"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.devCommands = exports.devAssertions = exports.devDebugUtils = exports.testDataSeeding = void 0;
exports.validateTestEnvironment = validateTestEnvironment;
exports.checkDatabaseHealth = checkDatabaseHealth;
exports.createQuickTestUser = createQuickTestUser;
exports.quickDatabaseCleanup = quickDatabaseCleanup;
const config_1 = require("./config");
const database_1 = require("./database");
const auth_1 = require("./auth");
const inline_helpers_1 = require("./inline-helpers");
/**
 * Comprehensive environment validation
 */
async function validateTestEnvironment() {
    const result = {
        valid: true,
        errors: [],
        warnings: [],
        suggestions: [],
        details: {
            environmentVariables: {},
            services: {},
            configuration: {},
        },
    };
    // Check environment variables
    const requiredEnvVars = {
        'SUPABASE_URL': process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
        'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'SUPABASE_ANON_KEY': process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_KEY,
        'CLERK_SECRET_KEY': process.env.CLERK_SECRET_KEY,
        'CLERK_PUBLISHABLE_KEY': process.env.CLERK_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    };
    const optionalEnvVars = {
        'CLERK_WEBHOOK_SECRET': process.env.CLERK_WEBHOOK_SECRET,
        'NODE_ENV': process.env.NODE_ENV,
        'CI': process.env.CI,
    };
    for (const [key, value] of Object.entries(requiredEnvVars)) {
        if (!value) {
            result.valid = false;
            result.errors.push(`Missing required environment variable: ${key}`);
            result.details.environmentVariables[key] = 'missing';
        }
        else if (value.length < 10) {
            result.warnings.push(`Environment variable ${key} seems too short (${value.length} characters)`);
            result.details.environmentVariables[key] = 'invalid';
        }
        else {
            result.details.environmentVariables[key] = 'present';
        }
    }
    for (const [key, value] of Object.entries(optionalEnvVars)) {
        if (!value) {
            result.warnings.push(`Optional environment variable ${key} is not set`);
            result.details.environmentVariables[key] = 'missing';
        }
        else {
            result.details.environmentVariables[key] = 'present';
        }
    }
    // Check test configuration
    try {
        (0, config_1.validateTestConfig)();
        result.details.configuration['testConfig'] = 'valid';
    }
    catch (error) {
        result.valid = false;
        result.errors.push(`Test configuration invalid: ${error}`);
        result.details.configuration['testConfig'] = 'invalid';
    }
    // Check service availability
    try {
        // Test database connection
        const dbStart = performance.now();
        await database_1.databaseTestHelper.testRLSPolicy({
            tableName: 'users',
            userId: (0, inline_helpers_1.fakeUserId)(),
            operation: 'select',
            shouldSucceed: false,
            description: 'Connection test',
        });
        const dbTime = performance.now() - dbStart;
        result.details.services['database'] = 'available';
        result.details.configuration['databaseResponseTime'] = `${dbTime.toFixed(2)}ms`;
        if (dbTime > 1000) {
            result.warnings.push(`Database response time is slow (${dbTime.toFixed(2)}ms)`);
        }
    }
    catch (error) {
        const errorMessage = error.message;
        if (errorMessage.includes('PGRST') || errorMessage.includes('permission')) {
            result.details.services['database'] = 'available';
        }
        else {
            result.errors.push(`Database connection failed: ${errorMessage}`);
            result.details.services['database'] = 'unavailable';
            result.valid = false;
        }
    }
    try {
        // Test Clerk service (try to create a test user)
        const testUser = await auth_1.authTestHelper.createTestUser({
            email: (0, inline_helpers_1.fakeEmail)('connection-test'),
        });
        result.details.services['clerk'] = 'available';
        // Clean up test user
        if (testUser.clerkUserId) {
            await auth_1.authTestHelper.deleteTestUser(testUser.clerkUserId);
        }
    }
    catch (error) {
        result.warnings.push(`Clerk service check failed: ${error}`);
        result.details.services['clerk'] = 'unavailable';
    }
    // Add suggestions based on findings
    if (result.errors.length > 0) {
        result.suggestions.push('Check your .env files and ensure all required variables are set');
        result.suggestions.push('Verify that your Supabase and Clerk projects are properly configured');
    }
    if (result.warnings.length > 0 && !(0, config_1.isCI)()) {
        result.suggestions.push('Consider setting up optional environment variables for better test coverage');
    }
    if (result.details.services['database'] === 'unavailable') {
        result.suggestions.push('Check your Supabase project status and database connection');
        result.suggestions.push('Verify that RLS policies are properly configured');
    }
    if (result.details.services['clerk'] === 'unavailable') {
        result.suggestions.push('Check your Clerk project configuration');
        result.suggestions.push('Verify that your Clerk secret key has the necessary permissions');
    }
    return result;
}
/**
 * Perform database health check
 */
