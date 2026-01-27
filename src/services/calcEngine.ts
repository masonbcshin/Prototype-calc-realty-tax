/**
 * 양도소득세/취득세 계산 엔진
 * 규칙 JSON을 사용해 케이스별 누진/중과/공제 로직 적용
 */

import {
  CalculationInput,
  CalculationResult,
  TaxRules,
  TaxBracket,
  LawVersion,
  CapitalGainsRules,
  SurtaxRules
} from '../types';

// 면책 문구
const DISCLAIMER = '이 계산은 공개된 법령 텍스트를 기반으로 자동 추출된 규칙을 사용했습니다. ' +
  '정확성을 보장하지 않으며, 법적·세무적 자문이 아닙니다. 실제 신고 전 반드시 세무사·전문가와 상담하세요.';

/**
 * 보유기간 계산 (년 단위, 소수점 이하 절사)
 */
export function calculateHoldingPeriod(acquisitionDate: string, dispositionDate: string): number {
  const acqDate = new Date(acquisitionDate);
  const dispDate = new Date(dispositionDate);
  
  const diffMs = dispDate.getTime() - acqDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const years = Math.floor(diffDays / 365);
  
  return Math.max(0, years);
}

/**
 * 장기보유특별공제율 계산
 * 규칙 JSON의 long_hold_deduction 테이블 참조
 */
export function getLongHoldDeductionRate(
  holdingYears: number,
  residenceYears: number,
  rules: CapitalGainsRules,
  isOneHouse: boolean
): number {
  let holdRate = 0;
  let residenceRate = 0;
  
  // 보유기간별 공제율 찾기
  for (const bracket of rules.long_hold_deduction) {
    if (holdingYears >= bracket.from_years && holdingYears < bracket.to_years) {
      holdRate = bracket.hold_rate;
      residenceRate = bracket.residence_rate;
      break;
    }
    // 마지막 구간 (to_years가 Infinity인 경우)
    if (bracket.to_years === Infinity && holdingYears >= bracket.from_years) {
      holdRate = bracket.hold_rate;
      residenceRate = bracket.residence_rate;
      break;
    }
  }
  
  // 1세대1주택의 경우 거주기간 공제 추가 (최대 80%)
  if (isOneHouse && residenceYears >= 2) {
    // 1세대1주택 장기보유특별공제: 보유 3년부터 연 4%, 거주 2년부터 연 4%
    // 최대 보유 40% + 거주 40% = 80%
    const extraHoldRate = Math.min(40, Math.max(0, (holdingYears - 2)) * 4);
    const extraResidenceRate = Math.min(40, Math.max(0, (residenceYears - 1)) * 4);
    return Math.min(80, extraHoldRate + extraResidenceRate);
  }
  
  // 일반 장기보유특별공제 (최대 30%)
  return Math.min(30, holdRate);
}

/**
 * 세율 구간에 따른 세액 계산 (누진세)
 */
export function calculateProgressiveTax(taxBase: number, brackets: TaxBracket[]): {
  tax: number;
  appliedBracket: TaxBracket | null;
} {
  if (taxBase <= 0) {
    return { tax: 0, appliedBracket: null };
  }
  
  let appliedBracket: TaxBracket | null = null;
  
  // 해당 과세표준에 맞는 구간 찾기
  for (const bracket of brackets) {
    if (taxBase >= bracket.from && taxBase <= bracket.to) {
      appliedBracket = bracket;
      break;
    }
    if (bracket.to === Infinity && taxBase >= bracket.from) {
      appliedBracket = bracket;
      break;
    }
  }
  
  if (!appliedBracket) {
    // 마지막 구간 적용
    appliedBracket = brackets[brackets.length - 1];
  }
  
  // 세액 = 과세표준 × 세율 - 누진공제액
  const tax = Math.floor(taxBase * (appliedBracket.rate / 100) - appliedBracket.deduction);
  
  return { tax: Math.max(0, tax), appliedBracket };
}

/**
 * 1세대1주택 비과세 판정
 */
