/**
 * 샘플 테스트 실행기
 * 규칙 변경 시 자동 검증용
 */

import Database from 'better-sqlite3';
import { CalculationInput } from '../types';
import { calculateCapitalGainsTax } from '../services/calcEngine';
import { getAllActiveRules, isAdjustedArea } from '../services/ruleManager';
import { DEFAULT_RULES } from '../db/schema';

// 샘플 테스트 케이스 (10개)
export const SAMPLE_TEST_CASES: Array<{
  name: string;
  input: CalculationInput;
  expected: {
    oneHouseExemption?: boolean;
    taxRange?: { min: number; max: number };
    multiHouseSurtax?: boolean;
    shortTermSurtax?: boolean;
  };
}> = [
  // 1. 1세대1주택 비과세 케이스
  {
    name: '1세대1주택 비과세 (보유 10년, 거주 10년, 양도가 10억)',
    input: {
      acquisitionDate: '2016-01-01',
      acquisitionPrice: 500000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 1000000000,
      address: '서울특별시 강남구',
      ownerCount: 1,
      isPrimaryResidence: true,
      residenceYears: 10
    },
    expected: {
      oneHouseExemption: true
    }
  },
  // 2. 1세대1주택 부분과세 (12억 초과)
  {
    name: '1세대1주택 부분과세 (양도가 15억)',
    input: {
      acquisitionDate: '2016-01-01',
      acquisitionPrice: 800000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 1500000000,
      address: '서울특별시 서초구',
      ownerCount: 1,
      isPrimaryResidence: true,
      residenceYears: 10
    },
    expected: {
      oneHouseExemption: false,
      taxRange: { min: 1000000, max: 100000000 }
    }
  },
  // 3. 일반 양도 (2년 이상 보유)
  {
    name: '일반 양도 (보유 3년, 1주택)',
    input: {
      acquisitionDate: '2023-01-01',
      acquisitionPrice: 350000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 450000000,
      address: '경기도 용인시',
      ownerCount: 1,
      isPrimaryResidence: false,
      residenceYears: 0
    },
    expected: {
      oneHouseExemption: false,
      taxRange: { min: 5000000, max: 50000000 }
    }
  },
  // 4. 장기보유공제 적용 케이스
  {
    name: '장기보유공제 적용 (보유 15년)',
    input: {
      acquisitionDate: '2011-01-01',
      acquisitionPrice: 300000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 600000000,
      address: '경기도 수원시',
      ownerCount: 1,
      isPrimaryResidence: false,
      residenceYears: 0
    },
    expected: {
      oneHouseExemption: false,
      taxRange: { min: 10000000, max: 100000000 }
    }
  },
  // 5. 다주택자 (2주택)
  {
    name: '다주택자 2주택 양도',
    input: {
      acquisitionDate: '2020-01-01',
      acquisitionPrice: 400000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 550000000,
      address: '서울특별시 마포구',
      ownerCount: 2
    },
    expected: {
      oneHouseExemption: false,
      multiHouseSurtax: true
    }
  },
  // 6. 다주택자 (3주택 이상)
  {
    name: '다주택자 3주택 양도',
    input: {
      acquisitionDate: '2020-01-01',
      acquisitionPrice: 400000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 500000000,
      address: '서울특별시 송파구',
      ownerCount: 3
    },
    expected: {
      oneHouseExemption: false,
      multiHouseSurtax: true
    }
  },
  // 7. 단기매매 (1년 미만)
  {
    name: '단기매매 1년 미만',
    input: {
      acquisitionDate: '2025-06-01',
      acquisitionPrice: 300000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 350000000,
      address: '서울특별시 강동구',
      ownerCount: 1
    },
    expected: {
      oneHouseExemption: false,
      shortTermSurtax: true
    }
  },
  // 8. 단기매매 (1~2년)
  {
    name: '단기매매 1~2년',
    input: {
      acquisitionDate: '2024-06-01',
      acquisitionPrice: 300000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 380000000,
      address: '경기도 성남시',
      ownerCount: 1
    },
    expected: {
      oneHouseExemption: false,
      shortTermSurtax: true
    }
  },
  // 9. 조정대상지역 외 양도
  {
    name: '비조정지역 양도 (제주)',
    input: {
      acquisitionDate: '2020-01-01',
      acquisitionPrice: 250000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 350000000,
      address: '제주특별자치도 제주시',
      ownerCount: 1
    },
    expected: {
      oneHouseExemption: false,
      taxRange: { min: 1000000, max: 50000000 }
    }
  },
  // 10. 손실 발생 케이스
  {
    name: '양도손실 발생',
    input: {
      acquisitionDate: '2022-01-01',
      acquisitionPrice: 500000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 400000000,
      address: '경기도 안양시',
      ownerCount: 1
    },
    expected: {
      taxRange: { min: 0, max: 0 }
    }
  }
];

