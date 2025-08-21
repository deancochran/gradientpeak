"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceAgnosticAuthUtils = exports.authTestHelper = exports.AuthTestHelper = void 0;
const clerk_sdk_node_1 = require("@clerk/clerk-sdk-node");
const config_1 = require("./config");
const fixtures_1 = require("./fixtures");
class AuthTestHelper {
    clerk;
    constructor() {
        this.clerk = (0, clerk_sdk_node_1.createClerkClient)({
            secretKey: config_1.testConfig.clerk.secretKey,
        });
    }
    /**
     * Create a test user in Clerk
     */
    async createTestUser(userData) {
        const user = (0, fixtures_1.generateTestUser)(userData);
        try {
            const clerkUser = await this.clerk.users.createUser({
                emailAddress: [user.email],
                password: user.password,
                firstName: user.firstName,
                lastName: user.lastName,
            });
            return {
                ...user,
                clerkUserId: clerkUser.id,
            };
        }
        catch (error) {
            throw new Error(`Failed to create test user: ${error}`);
        }
    }
    /**
     * Delete a test user from Clerk
     */
    async deleteTestUser(clerkUserId) {
        try {
            await this.clerk.users.deleteUser(clerkUserId);
        }
        catch (error) {
            console.warn(`Failed to delete test user ${clerkUserId}:`, error);
        }
    }
    /**
     * Generate Clerk JWT token for testing
     */
    async generateTestToken(clerkUserId, templateName = 'supabase') {
        try {
            const session = await this.clerk.sessions.createSession({
                userId: clerkUserId,
            });
            const token = await this.clerk.sessions.getToken(session.id, templateName);
            return String(token) || '';
        }
        catch (error) {
            throw new Error(`Failed to generate test token: ${error}`);
        }
    }
    /**
     * Verify JWT token structure and claims
     */
    verifyTokenStructure(token) {
        try {
            // Basic JWT structure validation (header.payload.signature)
            const parts = token.split('.');
            if (parts.length !== 3) {
                return { valid: false, error: 'Invalid JWT structure' };
            }
            // Decode payload (base64url)
            const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
            // Verify required Supabase claims
            const requiredClaims = ['sub', 'iat', 'exp'];
            const missingClaims = requiredClaims.filter(claim => !(claim in payload));
            if (missingClaims.length > 0) {
                return {
                    valid: false,
                    error: `Missing required claims: ${missingClaims.join(', ')}`
                };
            }
            return { valid: true, claims: payload };
        }
        catch (error) {
            return { valid: false, error: `Token parsing failed: ${error}` };
        }
    }
    /**
     * Generate auth flow test cases
     */
    generateAuthFlowTests() {
        return [
            {
                email: 'valid@example.com',
                password: 'ValidPassword123!',
                shouldSucceed: true,
                expectedRedirect: '/dashboard',
            },
            {
                email: 'invalid-email',
                password: 'ValidPassword123!',
                shouldSucceed: false,
            },
            {
                email: 'valid@example.com',
                password: 'weak',
                shouldSucceed: false,
            },
            {
                email: 'nonexistent@example.com',
                password: 'ValidPassword123!',
                shouldSucceed: false,
            },
        ];
    }
    /**
     * Wait for webhook processing (useful in tests)
     */
    async waitForWebhookProcessing(delayMs = 2000) {
        const adjustedDelay = (0, config_1.isCI)() ? delayMs * 2 : delayMs;
        return new Promise(resolve => setTimeout(resolve, adjustedDelay));
    }
    /**
     * Create multiple test users for comprehensive testing
     */
    async createTestUsers(count = 3) {
        const users = [];
        for (let i = 0; i < count; i++) {
            const userData = (0, fixtures_1.generateTestUser)({
                email: `test-user-${i}+${Date.now()}@turbofit.dev`
            });
            try {
                const user = await this.createTestUser(userData);
                users.push(user);
            }
            catch (error) {
                console.warn(`Failed to create test user ${i}:`, error);
            }
        }
        return users;
    }
    /**
     * Clean up test users (for test teardown)
     */
    async cleanupTestUsers(users) {
        const cleanupPromises = users.map(user => user.clerkUserId ? this.deleteTestUser(user.clerkUserId) : Promise.resolve());
        await Promise.allSettled(cleanupPromises);
    }
    /**
     * Generate device-agnostic test scenarios
     */
    generateDeviceAgnosticTestScenarios() {
        return {
            validCredentials: {
                email: 'valid@turbofit.dev',
                password: 'ValidPassword123!',
                shouldSucceed: true,
                expectedRedirect: '/dashboard',
            },
            invalidEmail: {
                email: 'invalid-email-format',
                password: 'ValidPassword123!',
                shouldSucceed: false,
                expectedError: 'Please enter a valid email address',
            },
            weakPassword: {
                email: 'valid@turbofit.dev',
                password: 'weak',
                shouldSucceed: false,
                expectedError: 'Password must be at least 8 characters',
            },
            nonExistentUser: {
                email: 'nonexistent@turbofit.dev',
                password: 'ValidPassword123!',
                shouldSucceed: false,
                expectedError: 'Invalid credentials',
            },
            emptyFields: {
                email: '',
                password: '',
                shouldSucceed: false,
                expectedError: 'Email and password are required',
            },
            sqlInjectionAttempt: {
                email: "admin'--",
                password: "' OR '1'='1",
                shouldSucceed: false,
                expectedError: 'Invalid credentials',
            },
            longEmail: {
                email: 'a'.repeat(255) + '@turbofit.dev',
                password: 'ValidPassword123!',
                shouldSucceed: false,
                expectedError: 'Email is too long',
            },
            specialCharacters: {
                email: 'test+special@turbofit.dev',
                password: 'P@ssw0rd!#$%',
                shouldSucceed: true,
            },
            unicodeCharacters: {
                email: 'tëst@türbofit.dev',
                password: 'Pässw0rd123!',
                shouldSucceed: true,
            }
        };
    }
    /**
     * Test authentication flow with retry logic
     */
    async testAuthFlowWithRetry(credentials, maxRetries = 3) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Create temporary user for test
                const testUser = await this.createTestUser({
                    email: credentials.email,
                    password: credentials.password,
                });
                // Generate token to verify auth works
                const token = await this.generateTestToken(testUser.clerkUserId);
                const verification = this.verifyTokenStructure(token);
                // Clean up test user
                await this.deleteTestUser(testUser.clerkUserId);
                if (verification.valid) {
                    return { success: true, attempts: attempt };
                }
                else {
                    lastError = verification.error;
                }
            }
            catch (error) {
                lastError = `Attempt ${attempt} failed: ${error}`;
                if (attempt < maxRetries) {
                    // Wait with exponential backoff
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
                }
            }
        }
        return {
            success: false,
            error: lastError,
            attempts: maxRetries
        };
    }
}
exports.AuthTestHelper = AuthTestHelper;
// Export singleton instance
exports.authTestHelper = new AuthTestHelper();
/**
 * Device-agnostic authentication test utilities
 */
