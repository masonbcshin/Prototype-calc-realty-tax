/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/app.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 30000,
  // 모든 스위트가 공유 SQLite 테스트 파일을 beforeAll/afterAll에서 삭제·재생성하므로
  // 병렬 워커 간 파일 경합으로 간헐 실패한다. 직렬 실행으로 격리한다.
  maxWorkers: 1,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};
