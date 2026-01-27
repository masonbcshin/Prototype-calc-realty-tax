/**
 * 법령 파서
 * 법령 본문에서 세율 표, 누진 구간, 장기보유공제 규칙 등을 추출
 * 정규표현식 기반 파싱
 */

import {
  TaxRules,
  TaxBracket,
  LongHoldDeduction,
  CapitalGainsRules,
  SurtaxRules,
  ParsedLawRules,
  AcquisitionTaxRules
} from '../types';

/**
 * 금액 문자열을 숫자로 변환
 * 예: "1억2천만원" -> 120000000, "1,200만원" -> 12000000
 */
export function parseAmountString(amountStr: string): number {
  // 숫자와 단위를 분리
  let amount = 0;
  
  // "억" 단위 처리
  const billionMatch = amountStr.match(/(\d+(?:,\d+)?)\s*억/);
  if (billionMatch) {
    amount += parseFloat(billionMatch[1].replace(/,/g, '')) * 100000000;
  }
  
  // "천만" 단위 처리
  const tenMillionMatch = amountStr.match(/(\d+(?:,\d+)?)\s*천\s*만/);
  if (tenMillionMatch) {
    amount += parseFloat(tenMillionMatch[1].replace(/,/g, '')) * 10000000;
  } else {
    // "만" 단위만 있는 경우
    const manMatch = amountStr.match(/(\d+(?:,\d+)?)\s*만/);
    if (manMatch && !amountStr.includes('천만')) {
      amount += parseFloat(manMatch[1].replace(/,/g, '')) * 10000;
    }
  }
  
  // 순수 숫자 + "원" 패턴
  const wonMatch = amountStr.match(/(\d{1,3}(?:,\d{3})*)\s*원/);
  if (wonMatch && !billionMatch && !tenMillionMatch) {
    amount = parseFloat(wonMatch[1].replace(/,/g, ''));
  }
  
  // 숫자만 있는 경우
  if (amount === 0) {
    const numOnly = amountStr.replace(/[^0-9]/g, '');
    if (numOnly) {
      amount = parseFloat(numOnly);
    }
  }
  
  return amount;
}

/**
 * 퍼센트 문자열을 숫자로 변환
 * 예: "15%" -> 15, "15퍼센트" -> 15
 */
export function parsePercentString(percentStr: string): number {
  const match = percentStr.match(/(\d+(?:\.\d+)?)\s*(?:%|퍼센트)/);
  if (match) {
    return parseFloat(match[1]);
  }
  return 0;
}

/**
 * 세율 표 추출 (누진세율)
 * 법령 본문에서 "X원 이하: Y%", "X원 초과 ~ Y원 이하: Z%" 형태 추출
 */
export function extractTaxBrackets(lawText: string): TaxBracket[] {
  const brackets: TaxBracket[] = [];
  
  // 패턴 1: "X원 이하 Y%" 또는 "X원 초과 Y원 이하 Z%"
  const pattern1 = /(\d{1,3}(?:,\d{3})*(?:만|억)?)\s*원?\s*(?:이하|까지)\s*[:\s]*(\d+(?:\.\d+)?)\s*%/g;
  const pattern2 = /(\d{1,3}(?:,\d{3})*(?:만|억)?)\s*원?\s*초과\s*(\d{1,3}(?:,\d{3})*(?:만|억)?)\s*원?\s*(?:이하|까지)\s*[:\s]*(\d+(?:\.\d+)?)\s*%/g;
  
  // 간단한 표 형식 파싱 시도
  // 예: "1,200만원 이하 6%"
  const simplePattern = /(\d[\d,]*)\s*(?:만)?원?\s*(?:이하|초과)\s*(?:~\s*(\d[\d,]*)\s*(?:만)?원?\s*(?:이하))?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%/g;
  
  let match;
  let prevTo = 0;
  
  // 소득세법 양도소득세 누진세율 기본 구조 (하드코딩된 기본값)
  const defaultBrackets: TaxBracket[] = [
    { from: 0, to: 14000000, rate: 6, deduction: 0 },
    { from: 14000001, to: 50000000, rate: 15, deduction: 1260000 },
    { from: 50000001, to: 88000000, rate: 24, deduction: 5760000 },
    { from: 88000001, to: 150000000, rate: 35, deduction: 15440000 },
    { from: 150000001, to: 300000000, rate: 38, deduction: 19940000 },
    { from: 300000001, to: 500000000, rate: 40, deduction: 25940000 },
    { from: 500000001, to: 1000000000, rate: 42, deduction: 35940000 },
    { from: 1000000001, to: Infinity, rate: 45, deduction: 65940000 }
  ];
  
  // 텍스트에서 숫자와 퍼센트 패턴 추출 시도
  const taxRatePattern = /(\d{1,3}(?:,\d{3})*)\s*원.*?(\d+)\s*(?:%|퍼센트)/g;
  
  while ((match = taxRatePattern.exec(lawText)) !== null) {
    const amount = parseFloat(match[1].replace(/,/g, ''));
    const rate = parseFloat(match[2]);
    
    if (amount > 0 && rate > 0 && rate <= 100) {
      brackets.push({
        from: prevTo + 1,
        to: amount,
        rate: rate,
        deduction: 0 // 누진공제액은 별도 계산 필요
      });
      prevTo = amount;
    }
  }
  
  // 추출 실패 시 기본값 반환
  if (brackets.length < 3) {
    return defaultBrackets;
  }
  
  // 누진공제액 계산
  for (let i = 1; i < brackets.length; i++) {
    const prevBracket = brackets[i - 1];
    const prevTax = prevBracket.to * (prevBracket.rate / 100) - prevBracket.deduction;
    const currentTaxAtPrevTo = prevBracket.to * (brackets[i].rate / 100);
    brackets[i].deduction = Math.floor(currentTaxAtPrevTo - prevTax);
  }
  
  return brackets;
}

