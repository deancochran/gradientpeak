"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWebhookPayload = exports.generateTestActivity = exports.generateTestUser = void 0;
// Simplified test fixtures using crypto.randomUUID and basic arrays
const crypto_1 = require("crypto");
// Simple arrays for test data - no faker needed
const SPORTS = ['running', 'cycling', 'walking', 'hiking', 'swimming'];
const FIRST_NAMES = ['Alex', 'Jordan', 'Casey', 'Taylor', 'Morgan'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller'];
// Helper functions
const getRandomItem = (array) => array[Math.floor(Math.random() * array.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
// Simple test user generator
const generateTestUser = (overrides = {}) => ({
    id: (0, crypto_1.randomUUID)(),
    clerk_user_id: `user_${(0, crypto_1.randomUUID)()}`,
    email: `user-${(0, crypto_1.randomUUID)()}@example.com`,
    full_name: `${getRandomItem(FIRST_NAMES)} ${getRandomItem(LAST_NAMES)}`,
    created_at: new Date().toISOString(),
    ...overrides
});
exports.generateTestUser = generateTestUser;
// Simple test activity generator  
const generateTestActivity = (overrides = {}) => ({
    id: (0, crypto_1.randomUUID)(),
    user_id: (0, crypto_1.randomUUID)(),
    client_id: (0, crypto_1.randomUUID)(),
    name: `Test ${getRandomItem(SPORTS)} Activity`,
    sport: getRandomItem(SPORTS),
    status: 'completed',
    privacy: 'private',
    distance_meters: randomInt(1000, 10000),
    duration_seconds: randomInt(1800, 3600),
    started_at: new Date().toISOString(),
    recorded_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    sync_status: 'synced',
    ...overrides
});
exports.generateTestActivity = generateTestActivity;
// Simple webhook payload generator
const generateWebhookPayload = (type = 'user.created', overrides = {}) => ({
    type,
    data: {
        id: `user_${(0, crypto_1.randomUUID)()}`,
        email_addresses: [{
                email_address: `test-${(0, crypto_1.randomUUID)()}@example.com`,
                id: `email_${(0, crypto_1.randomUUID)()}`
            }],
        first_name: getRandomItem(FIRST_NAMES),
        last_name: getRandomItem(LAST_NAMES),
        ...overrides
    }
});
exports.generateWebhookPayload = generateWebhookPayload;
