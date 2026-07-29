module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  globalSetup: './tests/globalSetup.js',
  globalTeardown: './tests/globalTeardown.js',
  setupFilesAfterEnv: ['./tests/setup.js'],
  testTimeout: 60000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
};
