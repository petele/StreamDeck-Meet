/* eslint-env node */
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/mocks/browser.js'],
  testMatch: ['**/tests/**/*.test.js'],
};

