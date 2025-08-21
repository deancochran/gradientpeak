import type { Config } from 'jest';
/**
 * Create Jest configuration with common testing utilities setup
 * Device-agnostic configuration that works across all platforms and environments
 */
export declare function createJestConfig(customConfig?: Partial<Config>): Config;
/**
 * Create React Native Jest configuration with device-agnostic settings
 */
export declare function createReactNativeJestConfig(customConfig?: Partial<Config>): Config;
/**
 * Create Next.js Jest configuration with device-agnostic settings
 */
export declare function createNextJestConfig(customConfig?: Partial<Config>): Config;
/**
 * Common Jest setup for environment variables - device-agnostic
 */
export declare const envSetup = "\n// Jest environment setup - loads env vars from multiple sources\nrequire('dotenv').config({ path: '.env' });\nrequire('dotenv').config({ path: '.env.local' });\nrequire('dotenv').config({ path: '.env.test' });\nrequire('dotenv').config({ path: '.env.test.local' });\n\n// Set test environment\nprocess.env.NODE_ENV = 'test';\n\n// Device-agnostic test environment settings\nprocess.env.FORCE_COLOR = '1'; // Ensure colored output works across all terminals\nprocess.env.NO_FLIPPER = '1'; // Disable Flipper in React Native tests\n\n// Timezone consistency across environments\nprocess.env.TZ = 'UTC';\n\n// Mock platform-specific globals for consistent testing\nif (typeof window !== 'undefined') {\n  // Web environment mocks\n  Object.defineProperty(window, 'matchMedia', {\n    writable: true,\n    value: jest.fn().mockImplementation(query => ({\n      matches: false,\n      media: query,\n      onchange: null,\n      addListener: jest.fn(), // deprecated\n      removeListener: jest.fn(), // deprecated\n      addEventListener: jest.fn(),\n      removeEventListener: jest.fn(),\n      dispatchEvent: jest.fn(),\n    })),\n  });\n  \n  // Mock ResizeObserver\n  global.ResizeObserver = jest.fn().mockImplementation(() => ({\n    observe: jest.fn(),\n    unobserve: jest.fn(),\n    disconnect: jest.fn(),\n  }));\n  \n  // Mock IntersectionObserver\n  global.IntersectionObserver = jest.fn().mockImplementation(() => ({\n    observe: jest.fn(),\n    unobserve: jest.fn(),\n    disconnect: jest.fn(),\n  }));\n}\n\n// Mock fetch for consistent network testing across platforms\nif (typeof global.fetch === 'undefined') {\n  global.fetch = require('jest-fetch-mock');\n}\n";
/**
 * Device-agnostic test utilities
 */
export declare const deviceAgnosticUtils: {
    /**
     * Get platform-appropriate test timeout
     */
    getTimeout: (baseTimeout?: number) => number;
    /**
     * Wait with platform-appropriate delay
     */
    wait: (ms?: number) => Promise<void>;
    /**
     * Retry function for flaky operations
     */
    retry: <T>(fn: () => Promise<T>, maxAttempts?: number, delay?: number) => Promise<T>;
};
//# sourceMappingURL=jest.d.ts.map