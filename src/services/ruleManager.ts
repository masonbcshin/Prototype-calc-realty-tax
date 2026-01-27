/**
 * 규칙 관리자
 * 규칙 버전 관리, 변경 감지, 활성화 로직
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { TaxRules, RuleInfo, LawVersion, AdjustedArea } from '../types';
import { parseLaw, validateRules } from './lawParser';

/**
 * 활성 규칙 가져오기
 */
export function getActiveRules(
  db: Database.Database,
  ruleType: string
): { rules: TaxRules | null; ruleId: string | null; lawVersion: LawVersion | null } {
  const stmt = db.prepare(`
    SELECT r.rule_id, r.law_id, r.version_date, r.json_blob
    FROM active_rules ar
    JOIN rules r ON ar.rule_id = r.rule_id
    WHERE ar.rule_type = ?
  `);
  
  const result = stmt.get(ruleType) as {
    rule_id: string;
    law_id: string;
    version_date: string;
    json_blob: string;
  } | undefined;
  
  if (!result) {
    return { rules: null, ruleId: null, lawVersion: null };
  }
  
  try {
    const rules = JSON.parse(result.json_blob) as TaxRules;
    return {
      rules,
      ruleId: result.rule_id,
      lawVersion: {
        law_id: result.law_id,
        version_date: result.version_date
      }
    };
  } catch {
    return { rules: null, ruleId: result.rule_id, lawVersion: null };
  }
}

/**
 * 모든 활성 규칙 가져오기
 */
export function getAllActiveRules(
  db: Database.Database
): {
  capitalGains: { rules: TaxRules | null; ruleId: string | null; lawVersion: LawVersion | null };
  acquisitionTax: { rules: TaxRules | null; ruleId: string | null; lawVersion: LawVersion | null };
} {
  return {
    capitalGains: getActiveRules(db, 'capital_gains'),
    acquisitionTax: getActiveRules(db, 'acquisition_tax')
  };
}

/**
 * 규칙 저장
 */
