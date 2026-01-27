/**
 * SQLite DB 스키마 정의
 * 법령, 규칙, 감사 로그 테이블
 */

export const CREATE_TABLES_SQL = `
-- 법령 테이블: 법제처에서 수집한 법령 원문 저장
CREATE TABLE IF NOT EXISTS laws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  law_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  law_type TEXT NOT NULL, -- 'income_tax', 'local_tax', 'special_tax'
  version_date TEXT NOT NULL,
  amendment_date TEXT,
  content TEXT NOT NULL, -- 법령 원문 (조문)
  source_url TEXT,
  collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(law_id, version_date)
);

-- 규칙 테이블: 파싱된 규칙 JSON 저장
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL UNIQUE,
  law_id TEXT NOT NULL,
  rule_type TEXT NOT NULL, -- 'capital_gains', 'acquisition_tax', 'surtax'
  version_date TEXT NOT NULL,
  json_blob TEXT NOT NULL, -- JSON 규칙 데이터
  source_excerpt TEXT, -- 원문 발췌 (최대 200자)
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  approved_by TEXT,
  FOREIGN KEY (law_id) REFERENCES laws(law_id)
);

-- 활성 규칙 테이블: 현재 계산에 사용되는 규칙
CREATE TABLE IF NOT EXISTS active_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL UNIQUE, -- 'capital_gains', 'acquisition_tax', 'surtax'
  rule_id TEXT NOT NULL,
  activated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (rule_id) REFERENCES rules(rule_id)
);

-- 조정대상지역 테이블
CREATE TABLE IF NOT EXISTS adjusted_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region_code TEXT NOT NULL UNIQUE, -- 행정구역 코드
  region_name TEXT NOT NULL, -- 시군구 이름
  is_adjusted INTEGER NOT NULL DEFAULT 0, -- 조정대상지역 여부
  effective_date TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 감사 로그 테이블: 계산 요청 및 시스템 이벤트 기록
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL, -- 'calculation', 'law_update', 'rule_change', 'error'
  event_data TEXT NOT NULL, -- JSON 형태 이벤트 데이터
  rule_ids TEXT, -- 사용된 규칙 IDs (쉼표 구분)
  law_versions TEXT, -- 사용된 법령 버전 (JSON)
  request_ip TEXT, -- 익명화된 IP
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 법령 수집 로그 테이블
CREATE TABLE IF NOT EXISTS collection_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  law_id TEXT,
  status TEXT NOT NULL, -- 'success', 'failed', 'no_change'
  message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_laws_law_id ON laws(law_id);
CREATE INDEX IF NOT EXISTS idx_laws_version_date ON laws(version_date);
CREATE INDEX IF NOT EXISTS idx_rules_law_id ON rules(law_id);
CREATE INDEX IF NOT EXISTS idx_rules_rule_type ON rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_adjusted_areas_region_name ON adjusted_areas(region_name);
`;

export const DROP_TABLES_SQL = `
DROP TABLE IF EXISTS collection_logs;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS adjusted_areas;
DROP TABLE IF EXISTS active_rules;
DROP TABLE IF EXISTS rules;
DROP TABLE IF EXISTS laws;
`;

// 초기 조정대상지역 데이터 (2025년 기준 예시)
export const INITIAL_ADJUSTED_AREAS = `
INSERT OR REPLACE INTO adjusted_areas (region_code, region_name, is_adjusted, effective_date) VALUES
('1100000000', '서울특별시', 1, '2020-06-19'),
('4100000000', '경기도 과천시', 1, '2020-06-19'),
('4113500000', '경기도 성남시 분당구', 1, '2020-06-19'),
('4111500000', '경기도 광명시', 1, '2020-12-18'),
('4113100000', '경기도 하남시', 1, '2020-12-18'),
('2600000000', '부산광역시 해운대구', 1, '2020-12-18'),
('2600000000', '부산광역시 수영구', 1, '2020-12-18'),
('2600000000', '부산광역시 동래구', 1, '2020-12-18'),
('2700000000', '대구광역시 수성구', 1, '2020-12-18'),
('3000000000', '세종특별자치시', 1, '2020-06-19');
`;