async function checkDatabaseHealth() {
    const result = {
        healthy: true,
        connectionTime: 0,
        errors: [],
        tables: {},
        rlsPolicies: {},
    };
    try {
        const startTime = performance.now();
        // Test connection with a simple query
        await database_1.databaseTestHelper.testRLSPolicy({
            tableName: 'users',
            userId: (0, inline_helpers_1.fakeUserId)(),
            operation: 'select',
            shouldSucceed: false,
            description: 'Health check',
        });
        result.connectionTime = performance.now() - startTime;
        // Test access to key tables
        const keyTables = ['users', 'activities', 'user_metrics', 'activity_segments'];
        for (const table of keyTables) {
            try {
                await database_1.databaseTestHelper.testRLSPolicy({
                    tableName: table,
                    userId: (0, inline_helpers_1.fakeUserId)(),
                    operation: 'select',
                    shouldSucceed: false,
                    description: `Table access test for ${table}`,
                });
                result.tables[table] = 'accessible';
                result.rlsPolicies[table] = 'active';
            }
            catch (error) {
                const errorMessage = error.message;
                if (errorMessage.includes('PGRST') || errorMessage.includes('permission')) {
                    result.tables[table] = 'accessible';
                    result.rlsPolicies[table] = 'active';
                }
                else {
                    result.tables[table] = 'inaccessible';
                    result.rlsPolicies[table] = 'unknown';
                    result.errors.push(`Table ${table}: ${errorMessage}`);
                }
            }
        }
    }
    catch (error) {
        result.healthy = false;
        result.errors.push(`Database health check failed: ${error}`);
    }
    return result;
}
/**
 * Quick test user creation for development
 */
async function createQuickTestUser(email, options = {}) {
    const userEmail = email || (0, inline_helpers_1.fakeEmail)('dev-user');
    const password = 'DevTestUser123!';
    try {
        // Create Clerk user
        const user = await auth_1.authTestHelper.createTestUser({
            email: userEmail,
            password,
        });
        const result = {
            user,
            credentials: {
                email: userEmail,
                password,
            },
            cleanup: async () => {
                if (user.clerkUserId) {
                    await auth_1.authTestHelper.deleteTestUser(user.clerkUserId);
                }
            },
        };
        // Create Supabase record if requested
        if (options.createSupabaseRecord && user.clerkUserId) {
            try {
                const supabaseUserId = await database_1.databaseTestHelper.createSupabaseUser(user);
                user.supabaseUserId = supabaseUserId;
            }
            catch (error) {
                console.warn('Failed to create Supabase user record:', error);
            }
        }
        // Generate token if requested
        if (options.generateToken && user.clerkUserId) {
            try {
                const token = await auth_1.authTestHelper.generateTestToken(user.clerkUserId);
                result.credentials.token = token;
            }
            catch (error) {
                console.warn('Failed to generate test token:', error);
            }
        }
        return result;
    }
    catch (error) {
        throw new Error(`Failed to create quick test user: ${error}`);
    }
}
/**
 * Quick database cleanup for development
 */
async function quickDatabaseCleanup() {
    const result = {
        cleaned: [],
        errors: [],
    };
    try {
        await database_1.databaseTestHelper.cleanup();
        result.cleaned.push('Database cleanup completed');
    }
    catch (error) {
        result.errors.push(`Database cleanup failed: ${error}`);
    }
    return result;
}
/**
 * Test data seeding utilities
 */