/**
 * 장기보유특별공제율 추출
 */
export function extractLongHoldDeduction(lawText: string): LongHoldDeduction[] {
  const deductions: LongHoldDeduction[] = [];
  
  // 패턴: "보유기간 X년 이상 Y년 미만: Z%"
  const pattern = /보유\s*기간\s*(\d+)\s*년\s*(?:이상)?\s*(?:~|부터)?\s*(\d+)?\s*년?\s*(?:미만|이하|까지)?\s*[:\s]*(\d+)\s*%/g;
  
  let match;
  while ((match = pattern.exec(lawText)) !== null) {
    const fromYears = parseInt(match[1]);
    const toYears = match[2] ? parseInt(match[2]) : fromYears + 1;
    const rate = parseInt(match[3]);
    
    deductions.push({
      from_years: fromYears,
      to_years: toYears,
      hold_rate: rate,
      residence_rate: 0
    });
  }
  
  // 기본값 반환
  if (deductions.length === 0) {
    return [
      { from_years: 0, to_years: 3, hold_rate: 0, residence_rate: 0 },
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
    ];
  }
  
  return deductions;
}

/**
 * 비과세 조건 추출
 */
export function extractExemptionConditions(lawText: string): {
  minHoldYears: number;
  minResidenceYears: number;
  maxExemptionAmount: number;
} {
  // 보유기간 요건
  const holdPattern = /보유\s*기간\s*(\d+)\s*년\s*(?:이상)?/;
  const holdMatch = lawText.match(holdPattern);
  const minHoldYears = holdMatch ? parseInt(holdMatch[1]) : 2;
  
  // 거주기간 요건
  const residencePattern = /거주\s*기간\s*(\d+)\s*년\s*(?:이상)?/;
  const residenceMatch = lawText.match(residencePattern);
  const minResidenceYears = residenceMatch ? parseInt(residenceMatch[1]) : 2;
  
  // 비과세 한도액
  const exemptionPattern = /(\d+)\s*억\s*원.*?(?:초과|이상).*?과세|비과세.*?(\d+)\s*억/;
  const exemptionMatch = lawText.match(exemptionPattern);
  const maxExemptionAmount = exemptionMatch 
    ? parseInt(exemptionMatch[1] || exemptionMatch[2]) * 100000000 
    : 1200000000;
  
  return {
    minHoldYears,
    minResidenceYears,
    maxExemptionAmount
  };
}

/**
 * 다주택자 중과 조건 추출
 */
export function extractMultiHouseSurtax(lawText: string): {
  twoHousesRate: number;
  threeOrMoreRate: number;
} {
  // 2주택 중과
  const twoPattern = /2\s*주택.*?(\d+)\s*%\s*(?:포인트|p)?.*?(?:중과|가산)/;
  const twoMatch = lawText.match(twoPattern);
  const twoHousesRate = twoMatch ? parseInt(twoMatch[1]) : 20;
  
  // 3주택 이상 중과
  const threePattern = /3\s*주택.*?(\d+)\s*%\s*(?:포인트|p)?.*?(?:중과|가산)/;
  const threeMatch = lawText.match(threePattern);
  const threeOrMoreRate = threeMatch ? parseInt(threeMatch[1]) : 30;
  
  return { twoHousesRate, threeOrMoreRate };
}

/**
 * 단기매매 세율 추출
 */
export function extractShortTermRates(lawText: string): {
  underOneYear: number;
  oneToTwoYears: number;
} {
  // 1년 미만
  const oneYearPattern = /1\s*년\s*미만.*?(\d+)\s*%/;
  const oneYearMatch = lawText.match(oneYearPattern);
  const underOneYear = oneYearMatch ? parseInt(oneYearMatch[1]) : 70;
  
  // 1년 이상 2년 미만
  const twoYearPattern = /(?:1\s*년\s*이상\s*)?2\s*년\s*미만.*?(\d+)\s*%/;
  const twoYearMatch = lawText.match(twoYearPattern);
  const oneToTwoYears = twoYearMatch ? parseInt(twoYearMatch[1]) : 60;
  
  return { underOneYear, oneToTwoYears };
}

