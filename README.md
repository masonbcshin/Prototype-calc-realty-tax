# 부동산 거래세/양도소득세 자동반영 계산기

법제처 Open API 기반 법령 텍스트를 주기적으로 수집·파싱해 세율/공제 규칙을 자동으로 업데이트하고, 입력 케이스에 대해 최신 규칙으로 양도소득세·취득세를 계산해 반환하는 웹 API + 웹 UI 서비스입니다.

## 면책 조항

> **중요:** 이 서비스는 **정보제공용**이며 **법률·세무 자문이 아닙니다**. 
> 실제 신고 전 반드시 세무사·전문가와 상담하세요.
> 계산 결과의 정확성을 보장하지 않습니다.

## 주요 기능

- **양도소득세 계산**: 1세대1주택 비과세, 장기보유특별공제, 다주택자 중과, 단기매매 중과 등 자동 적용
- **취득세 계산**: 주택 가격별 세율, 다주택자 중과 등 자동 적용
- **법령 자동 업데이트**: 법제처 Open API를 통해 매일 법령 변경 감지 및 규칙 자동 업데이트
- **투명한 계산**: 사용된 법령 버전, 적용 규칙, 근거 조문 요약 제공

## 기술 스택

- **Backend**: Node.js + TypeScript + Express
- **Database**: SQLite (better-sqlite3)
- **Frontend**: React + TypeScript + Vite
- **Testing**: Jest + Supertest
- **CI/CD**: GitHub Actions

## 빠른 시작

### 요구사항

- Node.js 18+
- npm

### 설치

```bash
# 저장소 클론
git clone <repository-url>
cd real-estate-tax-calculator

# 백엔드 의존성 설치
npm install

# 데이터베이스 초기화
npm run db:init

# 개발 서버 실행
npm run dev
```

### 프론트엔드 빌드

```bash
cd frontend
npm install
npm run build
```

### 테스트 실행

```bash
npm test
```

## API 엔드포인트

### 양도소득세 계산

```
POST /api/v1/calc
Content-Type: application/json

{
  "acquisitionDate": "2016-03-15",
  "acquisitionPrice": 350000000,
  "dispositionDate": "2026-04-01",
  "dispositionPrice": 500000000,
  "address": "서울특별시 마포구 상암동",
  "ownerCount": 1,
  "isPrimaryResidence": true,
  "residenceYears": 10
}
```

### 취득세 계산

```
POST /api/v1/calc/acquisition-tax
Content-Type: application/json

{
  "acquisitionPrice": 500000000,
  "address": "서울특별시 강남구",
  "ownerCount": 1,
  "isResidential": true
}
```

### 활성 규칙 조회

```
GET /api/v1/calc/rules
```

### 헬스 체크

```
GET /api/v1/health
```

## 환경 변수

```bash
# .env.example 참고
LAW_API_KEY=your_law_api_key_here  # 법제처 Open API 키
PORT=3000                          # 서버 포트
NODE_ENV=development               # 환경 (development/production)
DB_PATH=./data/tax_calculator.db   # DB 파일 경로
ADMIN_TOKEN=your_admin_token_here  # 관리자 인증 토큰
```

### 법제처 API 키 발급

