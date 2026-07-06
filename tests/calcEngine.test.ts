/**
 * 계산 엔진 단위 테스트
 * 10개의 테스트 케이스
 */

import {
  calculateHoldingPeriod,
  getLongHoldDeductionRate,
  calculateProgressiveTax,
  checkOneHouseExemption,
  calculateSurtax,
  calculateCapitalGainsTax,
  calculateAcquisitionTax
} from '../src/services/calcEngine';
import { DEFAULT_RULES } from '../src/db/schema';
import { CalculationInput, TaxRules, TaxBracket } from '../src/types';

describe('계산 엔진 테스트', () => {
  // 기본 규칙
  const rules: TaxRules = DEFAULT_RULES.capital_gains.rules as TaxRules;
  const lawVersions = [{ law_id: 'TEST_LAW', version_date: '2025-01-01' }];
  const ruleIds = ['TEST_RULE'];

  describe('보유기간 계산', () => {
    test('정확한 년수 계산', () => {
      expect(calculateHoldingPeriod('2016-01-01', '2026-01-01')).toBe(10);
      // 2023-06-15 ~ 2026-06-14 = 1094일 / 365 = 2.99년 -> 절사 = 2년
      // 실제로는 364일 모자라므로 거의 3년 -> 절사 방식에 따라 2 또는 3
      expect(calculateHoldingPeriod('2023-06-15', '2026-06-15')).toBe(3);
      expect(calculateHoldingPeriod('2025-01-01', '2025-12-31')).toBe(0);
    });

    test('윤년 처리', () => {
      expect(calculateHoldingPeriod('2020-02-29', '2024-02-29')).toBe(4);
    });
  });

  describe('장기보유특별공제율', () => {
    test('3년 미만 - 공제율 0%', () => {
      const rate = getLongHoldDeductionRate(2, 0, rules.capital_gains, false);
      expect(rate).toBe(0);
    });

    test('10년 보유 - 공제율 20%', () => {
      const rate = getLongHoldDeductionRate(10, 0, rules.capital_gains, false);
      expect(rate).toBe(20);
    });

    test('15년 이상 보유 - 최대 공제율 30%', () => {
      const rate = getLongHoldDeductionRate(20, 0, rules.capital_gains, false);
      expect(rate).toBe(30);
    });
  });

  describe('누진세 계산', () => {
    test('1,200만원 이하 - 6%', () => {
      const result = calculateProgressiveTax(10000000, rules.capital_gains.tax_brackets);
      expect(result.tax).toBe(600000);
      expect(result.appliedBracket?.rate).toBe(6);
    });

    test('5,000만원 - 15% 구간', () => {
      const result = calculateProgressiveTax(50000000, rules.capital_gains.tax_brackets);
      // 50,000,000 * 15% - 1,260,000 = 6,240,000
      expect(result.tax).toBe(6240000);
    });

    test('1억원 - 35% 구간', () => {
      const result = calculateProgressiveTax(100000000, rules.capital_gains.tax_brackets);
      // 100,000,000 * 35% - 15,440,000 = 19,560,000
      expect(result.tax).toBe(19560000);
    });

    test('과세표준 0원', () => {
      const result = calculateProgressiveTax(0, rules.capital_gains.tax_brackets);
      expect(result.tax).toBe(0);
      expect(result.appliedBracket).toBeNull();
    });
  });

  describe('1세대1주택 비과세', () => {
    test('비과세 조건 충족', () => {
      const input: CalculationInput = {
        acquisitionDate: '2016-01-01',
        acquisitionPrice: 500000000,
        dispositionDate: '2026-01-01',
        dispositionPrice: 1000000000,
        address: '서울시',
        ownerCount: 1,
        isPrimaryResidence: true,
        residenceYears: 10
      };
      
      const result = checkOneHouseExemption(input, 10, rules.capital_gains);
      expect(result.isExempt).toBe(true);
    });

    test('다주택자 - 비과세 불가', () => {
      const input: CalculationInput = {
        acquisitionDate: '2016-01-01',
        acquisitionPrice: 500000000,
        dispositionDate: '2026-01-01',
        dispositionPrice: 1000000000,
        address: '서울시',
        ownerCount: 2
      };
      
      const result = checkOneHouseExemption(input, 10, rules.capital_gains);
      expect(result.isExempt).toBe(false);
    });

    test('12억 초과 - 부분과세', () => {
      const input: CalculationInput = {
        acquisitionDate: '2016-01-01',
        acquisitionPrice: 800000000,
        dispositionDate: '2026-01-01',
        dispositionPrice: 1500000000,
        address: '서울시',
        ownerCount: 1,
        isPrimaryResidence: true,
        residenceYears: 10
      };
      
      const result = checkOneHouseExemption(input, 10, rules.capital_gains);
      expect(result.isExempt).toBe(false);
      expect(result.partialTax).toBe(true);
      expect(result.taxableAmount).toBeGreaterThan(0);
    });
  });

  describe('중과세 계산', () => {
    test('다주택자 2주택 중과', () => {
      const input: CalculationInput = {
        acquisitionDate: '2020-01-01',
        acquisitionPrice: 400000000,
        dispositionDate: '2026-01-01',
        dispositionPrice: 500000000,
        address: '서울시',
        ownerCount: 2
      };
      
      const result = calculateSurtax(10000000, input, 5, true, rules.surtax);
      expect(result.isMultiHouseSurtax).toBe(true);
      expect(result.surtax).toBeGreaterThan(0);
    });

    test('단기매매 1년 미만', () => {
      const input: CalculationInput = {
        acquisitionDate: '2025-06-01',
        acquisitionPrice: 300000000,
        dispositionDate: '2026-01-01',
        dispositionPrice: 350000000,
        address: '서울시',
        ownerCount: 1
      };
      
      const result = calculateSurtax(10000000, input, 0, false, rules.surtax);
      expect(result.isShortTermSurtax).toBe(true);
    });
  });

  describe('전체 양도소득세 계산', () => {
    test('케이스 1: 1세대1주택 비과세', () => {
      const input: CalculationInput = {
        acquisitionDate: '2016-01-01',
        acquisitionPrice: 500000000,
        dispositionDate: '2026-01-01',
        dispositionPrice: 1000000000,
        address: '서울특별시 강남구',
        ownerCount: 1,
        isPrimaryResidence: true,
        residenceYears: 10
      };
      
      const result = calculateCapitalGainsTax(input, rules, true, lawVersions, ruleIds);
      expect(result.applies.oneHouseExemption).toBe(true);
      expect(result.totalTax).toBe(0);
    });

    test('케이스 2: 일반 양도 (이익 발생)', () => {
      const input: CalculationInput = {
        acquisitionDate: '2023-01-01',
        acquisitionPrice: 350000000,
        dispositionDate: '2026-01-01',
        dispositionPrice: 450000000,
        address: '경기도 용인시',
        ownerCount: 1,
        isPrimaryResidence: false
      };
      
      const result = calculateCapitalGainsTax(input, rules, false, lawVersions, ruleIds);
      expect(result.applies.oneHouseExemption).toBe(false);
      expect(result.totalTax).toBeGreaterThan(0);
      expect(result.details.taxableGain).toBe(100000000);
    });

    test('케이스 3: 양도손실', () => {
      const input: CalculationInput = {
        acquisitionDate: '2022-01-01',
        acquisitionPrice: 500000000,
        dispositionDate: '2026-01-01',
        dispositionPrice: 400000000,
        address: '경기도 안양시',
        ownerCount: 1
      };
      
      const result = calculateCapitalGainsTax(input, rules, false, lawVersions, ruleIds);
      expect(result.totalTax).toBe(0);
      expect(result.details.taxableGain).toBeLessThan(0);
    });

    test('케이스 4: 다주택자 중과', () => {
      const input: CalculationInput = {
        acquisitionDate: '2020-01-01',
        acquisitionPrice: 400000000,
        dispositionDate: '2026-01-01',
        dispositionPrice: 550000000,
        address: '서울특별시 마포구',
        ownerCount: 3
      };
      
      const result = calculateCapitalGainsTax(input, rules, true, lawVersions, ruleIds);
      expect(result.applies.multiHouseSurtax).toBe(true);
      expect(result.surtax).toBeGreaterThan(0);
    });
  });

  describe('취득세 계산', () => {
    test('6억 이하 - 1%', () => {
      const result = calculateAcquisitionTax(500000000, 1, false);
      expect(result.rate).toBe(1);
      expect(result.tax).toBe(5000000);
    });

    test('6억 초과 9억 이하 - 선형 슬라이딩 세율', () => {
      // 7.5억(구간 중간값)은 정확히 2%
      const mid = calculateAcquisitionTax(750000000, 1, false);
      expect(mid.rate).toBe(2);
      expect(mid.tax).toBe(15000000);

      // 8억은 (8 × 2/3 − 3) = 2.3333%
      const result = calculateAcquisitionTax(800000000, 1, false);
      expect(result.rate).toBe(2.3333);
      expect(result.tax).toBe(18666400);

      // 6억/9억 경계는 각각 1%, 3%로 연속
      expect(calculateAcquisitionTax(600000001, 1, false).rate).toBeCloseTo(1, 4);
      expect(calculateAcquisitionTax(900000000, 1, false).rate).toBe(3);
    });

    test('다주택자 조정지역 - 중과', () => {
      const result = calculateAcquisitionTax(500000000, 3, true);
      expect(result.rate).toBe(12);
    });
  });
});