// 기본 규칙 데이터 (초기 정적 규칙)
export const DEFAULT_RULES = {
  capital_gains: {
    law_id: "LAW_DEFAULT_INCOME",
    title: "소득세법 - 양도소득세 (기본 규칙)",
    version_date: "2025-01-01",
    rules: {
      capital_gains: {
        basic_deduction: 2500000, // 기본공제 250만원
        tax_brackets: [
          { from: 0, to: 14000000, rate: 6, deduction: 0 },
          { from: 14000001, to: 50000000, rate: 15, deduction: 1260000 },
          { from: 50000001, to: 88000000, rate: 24, deduction: 5760000 },
          { from: 88000001, to: 150000000, rate: 35, deduction: 15440000 },
          { from: 150000001, to: 300000000, rate: 38, deduction: 19940000 },
          { from: 300000001, to: 500000000, rate: 40, deduction: 25940000 },
          { from: 500000001, to: 1000000000, rate: 42, deduction: 35940000 },
          { from: 1000000001, to: Infinity, rate: 45, deduction: 65940000 }
        ],
        long_hold_deduction: [
          { from_years: 0, to_years: 2, hold_rate: 0, residence_rate: 0 },
          { from_years: 2, to_years: 3, hold_rate: 0, residence_rate: 0 },
          { from_years: 3, to_years: 4, hold_rate: 6, residence_rate: 0 },
          { from_years: 4, to_years: 5, hold_rate: 8, residence_rate: 0 },
          { from_years: 5, to_years: 6, hold_rate: 10, residence_rate: 0 },
          { from_years: 6, to_years: 7, hold_rate: 12, residence_rate: 0 },
          { from_years: 7, to_years: 8, hold_rate: 14, residence_rate: 0 },
          { from_years: 8, to_years: 9, hold_rate: 16, residence_rate: 0 },
          { from_years: 9, to_years: 10, hold_rate: 18, residence_rate: 0 },
          { from_years: 10, to_years: 11, hold_rate: 20, residence_rate: 0 },
          { from_years: 11, to_years: 12, hold_rate: 22, residence_rate: 0 },
          { from_years: 12, to_years: 13, hold_rate: 24, residence_rate: 0 },
          { from_years: 13, to_years: 14, hold_rate: 26, residence_rate: 0 },
          { from_years: 14, to_years: 15, hold_rate: 28, residence_rate: 0 },
          { from_years: 15, to_years: Infinity, hold_rate: 30, residence_rate: 0 }
        ],
        one_house_exemption: {
          min_hold_years: 2,
          min_residence_years: 2,
          max_exemption_amount: 1200000000, // 12억원 초과분 과세
          condition_description: "1세대 1주택, 보유기간 >= 2년, 거주기간 >= 2년"
        }
      },
      surtax: {
        multi_house: {
          two_houses: { extra_rate: 20 },
          three_or_more: { extra_rate: 30 }
        },
        adjusted_area: {
          two_houses: { extra_rate: 20 },
          three_or_more: { extra_rate: 30 }
        },
        short_term: {
          under_one_year: { rate: 70 },
          one_to_two_years: { rate: 60 }
        }
      }
    }
  },
  acquisition_tax: {
    law_id: "LAW_DEFAULT_LOCAL",
    title: "지방세법 - 취득세 (기본 규칙)",
    version_date: "2025-01-01",
    rules: {
      acquisition_tax: {
        residential: {
          standard: [
            { max_price: 600000000, rate: 1 },
            { max_price: 900000000, rate: 2 },
            { max_price: Infinity, rate: 3 }
          ],
          adjusted_area_multi_house: {
            two_houses: { rate: 8 },
            three_or_more: { rate: 12 }
          },
          non_adjusted_area_multi_house: {
            three_or_more: { rate: 8 }
          }
        },
        non_residential: {
          rate: 4
        }
      }
    }
  }
};
