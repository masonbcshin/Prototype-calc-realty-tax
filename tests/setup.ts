/**
 * Jest 테스트 설정
 */

import { initializeDatabase } from '../src/db/init';
import * as fs from 'fs';
import * as path from 'path';

// 테스트용 DB 경로
export const TEST_DB_PATH = './data/test_tax_calculator.db';

// 테스트 전 DB 초기화
beforeAll(() => {
  // 테스트 DB 디렉토리 생성
  const dbDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // 기존 테스트 DB 삭제
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  if (fs.existsSync(TEST_DB_PATH + '-wal')) {
    fs.unlinkSync(TEST_DB_PATH + '-wal');
  }
  if (fs.existsSync(TEST_DB_PATH + '-shm')) {
    fs.unlinkSync(TEST_DB_PATH + '-shm');
  }
  
  // 테스트 DB 초기화
  const db = initializeDatabase(TEST_DB_PATH);
  db.close();
});

// 테스트 후 정리
afterAll(() => {
  // 테스트 DB 삭제
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  if (fs.existsSync(TEST_DB_PATH + '-wal')) {
    fs.unlinkSync(TEST_DB_PATH + '-wal');
  }
  if (fs.existsSync(TEST_DB_PATH + '-shm')) {
    fs.unlinkSync(TEST_DB_PATH + '-shm');
  }
});

// 환경 변수 설정
process.env.DB_PATH = TEST_DB_PATH;
process.env.NODE_ENV = 'test';
