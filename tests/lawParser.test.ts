/**
 * 법령 파서 단위 테스트
 */

import {
  parseAmountString,
  parsePercentString,
  extractTaxBrackets,
  extractLongHoldDeduction,
  extractExemptionConditions,
  extractMultiHouseSurtax,
  extractShortTermRates,
  parseIncomeTaxLaw,
  validateRules
} from '../src/services/lawParser';
import { TaxRules } from '../src/types';

describe('법령 파서 테스트', () => {
  describe('금액 문자열 파싱', () => {
    test('억 단위 파싱', () => {
      expect(parseAmountString('1억원')).toBe(100000000);
      expect(parseAmountString('12억원')).toBe(1200000000);
    });

    test('만원 단위 파싱', () => {
      expect(parseAmountString('1,200만원')).toBe(12000000);
      expect(parseAmountString('250만원')).toBe(2500000);
    });

    test('천만원 단위 파싱', () => {
      expect(parseAmountString('5천만원')).toBe(50000000);
    });

    test('순수 숫자+원 파싱', () => {
      expect(parseAmountString('1,000,000원')).toBe(1000000);
    });
  });

  describe('퍼센트 문자열 파싱', () => {
    test('% 기호 파싱', () => {
      expect(parsePercentString('15%')).toBe(15);
      expect(parsePercentString('6%')).toBe(6);
    });

    test('퍼센트 단어 파싱', () => {
      expect(parsePercentString('20퍼센트')).toBe(20);
    });

    test('소수점 퍼센트', () => {
      expect(parsePercentString('15.5%')).toBe(15.5);
    });
  });

  describe('세율 구간 추출', () => {
    test('기본 세율표 반환', () => {
      const brackets = extractTaxBrackets('');
      expect(brackets.length).toBeGreaterThan(0);
      expect(brackets[0].rate).toBe(6);
    });

    test('세율 구간 순서 검증', () => {
      const brackets = extractTaxBrackets('');
      for (let i = 1; i < brackets.length; i++) {
        expect(brackets[i].from).toBeGreaterThan(brackets[i - 1].from);
      }
    });
  });

  describe('장기보유공제 추출', () => {
    test('기본 공제율 반환', () => {
      const deductions = extractLongHoldDeduction('');
      expect(deductions.length).toBeGreaterThan(0);
      expect(deductions[0].hold_rate).toBe(0); // 3년 미만
    });

    test('15년 이상 최대 30%', () => {
      const deductions = extractLongHoldDeduction('');
      const maxDeduction = deductions.find(d => d.to_years === Infinity);
      expect(maxDeduction?.hold_rate).toBe(30);
    });
  });

  describe('비과세 조건 추출', () => {
    test('기본 요건', () => {
      const conditions = extractExemptionConditions('');
      expect(conditions.minHoldYears).toBe(2);
      expect(conditions.minResidenceYears).toBe(2);
      expect(conditions.maxExemptionAmount).toBe(1200000000);
    });

    test('패턴 매칭', () => {
      const text = '보유기간 3년 이상, 거주기간 2년 이상인 경우 비과세';
      const conditions = extractExemptionConditions(text);
      expect(conditions.minHoldYears).toBe(3);
    });
  });

  describe('다주택자 중과 추출', () => {
    test('기본 중과율', () => {
      const surtax = extractMultiHouseSurtax('');
      expect(surtax.twoHousesRate).toBe(20);
      expect(surtax.threeOrMoreRate).toBe(30);
    });
  });

  describe('단기매매 세율 추출', () => {
    test('기본 단기 세율', () => {
      const rates = extractShortTermRates('');
      expect(rates.underOneYear).toBe(70);
      expect(rates.oneToTwoYears).toBe(60);
    });
  });

  describe('전체 파싱', () => {
    test('소득세법 파싱', () => {
      const result = parseIncomeTaxLaw(
        'TEST_LAW',
        '소득세법',
        '2025-01-01',
        '양도소득세 과세표준 1,200만원 이하 6%'
      );
      
      expect(result.law_id).toBe('TEST_LAW');
      expect(result.title).toBe('소득세법');
      expect(result.rules).toBeDefined();
    });

    test('규칙 검증 - 유효한 규칙', () => {
      const result = parseIncomeTaxLaw(
        'TEST_LAW',
        '소득세법',
        '2025-01-01',
        ''
      );
      
      const validation = validateRules(result.rules as TaxRules);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    test('규칙 검증 - 세율 구간 누락', () => {
      const invalidRules = {
        capital_gains: {
          basic_deduction: 2500000,
          tax_brackets: [],
          long_hold_deduction: [],
          one_house_exemption: {
            min_hold_years: 2,
            min_residence_years: 2,
            max_exemption_amount: 1200000000,
            condition_description: ''
          }
        },
        surtax: {
          multi_house: { two_houses: { extra_rate: 20 }, three_or_more: { extra_rate: 30 } },
          adjusted_area: { two_houses: { extra_rate: 20 }, three_or_more: { extra_rate: 30 } },
          short_term: { under_one_year: { rate: 70 }, one_to_two_years: { rate: 60 } }
        }
      };
      
      const validation = validateRules(invalidRules);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});