export interface TestResult {
  name: string;
  passed: boolean;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  error?: string;
}

/**
 * 샘플 테스트 실행
 */
export function runSampleTests(db: Database.Database): {
  passed: number;
  total: number;
  results: TestResult[];
} {
  const results: TestResult[] = [];
  let passed = 0;
  
  const activeRules = getAllActiveRules(db);
  const rules = activeRules.capitalGains.rules || DEFAULT_RULES.capital_gains.rules;
  const ruleIds = activeRules.capitalGains.ruleId 
    ? [activeRules.capitalGains.ruleId] 
    : ['DEFAULT_RULE'];
  const lawVersions = activeRules.capitalGains.lawVersion 
    ? [activeRules.capitalGains.lawVersion] 
    : [{ law_id: 'LAW_DEFAULT_INCOME', version_date: '2025-01-01' }];
  
  for (const testCase of SAMPLE_TEST_CASES) {
    try {
      const adjustedArea = isAdjustedArea(db, testCase.input.address);
      
      const result = calculateCapitalGainsTax(
        testCase.input,
        rules,
        adjustedArea,
        lawVersions,
        ruleIds
      );
      
      // 검증
      let testPassed = true;
      const errors: string[] = [];
      
      // 1세대1주택 비과세 검증
      if (testCase.expected.oneHouseExemption !== undefined) {
        if (result.applies.oneHouseExemption !== testCase.expected.oneHouseExemption) {
          testPassed = false;
          errors.push(`비과세 적용 불일치: expected=${testCase.expected.oneHouseExemption}, actual=${result.applies.oneHouseExemption}`);
        }
      }
      
      // 세액 범위 검증
      if (testCase.expected.taxRange) {
        if (result.totalTax < testCase.expected.taxRange.min || result.totalTax > testCase.expected.taxRange.max) {
          testPassed = false;
          errors.push(`세액 범위 벗어남: expected=${testCase.expected.taxRange.min}~${testCase.expected.taxRange.max}, actual=${result.totalTax}`);
        }
      }
      
      // 다주택 중과 검증
      if (testCase.expected.multiHouseSurtax !== undefined) {
        if (result.applies.multiHouseSurtax !== testCase.expected.multiHouseSurtax) {
          testPassed = false;
          errors.push(`다주택 중과 불일치: expected=${testCase.expected.multiHouseSurtax}, actual=${result.applies.multiHouseSurtax}`);
        }
      }
      
      // 단기매매 중과 검증
      if (testCase.expected.shortTermSurtax !== undefined) {
        if (result.applies.shortTermSurtax !== testCase.expected.shortTermSurtax) {
          testPassed = false;
          errors.push(`단기매매 중과 불일치: expected=${testCase.expected.shortTermSurtax}, actual=${result.applies.shortTermSurtax}`);
        }
      }
      
      if (testPassed) {
        passed++;
      }
      
      results.push({
        name: testCase.name,
        passed: testPassed,
        expected: testCase.expected as Record<string, unknown>,
        actual: {
          totalTax: result.totalTax,
          oneHouseExemption: result.applies.oneHouseExemption,
          multiHouseSurtax: result.applies.multiHouseSurtax,
          shortTermSurtax: result.applies.shortTermSurtax
        },
        error: errors.length > 0 ? errors.join('; ') : undefined
      });
      
    } catch (error) {
      results.push({
        name: testCase.name,
        passed: false,
        expected: testCase.expected as Record<string, unknown>,
        actual: {},
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return {
    passed,
    total: SAMPLE_TEST_CASES.length,
    results
  };
}
