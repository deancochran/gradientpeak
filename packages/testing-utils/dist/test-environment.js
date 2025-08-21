"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testEnvironmentPresets = exports.TestPerformanceMonitor = exports.environmentValidation = exports.testIsolation = exports.testEnvironmentManager = void 0;
exports.setupTestEnvironment = setupTestEnvironment;
exports.teardownTestEnvironment = teardownTestEnvironment;
exports.describeWithEnvironment = describeWithEnvironment;
exports.getTestContext = getTestContext;
exports.getTestUser = getTestUser;
const crypto_1 = require("crypto");
const database_1 = require("./database");
const auth_1 = require("./auth");
const config_1 = require("./config");
const inline_helpers_1 = require("./inline-helpers");
/**
 * Global test environment manager
 */
class TestEnvironmentManager {
    contexts = new Map();
    globalContext = null;
    /**
     * Setup test environment for a specific test suite
     */
    async setupEnvironment(suiteName, config = {}) {
        const testRunId = `${suiteName}-${(0, crypto_1.randomUUID)()}`;
        // Validate configuration
        try {
            (0, config_1.validateTestConfig)();
        }
        catch (error) {
            throw new Error(`Test configuration invalid: ${error}`);
        }
        const context = {
            testRunId,
            testUsers: [],
            testDataIds: [],
            config: {
                createTestUsers: true,
                testUserCount: 2,
                createTestData: false,
                cleanupAfterTests: true,
                testSchema: 'public',
                setupTimeout: 30000,
                ...config,
            },
            setupAt: new Date(),
            isReady: false,
            cleanup: async () => this.cleanupEnvironment(testRunId),
        };
        try {
            // Store context before setup
            this.contexts.set(testRunId, context);
            // Setup test users if requested
            if (context.config.createTestUsers) {
                context.testUsers = await this.createTestUsers(context.config.testUserCount || 2);
            }
            // Setup test data if requested
            if (context.config.createTestData) {
                context.testDataIds = await this.createTestData(context.testUsers);
            }
            context.isReady = true;
            return context;
        }
        catch (error) {
            // Clean up on setup failure
            await this.cleanupEnvironment(testRunId);
            throw new Error(`Environment setup failed: ${error}`);
        }
    }
    /**
     * Get test environment context
     */
    getEnvironment(testRunId) {
        return this.contexts.get(testRunId) || null;
    }
    /**
     * Setup global test environment (for Jest setupFilesAfterEnv)
     */
    async setupGlobalEnvironment(config = {}) {
        if (this.globalContext) {
            return this.globalContext;
        }
        this.globalContext = await this.setupEnvironment('global', config);
        return this.globalContext;
    }
    /**
     * Get global test environment context
     */
    getGlobalEnvironment() {
        return this.globalContext;
    }
    /**
     * Cleanup test environment
     */
    async cleanupEnvironment(testRunId) {
        const context = this.contexts.get(testRunId);
        if (!context) {
            return;
        }
        try {
            // Clean up test users
            if (context.testUsers.length > 0) {
                await auth_1.authTestHelper.cleanupTestUsers(context.testUsers);
            }
            // Clean up database
            if (context.config.cleanupAfterTests) {
                await database_1.databaseTestHelper.cleanup();
            }
            // Remove from contexts
            this.contexts.delete(testRunId);
            // Clear global context if this is the global cleanup
            if (testRunId.startsWith('global-')) {
                this.globalContext = null;
            }
        }
        catch (error) {
            console.warn(`Cleanup failed for ${testRunId}:`, error);
        }
    }
    /**
     * Cleanup all test environments
     */
    async cleanupAll() {
        const cleanupPromises = Array.from(this.contexts.keys()).map(testRunId => this.cleanupEnvironment(testRunId));
        await Promise.allSettled(cleanupPromises);
    }
    /**
     * Create test users for the environment
     */
    async createTestUsers(count) {
        const users = [];
        for (let i = 0; i < count; i++) {
            try {
                const userData = {
                    email: (0, inline_helpers_1.fakeEmail)(`test-env-user-${i}`),
                };
                const user = await auth_1.authTestHelper.createTestUser(userData);
                users.push(user);
            }
            catch (error) {
                console.warn(`Failed to create test user ${i}:`, error);
            }
        }
        return users;
    }
    /**
     * Create test data for the environment
     */
    async createTestData(testUsers) {
        const dataIds = [];
        for (const user of testUsers) {
            try {
                // Create Supabase user record
                if (user.clerkUserId) {
                    const supabaseUserId = await database_1.databaseTestHelper.createSupabaseUser(user);
                    dataIds.push(supabaseUserId);
                }
            }
            catch (error) {
                console.warn(`Failed to create test data for user ${user.id}:`, error);
            }
        }
        return dataIds;
    }
}
// Singleton instance
exports.testEnvironmentManager = new TestEnvironmentManager();
/**
 * Jest setup helper for test files
 */
