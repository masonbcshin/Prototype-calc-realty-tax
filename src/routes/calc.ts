/**
 * 계산 API 라우트
 * /api/v1/calc 엔드포인트
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { CalculationInput, CalculationResult, ApiResponse } from '../types';
import { calculateCapitalGainsTax, calculateAcquisitionTax } from '../services/calcEngine';
import { getAllActiveRules, isAdjustedArea, saveAuditLog } from '../services/ruleManager';
import { getDatabase } from '../db/init';
import { anonymizeIp } from '../utils/httpClient';
import { DEFAULT_RULES } from '../db/schema';

const router = Router();

// 입력 검증 규칙
const calcValidation = [
  body('acquisitionDate')
    .isISO8601()
    .withMessage('취득일은 YYYY-MM-DD 형식이어야 합니다.'),
  body('acquisitionPrice')
    .isInt({ min: 0 })
    .withMessage('취득가액은 0 이상의 정수여야 합니다.'),
  body('dispositionDate')
    .isISO8601()
    .withMessage('양도일은 YYYY-MM-DD 형식이어야 합니다.'),
  body('dispositionPrice')
    .isInt({ min: 0 })
    .withMessage('양도가액은 0 이상의 정수여야 합니다.'),
  body('address')
    .isString()
    .notEmpty()
    .withMessage('주소는 필수입니다.'),
  body('ownerCount')
    .isInt({ min: 1 })
    .withMessage('보유 주택 수는 1 이상이어야 합니다.'),
  body('isPrimaryResidence')
    .optional()
    .isBoolean()
    .withMessage('실거주 여부는 불리언이어야 합니다.'),
  body('residenceYears')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('거주기간은 0 이상이어야 합니다.'),
  body('necessaryExpenses')
    .optional()
    .isInt({ min: 0 })
    .withMessage('필요경비는 0 이상의 정수여야 합니다.'),
  body('shareRatio')
    .optional()
    .isFloat({ gt: 0, max: 1 })
    .withMessage('공동명의 지분비율은 0 초과 1 이하여야 합니다.')
];

/**
 * POST /api/v1/calc
 * 양도소득세 계산
 */
router.post('/', calcValidation, (req: Request, res: Response) => {
  // 검증 오류 확인
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: errors.array().map(e => e.msg).join(', ')
      },
      timestamp: new Date().toISOString()
    };
    return res.status(400).json(response);
  }
  
  try {
    const input: CalculationInput = req.body;
    
    // DB 연결
    const db = getDatabase();
    
    // 활성 규칙 가져오기
    const activeRules = getAllActiveRules(db);
    
    // 조정대상지역 확인
    const adjustedArea = isAdjustedArea(db, input.address);
    
    // 규칙이 없으면 기본 규칙 사용
    const rules = activeRules.capitalGains.rules || DEFAULT_RULES.capital_gains.rules;
    const ruleIds = activeRules.capitalGains.ruleId 
      ? [activeRules.capitalGains.ruleId] 
      : ['DEFAULT_RULE'];
    const lawVersions = activeRules.capitalGains.lawVersion 
      ? [activeRules.capitalGains.lawVersion] 
      : [{ law_id: 'LAW_DEFAULT_INCOME', version_date: '2025-01-01' }];
    
    // 계산 실행
    const result = calculateCapitalGainsTax(
      input,
      rules,
      adjustedArea,
      lawVersions,
      ruleIds
    );

    // F3 투명성: 근거 조문 발췌 포함 (활성 규칙에 있으면 첨부)
    result.sourceExcerpt = activeRules.capitalGains.sourceExcerpt || undefined;
    
    // 감사 로그 저장
    const clientIp = anonymizeIp(
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
      req.socket.remoteAddress || 
      ''
    );
    
    saveAuditLog(
      db,
      'calculation',
      {
        input: {
          address: extractRegion(input.address), // 시군구만 저장
          ownerCount: input.ownerCount,
          holdingPeriodYears: result.details.holdingPeriodYears
        },
        output: {
          totalTax: result.totalTax,
          oneHouseExemption: result.applies.oneHouseExemption
        }
      },
      ruleIds,
      lawVersions,
      clientIp
    );
    
    db.close();
    
    const response: ApiResponse<CalculationResult> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    };
    
    return res.json(response);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'CALCULATION_ERROR',
        message: errorMessage
      },
      timestamp: new Date().toISOString()
    };
    
    return res.status(500).json(response);
  }
});

/**
 * POST /api/v1/calc/acquisition-tax
 * 취득세 계산
 */
router.post('/acquisition-tax', [
  body('acquisitionPrice')
    .isInt({ min: 0 })
    .withMessage('취득가액은 0 이상의 정수여야 합니다.'),
  body('address')
    .isString()
    .notEmpty()
    .withMessage('주소는 필수입니다.'),
  body('ownerCount')
    .isInt({ min: 1 })
    .withMessage('보유 주택 수는 1 이상이어야 합니다.'),
  body('isResidential')
    .optional()
    .isBoolean()
    .withMessage('주거용 여부는 불리언이어야 합니다.')
], (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: errors.array().map(e => e.msg).join(', ')
      },
      timestamp: new Date().toISOString()
    };
    return res.status(400).json(response);
  }
  
  try {
    const { acquisitionPrice, address, ownerCount, isResidential = true } = req.body;
    
    const db = getDatabase();
    const adjustedArea = isAdjustedArea(db, address);
    db.close();
    
    const result = calculateAcquisitionTax(
      acquisitionPrice,
      ownerCount,
      adjustedArea,
      isResidential
    );
    
    const response: ApiResponse<{
      tax: number;
      rate: number;
      isAdjustedArea: boolean;
      notes: string;
    }> = {
      success: true,
      data: {
        ...result,
        isAdjustedArea: adjustedArea,
        notes: '이 계산은 참고용이며 법적·세무적 자문이 아닙니다.'
      },
      timestamp: new Date().toISOString()
    };
    
    return res.json(response);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'CALCULATION_ERROR',
        message: errorMessage
      },
      timestamp: new Date().toISOString()
    };
    
    return res.status(500).json(response);
  }
});

/**
 * GET /api/v1/calc/rules
 * 현재 활성 규칙 조회
 */
router.get('/rules', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const activeRules = getAllActiveRules(db);
    db.close();
    
    const response: ApiResponse<typeof activeRules> = {
      success: true,
      data: activeRules,
      timestamp: new Date().toISOString()
    };
    
    return res.json(response);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: errorMessage
      },
      timestamp: new Date().toISOString()
    };
    
    return res.status(500).json(response);
  }
});

/**
 * 주소에서 시군구만 추출 (PII 보호)
 */
function extractRegion(address: string): string {
  const match = address.match(/([가-힣]+(?:특별시|광역시|특별자치시|도|특별자치도))\s*([가-힣]+(?:시|군|구))?/);
  if (match) {
    return match[0];
  }
  return '';
}

export default router;