export function checkOneHouseExemption(
  input: CalculationInput,
  holdingYears: number,
  rules: CapitalGainsRules
): { isExempt: boolean; partialTax: boolean; taxableAmount: number } {
  const exemption = rules.one_house_exemption;
  
  // 주택 수 확인
  if (input.ownerCount !== 1) {
    return { isExempt: false, partialTax: false, taxableAmount: input.dispositionPrice - input.acquisitionPrice };
  }
  
  // 보유기간 확인
  if (holdingYears < exemption.min_hold_years) {
    return { isExempt: false, partialTax: false, taxableAmount: input.dispositionPrice - input.acquisitionPrice };
  }
  
  // 거주기간 확인
  const residenceYears = input.residenceYears || 0;
  if (residenceYears < exemption.min_residence_years && input.isPrimaryResidence !== true) {
    return { isExempt: false, partialTax: false, taxableAmount: input.dispositionPrice - input.acquisitionPrice };
  }
  
  // 양도가액이 12억원 초과시 부분 과세
  if (input.dispositionPrice > exemption.max_exemption_amount) {
    const gain = input.dispositionPrice - input.acquisitionPrice;
    // 12억 초과분에 대한 과세 비율 계산
    const taxableRatio = (input.dispositionPrice - exemption.max_exemption_amount) / input.dispositionPrice;
    const taxableAmount = Math.floor(gain * taxableRatio);
    return { isExempt: false, partialTax: true, taxableAmount };
  }
  
  return { isExempt: true, partialTax: false, taxableAmount: 0 };
}

/**
 * 중과세 계산
 */
export function calculateSurtax(
  baseTax: number,
  input: CalculationInput,
  holdingYears: number,
  isAdjustedArea: boolean,
  rules: SurtaxRules
): { surtax: number; isMultiHouseSurtax: boolean; isShortTermSurtax: boolean } {
  let surtax = 0;
  let isMultiHouseSurtax = false;
  let isShortTermSurtax = false;
  
  // 단기 매매 중과 (1년 미만: 70%, 1-2년: 60%)
  if (holdingYears < 1) {
    const shortTermRate = rules.short_term.under_one_year.rate;
    // 단기 매매의 경우 기본 세율 대신 단기 세율 적용
    isShortTermSurtax = true;
    // 단기 중과는 세액이 아닌 세율로 적용
    return { surtax: 0, isMultiHouseSurtax: false, isShortTermSurtax: true };
  } else if (holdingYears < 2) {
    isShortTermSurtax = true;
    return { surtax: 0, isMultiHouseSurtax: false, isShortTermSurtax: true };
  }
  
  // 다주택자 중과
  if (input.ownerCount >= 2) {
    isMultiHouseSurtax = true;
    
    if (isAdjustedArea) {
      // 조정대상지역 내 다주택
      if (input.ownerCount === 2) {
        const extraRate = rules.adjusted_area.two_houses.extra_rate;
        surtax = Math.floor(baseTax * (extraRate / 100));
      } else {
        const extraRate = rules.adjusted_area.three_or_more.extra_rate;
        surtax = Math.floor(baseTax * (extraRate / 100));
      }
    } else {
      // 조정대상지역 외 다주택
      if (input.ownerCount === 2) {
        const extraRate = rules.multi_house.two_houses.extra_rate;
        surtax = Math.floor(baseTax * (extraRate / 100));
      } else {
        const extraRate = rules.multi_house.three_or_more.extra_rate;
        surtax = Math.floor(baseTax * (extraRate / 100));
      }
    }
  }
  
  return { surtax, isMultiHouseSurtax, isShortTermSurtax };
}

/**
 * 메인 계산 함수: 양도소득세 계산
 */