1. [국가법령정보센터](https://www.law.go.kr) 접속
2. Open API 신청
3. 발급받은 API 키를 `LAW_API_KEY` 환경변수로 설정

## GitHub Actions 설정

### Secrets 설정

Repository Settings > Secrets and variables > Actions에서 다음 시크릿 설정:

- `LAW_API_KEY`: 법제처 Open API 키

### 워크플로우

- **CI (ci.yml)**: 푸시/PR 시 테스트 및 빌드 실행
- **Law Collector (law-collector.yml)**: 매일 00:00 KST 법령 수집 실행

## 프로젝트 구조

```
/
├── src/
│   ├── app.ts                    # Express 앱 진입점
│   ├── routes/
│   │   ├── calc.ts               # 계산 API 라우트
│   │   └── admin.ts              # 관리자 API 라우트
│   ├── services/
│   │   ├── calcEngine.ts         # 계산 로직
│   │   ├── lawParser.ts          # 법령 파서
│   │   ├── lawCollector.ts       # 법령 수집기
│   │   └── ruleManager.ts        # 규칙 관리
│   ├── db/
│   │   ├── schema.ts             # DB 스키마 정의
│   │   └── init.ts               # DB 초기화
│   ├── jobs/
│   │   ├── schedule.ts           # 스케줄러
│   │   └── testRunner.ts         # 샘플 테스트 실행기
│   ├── utils/
│   │   └── httpClient.ts         # HTTP 유틸리티
│   └── types/
│       └── index.ts              # 타입 정의
├── tests/
│   ├── calcEngine.test.ts        # 계산 엔진 테스트
│   ├── lawParser.test.ts         # 파서 테스트
│   └── api.test.ts               # API 통합 테스트
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # React 앱
│   │   ├── components/           # React 컴포넌트
│   │   └── services/             # API 클라이언트
│   └── ...
├── samples/                      # 샘플 결과
├── .github/workflows/            # GitHub Actions
├── schema.sql                    # DB 스키마 SQL
├── openapi.yaml                  # API 명세
└── README.md
```

## 계산 로직

### 양도소득세

1. **보유기간 계산**: 취득일 ~ 양도일 (년 단위, 소수점 절사)
2. **1세대1주택 비과세 판정**:
   - 주택 수 = 1
   - 보유기간 ≥ 2년
   - 거주기간 ≥ 2년 (실거주 요건)
   - 양도가액 ≤ 12억원 (초과분 부분과세)
3. **장기보유특별공제**: 보유기간별 공제율 (최대 30%)
4. **과세표준 계산**: 양도차익 - 장기보유공제 - 기본공제(250만원)
5. **누진세 계산**: 과세표준별 세율 적용 (6% ~ 45%)
6. **중과세 적용**:
   - 단기매매 (1년 미만: 70%, 1~2년: 60%)
   - 다주택자 (2주택: +20%, 3주택 이상: +30%)
   - 조정대상지역 중과

### 취득세

1. **기본 세율**: 6억 이하 1%, 6억 초과 9억 이하 선형 슬라이딩(`세율(%) = 취득가액(억) × 2/3 − 3`, 백분율 기준 소수점 셋째자리에서 반올림하여 둘째자리까지, 6억 1% → 7.5억 2% → 8억 2.33% → 9억 3%), 9억 초과 3%
2. **다주택자 중과**:
   - 조정대상지역 2주택: 8%
   - 조정대상지역 3주택 이상: 12%
   - 비조정지역 3주택 이상: 8%

## 규칙 JSON 예시

```json
{
  "law_id": "LAW_2025_XXXX",
  "title": "소득세법 - 양도소득세",
  "version_date": "2025-01-01",
  "rules": {
    "capital_gains": {
      "basic_deduction": 2500000,
      "tax_brackets": [
        {"from": 0, "to": 14000000, "rate": 6, "deduction": 0},
        {"from": 14000001, "to": 50000000, "rate": 15, "deduction": 1260000}
      ],
      "long_hold_deduction": [
        {"from_years": 3, "to_years": 4, "hold_rate": 6, "residence_rate": 0}
      ],
      "one_house_exemption": {
        "min_hold_years": 2,
        "min_residence_years": 2,
        "max_exemption_amount": 1200000000
      }
    }
  }
}
```

## 관리자 기능

관리자 API는 `x-admin-token` 헤더 또는 `token` 쿼리 파라미터로 인증합니다.

```bash
# 법령 수동 수집
curl -X POST http://localhost:3000/api/v1/admin/refresh-laws \
  -H "x-admin-token: YOUR_ADMIN_TOKEN"

# 규칙 이력 조회
curl http://localhost:3000/api/v1/admin/rules/history?ruleType=capital_gains \
  -H "x-admin-token: YOUR_ADMIN_TOKEN"

# 규칙 롤백
curl -X POST http://localhost:3000/api/v1/admin/rules/rollback \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ruleType": "capital_gains", "targetRuleId": "RULE_xxx"}'
```

## 데이터 스키마

### laws 테이블
법제처에서 수집한 법령 원문 저장

### rules 테이블
파싱된 규칙 JSON 저장

### active_rules 테이블
현재 계산에 사용되는 규칙

### adjusted_areas 테이블
조정대상지역 정보

### audit_logs 테이블
계산 요청 및 시스템 이벤트 기록

## 감사 및 투명성

- 모든 계산 요청은 감사 로그에 기록 (PII 제외)
- 계산 결과에 사용된 법령 버전 ID, 개정일, 원문 발췌 포함
- IP 주소는 익명화 처리

## 라이선스

MIT License

## 기여

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 문의

이슈를 통해 문의해 주세요.
