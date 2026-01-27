-- 부동산 거래세/양도소득세 계산기 데이터베이스 스키마
-- SQLite 기준

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

-- 초기 조정대상지역 데이터 (2025년 기준 예시)
INSERT OR REPLACE INTO adjusted_areas (region_code, region_name, is_adjusted, effective_date) VALUES
('1100000000', '서울특별시', 1, '2020-06-19'),
('4100000000', '경기도 과천시', 1, '2020-06-19'),
('4113500000', '경기도 성남시 분당구', 1, '2020-06-19'),
('4111500000', '경기도 광명시', 1, '2020-12-18'),
('4113100000', '경기도 하남시', 1, '2020-12-18'),
('2600000000', '부산광역시 해운대구', 1, '2020-12-18'),
('2600000001', '부산광역시 수영구', 1, '2020-12-18'),
('2600000002', '부산광역시 동래구', 1, '2020-12-18'),
('2700000000', '대구광역시 수성구', 1, '2020-12-18'),
('3000000000', '세종특별자치시', 1, '2020-06-19');
