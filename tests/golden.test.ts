/**
 * 골든(정답) 대조 테스트
 *
 * 목적: 유닛테스트가 "코드가 산출한 값"을 그대로 기대값으로 쓰면 순환논리가 되어
 *       결과 정확성을 보증하지 못한다. 이 파일의 기대값은 모두 **법령/공식으로 직접
 *       손계산**하여 고정한 값이다. 코드가 이 값과 어긋나면 회귀로 간주한다.
 *
 * 참고: 홈택스 모의계산은 로그인·인터랙티브라 자동화 대상이 아니므로, 조문·공시
 *       세율표에 근거한 확정값을 스냅샷으로 박는다. 각 케이스에 산출 근거를 주석으로 남긴다.
 */

import {
  calculateCapitalGainsTax,
  calculateAcquisitionTax
} from '../src/services/calcEngine';
import { DEFAULT_RULES } from '../src/db/schema';
import { CalculationInput, TaxRules } from '../src/types';

const rules: TaxRules = DEFAULT_RULES.capital_gains.rules as TaxRules;
const lawVersions = [{ law_id: 'GOLDEN', version_date: '2025-01-01' }];
const ruleIds = ['GOLDEN'];

describe('골든 대조 - 취득세 (지방세법 제11조제1항제8호)', () => {
  // 유상거래 주택, 1주택, 비조정, 주거용. 세율(%) = 취득가액(억)×2/3 − 3, 백분율 소수 2자리 반올림.
  test('5억: 6억 이하 → 1%, 세액 5,000,000', () => {
    const r = calculateAcquisitionTax(500000000, 1, false);
    expect(r.rate).toBe(1);
    expect(r.tax).toBe(5000000);
  });

  test('6.5억: (6.5×2/3−3)=1.33% → 세액 8,645,000', () => {
    const r = calculateAcquisitionTax(650000000, 1, false);
    expect(r.rate).toBe(1.33);
    expect(r.tax).toBe(8645000);
  });

  test('7.5억(구간 중간): 정확히 2% → 세액 15,000,000', () => {
    const r = calculateAcquisitionTax(750000000, 1, false);
    expect(r.rate).toBe(2);
    expect(r.tax).toBe(15000000);
  });

  test('8억: (8×2/3−3)=2.33% → 세액 18,640,000', () => {
    const r = calculateAcquisitionTax(800000000, 1, false);
    expect(r.rate).toBe(2.33);
    expect(r.tax).toBe(18640000);
  });

  test('10억: 9억 초과 → 3%, 세액 30,000,000', () => {
    const r = calculateAcquisitionTax(1000000000, 1, false);
    expect(r.rate).toBe(3);
    expect(r.tax).toBe(30000000);
  });

  test('5억·3주택·조정지역: 다주택 중과 12% → 세액 60,000,000', () => {
    const r = calculateAcquisitionTax(500000000, 3, true);
    expect(r.rate).toBe(12);
    expect(r.tax).toBe(60000000);
  });

  test('비주거용 5억: 4% → 세액 20,000,000', () => {
    const r = calculateAcquisitionTax(500000000, 1, false, false);
    expect(r.rate).toBe(4);
    expect(r.tax).toBe(20000000);
  });
});

describe('골든 대조 - 양도소득세 (소득세법 기본세율표 §55, 장특공 §95)', () => {
  test('일반 양도(보유6년·비1주택): 세액 14,760,000', () => {
    // 취득3억/양도4억 → 양도차익 1억. 일반 장특공 6년=12% → 공제 12,000,000.
    // 기본공제 2,500,000. 과표 = 100,000,000−12,000,000−2,500,000 = 85,500,000.
    // 누진: 85,500,000×24% − 5,760,000 = 14,760,000. 중과 없음.
    const input: CalculationInput = {
      acquisitionDate: '2020-01-01',
      acquisitionPrice: 300000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 400000000,
      address: '경기도 용인시',
      ownerCount: 1,
      isPrimaryResidence: false,
      residenceYears: 0
    };
    const r = calculateCapitalGainsTax(input, rules, false, lawVersions, ruleIds);
    expect(r.applies.oneHouseExemption).toBe(false);
    expect(r.details.taxBase).toBe(85500000);
    expect(r.totalTax).toBe(14760000);
  });

  test('1세대1주택 비과세(양도가 12억 이하): 세액 0', () => {
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
    const r = calculateCapitalGainsTax(input, rules, true, lawVersions, ruleIds);
    expect(r.applies.oneHouseExemption).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  test('1세대1주택 12억 초과 부분과세(보유10·거주10): 장특공 80% → 세액 2,565,000', () => {
    // 양도차익 7억. 과세대상 안분 = (15억−12억)/15억 = 0.2 → 과세차익 140,000,000.
    // 장특공 표2: 보유10년 40% + 거주10년 40% = 80% → 공제 112,000,000.
    // 기본공제 2,500,000. 과표 = 140,000,000−112,000,000−2,500,000 = 25,500,000.
    // 누진: 25,500,000×15% − 1,260,000 = 2,565,000.
    const input: CalculationInput = {
      acquisitionDate: '2016-01-01',
      acquisitionPrice: 800000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 1500000000,
      address: '서울특별시 서초구',
      ownerCount: 1,
      isPrimaryResidence: true,
      residenceYears: 10
    };
    const r = calculateCapitalGainsTax(input, rules, true, lawVersions, ruleIds);
    expect(r.applies.oneHouseExemption).toBe(false);
    expect(r.details.taxableGain).toBe(140000000);
    expect(r.applies.longHoldDeduction).toBeCloseTo(0.8, 5);
    expect(r.details.taxBase).toBe(25500000);
    expect(r.totalTax).toBe(2565000);
  });

  test('단기매매(1년 미만): 70% 고정세율 → 세액 33,250,000', () => {
    // 취득3억/양도3.5억 → 차익 50,000,000. 단기: 장특공 0, 기본공제 2,500,000.
    // 과표 = 50,000,000−2,500,000 = 47,500,000. 세액 = 47,500,000×70% = 33,250,000.
    const input: CalculationInput = {
      acquisitionDate: '2025-06-01',
      acquisitionPrice: 300000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 350000000,
      address: '서울특별시 강동구',
      ownerCount: 1
    };
    const r = calculateCapitalGainsTax(input, rules, false, lawVersions, ruleIds);
    expect(r.applies.shortTermSurtax).toBe(true);
    expect(r.details.taxBase).toBe(47500000);
    expect(r.totalTax).toBe(33250000);
  });

  test('3주택·조정지역 중과(+30%): 세액 38,850,500', () => {
    // 취득4억/양도5.5억 → 차익 150,000,000. 일반 장특공 6년=12% → 18,000,000.
    // 기본공제 2,500,000. 과표 = 150,000,000−18,000,000−2,500,000 = 129,500,000.
    // 누진: 129,500,000×35% − 15,440,000 = 29,885,000.
    // 조정지역 3주택 중과 +30% → 8,965,500. 합계 = 38,850,500.
    const input: CalculationInput = {
      acquisitionDate: '2020-01-01',
      acquisitionPrice: 400000000,
      dispositionDate: '2026-01-01',
      dispositionPrice: 550000000,
      address: '서울특별시 송파구',
      ownerCount: 3
    };
    const r = calculateCapitalGainsTax(input, rules, true, lawVersions, ruleIds);
    expect(r.applies.multiHouseSurtax).toBe(true);
    expect(r.details.taxBase).toBe(129500000);
    expect(r.taxBeforeSurtax).toBe(29885000);
    expect(r.surtax).toBe(8965500);
    expect(r.totalTax).toBe(38850500);
  });
});