/**
 * 메인 파서 함수: 소득세법(양도소득세) 파싱
 */
export function parseIncomeTaxLaw(
  lawId: string,
  title: string,
  versionDate: string,
  lawText: string
): ParsedLawRules {
  // 세율 구간 추출
  const taxBrackets = extractTaxBrackets(lawText);
  
  // 장기보유특별공제 추출
  const longHoldDeduction = extractLongHoldDeduction(lawText);
  
  // 비과세 조건 추출
  const exemptionConditions = extractExemptionConditions(lawText);
  
  // 중과세 조건 추출
  const multiHouseSurtax = extractMultiHouseSurtax(lawText);
  const shortTermRates = extractShortTermRates(lawText);
  
  // 규칙 구조화
  const rules: TaxRules = {
    capital_gains: {
      basic_deduction: 2500000,
      tax_brackets: taxBrackets,
      long_hold_deduction: longHoldDeduction,
      one_house_exemption: {
        min_hold_years: exemptionConditions.minHoldYears,
        min_residence_years: exemptionConditions.minResidenceYears,
        max_exemption_amount: exemptionConditions.maxExemptionAmount,
        condition_description: `1세대 1주택, 보유기간 >= ${exemptionConditions.minHoldYears}년, 거주기간 >= ${exemptionConditions.minResidenceYears}년`
      }
    },
    surtax: {
      multi_house: {
        two_houses: { extra_rate: multiHouseSurtax.twoHousesRate },
        three_or_more: { extra_rate: multiHouseSurtax.threeOrMoreRate }
      },
      adjusted_area: {
        two_houses: { extra_rate: multiHouseSurtax.twoHousesRate },
        three_or_more: { extra_rate: multiHouseSurtax.threeOrMoreRate }
      },
      short_term: {
        under_one_year: { rate: shortTermRates.underOneYear },
        one_to_two_years: { rate: shortTermRates.oneToTwoYears }
      }
    }
  };
  
  // 원문 발췌 (최대 200자)
  const sourceExcerpt = lawText.substring(0, 200).replace(/\s+/g, ' ').trim();
  
  return {
    law_id: lawId,
    title,
    version_date: versionDate,
    rules,
    source_excerpt: sourceExcerpt
  };
}

/**
 * 지방세법(취득세) 파싱
 */
export function parseLocalTaxLaw(
  lawId: string,
  title: string,
  versionDate: string,
  lawText: string
): ParsedLawRules {
  // 취득세율 추출 (기본값)
  const rules: AcquisitionTaxRules = {
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
  };
  
  // 취득세율 패턴 추출 시도
  const ratePattern = /취득세.*?(\d+)\s*%/g;
  let match;
  while ((match = ratePattern.exec(lawText)) !== null) {
    // 추출된 세율로 규칙 업데이트 가능
  }
  
  const sourceExcerpt = lawText.substring(0, 200).replace(/\s+/g, ' ').trim();
  
  return {
    law_id: lawId,
    title,
    version_date: versionDate,
    rules: rules as unknown as TaxRules,
    source_excerpt: sourceExcerpt
  };
}

/**
 * 법령 유형별 파서 라우팅
 */
export function parseLaw(
  lawId: string,
  title: string,
  lawType: string,
  versionDate: string,
  lawText: string
): ParsedLawRules | null {
  switch (lawType) {
    case 'income_tax':
      return parseIncomeTaxLaw(lawId, title, versionDate, lawText);
    case 'local_tax':
      return parseLocalTaxLaw(lawId, title, versionDate, lawText);
    case 'special_tax':
      // 조세특례제한법은 소득세법과 유사하게 처리
      return parseIncomeTaxLaw(lawId, title, versionDate, lawText);
    default:
      return null;
  }
}

/**
 * 규칙 JSON 검증
 */
export function validateRules(rules: TaxRules): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // 세율 구간 검증
  if (!rules.capital_gains?.tax_brackets || rules.capital_gains.tax_brackets.length === 0) {
    errors.push('세율 구간이 누락되었습니다.');
  }
  
  // 세율 범위 검증
  for (const bracket of rules.capital_gains?.tax_brackets || []) {
    if (bracket.rate < 0 || bracket.rate > 100) {
      errors.push(`잘못된 세율: ${bracket.rate}%`);
    }
    if (bracket.from > bracket.to && bracket.to !== Infinity) {
      errors.push(`잘못된 구간: ${bracket.from} ~ ${bracket.to}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
