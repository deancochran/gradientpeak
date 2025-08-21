// Essential testing helpers - simple and focused
import { randomUUID } from 'crypto';

// Simple test utilities using built-in Node.js functions
export const fakeEmail = () => `user-${randomUUID()}@example.com`;
export const fakePassword = () => 'password123';
export const fakeUserId = () => `user_${randomUUID()}`;
export const fakeClerkId = () => `user_${randomUUID().replace(/-/g, '')}`;

// Basic webhook payload for testing
export const createTestWebhookPayload = (overrides = {}) => ({
  type: 'user.created',
  data: {
    id: fakeClerkId(),
    email_addresses: [{ 
      email_address: fakeEmail(),
      id: `email_${randomUUID()}`
    }],
    first_name: 'Test',
    last_name: 'User',
    ...overrides
  }
});

// Environment variable checker
export const checkTestEnvironment = () => {
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