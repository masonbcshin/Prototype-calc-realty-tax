/**
 * 법령 수집기
 * 법제처(국가법령정보센터) Open API에서 법령 데이터 수집
 */

import { parseStringPromise } from 'xml2js';
import { LawInfo, LawApiResponse } from '../types';
import { httpGet, delay } from '../utils/httpClient';
import Database from 'better-sqlite3';

// 법제처 Open API 엔드포인트
const LAW_API_BASE_URL = 'https://www.law.go.kr/DRF/lawService.do';

// 관심 법령 목록
export const TARGET_LAWS = [
  { mst: '소득세법', type: 'income_tax' },
  { mst: '지방세법', type: 'local_tax' },
  { mst: '조세특례제한법', type: 'special_tax' }
];

// 최대 재시도 횟수
const MAX_RETRIES = 3;

// 재시도 대기 시간 (밀리초, 지수 백오프)
const getRetryDelay = (attempt: number): number => Math.pow(2, attempt) * 1000;

export interface CollectionResult {
  success: boolean;
  law_id?: string;
  message: string;
  isNewVersion: boolean;
}

/**
 * 법제처 API 호출하여 법령 정보 조회
 */
export async function fetchLawFromApi(
  lawName: string,
  apiKey: string
): Promise<LawApiResponse | null> {
  const params = new URLSearchParams({
    OC: apiKey,
    target: 'law',
    type: 'XML',
    query: lawName
  });
  
  const url = `${LAW_API_BASE_URL}?${params.toString()}`;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await httpGet(url);
      
      if (!response) {
        throw new Error('Empty response from API');
      }
      
      // XML 파싱
      const parsed = await parseStringPromise(response, {
        explicitArray: false,
        ignoreAttrs: true
      });
      
      if (parsed.LawService?.law) {
        const law = parsed.LawService.law;
        return {
          법령ID: law.법령ID || law.MST || '',
          법령명: law.법령명한글 || law.법령명 || lawName,
          제개정일: law.제개정일자 || '',
          시행일: law.시행일자 || '',
          조문: law.조문 || law.조문내용 || ''
        };
      }
      
      // 검색 결과가 여러개인 경우
      if (parsed.LawSearch?.law) {
        const laws = Array.isArray(parsed.LawSearch.law) 
          ? parsed.LawSearch.law 
          : [parsed.LawSearch.law];
        
        // 정확히 일치하는 법령 찾기
        const exactMatch = laws.find(
          (l: { 법령명한글?: string; 법령명?: string }) => 
            l.법령명한글 === lawName || l.법령명 === lawName
        );
        
        if (exactMatch) {
          return {
            법령ID: exactMatch.법령ID || exactMatch.MST || '',
            법령명: exactMatch.법령명한글 || exactMatch.법령명 || lawName,
            제개정일: exactMatch.제개정일자 || '',
            시행일: exactMatch.시행일자 || '',
            조문: exactMatch.조문 || ''
          };
        }
      }
      
      return null;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`API 호출 실패 (시도 ${attempt + 1}/${MAX_RETRIES}): ${errorMessage}`);
      
      if (attempt < MAX_RETRIES - 1) {
        const waitTime = getRetryDelay(attempt);
        console.log(`${waitTime}ms 후 재시도...`);
        await delay(waitTime);
      }
    }
  }
  
  return null;
}

/**
 * 법령 상세 정보 조회 (법령ID로 조문 내용 가져오기)
 */
export async function fetchLawDetail(
  lawId: string,
  apiKey: string
): Promise<string | null> {
  const params = new URLSearchParams({
    OC: apiKey,
    target: 'law',
    MST: lawId,
    type: 'XML'
  });
  
  const url = `${LAW_API_BASE_URL}?${params.toString()}`;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await httpGet(url);
      
      if (!response) {
        throw new Error('Empty response from API');
      }
      
      // XML 파싱
      const parsed = await parseStringPromise(response, {
        explicitArray: false,
        ignoreAttrs: true
      });
      
      // 조문 내용 추출
      if (parsed.법령?.조문) {
        const articles = parsed.법령.조문;
        if (typeof articles === 'string') {
          return articles;
        }
        
        // 조문이 배열인 경우 합치기
        if (Array.isArray(articles.조문단위)) {
          return articles.조문단위
            .map((a: { 조문내용?: string }) => a.조문내용 || '')
            .join('\n');
        }
        
        return JSON.stringify(articles);
      }
      
      return response; // 원본 XML 반환
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`법령 상세 조회 실패 (시도 ${attempt + 1}/${MAX_RETRIES}): ${errorMessage}`);
      
      if (attempt < MAX_RETRIES - 1) {
        const waitTime = getRetryDelay(attempt);
        await delay(waitTime);
      }
    }
  }
  
  return null;
}

