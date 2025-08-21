# Testing Utils Package

A comprehensive testing utilities package for the TurboFit monorepo, providing shared testing infrastructure, helpers, and fixtures for authentication, database, and end-to-end testing.

## Overview

This package provides:

- **Authentication Testing**: Clerk integration, JWT validation, user lifecycle testing
- **Database Testing**: Supabase RLS policy validation, data fixtures, test cleanup  
- **End-to-End Testing**: Playwright and Maestro configuration and helpers
- **Test Fixtures**: Predefined test data, scenarios, and factories
- **Shared Utilities**: Common testing helpers, mocks, and configuration

## Installation

This package is automatically available in all apps within the monorepo:

```json
{
  "devDependencies": {
    "@repo/testing-utils": "workspace:*"
  }
}
```

## Quick Start

### Basic Setup

```typescript
import { 
  validateTestConfig,
  authTestHelper,
  databaseTestHelper 
} from '@repo/testing-utils';

// Validate environment configuration
validateTestConfig();

// Create test user
const testUser = await authTestHelper.createTestUser({
  email: 'test@example.com',
  password: 'TestPassword123!'
});

// Test database operations
const result = await databaseTestHelper.testRLSPolicy({
  tableName: 'activities',
  userId: testUser.id,
  operation: 'select',
  shouldSucceed: true,
  description: 'User can read own activities'
});
```

### Using Test Scenarios

```typescript
import { activeUserScenario } from '@repo/testing-utils';

const scenario = activeUserScenario();

// Use predefined users and activities
const user = scenario.users[0];
const activities = scenario.activities;

// Verify expected outcomes
expect(scenario.expectedOutcomes.totalActivities).toBe(3);
```

## Core Components

### Authentication Testing (`auth.ts`)

```typescript
import { authTestHelper } from '@repo/testing-utils';

// Create test users
const user = await authTestHelper.createTestUser();

// Generate JWT tokens
const token = await authTestHelper.generateTestToken(user.clerkUserId, 'supabase');

// Validate token structure
const validation = authTestHelper.verifyTokenStructure(token);

// Clean up
await authTestHelper.deleteTestUser(user.clerkUserId);
```

### Database Testing (`database.ts`)

```typescript
import { databaseTestHelper } from '@repo/testing-utils';

// Set authentication context
databaseTestHelper.setAuthContext(jwtToken);

// Test RLS policies
const testCase = {
  tableName: 'activities',
  userId: 'user-uuid',
  operation: 'select',
  shouldSucceed: true,
  description: 'User can read own data'
};

const result = await databaseTestHelper.testRLSPolicy(testCase);

// Create test data
const activityId = await databaseTestHelper.createTestActivity({
  userId: 'user-uuid',
  name: 'Test Activity',
  type: 'running',
  startTime: new Date(),
  endTime: new Date(),
  duration: 3600
});

// Cleanup
await databaseTestHelper.cleanup();
```

### RLS Policy Testing (`rls.ts`)

```typescript
import { rlsTestHelper } from '@repo/testing-utils';

// Test comprehensive table policies
const results = await rlsTestHelper.testTablePolicies(
  'activities',
  'own-user-id', 
  'other-user-id',
  { name: 'Test Activity', activity_type: 'running' }
);

// Test anonymous access
const anonResults = await rlsTestHelper.testAnonymousAccess('activities');

// Verify RLS is enabled
const rlsEnabled = await rlsTestHelper.verifyRLSEnabled('activities');
```

### Test Fixtures (`fixtures.ts`)

```typescript
import { 
  generateTestUser,
  generateTestActivity,
  testUserScenarios,
  testActivityScenarios
} from '@repo/testing-utils';

// Generate random test data
const user = generateTestUser();
const activity = generateTestActivity(user.id);

// Use predefined scenarios
const validUser = testUserScenarios.validUser();
const runningActivity = testActivityScenarios.runningActivity(user.id);

// Generate webhook payloads
const webhookPayload = generateWebhookPayload('user.created', {
  email: 'test@example.com'
});
```

### Test Helpers (`helpers.ts`)

```typescript
import { 
  waitFor,
  retry,
  expectToThrow,
  withTimeout
} from '@repo/testing-utils';

// Wait for conditions
await waitFor(
  async () => await checkUserExists(userId),
  { timeout: 10000, timeoutMessage: 'User was not created' }
);

// Retry operations
const result = await retry(
  async () => await unstableOperation(),
  { maxAttempts: 3, baseDelay: 1000 }
);

// Test error conditions
await expectToThrow(
  async () => await invalidOperation(),
  'Expected error message'
);

// Add timeouts
const result = await withTimeout(
  slowOperation(),
  5000,
  'Operation timed out'
);
```

