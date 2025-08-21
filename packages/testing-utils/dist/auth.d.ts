import { TestUser, AuthFlowTest } from './types';
export declare class AuthTestHelper {
    private clerk;
    constructor();
    /**
     * Create a test user in Clerk
     */
    createTestUser(userData?: Partial<TestUser>): Promise<TestUser>;
    /**
     * Delete a test user from Clerk
     */
    deleteTestUser(clerkUserId: string): Promise<void>;
    /**
     * Generate Clerk JWT token for testing
     */
    generateTestToken(clerkUserId: string, templateName?: string): Promise<string>;
    /**
     * Verify JWT token structure and claims
     */
    verifyTokenStructure(token: string): {
        valid: boolean;
        claims?: any;
        error?: string;
    };
    /**
     * Generate auth flow test cases
     */
    generateAuthFlowTests(): AuthFlowTest[];
    /**
     * Wait for webhook processing (useful in tests)
     */
    waitForWebhookProcessing(delayMs?: number): Promise<void>;
    /**
     * Create multiple test users for comprehensive testing
     */
    createTestUsers(count?: number): Promise<TestUser[]>;
    /**
     * Clean up test users (for test teardown)
     */
    cleanupTestUsers(users: TestUser[]): Promise<void>;
    /**
     * Generate device-agnostic test scenarios
     */
    generateDeviceAgnosticTestScenarios(): {
        validCredentials: {
            email: string;
            password: string;
            shouldSucceed: boolean;
            expectedRedirect: string;
        };
        invalidEmail: {
            email: string;
            password: string;
            shouldSucceed: boolean;
            expectedError: string;
        };
        weakPassword: {
            email: string;
            password: string;
            shouldSucceed: boolean;
            expectedError: string;
        };
        nonExistentUser: {
            email: string;
            password: string;
            shouldSucceed: boolean;
            expectedError: string;
        };
        emptyFields: {
            email: string;
            password: string;
            shouldSucceed: boolean;
            expectedError: string;
        };
        sqlInjectionAttempt: {
            email: string;
            password: string;
            shouldSucceed: boolean;
            expectedError: string;
        };
        longEmail: {
            email: string;
            password: string;
            shouldSucceed: boolean;
            expectedError: string;
        };
        specialCharacters: {
            email: string;
            password: string;
            shouldSucceed: boolean;
        };
        unicodeCharacters: {
            email: string;
            password: string;
            shouldSucceed: boolean;
        };
    };
    /**
     * Test authentication flow with retry logic
     */
    testAuthFlowWithRetry(credentials: {
        email: string;
        password: string;
    }, maxRetries?: number): Promise<{
        success: boolean;
        error?: string;
        attempts: number;
    }>;
}
export declare const authTestHelper: AuthTestHelper;
/**
 * Device-agnostic authentication test utilities
 */
export declare const deviceAgnosticAuthUtils: {
    /**
     * Test auth flow across multiple environments
     */
    testCrossEnvironmentAuth(baseCredentials: {
        email: string;
        password: string;
    }): Promise<Record<string, any>>;
    /**
     * Generate environment-specific test data
     */
    generateEnvironmentTestData: () => {
        development: {
            baseUrl: string;
            timeout: number;
            retries: number;
        };
        staging: {
            baseUrl: string;
            timeout: number;
            retries: number;
        };
        production: {
            baseUrl: string;
            timeout: number;
            retries: number;
        };
        ci: {
            baseUrl: string;
            timeout: number;
            retries: number;
        };
    };
    /**
     * Mock authentication state for testing
     */
    mockAuthState: (authenticated?: boolean) => {
        isAuthenticated: boolean;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
        } | null;
        token: string | null;
    };
};
//# sourceMappingURL=auth.d.ts.map