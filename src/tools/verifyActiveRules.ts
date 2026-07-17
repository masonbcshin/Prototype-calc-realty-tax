/**
 * 검증 게이트 (CI용)
 *
 * 현재 활성 규칙에 대해 샘플 케이스(runSampleTests)를 실행한다.
 * 하나라도 실패하면 종료 코드 1로 빠져나가 워크플로우의 이후 단계(스냅샷/커밋)를 중단시킨다.
 * 계산 로직·게이트 로직은 재사용만 하며 수정하지 않는다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDatabase } from '../db/init';
import { runSampleTests } from '../jobs/testRunner';

const AUDIT_PATH = path.resolve(process.cwd(), 'audit/verify-rules.json');

function main(): void {
  const db = getDatabase();
  const results = runSampleTests(db);
  db.close();

  // 감사 로그 기록 (성공/실패 무관하게 남겨 아티팩트로 업로드)
  fs.mkdirSync(path.dirname(AUDIT_PATH), { recursive: true });
  fs.writeFileSync(
    AUDIT_PATH,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        passed: results.passed,
        total: results.total,
        results: results.results,
      },
      null,
      2,
    ),
  );

  console.log(`[verify] 샘플 검증: ${results.passed}/${results.total} 통과`);

  if (results.passed < results.total) {
    console.error('[verify] 검증 실패 — 규칙 스냅샷/커밋을 중단합니다.');
    for (const r of results.results.filter((x) => !x.passed)) {
      console.error(` - ${r.name}: ${r.error ?? '불일치'}`);
    }
    process.exit(1);
  }

  console.log('[verify] 게이트 통과.');
}

main();
