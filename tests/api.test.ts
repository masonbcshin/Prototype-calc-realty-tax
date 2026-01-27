/**
 * API 통합 테스트
 */

import request from 'supertest';
import app from '../src/app';

describe('API 통합 테스트', () => {
  describe('GET /api/v1/health', () => {
    test('헬스 체크 응답', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
    });
  });

  describe('GET /api/v1', () => {
    test('API 정보 반환', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Real Estate Tax Calculator API');
      expect(response.body.data.disclaimer).toBeDefined();
    });
  });

  describe('POST /api/v1/calc', () => {
    test('유효한 요청 - 계산 성공', async () => {
      const response = await request(app)
        .post('/api/v1/calc')
        .send({
          acquisitionDate: '2016-03-15',
          acquisitionPrice: 350000000,
          dispositionDate: '2026-04-01',
          dispositionPrice: 500000000,
          address: '서울특별시 마포구 상암동',
          ownerCount: 1,
          isPrimaryResidence: true
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalTax).toBeDefined();
      expect(response.body.data.applies).toBeDefined();
      expect(response.body.data.notes).toContain('법적·세무적 자문이 아닙니다');
    });

    test('1세대1주택 비과세 케이스', async () => {
      const response = await request(app)
        .post('/api/v1/calc')
        .send({
          acquisitionDate: '2016-01-01',
          acquisitionPrice: 500000000,
          dispositionDate: '2026-01-01',
          dispositionPrice: 1000000000,
          address: '서울특별시 강남구',
          ownerCount: 1,
          isPrimaryResidence: true,
          residenceYears: 10
        })
        .expect(200);
      
      expect(response.body.data.applies.oneHouseExemption).toBe(true);
      expect(response.body.data.totalTax).toBe(0);
    });

    test('다주택자 중과 케이스', async () => {
      const response = await request(app)
        .post('/api/v1/calc')
        .send({
          acquisitionDate: '2020-01-01',
          acquisitionPrice: 400000000,
          dispositionDate: '2026-01-01',
          dispositionPrice: 550000000,
          address: '서울특별시 마포구',
          ownerCount: 3
        })
        .expect(200);
      
      expect(response.body.data.applies.multiHouseSurtax).toBe(true);
    });

    test('유효하지 않은 날짜 형식', async () => {
      const response = await request(app)
        .post('/api/v1/calc')
        .send({
          acquisitionDate: 'invalid-date',
          acquisitionPrice: 350000000,
          dispositionDate: '2026-04-01',
          dispositionPrice: 500000000,
          address: '서울특별시',
          ownerCount: 1
        })
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('필수 필드 누락', async () => {
      const response = await request(app)
        .post('/api/v1/calc')
        .send({
          acquisitionDate: '2016-01-01'
          // 다른 필드 누락
        })
        .expect(400);
      
      expect(response.body.success).toBe(false);
    });

    test('음수 금액', async () => {
      const response = await request(app)
        .post('/api/v1/calc')
        .send({
          acquisitionDate: '2016-01-01',
          acquisitionPrice: -100,
          dispositionDate: '2026-01-01',
          dispositionPrice: 500000000,
          address: '서울특별시',
          ownerCount: 1
        })
        .expect(400);
      
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/calc/acquisition-tax', () => {
    test('취득세 계산', async () => {
      const response = await request(app)
        .post('/api/v1/calc/acquisition-tax')
        .send({
          acquisitionPrice: 500000000,
          address: '서울특별시 강남구',
          ownerCount: 1
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.tax).toBeDefined();
      expect(response.body.data.rate).toBeDefined();
    });
  });

  describe('GET /api/v1/calc/rules', () => {
    test('활성 규칙 조회', async () => {
      const response = await request(app)
        .get('/api/v1/calc/rules')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.capitalGains).toBeDefined();
      expect(response.body.data.acquisitionTax).toBeDefined();
    });
  });

  describe('관리자 API 인증', () => {
    test('인증 없이 접근 - 401', async () => {
      const response = await request(app)
        .post('/api/v1/admin/refresh-laws')
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    test('잘못된 토큰 - 401', async () => {
      const response = await request(app)
        .post('/api/v1/admin/refresh-laws')
        .set('x-admin-token', 'wrong-token')
        .expect(401);
      
      expect(response.body.success).toBe(false);
    });
  });

  describe('404 처리', () => {
    test('존재하지 않는 API 경로', async () => {
      const response = await request(app)
        .get('/api/v1/nonexistent')
        .expect(404);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