/**
 * DB에서 기존 법령 버전 확인
 */
export function getExistingLawVersion(
  db: Database.Database,
  lawId: string
): { version_date: string; amendment_date: string } | null {
  const stmt = db.prepare(`
    SELECT version_date, amendment_date 
    FROM laws 
    WHERE law_id = ? AND is_active = 1
    ORDER BY version_date DESC
    LIMIT 1
  `);
  
  const result = stmt.get(lawId) as { version_date: string; amendment_date: string } | undefined;
  return result || null;
}

/**
 * 새 법령 버전 저장
 */
export function saveLaw(
  db: Database.Database,
  law: LawInfo
): void {
  // 기존 버전 비활성화
  const deactivateStmt = db.prepare(`
    UPDATE laws SET is_active = 0 WHERE law_id = ?
  `);
  deactivateStmt.run(law.law_id);
  
  // 새 버전 저장
  const insertStmt = db.prepare(`
    INSERT INTO laws (law_id, title, law_type, version_date, amendment_date, content, source_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  
  insertStmt.run(
    law.law_id,
    law.title,
    law.law_type,
    law.version_date,
    law.amendment_date || null,
    law.content,
    law.source_url || null
  );
}

/**
 * 수집 로그 저장
 */
export function saveCollectionLog(
  db: Database.Database,
  lawId: string | null,
  status: 'success' | 'failed' | 'no_change',
  message: string,
  retryCount: number = 0
): void {
  const stmt = db.prepare(`
    INSERT INTO collection_logs (law_id, status, message, retry_count)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(lawId, status, message, retryCount);
}

/**
 * 단일 법령 수집 및 변경 감지
 */
export async function collectSingleLaw(
  db: Database.Database,
  lawName: string,
  lawType: string,
  apiKey: string
): Promise<CollectionResult> {
  try {
    // API에서 법령 정보 조회
    const lawData = await fetchLawFromApi(lawName, apiKey);
    
    if (!lawData || !lawData.법령ID) {
      saveCollectionLog(db, null, 'failed', `법령 조회 실패: ${lawName}`);
      return {
        success: false,
        message: `법령 조회 실패: ${lawName}`,
        isNewVersion: false
      };
    }
    
    const lawId = lawData.법령ID;
    const versionDate = lawData.시행일 || new Date().toISOString().split('T')[0];
    const amendmentDate = lawData.제개정일;
    
    // 기존 버전 확인
    const existingVersion = getExistingLawVersion(db, lawId);
    
    // 변경 감지
    const isNewVersion = !existingVersion || 
      existingVersion.version_date !== versionDate ||
      existingVersion.amendment_date !== amendmentDate;
    
    if (!isNewVersion) {
      saveCollectionLog(db, lawId, 'no_change', '변경 없음');
      return {
        success: true,
        law_id: lawId,
        message: '변경 없음',
        isNewVersion: false
      };
    }
    
    // 조문 상세 내용 가져오기
    let content = lawData.조문;
    if (!content || content.length < 100) {
      const detailContent = await fetchLawDetail(lawId, apiKey);
      if (detailContent) {
        content = detailContent;
      }
    }
    
    // 새 버전 저장
    const lawInfo: LawInfo = {
      law_id: lawId,
      title: lawData.법령명,
      law_type: lawType,
      version_date: versionDate,
      amendment_date: amendmentDate,
      content: content || '',
      source_url: `https://www.law.go.kr/법령/${encodeURIComponent(lawData.법령명)}`
    };
    
    saveLaw(db, lawInfo);
    saveCollectionLog(db, lawId, 'success', `새 버전 저장: ${versionDate}`);
    
    return {
      success: true,
      law_id: lawId,
      message: `새 버전 저장 완료: ${versionDate}`,
      isNewVersion: true
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    saveCollectionLog(db, null, 'failed', errorMessage);
    
    return {
      success: false,
      message: errorMessage,
      isNewVersion: false
    };
  }
}

/**
 * 모든 관심 법령 수집
 */
export async function collectAllLaws(
  db: Database.Database,
  apiKey: string
): Promise<CollectionResult[]> {
  const results: CollectionResult[] = [];
  
  for (const target of TARGET_LAWS) {
    console.log(`수집 중: ${target.mst}`);
    
    const result = await collectSingleLaw(db, target.mst, target.type, apiKey);
    results.push(result);
    
    // API 호출 간격 (rate limiting 방지)
    await delay(1000);
  }
  
  return results;
}

/**
 * 수집된 법령에서 규칙 추출 및 저장
 */
export function processNewLaws(
  db: Database.Database,
  results: CollectionResult[]
): string[] {
  // 이 함수는 ruleManager에서 호출됨
  // 변경된 법령 ID 목록 반환
  return results
    .filter(r => r.isNewVersion && r.law_id)
    .map(r => r.law_id as string);
}
