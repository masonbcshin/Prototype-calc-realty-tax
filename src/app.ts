/**
 * Express 앱 진입점
 * 부동산 거래세/양도소득세 계산기 API 서버
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import calcRoutes from './routes/calc';
import adminRoutes from './routes/admin';
import { initializeDatabase } from './db/init';
import { ApiResponse } from './types';

// 환경 변수 로드 (dotenv 대신 직접 처리)
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Express 앱 생성
const app = express();

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 요청 로깅 (개발 환경)
if (NODE_ENV === 'development') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// 정적 파일 서빙 (프론트엔드)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// API 라우트
app.use('/api/v1/calc', calcRoutes);
app.use('/api/v1/admin', adminRoutes);

// 헬스 체크
app.get('/api/v1/health', (_req: Request, res: Response) => {
  const response: ApiResponse<{ status: string; timestamp: string }> = {
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  };
  res.json(response);
});

// API 정보
app.get('/api/v1', (_req: Request, res: Response) => {
  const response: ApiResponse<{
    name: string;
    version: string;
    description: string;
    disclaimer: string;
    endpoints: string[];
  }> = {
    success: true,
    data: {
      name: 'Real Estate Tax Calculator API',
      version: '1.0.0',
      description: '부동산 거래세/양도소득세 자동계산 API - 법제처 Open API 기반',
      disclaimer: '이 서비스는 정보제공용이며 법률·세무 자문이 아닙니다. 실제 신고 전 반드시 세무사·전문가와 상담하세요.',
      endpoints: [
        'POST /api/v1/calc - 양도소득세 계산',
        'POST /api/v1/calc/acquisition-tax - 취득세 계산',
        'GET /api/v1/calc/rules - 현재 활성 규칙 조회',
        'GET /api/v1/health - 헬스 체크'
      ]
    },
    timestamp: new Date().toISOString()
  };
  res.json(response);
});

// SPA 라우팅 - 프론트엔드 fallback
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'), (err) => {
    if (err) {
      // 프론트엔드 빌드가 없는 경우
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>부동산 거래세 계산기</title>
          <meta charset="utf-8">
          <style>
            body { font-family: sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #333; }
            .disclaimer { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
            pre { background: #f5f5f5; padding: 15px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>부동산 거래세/양도소득세 계산기 API</h1>
          <div class="disclaimer">
            <strong>면책 조항:</strong> 이 서비스는 정보제공용이며 법률·세무 자문이 아닙니다. 
            실제 신고 전 반드시 세무사·전문가와 상담하세요.
          </div>
          <h2>API 엔드포인트</h2>
          <ul>
            <li><code>POST /api/v1/calc</code> - 양도소득세 계산</li>
            <li><code>POST /api/v1/calc/acquisition-tax</code> - 취득세 계산</li>
            <li><code>GET /api/v1/calc/rules</code> - 현재 활성 규칙 조회</li>
          </ul>
          <h2>예제 요청</h2>
          <pre>
POST /api/v1/calc
Content-Type: application/json

{
  "acquisitionDate": "2016-03-15",
  "acquisitionPrice": 350000000,
  "dispositionDate": "2026-04-01",
  "dispositionPrice": 500000000,
  "address": "서울특별시 마포구 상암동",
  "ownerCount": 1,
  "isPrimaryResidence": true
}
          </pre>
          <p>프론트엔드 빌드: <code>cd frontend && npm install && npm run build</code></p>
        </body>
        </html>
      `);
    }
  });
});

// 404 핸들러
app.use((req: Request, res: Response) => {
  const response: ApiResponse<null> = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `경로를 찾을 수 없습니다: ${req.path}`
    },
    timestamp: new Date().toISOString()
  };
  res.status(404).json(response);
});

// 에러 핸들러
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  
  const response: ApiResponse<null> = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: NODE_ENV === 'development' ? err.message : '서버 내부 오류'
    },
    timestamp: new Date().toISOString()
  };
  res.status(500).json(response);
});

// 서버 시작
if (require.main === module) {
  // DB 초기화
  console.log('Initializing database...');
  const db = initializeDatabase();
  db.close();
  
  app.listen(PORT, () => {
    console.log(`
========================================
부동산 거래세/양도소득세 계산기 서버
========================================
환경: ${NODE_ENV}
포트: ${PORT}
API: http://localhost:${PORT}/api/v1
========================================

주의: 이 서비스는 정보제공용이며 법률·세무 자문이 아닙니다.
실제 신고 전 반드시 세무사·전문가와 상담하세요.
    `);
  });
}

export default app;
