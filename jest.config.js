export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: [
    '**/tests/**/*.e2e.test.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 60000,
  verbose: true,
};
