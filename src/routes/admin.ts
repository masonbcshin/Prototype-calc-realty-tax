/**
 * 관리자 API 라우트
 * 법령 수집, 규칙 관리, 감사 로그 조회
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, query, validationResult } from 'express-validator';
import { ApiResponse } from '../types';
import { getDatabase } from '../db/init';
import { collectAllLaws, collectSingleLaw, TARGET_LAWS } from '../services/lawCollector';
import {
  processLawToRule,
  activateRule,
  rollbackRule,
  getRuleById,
  getRuleHistory,
  getAdjustedAreas,
  updateAdjustedArea,
  saveAuditLog
} from '../services/ruleManager';
import { runSampleTests } from '../jobs/testRunner';

const router = Router();

// 관리자 인증 미들웨어
const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  const expectedToken = process.env.ADMIN_TOKEN;
  
  if (!expectedToken || token !== expectedToken) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '관리자 인증이 필요합니다.'
      },
      timestamp: new Date().toISOString()
    };
    return res.status(401).json(response);
  }
  
  next();
};

/**
 * POST /api/v1/admin/refresh-laws
 * 법령 수집 수동 트리거
 */
router.post('/refresh-laws', adminAuth, async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.LAW_API_KEY;
    
    if (!apiKey) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'LAW_API_KEY 환경변수가 설정되지 않았습니다.'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(500).json(response);
    }
    
    const db = getDatabase();
    
    // 법령 수집
    const results = await collectAllLaws(db, apiKey);
    
    // 변경된 법령에서 규칙 추출
    const processedRules: { lawId: string; success: boolean; error?: string }[] = [];
    
    for (const result of results) {
      if (result.isNewVersion && result.law_id) {
        const ruleResult = processLawToRule(db, result.law_id);
        processedRules.push({
          lawId: result.law_id,
          success: ruleResult.success,
          error: ruleResult.error
        });
      }
    }
    
    // 감사 로그
    saveAuditLog(db, 'law_update', {
      trigger: 'manual',
      results: results.map(r => ({
        law_id: r.law_id,
        isNewVersion: r.isNewVersion,
        message: r.message
      })),
      processedRules
    });
    
    db.close();
    
    const response: ApiResponse<{
      collectionResults: typeof results;
      processedRules: typeof processedRules;
    }> = {
      success: true,
      data: {
        collectionResults: results,
        processedRules
      },
      timestamp: new Date().toISOString()
    };
    
    return res.json(response);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'COLLECTION_ERROR',
        message: errorMessage
      },
      timestamp: new Date().toISOString()
    };
    
    return res.status(500).json(response);
  }
});

/**
 * POST /api/v1/admin/refresh-law/:lawName
 * 단일 법령 수집
 */
router.post('/refresh-law/:lawName', adminAuth, async (req: Request, res: Response) => {
  try {
    const { lawName } = req.params;
    const apiKey = process.env.LAW_API_KEY;
    
    if (!apiKey) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'LAW_API_KEY 환경변수가 설정되지 않았습니다.'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(500).json(response);
    }
    
    // 법령 유형 찾기
    const targetLaw = TARGET_LAWS.find(l => l.mst === lawName);
    const lawType = targetLaw?.type || 'income_tax';
    
    const db = getDatabase();
    const result = await collectSingleLaw(db, lawName, lawType, apiKey);
    
    let processedRule = null;
    if (result.isNewVersion && result.law_id) {
      processedRule = processLawToRule(db, result.law_id);
    }
    
    db.close();
    
    const response: ApiResponse<{
      collection: typeof result;
      processedRule: typeof processedRule;
    }> = {
      success: result.success,
      data: {
        collection: result,
        processedRule
      },
      timestamp: new Date().toISOString()
    };
    
    return res.json(response);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'COLLECTION_ERROR',
        message: errorMessage
      },
      timestamp: new Date().toISOString()
    };
    
    return res.status(500).json(response);
  }
});

/**
 * GET /api/v1/admin/rules/history
 * 규칙 변경 이력 조회
 */
