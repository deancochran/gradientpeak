import { TestUser } from './types';
/**
 * Test environment setup and teardown utilities
 * These utilities provide comprehensive test environment management
 * for consistent and isolated testing across all test suites.
 */
/**
 * Test environment configuration
 */
export interface TestEnvironmentConfig {
    /** Whether to create test users automatically */
    createTestUsers?: boolean;
    /** Number of test users to create */
    testUserCount?: number;
    /** Whether to create test data */
    createTestData?: boolean;
    /** Whether to clean up after tests */
    cleanupAfterTests?: boolean;
    /** Custom test database schema */
    testSchema?: string;
    /** Timeout for environment setup */
    setupTimeout?: number;
}
/**
 * Test environment context
 */
export interface TestEnvironmentContext {
    /** Test run identifier */
    testRunId: string;
    /** Test users created for this run */
    testUsers: TestUser[];
    /** Test data identifiers */
    testDataIds: string[];
    /** Environment configuration */
    config: TestEnvironmentConfig;
    /** Setup timestamp */
    setupAt: Date;
    /** Whether environment is ready */
    isReady: boolean;
    /** Cleanup function */
    cleanup: () => Promise<void>;
}
/**
 * Global test environment manager
 */
declare class TestEnvironmentManager {
    private contexts;
    private globalContext;
    /**
     * Setup test environment for a specific test suite
     */
    setupEnvironment(suiteName: string, config?: TestEnvironmentConfig): Promise<TestEnvironmentContext>;
    /**
     * Get test environment context
     */
    getEnvironment(testRunId: string): TestEnvironmentContext | null;
    /**
     * Setup global test environment (for Jest setupFilesAfterEnv)
     */
    setupGlobalEnvironment(config?: TestEnvironmentConfig): Promise<TestEnvironmentContext>;
    /**
     * Get global test environment context
     */
    getGlobalEnvironment(): TestEnvironmentContext | null;
    /**
     * Cleanup test environment
     */
    cleanupEnvironment(testRunId: string): Promise<void>;
    /**
     * Cleanup all test environments
     */
    cleanupAll(): Promise<void>;
    /**
     * Create test users for the environment
     */
    private createTestUsers;
    /**
     * Create test data for the environment
     */
    private createTestData;
}
export declare const testEnvironmentManager: TestEnvironmentManager;
/**
 * Jest setup helper for test files
 */
export declare function setupTestEnvironment(config?: TestEnvironmentConfig): () => Promise<TestEnvironmentContext>;
/**
 * Jest teardown helper for test files
 */
export declare function teardownTestEnvironment(): () => Promise<void>;
/**
 * Describe block wrapper with automatic environment setup/teardown
 */
export declare function describeWithEnvironment(name: string, config: TestEnvironmentConfig, tests: (context: () => TestEnvironmentContext) => void): void;
/**
 * Test isolation utilities
 */
export declare const testIsolation: {
    /**
     * Create isolated test context for a single test
     */
    createIsolatedContext(testName: string): Promise<TestEnvironmentContext>;
    /**
     * Run test with isolated environment
     */
    withIsolatedEnvironment<T>(testName: string, testFn: (context: TestEnvironmentContext) => Promise<T>): Promise<T>;
};
/**
 * Environment validation utilities
 */
export declare const environmentValidation: {
    /**
     * Validate test environment is properly configured
     */
    validateEnvironment(): {
        valid: boolean;
        errors: string[];
        warnings: string[];
    };
    /**
     * Validate database connection
     */
    validateDatabaseConnection(): Promise<{
        connected: boolean;
        error?: string;
    }>;
    /**
     * Validate authentication services
     */
    validateAuthServices(): Promise<{
        clerkValid: boolean;
        supabaseAuthValid: boolean;
        errors: string[];
    }>;
};
/**
 * Test performance monitoring
 */
export declare class TestPerformanceMonitor {
    private static measurements;
    static startTest(testName: string): () => void;
    static getTestStats(testName: string): {
        count: number;
        average: number;
        min: number;
        max: number;
    } | null;
    static getAllStats(): Record<string, ReturnType<typeof this.getTestStats>>;
    static reset(): void;
}
/**
 * Test environment presets for common scenarios
 */
export declare const testEnvironmentPresets: {
    /**
     * Minimal environment for unit tests
     */
    unit: () => TestEnvironmentConfig;
    /**
     * Full environment for integration tests
     */
    integration: () => TestEnvironmentConfig;
    /**
     * Environment for authentication tests
     */
    auth: () => TestEnvironmentConfig;
    /**
     * Environment for database/RLS tests
     */
    database: () => TestEnvironmentConfig;
    /**
     * Environment for end-to-end tests
     */
    e2e: () => TestEnvironmentConfig;
};
/**
 * Helper for accessing test context in tests
 */
export declare function getTestContext(): TestEnvironmentContext;
/**
 * Helper to get the first test user from context
 */
export declare function getTestUser(index?: number): TestUser;
export {};
//# sourceMappingURL=test-environment.d.ts.map