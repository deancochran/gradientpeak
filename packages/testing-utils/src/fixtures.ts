// Simplified test fixtures using crypto.randomUUID and basic arrays
import { randomUUID } from 'crypto';

// Simple arrays for test data - no faker needed
const SPORTS = ['running', 'cycling', 'walking', 'hiking', 'swimming'];
const FIRST_NAMES = ['Alex', 'Jordan', 'Casey', 'Taylor', 'Morgan'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller'];

// Helper functions
const getRandomItem = <T>(array: T[]): T => array[Math.floor(Math.random() * array.length)] as T;
const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

// Simple test user generator
export const generateTestUser = (overrides = {}) => ({
  id: randomUUID(),
  clerk_user_id: `user_${randomUUID()}`,
  email: `user-${randomUUID()}@example.com`,
  full_name: `${getRandomItem(FIRST_NAMES)} ${getRandomItem(LAST_NAMES)}`,
  created_at: new Date().toISOString(),
  ...overrides
});

// Simple test activity generator  
export const generateTestActivity = (overrides = {}) => ({
  id: randomUUID(),
  user_id: randomUUID(),
  client_id: randomUUID(),
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

// Simple webhook payload generator
export const generateWebhookPayload = (type = 'user.created', overrides = {}) => ({
  type,
  data: {
    id: `user_${randomUUID()}`,
    email_addresses: [{ 
      email_address: `test-${randomUUID()}@example.com`,
      id: `email_${randomUUID()}`
    }],
    first_name: getRandomItem(FIRST_NAMES),
    last_name: getRandomItem(LAST_NAMES),
    ...overrides
  }
});