function setupTestEnvironment(config = {}) {
    return async () => {
        const testFileName = expect.getState().testPath?.split('/').pop()?.replace('.test.', '-') || 'unknown';
        const context = await exports.testEnvironmentManager.setupEnvironment(testFileName, config);
        // Make context available globally in tests
        global.testContext = context;
        return context;
    };
}
/**
 * Jest teardown helper for test files
 */
function teardownTestEnvironment() {
    return async () => {
        const context = global.testContext;
        if (context) {
            await context.cleanup();
            global.testContext = null;
        }
    };
}
/**
 * Describe block wrapper with automatic environment setup/teardown
 */
function describeWithEnvironment(name, config, tests) {
    describe(name, () => {
        let testContext;
        beforeAll(async () => {
            testContext = await exports.testEnvironmentManager.setupEnvironment(name, config);
        });
        afterAll(async () => {
            if (testContext) {
                await testContext.cleanup();
            }
        });
        tests(() => testContext);
    });
}
/**
 * Test isolation utilities
 */
exports.testIsolation = {
    /**
     * Create isolated test context for a single test
     */
    async createIsolatedContext(testName) {
        return exports.testEnvironmentManager.setupEnvironment(`isolated-${testName}`, {
            createTestUsers: true,
            testUserCount: 1,
            cleanupAfterTests: true,
        });
    },
    /**
     * Run test with isolated environment
     */
    async withIsolatedEnvironment(testName, testFn) {
        const context = await this.createIsolatedContext(testName);
        try {
            return await testFn(context);
        }
        finally {
            await context.cleanup();
        }
    },
};
/**
 * Environment validation utilities
 */