exports.testDataSeeding = {
    /**
     * Seed basic test data
     */
    async seedBasicTestData() {
        const result = {
            users: [],
            activities: [],
            errors: [],
        };
        try {
            // Create a few test users
            for (let i = 0; i < 3; i++) {
                try {
                    const user = await createQuickTestUser(`seed-user-${i}@test.example`, {
                        createSupabaseRecord: true,
                    });
                    result.users.push(user.user);
                }
                catch (error) {
                    result.errors.push(`Failed to create user ${i}: ${error}`);
                }
            }
            // Create some test activities
            for (const user of result.users) {
                if (user.supabaseUserId) {
                    try {
                        const activity = {
                            userId: user.supabaseUserId,
                            name: `Seeded Activity for ${user.firstName}`,
                            type: 'running',
                            startTime: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
                            endTime: new Date(),
                            duration: 3600,
                            distance: 10000,
                            calories: 500,
                            elevationGain: 100,
                        };
                        const activityId = await database_1.databaseTestHelper.createTestActivity(activity);
                        result.activities.push(activityId);
                    }
                    catch (error) {
                        result.errors.push(`Failed to create activity for user ${user.id}: ${error}`);
                    }
                }
            }
        }
        catch (error) {
            result.errors.push(`Test data seeding failed: ${error}`);
        }
        return result;
    },
    /**
     * Clean all seeded test data
     */
    async cleanSeedData() {
        try {
            await quickDatabaseCleanup();
            return { success: true };
        }
        catch (error) {
            return { success: false, error: `Failed to clean seed data: ${error}` };
        }
    },
};
/**
 * Development debugging utilities
 */
exports.devDebugUtils = {
    /**
     * Print environment status to console
     */
    async printEnvironmentStatus() {
        console.log('\n🔧 TurboFit Testing Environment Status');
        console.log('=====================================');
        const validation = await validateTestEnvironment();
        console.log('\n📋 Environment Variables:');
        for (const [key, status] of Object.entries(validation.details.environmentVariables)) {
            const icon = status === 'present' ? '✅' : status === 'missing' ? '❌' : '⚠️';
            console.log(`${icon} ${key}: ${status}`);
        }
        console.log('\n🔌 Services:');
        for (const [service, status] of Object.entries(validation.details.services)) {
            const icon = status === 'available' ? '✅' : status === 'unavailable' ? '❌' : '❓';
            console.log(`${icon} ${service}: ${status}`);
        }
        if (validation.errors.length > 0) {
            console.log('\n❌ Errors:');
            validation.errors.forEach(error => console.log(`   • ${error}`));
        }
        if (validation.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            validation.warnings.forEach(warning => console.log(`   • ${warning}`));
        }
        if (validation.suggestions.length > 0) {
            console.log('\n💡 Suggestions:');
            validation.suggestions.forEach(suggestion => console.log(`   • ${suggestion}`));
        }
        console.log(`\n🏁 Overall Status: ${validation.valid ? '✅ Ready' : '❌ Issues Found'}\n`);
    },
    /**
     * Print database health status
     */
    async printDatabaseHealth() {
        console.log('\n🗄️  Database Health Check');
        console.log('=======================');
        const health = await checkDatabaseHealth();
        console.log(`Connection Time: ${health.connectionTime.toFixed(2)}ms`);
        console.log(`Overall Health: ${health.healthy ? '✅ Healthy' : '❌ Issues Found'}`);
        console.log('\n📊 Table Access:');
        for (const [table, status] of Object.entries(health.tables)) {
            const icon = status === 'accessible' ? '✅' : '❌';
            console.log(`${icon} ${table}: ${status}`);
        }
        console.log('\n🔒 RLS Policies:');
        for (const [table, status] of Object.entries(health.rlsPolicies)) {
            const icon = status === 'active' ? '✅' : status === 'inactive' ? '⚠️' : '❓';
            console.log(`${icon} ${table}: ${status}`);
        }
        if (health.errors.length > 0) {
            console.log('\n❌ Errors:');
            health.errors.forEach(error => console.log(`   • ${error}`));
        }
        console.log('');
    },
    /**
     * Interactive test user creation
     */
    async createInteractiveTestUser() {
        console.log('\n👤 Creating Test User');
        console.log('===================');
        try {
            const quickUser = await createQuickTestUser(undefined, {
                createSupabaseRecord: true,
                generateToken: true,
            });
            console.log('✅ Test user created successfully!');
            console.log(`📧 Email: ${quickUser.credentials.email}`);
            console.log(`🔑 Password: ${quickUser.credentials.password}`);
            console.log(`🆔 Clerk ID: ${quickUser.user.clerkUserId}`);
            console.log(`🆔 Supabase ID: ${quickUser.user.supabaseUserId}`);
            if (quickUser.credentials.token) {
                console.log(`🎫 Token: ${quickUser.credentials.token.substring(0, 50)}...`);
            }
            console.log('\n⚠️  Remember to call cleanup() when done testing:');
            console.log(`await quickUser.cleanup();`);
            // Store cleanup function globally for easy access
            global.__testUserCleanup = quickUser.cleanup;
        }
        catch (error) {
            console.log(`❌ Failed to create test user: ${error}`);
        }
    },
    /**
     * Quick environment setup check
     */
    async quickSetupCheck() {
        try {
            const validation = await validateTestEnvironment();
            const health = await checkDatabaseHealth();
            const allGood = validation.valid && health.healthy;
            if (allGood) {
                console.log('✅ Test environment is ready to go!');
            }
            else {
                console.log('❌ Test environment has issues. Run printEnvironmentStatus() for details.');
            }
            return allGood;
        }
        catch (error) {
            console.log(`❌ Setup check failed: ${error}`);
            return false;
        }
    },
};
/**
 * Assertion helpers for development
 */
