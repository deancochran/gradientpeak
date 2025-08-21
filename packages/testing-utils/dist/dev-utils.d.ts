import { TestUser } from './types';
/**
 * Development convenience utilities for testing
 * These utilities provide helpful functions for developers
 * to quickly set up, validate, and debug test environments.
 */
/**
 * Environment validation result
 */
export interface EnvironmentValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
    details: {
        environmentVariables: Record<string, 'present' | 'missing' | 'invalid'>;
        services: Record<string, 'available' | 'unavailable' | 'unknown'>;
        configuration: Record<string, any>;
    };
}
/**
 * Database health check result
 */
export interface DatabaseHealthResult {
    healthy: boolean;
    connectionTime: number;
    errors: string[];
    tables: Record<string, 'accessible' | 'inaccessible' | 'unknown'>;
    rlsPolicies: Record<string, 'active' | 'inactive' | 'unknown'>;
}
/**
 * Quick test user creation result
 */
export interface QuickUserResult {
    user: TestUser;
    credentials: {
        email: string;
        password: string;
        token?: string;
    };
    cleanup: () => Promise<void>;
}
/**
 * Comprehensive environment validation
 */
export declare function validateTestEnvironment(): Promise<EnvironmentValidationResult>;
/**
 * Perform database health check
 */
export declare function checkDatabaseHealth(): Promise<DatabaseHealthResult>;
/**
 * Quick test user creation for development
 */
export declare function createQuickTestUser(email?: string, options?: {
    createSupabaseRecord?: boolean;
    generateToken?: boolean;
}): Promise<QuickUserResult>;
/**
 * Quick database cleanup for development
 */
export declare function quickDatabaseCleanup(): Promise<{
    cleaned: string[];
    errors: string[];
}>;
/**
 * Test data seeding utilities
 */
export declare const testDataSeeding: {
    /**
     * Seed basic test data
     */
    seedBasicTestData(): Promise<{
        users: TestUser[];
        activities: string[];
        errors: string[];
    }>;
    /**
     * Clean all seeded test data
     */
    cleanSeedData(): Promise<{
        success: boolean;
        error?: string;
    }>;
};
/**
 * Development debugging utilities
 */
export declare const devDebugUtils: {
    /**
     * Print environment status to console
     */
    printEnvironmentStatus(): Promise<void>;
    /**
     * Print database health status
     */
    printDatabaseHealth(): Promise<void>;
    /**
     * Interactive test user creation
     */
    createInteractiveTestUser(): Promise<void>;
    /**
     * Quick environment setup check
     */
    quickSetupCheck(): Promise<boolean>;
};
/**
 * Assertion helpers for development
 */
export declare const devAssertions: {
    /**
     * Assert environment is ready
     */
    assertEnvironmentReady(): Promise<void>;
    /**
     * Assert database is healthy
     */
    assertDatabaseHealthy(): Promise<void>;
    /**
     * Assert test user can be created
     */
    assertCanCreateTestUser(): Promise<void>;
};
/**
 * Quick commands for developers
 */
export declare const devCommands: {
    /**
     * Full environment diagnostic
     */
    fullDiagnostic(): Promise<void>;
    /**
     * Quick setup for new developers
     */
    quickSetup(): Promise<void>;
    /**
     * Clean everything for fresh start
     */
    cleanEverything(): Promise<void>;
};
//# sourceMappingURL=dev-utils.d.ts.map