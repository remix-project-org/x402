export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: [
    '**/tests/**/*.e2e.test.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 180000, // 3 minutes for multi-network deployment tests
  verbose: true,
};
