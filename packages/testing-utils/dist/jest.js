"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceAgnosticUtils = exports.envSetup = void 0;
exports.createJestConfig = createJestConfig;
exports.createReactNativeJestConfig = createReactNativeJestConfig;
exports.createNextJestConfig = createNextJestConfig;
const config_1 = require("./config");
/**
 * Create Jest configuration with common testing utilities setup
 * Device-agnostic configuration that works across all platforms and environments
 */
function createJestConfig(customConfig = {}) {
    const baseConfig = {
        testEnvironment: 'node',
        setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts'],
        testMatch: [
            '<rootDir>/tests/**/*.test.{js,ts,tsx}',
            '<rootDir>/**/__tests__/**/*.{js,ts,tsx}',
        ],
        testPathIgnorePatterns: [
            '<rootDir>/node_modules/',
            '<rootDir>/dist/',
            '<rootDir>/build/',
            '<rootDir>/.next/',
            '<rootDir>/.expo/',
            '<rootDir>/coverage/',
            '<rootDir>/playwright-report/',
            '<rootDir>/test-results/',
        ],
        collectCoverageFrom: [
            '**/*.{js,ts,tsx}',
            '!**/*.d.ts',
            '!**/node_modules/**',
            '!**/coverage/**',
            '!**/.next/**',
            '!**/.expo/**',
            '!**/dist/**',
            '!**/build/**',
            '!**/tests/**',
            '!**/__tests__/**',
            '!**/playwright-report/**',
            '!**/test-results/**',
        ],
        coverageDirectory: 'coverage',
        coverageReporters: ['text', 'lcov', 'html', 'json'],
        coverageThreshold: {
            global: {
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80,
            },
        },
        verbose: true,
        testTimeout: (0, config_1.getTestTimeout)(),
        maxWorkers: (0, config_1.isCI)() ? 2 : '50%',
        setupFiles: ['<rootDir>/tests/setup/env.setup.js'],
        // Device-agnostic settings
        clearMocks: true,
        resetMocks: true,
        restoreMocks: true,
        // Better error reporting
        errorOnDeprecated: true,
        // Global test utilities available in all tests
        globals: {
            '__DEV__': true,
            '__TEST__': true,
        },
    };
    return {
        ...baseConfig,
        ...customConfig,
    };
}
/**
 * Create React Native Jest configuration with device-agnostic settings
 */
function createReactNativeJestConfig(customConfig = {}) {
    const baseConfig = createJestConfig(customConfig);
    return {
        ...baseConfig,
        preset: 'jest-expo',
        testEnvironment: 'jsdom',
        setupFilesAfterEnv: [
            '@testing-library/jest-native/extend-expect',
            '<rootDir>/tests/setup/jest.setup.ts',
        ],
        transformIgnorePatterns: [
            'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@clerk/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
        ],
        moduleNameMapper: {
            '^@/(.*)$': '<rootDir>/$1',
        },
    };
}
/**
 * Create Next.js Jest configuration with device-agnostic settings
 */
function createNextJestConfig(customConfig = {}) {
    const baseConfig = createJestConfig(customConfig);
    return {
        ...baseConfig,
        testEnvironment: 'jest-environment-jsdom',
        moduleNameMapper: {
            '^@/(.*)$': '<rootDir>/$1',
        },
        setupFilesAfterEnv: [
            '<rootDir>/tests/setup/jest.setup.ts',
        ],
    };
}
/**
 * Common Jest setup for environment variables - device-agnostic
 */
exports.envSetup = `
// Jest environment setup - loads env vars from multiple sources
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: '.env.test.local' });

// Set test environment
process.env.NODE_ENV = 'test';

// Device-agnostic test environment settings
process.env.FORCE_COLOR = '1'; // Ensure colored output works across all terminals
process.env.NO_FLIPPER = '1'; // Disable Flipper in React Native tests

// Timezone consistency across environments
process.env.TZ = 'UTC';

// Mock platform-specific globals for consistent testing
if (typeof window !== 'undefined') {
  // Web environment mocks
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(), // deprecated
      removeListener: jest.fn(), // deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
  
  // Mock ResizeObserver
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
  
  // Mock IntersectionObserver
  global.IntersectionObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
}

// Mock fetch for consistent network testing across platforms
if (typeof global.fetch === 'undefined') {
  global.fetch = require('jest-fetch-mock');
}
`;
/**
 * Device-agnostic test utilities
 */
exports.deviceAgnosticUtils = {
    /**
     * Get platform-appropriate test timeout
     */
    getTimeout: (baseTimeout = 10000) => {
        const multiplier = (0, config_1.isCI)() ? 3 : 1;
        return baseTimeout * multiplier;
    },
    /**
     * Wait with platform-appropriate delay
     */
    wait: (ms = 100) => {
        const adjustedMs = (0, config_1.isCI)() ? ms * 2 : ms;
        return new Promise(resolve => setTimeout(resolve, adjustedMs));
    },
    /**
     * Retry function for flaky operations
     */
    retry: async (fn, maxAttempts = 3, delay = 1000) => {
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                if (attempt === maxAttempts) {
                    throw lastError;
                }
                await exports.deviceAgnosticUtils.wait(delay * attempt);
            }
        }
        throw lastError;
    },
};