export function saveRule(
  db: Database.Database,
  lawId: string,
  ruleType: string,
  versionDate: string,
  rules: TaxRules,
  sourceExcerpt: string
): string {
  const ruleId = `RULE_${uuidv4()}`;
  
  const stmt = db.prepare(`
    INSERT INTO rules (rule_id, law_id, rule_type, version_date, json_blob, source_excerpt, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);
  
  stmt.run(
    ruleId,
    lawId,
    ruleType,
    versionDate,
    JSON.stringify(rules),
    sourceExcerpt.substring(0, 200)
  );
  
  return ruleId;
}

/**
 * 규칙 활성화
 */
export function activateRule(
  db: Database.Database,
  ruleType: string,
  ruleId: string
): void {
  // 활성 규칙 테이블 업데이트
  const upsertStmt = db.prepare(`
    INSERT OR REPLACE INTO active_rules (rule_type, rule_id)
    VALUES (?, ?)
  `);
  upsertStmt.run(ruleType, ruleId);
  
  // 규칙 테이블 is_active 업데이트
  const deactivateStmt = db.prepare(`
    UPDATE rules SET is_active = 0 WHERE rule_type = ?
  `);
  deactivateStmt.run(ruleType);
  
  const activateStmt = db.prepare(`
    UPDATE rules SET is_active = 1, approved_at = datetime('now') WHERE rule_id = ?
  `);
  activateStmt.run(ruleId);
}

/**
 * 법령에서 규칙 추출 및 저장
 */
export function processLawToRule(
  db: Database.Database,
  lawId: string
): { success: boolean; ruleId?: string; error?: string } {
  // 법령 정보 조회
  const lawStmt = db.prepare(`
    SELECT law_id, title, law_type, version_date, content
    FROM laws
    WHERE law_id = ? AND is_active = 1
    ORDER BY version_date DESC
    LIMIT 1
  `);
  
  const law = lawStmt.get(lawId) as {
    law_id: string;
    title: string;
    law_type: string;
    version_date: string;
    content: string;
  } | undefined;
  
  if (!law) {
    return { success: false, error: '법령을 찾을 수 없습니다.' };
  }
  
  // 법령 파싱
  const parsedRules = parseLaw(
    law.law_id,
    law.title,
    law.law_type,
    law.version_date,
    law.content
  );
  
  if (!parsedRules) {
    return { success: false, error: '법령 파싱 실패' };
  }
  
  // 규칙 검증
  const validation = validateRules(parsedRules.rules as TaxRules);
  if (!validation.valid) {
    return { success: false, error: `규칙 검증 실패: ${validation.errors.join(', ')}` };
  }
  
  // 규칙 유형 결정
  let ruleType: string;
  switch (law.law_type) {
    case 'income_tax':
    case 'special_tax':
      ruleType = 'capital_gains';
      break;
    case 'local_tax':
      ruleType = 'acquisition_tax';
      break;
    default:
      ruleType = 'capital_gains';
  }
  
  // 규칙 저장
  const ruleId = saveRule(
    db,
    law.law_id,
    ruleType,
    law.version_date,
    parsedRules.rules as TaxRules,
    parsedRules.source_excerpt
  );
  
  return { success: true, ruleId };
}

/**
 * 조정대상지역 확인
 */
export function isAdjustedArea(
  db: Database.Database,
  address: string
): boolean {
  // 주소에서 시군구 추출
  const regions = extractRegions(address);
  
  for (const region of regions) {
    const stmt = db.prepare(`
      SELECT is_adjusted FROM adjusted_areas
      WHERE region_name LIKE ?
      LIMIT 1
    `);
    
    const result = stmt.get(`%${region}%`) as { is_adjusted: number } | undefined;
    if (result && result.is_adjusted === 1) {
      return true;
    }
  }
  
  return false;
}

/**
 * 주소에서 지역명 추출
 */
function extractRegions(address: string): string[] {
  const regions: string[] = [];
  
  // 시/도 추출
  const sidoMatch = address.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|도|특별자치도)?/);
  if (sidoMatch) {
    regions.push(sidoMatch[0]);
  }
  
  // 시/군/구 추출
  const sigugunMatch = address.match(/([가-힣]+(?:시|군|구))/g);
  if (sigugunMatch) {
    regions.push(...sigugunMatch);
  }
  
  return regions;
}

/**
 * 조정대상지역 목록 조회
 */
export function getAdjustedAreas(db: Database.Database): AdjustedArea[] {
  const stmt = db.prepare(`
    SELECT region_code, region_name, is_adjusted, effective_date
    FROM adjusted_areas
    WHERE is_adjusted = 1
  `);
  
  return stmt.all() as AdjustedArea[];
}

/**
 * 조정대상지역 업데이트
 */
export function updateAdjustedArea(
  db: Database.Database,
  regionCode: string,
  regionName: string,
  isAdjusted: boolean,
  effectiveDate: string
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO adjusted_areas (region_code, region_name, is_adjusted, effective_date, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  
  stmt.run(regionCode, regionName, isAdjusted ? 1 : 0, effectiveDate);
}

/**
 * 감사 로그 저장
 */
export function saveAuditLog(
  db: Database.Database,
  eventType: string,
  eventData: Record<string, unknown>,
  ruleIds: string[] = [],
  lawVersions: LawVersion[] = [],
  requestIp: string = ''
): void {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (event_type, event_data, rule_ids, law_versions, request_ip)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    eventType,
    JSON.stringify(eventData),
    ruleIds.join(','),
    JSON.stringify(lawVersions),
    requestIp
  );
}

/**
 * 규칙 변경 이력 조회
 */
export function getRuleHistory(
  db: Database.Database,
  ruleType: string,
  limit: number = 10
): RuleInfo[] {
  const stmt = db.prepare(`
    SELECT rule_id, law_id, rule_type, version_date, json_blob, source_excerpt, is_active, created_at
    FROM rules
    WHERE rule_type = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  
  return stmt.all(ruleType, limit) as RuleInfo[];
}

/**
 * 규칙 롤백
 */
export function rollbackRule(
  db: Database.Database,
  ruleType: string,
  targetRuleId: string
): { success: boolean; error?: string } {
  // 대상 규칙 존재 확인
  const checkStmt = db.prepare(`
    SELECT rule_id FROM rules WHERE rule_id = ? AND rule_type = ?
  `);
  
  const exists = checkStmt.get(targetRuleId, ruleType);
  if (!exists) {
    return { success: false, error: '규칙을 찾을 수 없습니다.' };
  }
  
  // 활성화
  activateRule(db, ruleType, targetRuleId);
  
  // 감사 로그
  saveAuditLog(db, 'rule_rollback', {
    rule_type: ruleType,
    target_rule_id: targetRuleId
  });
  
  return { success: true };
}
