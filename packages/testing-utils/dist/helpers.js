"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkTestEnvironment = exports.createTestWebhookPayload = exports.fakeClerkId = exports.fakeUserId = exports.fakePassword = exports.fakeEmail = void 0;
// Essential testing helpers - simple and focused
const crypto_1 = require("crypto");
// Simple test utilities using built-in Node.js functions
const fakeEmail = () => `user-${(0, crypto_1.randomUUID)()}@example.com`;
exports.fakeEmail = fakeEmail;
const fakePassword = () => 'password123';
exports.fakePassword = fakePassword;
const fakeUserId = () => `user_${(0, crypto_1.randomUUID)()}`;
exports.fakeUserId = fakeUserId;
const fakeClerkId = () => `user_${(0, crypto_1.randomUUID)().replace(/-/g, '')}`;
exports.fakeClerkId = fakeClerkId;
// Basic webhook payload for testing
const createTestWebhookPayload = (overrides = {}) => ({
    type: 'user.created',
    data: {
        id: (0, exports.fakeClerkId)(),
        email_addresses: [{
                email_address: (0, exports.fakeEmail)(),
                id: `email_${(0, crypto_1.randomUUID)()}`
            }],
        first_name: 'Test',
        last_name: 'User',
        ...overrides
    }
});
exports.createTestWebhookPayload = createTestWebhookPayload;
// Environment variable checker
const checkTestEnvironment = () => {
    const required = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'
    ];
    const missing = required.filter(env => !process.env[env]);
    if (missing.length > 0) {
        console.warn('⚠️  Missing environment variables:', missing.join(', '));
        return false;
    }
    return true;
};
exports.checkTestEnvironment = checkTestEnvironment;