router.get('/rules/history', adminAuth, [
  query('ruleType')
    .optional()
    .isIn(['capital_gains', 'acquisition_tax'])
    .withMessage('유효하지 않은 규칙 유형입니다.'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit은 1-100 사이여야 합니다.')
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
    const ruleType = (req.query.ruleType as string) || 'capital_gains';
    const limit = parseInt(req.query.limit as string) || 10;
    
    const db = getDatabase();
    const history = getRuleHistory(db, ruleType, limit);
    db.close();
    
    const response: ApiResponse<typeof history> = {
      success: true,
      data: history,
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
 * POST /api/v1/admin/rules/activate
 * 규칙 수동 활성화
 */
router.post('/rules/activate', adminAuth, [
  body('ruleType')
    .isIn(['capital_gains', 'acquisition_tax'])
    .withMessage('유효하지 않은 규칙 유형입니다.'),
  body('ruleId')
    .isString()
    .notEmpty()
    .withMessage('규칙 ID는 필수입니다.'),
  body('force')
    .optional()
    .isBoolean()
    .withMessage('force는 불리언이어야 합니다.')
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
    const { ruleType, ruleId, force } = req.body;

    const db = getDatabase();

    // 활성화 전 검증 게이트: 무인 안전 구멍을 막기 위해 스케줄러와 동일하게
    // 후보 규칙 자체를 샘플 케이스로 검증한다. (양도세만 실질 검증 가능)
    // force=true 이면 게이트를 우회하되 감사로그에 명시한다.
    if (!force && ruleType === 'capital_gains') {
      const candidateRules = getRuleById(db, ruleId);
      if (!candidateRules) {
        saveAuditLog(db, 'rule_change', {
          action: 'manual_activate',
          result: 'rejected_load_failure',
          rule_type: ruleType,
          rule_id: ruleId
        });
        db.close();
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'RULE_NOT_FOUND',
            message: `규칙 ${ruleId}을(를) 로드할 수 없습니다.`
          },
          timestamp: new Date().toISOString()
        };
        return res.status(404).json(response);
      }

      const testResults = runSampleTests(db, candidateRules);
      if (testResults.passed !== testResults.total) {
        saveAuditLog(db, 'rule_change', {
          action: 'manual_activate',
          result: 'blocked_by_gate',
          rule_type: ruleType,
          rule_id: ruleId,
          test_results: { passed: testResults.passed, total: testResults.total }
        });
        db.close();
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'GATE_FAILED',
            message: `샘플 검증 실패(${testResults.passed}/${testResults.total})로 활성화가 거부되었습니다. force로 우회할 수 있습니다.`
          },
          timestamp: new Date().toISOString()
        };
        return res.status(422).json(response);
      }
    }

    activateRule(db, ruleType, ruleId);

    saveAuditLog(db, 'rule_change', {
      action: force ? 'forced_activate' : 'manual_activate',
      result: 'activated',
      rule_type: ruleType,
      rule_id: ruleId
    });

    db.close();

    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: {
        message: `규칙 ${ruleId} 활성화 완료${force ? ' (force)' : ''}`
      },
      timestamp: new Date().toISOString()
    };

    return res.json(response);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'ACTIVATION_ERROR',
        message: errorMessage
      },
      timestamp: new Date().toISOString()
    };
    
    return res.status(500).json(response);
  }
});

/**
 * POST /api/v1/admin/rules/rollback
 * 규칙 롤백
 */
router.post('/rules/rollback', adminAuth, [
  body('ruleType')
    .isIn(['capital_gains', 'acquisition_tax'])
    .withMessage('유효하지 않은 규칙 유형입니다.'),
  body('targetRuleId')
    .isString()
    .notEmpty()
    .withMessage('대상 규칙 ID는 필수입니다.')
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
    const { ruleType, targetRuleId } = req.body;
    
    const db = getDatabase();
    const result = rollbackRule(db, ruleType, targetRuleId);
    db.close();
    
    if (!result.success) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: 'ROLLBACK_ERROR',
          message: result.error || '롤백 실패'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(response);
    }
    
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: {
        message: `규칙 ${targetRuleId}로 롤백 완료`
      },
      timestamp: new Date().toISOString()
    };
    
    return res.json(response);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'ROLLBACK_ERROR',
        message: errorMessage
      },
      timestamp: new Date().toISOString()
    };
    
    return res.status(500).json(response);
  }
});

/**
 * GET /api/v1/admin/adjusted-areas
 * 조정대상지역 목록 조회
 */
router.get('/adjusted-areas', adminAuth, (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const areas = getAdjustedAreas(db);
    db.close();
    
    const response: ApiResponse<typeof areas> = {
      success: true,
      data: areas,
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
 * POST /api/v1/admin/adjusted-areas
 * 조정대상지역 업데이트
 */
router.post('/adjusted-areas', adminAuth, [
  body('regionCode')
    .isString()
    .notEmpty()
    .withMessage('지역 코드는 필수입니다.'),
  body('regionName')
    .isString()
    .notEmpty()
    .withMessage('지역명은 필수입니다.'),
  body('isAdjusted')
    .isBoolean()
    .withMessage('조정대상지역 여부는 불리언이어야 합니다.'),
  body('effectiveDate')
    .isISO8601()
    .withMessage('시행일은 YYYY-MM-DD 형식이어야 합니다.')
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
    const { regionCode, regionName, isAdjusted, effectiveDate } = req.body;
    
    const db = getDatabase();
    updateAdjustedArea(db, regionCode, regionName, isAdjusted, effectiveDate);
    
    saveAuditLog(db, 'adjusted_area_change', {
      regionCode,
      regionName,
      isAdjusted,
      effectiveDate
    });
    
    db.close();
    
    const response: ApiResponse<{ message: string }> = {
      success: true,
      data: {
        message: `${regionName} 조정대상지역 설정 완료`
      },
      timestamp: new Date().toISOString()
    };
    
    return res.json(response);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: errorMessage
      },
      timestamp: new Date().toISOString()
    };
    
    return res.status(500).json(response);
  }
});

/**
 * GET /api/v1/admin/audit-logs
 * 감사 로그 조회
 */
router.get('/audit-logs', adminAuth, [
  query('eventType')
    .optional()
    .isIn(['calculation', 'law_update', 'rule_change', 'error'])
    .withMessage('유효하지 않은 이벤트 유형입니다.'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('limit은 1-1000 사이여야 합니다.')
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
    const eventType = req.query.eventType as string;
    const limit = parseInt(req.query.limit as string) || 100;
    
    const db = getDatabase();
    
    let query = `
      SELECT id, event_type, event_data, rule_ids, law_versions, created_at
      FROM audit_logs
    `;
    
    const params: (string | number)[] = [];
    
    if (eventType) {
      query += ' WHERE event_type = ?';
      params.push(eventType);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    
    const stmt = db.prepare(query);
    const logs = stmt.all(...params);
    
    db.close();
    
    const response: ApiResponse<typeof logs> = {
      success: true,
      data: logs,
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

export default router;