exports.devAssertions = {
    /**
     * Assert environment is ready
     */
    async assertEnvironmentReady() {
        const validation = await validateTestEnvironment();
        if (!validation.valid) {
            throw new Error(`Test environment is not ready: ${validation.errors.join(', ')}`);
        }
    },
    /**
     * Assert database is healthy
     */
    async assertDatabaseHealthy() {
        const health = await checkDatabaseHealth();
        if (!health.healthy) {
            throw new Error(`Database is not healthy: ${health.errors.join(', ')}`);
        }
    },
    /**
     * Assert test user can be created
     */
    async assertCanCreateTestUser() {
        try {
            const quickUser = await createQuickTestUser();
            await quickUser.cleanup();
        }
        catch (error) {
            throw new Error(`Cannot create test user: ${error}`);
        }
    },
};
/**
 * Quick commands for developers
 */
exports.devCommands = {
    /**
     * Full environment diagnostic
     */
    async fullDiagnostic() {
        await exports.devDebugUtils.printEnvironmentStatus();
        await exports.devDebugUtils.printDatabaseHealth();
        const isReady = await exports.devDebugUtils.quickSetupCheck();
        if (isReady) {
            console.log('🚀 Your test environment is ready for development!');
        }
        else {
            console.log('🔧 Please address the issues above before running tests.');
        }
    },
    /**
     * Quick setup for new developers
     */
    async quickSetup() {
        console.log('🛠️  TurboFit Testing Quick Setup');
        console.log('==============================\n');
        console.log('1️⃣ Validating environment...');
        const validation = await validateTestEnvironment();
        if (!validation.valid) {
            console.log('❌ Environment validation failed. Please fix these issues:');
            validation.errors.forEach(error => console.log(`   • ${error}`));
            return;
        }
        console.log('2️⃣ Checking database health...');
        const health = await checkDatabaseHealth();
        if (!health.healthy) {
            console.log('❌ Database health check failed. Please fix these issues:');
            health.errors.forEach(error => console.log(`   • ${error}`));
            return;
        }
        console.log('3️⃣ Creating test user...');
        try {
            await exports.devDebugUtils.createInteractiveTestUser();
        }
        catch (error) {
            console.log(`❌ Failed to create test user: ${error}`);
            return;
        }
        console.log('\n🎉 Quick setup complete! You\'re ready to start testing.');
        console.log('💡 Tip: Use devCommands.fullDiagnostic() anytime to check your environment.');
    },
    /**
     * Clean everything for fresh start
     */
    async cleanEverything() {
        console.log('🧹 Cleaning test environment...');
        try {
            const cleanup = await quickDatabaseCleanup();
            if (cleanup.errors.length > 0) {
                console.log('⚠️ Some cleanup operations failed:');
                cleanup.errors.forEach(error => console.log(`   • ${error}`));
            }
            else {
                console.log('✅ Test environment cleaned successfully!');
            }
        }
        catch (error) {
            console.log(`❌ Cleanup failed: ${error}`);
        }
    },
};