## Configuration

### Environment Variables

Create `.env.test` with your test configuration:

```bash
# Supabase Test Configuration
SUPABASE_URL=https://your-test-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-test-service-role-key
SUPABASE_ANON_KEY=your-test-anon-key

# Clerk Test Configuration  
CLERK_SECRET_KEY=sk_test_your-clerk-secret-key
CLERK_PUBLISHABLE_KEY=pk_test_your-clerk-publishable-key
CLERK_WEBHOOK_SECRET=whsec_your-webhook-secret

# Test Settings
TEST_SCHEMA=public
CLEANUP_BETWEEN_TESTS=true
TEST_TIMEOUT=30000
```

### Validation

The package automatically validates configuration:

```typescript
import { validateTestConfig } from '@repo/testing-utils';

// Throws error if configuration is invalid
validateTestConfig();
```

## Test Scenarios

Pre-built scenarios for comprehensive testing:

- **New User Onboarding**: Registration and setup flow
- **Active User**: User with multiple activities and metrics
- **Multi-User Privacy**: RLS and data isolation testing
- **Data Synchronization**: Offline/online sync testing  
- **Performance**: High-volume data testing
- **Error Handling**: Resilience and recovery testing
- **Mobile Features**: GPS, offline storage, background sync
- **Achievement System**: Gamification and notifications

## Integration with Testing Frameworks

### Jest Setup

```javascript
// jest.config.js
const { createJestConfig } = require('@repo/testing-utils/jest');

module.exports = createJestConfig({
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts']
});
```

### Playwright Setup

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';
import { testConfig } from '@repo/testing-utils';

export default defineConfig({
  globalSetup: require.resolve('./tests/setup/global-setup.ts'),
  use: {
    baseURL: 'http://localhost:3000',
  },
});
```

### Maestro Setup

```yaml
# .maestro/config.yaml
env:
  APP_ID: "com.turbofit.native"
  
test_users:
  valid_user:
    email: "maestro-test@test.example"
    password: "MaestroTestPassword123!"
```

## Best Practices

### Test Isolation

```typescript
// Always clean up after tests
afterEach(async () => {
  if (testUser?.clerkUserId) {
    await authTestHelper.deleteTestUser(testUser.clerkUserId);
  }
  await databaseTestHelper.cleanup();
});
```

### Error Handling

```typescript
// Use timeout wrappers for potentially slow operations
const result = await withTimeout(
  authTestHelper.createTestUser(),
  10000,
  'User creation timed out'
);
```

### Data Fixtures

```typescript
// Use factories for consistent test data
const user = generateTestUser({
  email: 'specific-test@example.com'
});

// Use scenarios for complex test setups
const scenario = activeUserScenario();
```

### RLS Testing

```typescript
// Test both positive and negative cases
const testCases = databaseTestHelper.generateRLSTestCases(
  ownUserId,
  otherUserId
);

for (const testCase of testCases) {
  const result = await databaseTestHelper.testRLSPolicy(testCase);
  expect(result.success).toBe(true);
}
```

## CI/CD Integration

The package is designed for CI/CD environments:

- Automatic configuration validation
- Parallel test execution support
- Comprehensive cleanup
- Artifact generation
- Performance optimizations for CI

See the main project's `.github/workflows/test.yml` for example CI configuration.

## API Reference

### Core Classes

- `AuthTestHelper`: Clerk authentication testing
- `DatabaseTestHelper`: Supabase database testing  
- `RLSTestHelper`: Row Level Security policy testing

### Utility Functions

- `validateTestConfig()`: Validate test environment
- `generateTestUser()`: Create test user data
- `generateTestActivity()`: Create test activity data
- `waitFor()`: Wait for conditions
- `retry()`: Retry operations
- `withTimeout()`: Add operation timeouts

### Test Scenarios

- `newUserOnboardingScenario()`
- `activeUserScenario()`
- `multiUserPrivacyScenario()`
- `dataSyncScenario()`
- `performanceScenario()`
- `errorHandlingScenario()`
- `mobileAppScenario()`
- `achievementSystemScenario()`

## Contributing

When adding new testing utilities:

1. Add comprehensive TypeScript types
2. Include JSDoc documentation
3. Add corresponding test scenarios
4. Update this README with examples
5. Ensure CI/CD compatibility