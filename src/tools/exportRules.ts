/**
 * 활성 규칙 스냅샷 익스포터 (CI용)
 *
 * 현재 활성 규칙을 커밋 가능한 JSON(rules/active-rules.json)으로 내보낸다.
 * 이 파일이 main에 커밋되면 배포 플랫폼의 Git 연동이 재배포를 트리거한다.
 *
 * 결정성: 실행마다 달라지는 값(규칙 UUID, 생성 시각)은 제외한다.
 * 규칙 내용·법령버전·근거조문이 실제로 바뀔 때에만 파일이 변경되어
 * 불필요한(빈) 커밋을 방지한다. 계산 로직은 재사용만 하며 수정하지 않는다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDatabase } from '../db/init';
import { getAllActiveRules } from '../services/ruleManager';

const OUTPUT_PATH = path.resolve(process.cwd(), 'rules/active-rules.json');

function main(): void {
  const db = getDatabase();
  const active = getAllActiveRules(db);
  db.close();

  const snapshot = {
    capitalGains: {
      lawVersion: active.capitalGains.lawVersion,
      sourceExcerpt: active.capitalGains.sourceExcerpt,
      rules: active.capitalGains.rules,
    },
    acquisitionTax: {
      lawVersion: active.acquisitionTax.lawVersion,
      sourceExcerpt: active.acquisitionTax.sourceExcerpt,
      rules: active.acquisitionTax.rules,
    },
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`[export] 활성 규칙 스냅샷 저장: ${OUTPUT_PATH}`);
}

main();
