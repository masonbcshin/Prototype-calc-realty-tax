/**
 * 타입 정의
 */

// 계산 요청 입력
export interface CalculationInput {
  acquisitionDate: string; // YYYY-MM-DD
  acquisitionPrice: number; // 취득가액 (원)
  dispositionDate: string; // YYYY-MM-DD
  dispositionPrice: number; // 양도가액 (원)
  address: string; // 주소 (시군구 단위)
  ownerCount: number; // 보유 주택 수
  isPrimaryResidence?: boolean; // 실거주 여부
  residenceYears?: number; // 거주 기간 (년)
  necessaryExpenses?: number; // 필요경비 (원)
}

// 계산 결과
export interface CalculationResult {
  // 세액 정보
  taxBeforeSurtax: number; // 중과 전 세액
  surtax: number; // 중과세액
  totalTax: number; // 총 세액
  
  // 적용 항목
  applies: {
    oneHouseExemption: boolean; // 1세대1주택 비과세 적용 여부
    longHoldDeduction: number; // 장기보유공제율
    isAdjustedArea: boolean; // 조정대상지역 여부
    multiHouseSurtax: boolean; // 다주택 중과 적용 여부
    shortTermSurtax: boolean; // 단기매매 중과 적용 여부
  };
  
  // 계산 상세
  details: {
    holdingPeriodYears: number; // 보유기간 (년)
    taxableGain: number; // 양도차익
    deductions: number; // 공제 합계
    taxBase: number; // 과세표준
    appliedBracket: TaxBracket | null; // 적용 세율 구간
  };
  
  // 감사/추적 정보
  appliedRules: string[]; // 적용된 규칙 IDs
  lawVersions: LawVersion[]; // 사용된 법령 버전
  notes: string; // 참고사항/면책문구
}

// 법령 버전 정보
export interface LawVersion {
  law_id: string;
  version_date: string;
  title?: string;
}

// 세율 구간
export interface TaxBracket {
  from: number;
  to: number;
  rate: number;
  deduction: number;
}

// 장기보유공제 구간
export interface LongHoldDeduction {
  from_years: number;
  to_years: number;
  hold_rate: number; // 보유 기간 공제율
  residence_rate: number; // 거주 기간 공제율
}

// 1세대1주택 비과세 조건
export interface OneHouseExemption {
  min_hold_years: number;
  min_residence_years: number;
  max_exemption_amount: number;
  condition_description: string;
}

// 양도소득세 규칙
export interface CapitalGainsRules {
  basic_deduction: number;
  tax_brackets: TaxBracket[];
  long_hold_deduction: LongHoldDeduction[];
  one_house_exemption: OneHouseExemption;
}

// 중과세 규칙
export interface SurtaxRules {
  multi_house: {
    two_houses: { extra_rate: number };
    three_or_more: { extra_rate: number };
  };
  adjusted_area: {
    two_houses: { extra_rate: number };
    three_or_more: { extra_rate: number };
  };
  short_term: {
    under_one_year: { rate: number };
    one_to_two_years: { rate: number };
  };
}

// 전체 규칙 구조
export interface TaxRules {
  capital_gains: CapitalGainsRules;
  surtax: SurtaxRules;
}

// 취득세 규칙
export interface AcquisitionTaxRules {
  acquisition_tax: {
    residential: {
      standard: Array<{ max_price: number; rate: number }>;
      adjusted_area_multi_house: {
        two_houses: { rate: number };
        three_or_more: { rate: number };
      };
      non_adjusted_area_multi_house: {
        three_or_more: { rate: number };
      };
    };
    non_residential: {
      rate: number;
    };
  };
}

// 법령 정보
export interface LawInfo {
  law_id: string;
  title: string;
  law_type: string;
  version_date: string;
  amendment_date?: string;
  content: string;
  source_url?: string;
}

// 규칙 정보
export interface RuleInfo {
  rule_id: string;
  law_id: string;
  rule_type: string;
  version_date: string;
  json_blob: string;
  source_excerpt?: string;
  is_active: boolean;
}

// 조정대상지역 정보
export interface AdjustedArea {
  region_code: string;
  region_name: string;
  is_adjusted: boolean;
  effective_date: string;
}

// API 응답 형식
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
}

// 법령 파싱 결과
export interface ParsedLawRules {
  law_id: string;
  title: string;
  version_date: string;
  rules: TaxRules | AcquisitionTaxRules;
  source_excerpt: string;
}

// 법제처 API 응답 (간소화)
export interface LawApiResponse {
  법령ID: string;
  법령명: string;
  제개정일: string;
  시행일: string;
  조문: string;
}