exports.environmentValidation = {
    /**
     * Validate test environment is properly configured
     */
    validateEnvironment() {
        const errors = [];
        const warnings = [];
        // Check required environment variables
        const requiredVars = [
            'SUPABASE_URL',
            'SUPABASE_SERVICE_ROLE_KEY',
            'CLERK_SECRET_KEY',
        ];
        for (const varName of requiredVars) {
            const value = process.env[varName] ||
                process.env[`EXPO_PUBLIC_${varName.replace('_', '_')}`] ||
                process.env[`NEXT_PUBLIC_${varName.replace('_', '_')}`];
            if (!value) {
                errors.push(`Missing required environment variable: ${varName}`);
            }
        }
        // Check optional but recommended variables
        const recommendedVars = [
            'CLERK_WEBHOOK_SECRET',
            'SUPABASE_ANON_KEY',
        ];
        for (const varName of recommendedVars) {
            const value = process.env[varName];
            if (!value) {
                warnings.push(`Missing recommended environment variable: ${varName}`);
            }
        }
        // Check if running in test environment
        if (!process.env.NODE_ENV?.includes('test')) {
            warnings.push('NODE_ENV is not set to test mode');
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    },
    /**
     * Validate database connection
     */
    async validateDatabaseConnection() {
        try {
            // Try to create a simple query to test connection
            await database_1.databaseTestHelper.testRLSPolicy({
                tableName: 'users',
                userId: (0, inline_helpers_1.fakeUserId)(),
                operation: 'select',
                shouldSucceed: false, // This should fail due to RLS, but connection should work
                description: 'Connection test',
            });
            return { connected: true };
        }
        catch (error) {
            // If error is about permissions/RLS, connection is working
            if (error instanceof Error && error.message.includes('PGRST')) {
                return { connected: true };
            }
            return {
                connected: false,
                error: `Database connection failed: ${error}`,
            };
        }
    },
    /**
     * Validate authentication services
     */
    async validateAuthServices() {
        const errors = [];
        let clerkValid = false;
        let supabaseAuthValid = false;
        // Test Clerk connection
        try {
            // Try to create and delete a test user
            const testUser = await auth_1.authTestHelper.createTestUser({
                email: (0, inline_helpers_1.fakeEmail)('connection-test'),
            });
            if (testUser.clerkUserId) {
                await auth_1.authTestHelper.deleteTestUser(testUser.clerkUserId);
                clerkValid = true;
            }
        }
        catch (error) {
            errors.push(`Clerk connection failed: ${error}`);
        }
        // Test Supabase auth connection
        try {
            // Test creating auth context (this will fail safely if auth is misconfigured)
            database_1.databaseTestHelper.clearAuthContext();
            supabaseAuthValid = true;
        }
        catch (error) {
            errors.push(`Supabase auth failed: ${error}`);
        }
        return {
            clerkValid,
            supabaseAuthValid,
            errors,
        };
    },
};
/**
 * Test performance monitoring
 */
class TestPerformanceMonitor {
    static measurements = new Map();
    static startTest(testName) {
        const startTime = performance.now();
        return () => {
            const duration = performance.now() - startTime;
            const measurements = this.measurements.get(testName) || [];
            measurements.push(duration);
            this.measurements.set(testName, measurements);
        };
    }
    static getTestStats(testName) {
        const measurements = this.measurements.get(testName);
        if (!measurements || measurements.length === 0) {
            return null;
        }
        return {
            count: measurements.length,
            average: measurements.reduce((a, b) => a + b, 0) / measurements.length,
            min: Math.min(...measurements),
            max: Math.max(...measurements),
        };
    }
    static getAllStats() {
        const stats = {};
        for (const testName of this.measurements.keys()) {
            stats[testName] = this.getTestStats(testName);
        }
        return stats;
    }
    static reset() {
        this.measurements.clear();
    }
}
exports.TestPerformanceMonitor = TestPerformanceMonitor;
/**
 * Test environment presets for common scenarios
 */
exports.testEnvironmentPresets = {
    /**
     * Minimal environment for unit tests
     */
    unit: () => ({
        createTestUsers: false,
        createTestData: false,
        cleanupAfterTests: false,
        setupTimeout: 5000,
    }),
    /**
     * Full environment for integration tests
     */
    integration: () => ({
        createTestUsers: true,
        testUserCount: 3,
        createTestData: true,
        cleanupAfterTests: true,
        setupTimeout: 30000,
    }),
    /**
     * Environment for authentication tests
     */
    auth: () => ({
        createTestUsers: true,
        testUserCount: 5,
        createTestData: false,
        cleanupAfterTests: true,
        setupTimeout: 20000,
    }),
    /**
     * Environment for database/RLS tests
     */
    database: () => ({
        createTestUsers: true,
        testUserCount: 2,
        createTestData: true,
        cleanupAfterTests: true,
        setupTimeout: 25000,
    }),
    /**
     * Environment for end-to-end tests
     */
    e2e: () => ({
        createTestUsers: true,
        testUserCount: 1,
        createTestData: true,
        cleanupAfterTests: true,
        setupTimeout: 60000,
    }),
};
/**
 * Helper for accessing test context in tests
 */
function getTestContext() {
    const context = global.testContext;
    if (!context) {
        throw new Error('Test context not available. Make sure to call setupTestEnvironment() in your test setup.');
    }
    if (!context.isReady) {
        throw new Error('Test environment is not ready yet. Wait for setup to complete.');
    }
    return context;
}
/**
 * Helper to get the first test user from context
 */
function getTestUser(index = 0) {
    const context = getTestContext();
    if (!context.testUsers[index]) {
        throw new Error(`Test user at index ${index} not found. Available users: ${context.testUsers.length}`);
    }
    return context.testUsers[index];
}
