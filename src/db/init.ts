/**
 * 데이터베이스 초기화 스크립트
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { CREATE_TABLES_SQL, INITIAL_ADJUSTED_AREAS, DEFAULT_RULES } from './schema';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = process.env.DB_PATH || './data/tax_calculator.db';

export function getDbPath(): string {
  return DB_PATH;
}

export function initializeDatabase(dbPath?: string): Database.Database {
  const targetPath = dbPath || DB_PATH;
  const dbDir = path.dirname(targetPath);
  
  // 디렉토리 생성
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  const db = new Database(targetPath);
  
  // WAL 모드 활성화 (성능 향상)
  db.pragma('journal_mode = WAL');
  
  // 테이블 생성
  db.exec(CREATE_TABLES_SQL);
  
  // 초기 조정대상지역 데이터 삽입
  db.exec(INITIAL_ADJUSTED_AREAS);
  
  // 기본 규칙 삽입
  insertDefaultRules(db);
  
  console.log(`Database initialized at: ${targetPath}`);
  
  return db;
}

function insertDefaultRules(db: Database.Database): void {
  // 먼저 기본 법령 삽입 (FOREIGN KEY 제약 해결)
  const insertLaw = db.prepare(`
    INSERT OR IGNORE INTO laws (law_id, title, law_type, version_date, content, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  
  // 소득세법 기본 법령
  insertLaw.run(
    DEFAULT_RULES.capital_gains.law_id,
    DEFAULT_RULES.capital_gains.title,
    'income_tax',
    DEFAULT_RULES.capital_gains.version_date,
    '기본 규칙 - 소득세법 양도소득세 관련 조문'
  );
  
  // 지방세법 기본 법령
  insertLaw.run(
    DEFAULT_RULES.acquisition_tax.law_id,
    DEFAULT_RULES.acquisition_tax.title,
    'local_tax',
    DEFAULT_RULES.acquisition_tax.version_date,
    '기본 규칙 - 지방세법 취득세 관련 조문'
  );
  
  const insertRule = db.prepare(`
    INSERT OR IGNORE INTO rules (rule_id, law_id, rule_type, version_date, json_blob, source_excerpt, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  
  const insertActiveRule = db.prepare(`
    INSERT OR REPLACE INTO active_rules (rule_type, rule_id)
    VALUES (?, ?)
  `);
  
  // 양도소득세 규칙
  const capitalGainsRuleId = `RULE_${uuidv4()}`;
  insertRule.run(
    capitalGainsRuleId,
    DEFAULT_RULES.capital_gains.law_id,
    'capital_gains',
    DEFAULT_RULES.capital_gains.version_date,
    JSON.stringify(DEFAULT_RULES.capital_gains.rules),
    '소득세법 제104조(양도소득의 세율), 제95조(양도소득금액의 계산) 기준 기본 규칙'
  );
  insertActiveRule.run('capital_gains', capitalGainsRuleId);
  
  // 취득세 규칙
  const acquisitionTaxRuleId = `RULE_${uuidv4()}`;
  insertRule.run(
    acquisitionTaxRuleId,
    DEFAULT_RULES.acquisition_tax.law_id,
    'acquisition_tax',
    DEFAULT_RULES.acquisition_tax.version_date,
    JSON.stringify(DEFAULT_RULES.acquisition_tax.rules),
    '지방세법 제11조(부동산 취득의 세율) 기준 기본 규칙'
  );
  insertActiveRule.run('acquisition_tax', acquisitionTaxRuleId);
  
  console.log('Default laws and rules inserted');
}

export function getDatabase(dbPath?: string): Database.Database {
  const targetPath = dbPath || DB_PATH;
  
  if (!fs.existsSync(targetPath)) {
    return initializeDatabase(targetPath);
  }
  
  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  
  return db;
}

// CLI로 직접 실행 시
if (require.main === module) {
  console.log('Initializing database...');
  const db = initializeDatabase();
  db.close();
  console.log('Database initialization complete.');
}
