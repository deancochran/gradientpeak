"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTestTimeout = exports.isCI = exports.validateTestConfig = exports.testConfig = void 0;
const dotenv_1 = require("dotenv");
// Load environment variables from various locations
(0, dotenv_1.config)({ path: '.env' });
(0, dotenv_1.config)({ path: '.env.local' });
(0, dotenv_1.config)({ path: '.env.test' });
exports.testConfig = {
    supabase: {
        url: process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        anonKey: process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_KEY || '',
    },
    clerk: {
        publishableKey: process.env.CLERK_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
        secretKey: process.env.CLERK_SECRET_KEY || '',
        webhookSecret: process.env.CLERK_WEBHOOK_SECRET || '',
    },
    database: {
        testSchema: process.env.TEST_SCHEMA || 'public',
        cleanupBetweenTests: process.env.CLEANUP_BETWEEN_TESTS !== 'false',
    },
};
const validateTestConfig = () => {
    const required = [
        'supabase.url',
        'supabase.serviceRoleKey',
        'supabase.anonKey',
        'clerk.publishableKey',
        'clerk.secretKey',
    ];
    for (const key of required) {
        const value = key.split('.').reduce((obj, k) => obj[k], exports.testConfig);
        if (!value) {
            throw new Error(`Missing required test configuration: ${key}`);
        }
    }
};
exports.validateTestConfig = validateTestConfig;
const isCI = () => {
    return !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.BUILDKITE || process.env.CIRCLECI);
};
exports.isCI = isCI;
const getTestTimeout = () => {
    return (0, exports.isCI)() ? 30000 : 15000; // 30s in CI, 15s locally
};
exports.getTestTimeout = getTestTimeout;