exports.deviceAgnosticAuthUtils = {
    /**
     * Test auth flow across multiple environments
     */
    async testCrossEnvironmentAuth(baseCredentials) {
        const environments = ['desktop', 'tablet', 'mobile'];
        const results = {};
        for (const env of environments) {
            try {
                const result = await exports.authTestHelper.testAuthFlowWithRetry(baseCredentials);
                results[env] = result;
            }
            catch (error) {
                results[env] = { success: false, error: `${error}`, environment: env };
            }
        }
        return results;
    },
    /**
     * Generate environment-specific test data
     */
    generateEnvironmentTestData: () => ({
        development: {
            baseUrl: 'http://localhost:3000',
            timeout: 10000,
            retries: 1,
        },
        staging: {
            baseUrl: 'https://staging.turbofit.dev',
            timeout: 20000,
            retries: 2,
        },
        production: {
            baseUrl: 'https://turbofit.dev',
            timeout: 30000,
            retries: 3,
        },
        ci: {
            baseUrl: process.env.CI_BASE_URL || 'http://localhost:3000',
            timeout: 60000,
            retries: 5,
        }
    }),
    /**
     * Mock authentication state for testing
     */
    mockAuthState: (authenticated = true) => ({
        isAuthenticated: authenticated,
        user: authenticated ? {
            id: 'test-user-id',
            email: 'test@turbofit.dev',
            firstName: 'Test',
            lastName: 'User',
        } : null,
        token: authenticated ? 'mock-jwt-token' : null,
    }),
};
