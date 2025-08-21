const dotenv = require("dotenv");

dotenv.config({
    path: ".env.local"
});

const nextJest = require('next/jest');

const createNextJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  testEnvironment: 'jest-environment-jsdom',
  testMatch: [
    '<rootDir>/tests/**/*.test.{js,ts,tsx}',
    '<rootDir>/**/__tests__/**/*.{js,ts,tsx}',
  ],
  testPathIgnorePatterns: ['<rootDir>/tests/e2e/'],
  testTimeout: 10000,
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createNextJestConfig(customJestConfig);