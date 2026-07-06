/**
 * 법령 수집 스케줄러
 * node-cron 기반 또는 GitHub Actions에서 호출
 */

import cron from 'node-cron';
import { getDatabase } from '../db/init';
import { collectAllLaws } from '../services/lawCollector';
import { processLawToRule, activateRule, saveAuditLog, getRuleById } from '../services/ruleManager';
import { runSampleTests } from './testRunner';

const LAW_API_KEY = process.env.LAW_API_KEY || '';

/**
 * 법령 수집 및 규칙 업데이트 작업
 */
export async function runLawCollectionJob(): Promise<{
  success: boolean;
  results: Array<{
    lawId: string;
    collected: boolean;
    ruleCreated: boolean;
    ruleActivated: boolean;
    error?: string;
  }>;
}> {
  console.log(`[${new Date().toISOString()}] 법령 수집 작업 시작`);
  
  const results: Array<{
    lawId: string;
    collected: boolean;
    ruleCreated: boolean;
    ruleActivated: boolean;
    error?: string;
  }> = [];
  
  if (!LAW_API_KEY) {
    console.error('LAW_API_KEY 환경변수가 설정되지 않았습니다.');
    console.log('기본 규칙을 사용합니다.');
    return { success: false, results };
  }
  
  const db = getDatabase();
  
  try {
    // 1. 법령 수집
    const collectionResults = await collectAllLaws(db, LAW_API_KEY);
    
    // 2. 변경된 법령 처리
    for (const result of collectionResults) {
      const jobResult = {
        lawId: result.law_id || 'unknown',
        collected: result.success,
        ruleCreated: false,
        ruleActivated: false,
        error: undefined as string | undefined
      };
      
      if (result.isNewVersion && result.law_id) {
        // 규칙 생성
        const ruleResult = processLawToRule(db, result.law_id);
        jobResult.ruleCreated = ruleResult.success;
        
        if (ruleResult.success && ruleResult.ruleId) {
          const ruleType = result.law_id.includes('LOCAL') ? 'acquisition_tax' : 'capital_gains';

          // 활성 규칙이 아닌 '새로 만든 후보 규칙' 자체를 검증한다.
          // (샘플 케이스는 전부 양도소득세라 capital_gains 후보만 실질 검증 가능)
          const candidateRules = ruleType === 'capital_gains'
            ? getRuleById(db, ruleResult.ruleId)
            : undefined;

          // 후보 규칙 로드 실패 시, 활성 규칙으로 잘못 검증한 뒤 미검증 규칙이
          // 활성화되는 안전 게이트 우회를 막기 위해 활성화하지 않고 건너뛴다.
          if (ruleType === 'capital_gains' && candidateRules === null) {
            jobResult.error = `후보 규칙을 로드할 수 없습니다. (ruleId: ${ruleResult.ruleId})`;
            console.error(`[${result.law_id}] ${jobResult.error}`);
            saveAuditLog(db, 'error', {
              type: 'rule_load_failure',
              law_id: result.law_id,
              rule_id: ruleResult.ruleId
            });
            results.push(jobResult);
            continue;
          }

          // 테스트 실행
          console.log(`[${result.law_id}] 샘플 테스트 실행 중...`);
          const testResults = runSampleTests(db, candidateRules ?? undefined);

          if (testResults.passed === testResults.total) {
            // 모든 테스트 통과 - 규칙 활성화
            activateRule(db, ruleType, ruleResult.ruleId);
            jobResult.ruleActivated = true;
            console.log(`[${result.law_id}] 규칙 활성화 완료`);
          } else {
            // 테스트 실패 - 이전 규칙 유지
            jobResult.error = `테스트 실패: ${testResults.passed}/${testResults.total}`;
            console.error(`[${result.law_id}] ${jobResult.error}`);
            
            // 감사 로그에 실패 기록
            saveAuditLog(db, 'error', {
              type: 'test_failure',
              law_id: result.law_id,
              rule_id: ruleResult.ruleId,
              test_results: testResults
            });
          }
        } else if (ruleResult.error) {
          jobResult.error = ruleResult.error;
          console.error(`[${result.law_id}] 규칙 생성 실패: ${ruleResult.error}`);
        }
      }
      
      results.push(jobResult);
    }
    
    // 감사 로그
    saveAuditLog(db, 'law_update', {
      trigger: 'scheduled',
      timestamp: new Date().toISOString(),
      results
    });
    
    console.log(`[${new Date().toISOString()}] 법령 수집 작업 완료`);
    
    return { success: true, results };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`법령 수집 작업 실패: ${errorMessage}`);
    
    saveAuditLog(db, 'error', {
      type: 'collection_job_error',
      error: errorMessage
    });
    
    return { success: false, results };
  } finally {
    db.close();
  }
}

/**
 * cron 스케줄 설정 (로컬 실행용)
 * 매일 00:00에 실행
 */
export function startScheduler(): void {
  console.log('법령 수집 스케줄러 시작');
  
  // 매일 자정 실행
  cron.schedule('0 0 * * *', async () => {
    await runLawCollectionJob();
  }, {
    timezone: 'Asia/Seoul'
  });
  
  console.log('스케줄러 등록 완료: 매일 00:00 (KST)');
}

// CLI로 직접 실행 시 즉시 수집 실행
if (require.main === module) {
  console.log('법령 수집 즉시 실행...');
  
  runLawCollectionJob()
    .then((result) => {
      console.log('수집 결과:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('오류:', error);
      process.exit(1);
    });
}
