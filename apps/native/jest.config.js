const { defaults } = require('jest-config');

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: [
    '@testing-library/jest-native/extend-expect',
  ],
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.{js,ts,tsx}',
    '<rootDir>/tests/integration/**/*.test.{js,ts,tsx}',
    '<rootDir>/**/__tests__/**/*.{js,ts,tsx}',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/tests/e2e/',
    '<rootDir>/node_modules/',
    '<rootDir>/.expo/',
  ],
  collectCoverageFrom: [
    'app/**/*.{js,ts,tsx}',
    'components/**/*.{js,ts,tsx}',
    'lib/**/*.{js,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.expo/**',
  ],
  moduleFileExtensions: [...defaults.moduleFileExtensions, 'ts', 'tsx'],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native" +
      "|@react-native" +
      "|@react-native-community" +
      "|expo(nent)?|@expo(nent)?|expo-modules|@expo-google-fonts" +
      "|react-clone-referenced-element" +
      "|react-native))"
  ],
  testTimeout: 30000,
};