export function calculateCapitalGainsTax(
  input: CalculationInput,
  rules: TaxRules,
  isAdjustedArea: boolean,
  lawVersions: LawVersion[],
  ruleIds: string[]
): CalculationResult {
  // 1. 보유기간 계산
  const holdingPeriodYears = calculateHoldingPeriod(input.acquisitionDate, input.dispositionDate);
  const residenceYears = input.residenceYears || 0;
  
  // 2. 양도차익 계산
  const gain = input.dispositionPrice - input.acquisitionPrice;
  const necessaryExpenses = input.necessaryExpenses || 0;
  const taxableGain = gain - necessaryExpenses;
  
  // 3. 1세대1주택 비과세 확인
  const exemptionResult = checkOneHouseExemption(input, holdingPeriodYears, rules.capital_gains);
  
  if (exemptionResult.isExempt) {
    return {
      taxBeforeSurtax: 0,
      surtax: 0,
      totalTax: 0,
      applies: {
        oneHouseExemption: true,
        longHoldDeduction: 0,
        isAdjustedArea,
        multiHouseSurtax: false,
        shortTermSurtax: false
      },
      details: {
        holdingPeriodYears,
        taxableGain: 0,
        deductions: taxableGain,
        taxBase: 0,
        appliedBracket: null
      },
      appliedRules: ruleIds,
      lawVersions,
      notes: DISCLAIMER + ' 1세대1주택 비과세 요건 충족.'
    };
  }
  
  // 4. 단기매매 중과 확인
  let effectiveTaxRate = 0;
  let isShortTermSurtax = false;
  
  if (holdingPeriodYears < 1) {
    effectiveTaxRate = rules.surtax.short_term.under_one_year.rate;
    isShortTermSurtax = true;
  } else if (holdingPeriodYears < 2) {
    effectiveTaxRate = rules.surtax.short_term.one_to_two_years.rate;
    isShortTermSurtax = true;
  }
  
  // 5. 장기보유특별공제율 계산
  const isOneHouse = input.ownerCount === 1 && (input.isPrimaryResidence || residenceYears >= 2);
  const longHoldDeductionRate = isShortTermSurtax ? 0 : 
    getLongHoldDeductionRate(holdingPeriodYears, residenceYears, rules.capital_gains, isOneHouse);
  
  // 6. 과세표준 계산
  const effectiveGain = exemptionResult.partialTax ? exemptionResult.taxableAmount : taxableGain;
  const longHoldDeduction = Math.floor(effectiveGain * (longHoldDeductionRate / 100));
  const basicDeduction = rules.capital_gains.basic_deduction;
  const totalDeductions = longHoldDeduction + basicDeduction + necessaryExpenses;
  
  const taxBase = Math.max(0, effectiveGain - longHoldDeduction - basicDeduction);
  
  // 7. 세액 계산
  let taxBeforeSurtax: number;
  let appliedBracket: TaxBracket | null = null;
  
  if (isShortTermSurtax) {
    // 단기매매: 고정 세율 적용
    taxBeforeSurtax = Math.floor(taxBase * (effectiveTaxRate / 100));
  } else {
    // 누진세 계산
    const taxResult = calculateProgressiveTax(taxBase, rules.capital_gains.tax_brackets);
    taxBeforeSurtax = taxResult.tax;
    appliedBracket = taxResult.appliedBracket;
  }
  
  // 8. 중과세 계산
  const surtaxResult = calculateSurtax(
    taxBeforeSurtax,
    input,
    holdingPeriodYears,
    isAdjustedArea,
    rules.surtax
  );
  
  const totalTax = taxBeforeSurtax + surtaxResult.surtax;
  
  return {
    taxBeforeSurtax,
    surtax: surtaxResult.surtax,
    totalTax,
    applies: {
      oneHouseExemption: false,
      longHoldDeduction: longHoldDeductionRate / 100,
      isAdjustedArea,
      multiHouseSurtax: surtaxResult.isMultiHouseSurtax,
      shortTermSurtax: isShortTermSurtax
    },
    details: {
      holdingPeriodYears,
      taxableGain: effectiveGain,
      deductions: totalDeductions,
      taxBase,
      appliedBracket
    },
    appliedRules: ruleIds,
    lawVersions,
    notes: DISCLAIMER
  };
}

/**
 * 취득세 계산
 */
export function calculateAcquisitionTax(
  acquisitionPrice: number,
  ownerCount: number,
  isAdjustedArea: boolean,
  isResidential: boolean = true
): { tax: number; rate: number } {
  // 기본 취득세율 테이블 (주거용)
  if (!isResidential) {
    return { tax: Math.floor(acquisitionPrice * 0.04), rate: 4 };
  }
  
  let rate: number;
  
  // 다주택자 중과
  if (ownerCount >= 3) {
    rate = isAdjustedArea ? 12 : 8;
  } else if (ownerCount === 2 && isAdjustedArea) {
    rate = 8;
  } else {
    // 일반 주택 취득세율
    if (acquisitionPrice <= 600000000) {
      rate = 1;
    } else if (acquisitionPrice <= 900000000) {
      rate = 2;
    } else {
      rate = 3;
    }
  }
  
  const tax = Math.floor(acquisitionPrice * (rate / 100));
  return { tax, rate };
}
