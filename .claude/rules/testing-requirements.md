# Testing Requirements for GradientPeak

## Testing Philosophy

- **Test behavior, not implementation** - Focus on what the code does, not how it does it
- **Test critical paths first** - Prioritize user-facing functionality and business logic
- **Keep tests simple and readable** - Tests should document expected behavior
- **Mock external dependencies** - Tests should be fast and deterministic

## Coverage Requirements

### Minimum Coverage Targets
- **Critical paths**: 80% coverage minimum
  - Recording service logic
  - Auth flows
  - tRPC routers
  - Core package calculations
- **New features**: 100% coverage required
- **Bug fixes**: Add regression tests
- **Refactoring**: Maintain or improve existing coverage

### What Must Be Tested
1. **Business Logic** - All calculations, validations, transformations
2. **API Endpoints** - All tRPC procedures with success/error cases
3. **Critical User Flows** - Auth, recording, activity submission
4. **Edge Cases** - Null values, empty arrays, extreme values
5. **Error Handling** - All error states and recovery logic

## Test Organization

### Mobile App (`apps/mobile/`)
```
app/
├── (internal)/
│   └── __tests__/
│       ├── activity-detail.test.tsx
│       └── settings.test.tsx
components/
├── activity/
│   └── __tests__/
│       └── ActivityCard.test.tsx
lib/
├── hooks/
│   └── __tests__/
│       └── useActivityRecorder.test.ts
└── services/
    └── ActivityRecorder/
        └── __tests__/
            ├── index.test.ts
            ├── LiveMetricsManager.test.ts
            └── sensors.test.ts
```

### Web Dashboard (`apps/web/`)
```
app/
├── (dashboard)/
│   └── activities/
│       └── __tests__/
│           └── page.test.tsx
components/
├── ui/
│   └── __tests__/
│       └── button.test.tsx
lib/
└── __tests__/
    └── utils.test.ts
```

### Core Package (`packages/core/`)
```
calculations/
├── tss.ts
└── tss.test.ts

schemas/
├── activity.ts
└── activity.test.ts

utils/
├── time.ts
└── time.test.ts
```

### Integration Tests
```
tests/
├── integration/
│   ├── auth.test.ts
│   ├── activities.test.ts
│   └── trpc/
│       ├── activities.test.ts
│       └── profiles.test.ts
└── e2e/ (future)
    ├── recording-flow.test.ts
    └── activity-submission.test.ts
```

## Test Types and Patterns

### 1. Unit Tests - Pure Functions

**For**: Calculations, utilities, transformations

```typescript
// packages/core/calculations/tss.test.ts
import { calculateTSS } from './tss';

describe('calculateTSS', () => {
  it('should calculate TSS correctly for 1 hour at FTP', () => {
    const result = calculateTSS({
      normalizedPower: 250,
      duration: 3600,
      ftp: 250,
    });
    expect(result).toBe(100);
  });

  it('should return 0 for zero duration', () => {
    const result = calculateTSS({
      normalizedPower: 250,
      duration: 0,
      ftp: 250,
    });
    expect(result).toBe(0);
  });

  it('should handle missing FTP', () => {
    const result = calculateTSS({
      normalizedPower: 250,
      duration: 3600,
      ftp: undefined,
    });
    expect(result).toBeNull();
  });
});
```

### 2. Hook Tests - Custom Hooks

**For**: React hooks with business logic

```typescript
// apps/mobile/lib/hooks/__tests__/useActivityRecorder.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { useActivityRecorder } from '../useActivityRecorder';

describe('useActivityRecorder', () => {
  const mockProfile = {
    id: '1',
    ftp: 250,
    maxHeartRate: 190,
  };

  it('should initialize service with profile', () => {
    const { result } = renderHook(() => useActivityRecorder(mockProfile));
    expect(result.current).toBeDefined();
    expect(result.current.getState()).toBe('pending');
  });

  it('should transition to ready state when sensors connected', async () => {
    const { result } = renderHook(() => useActivityRecorder(mockProfile));

    result.current.connectSensor('heartRate', mockSensor);

    await waitFor(() => {
      expect(result.current.getState()).toBe('ready');
    });
  });

  it('should clean up on unmount', () => {
    const { result, unmount } = renderHook(() => useActivityRecorder(mockProfile));
    const cleanupSpy = jest.spyOn(result.current, 'cleanup');

    unmount();

    expect(cleanupSpy).toHaveBeenCalled();
  });
});
```

### 3. Component Tests - UI Rendering

**For**: React components, user interactions

```typescript
// apps/mobile/components/activity/__tests__/ActivityCard.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import { ActivityCard } from '../ActivityCard';

describe('ActivityCard', () => {
  const mockActivity = {
    id: '1',
    name: 'Morning Run',
    type: 'run',
    distance: 5000,
    duration: 1800,
  };

  it('should render activity name', () => {
    const { getByText } = render(<ActivityCard activity={mockActivity} />);
    expect(getByText('Morning Run')).toBeTruthy();
  });

  it('should format distance correctly', () => {
    const { getByText } = render(<ActivityCard activity={mockActivity} />);
    expect(getByText('5.00 km')).toBeTruthy();
  });

  it('should call onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <ActivityCard activity={mockActivity} onPress={onPress} />
    );

    fireEvent.press(getByTestId('activity-card'));

    expect(onPress).toHaveBeenCalledWith(mockActivity.id);
  });
});
```

### 4. Integration Tests - tRPC Routers

**For**: API endpoints with database operations

```typescript
// tests/integration/trpc/activities.test.ts
import { createInnerTRPCContext } from '@/server/trpc';
import { activityRouter } from '@/server/routers/activities';
import { createTestDatabase } from '../helpers/database';

describe('activityRouter', () => {
  let db: Database;
  let ctx: Context;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  beforeEach(async () => {
    await db.clear();
    ctx = createInnerTRPCContext({
      session: mockSession,
      db,
    });
  });

  afterAll(async () => {
    await db.close();
  });

  describe('create', () => {
    it('should create activity with valid input', async () => {
      const caller = activityRouter.createCaller(ctx);

      const activity = await caller.create({
        name: 'Test Activity',
        type: 'run',
        distance: 5000,
        duration: 1800,
      });

      expect(activity.id).toBeDefined();
      expect(activity.name).toBe('Test Activity');
    });

    it('should reject invalid input', async () => {
      const caller = activityRouter.createCaller(ctx);

      await expect(
        caller.create({
          name: '', // Empty name
          type: 'run',
          distance: -100, // Negative distance
        })
      ).rejects.toThrow();
    });

    it('should require authentication', async () => {
      const unauthCtx = createInnerTRPCContext({ session: null });
      const caller = activityRouter.createCaller(unauthCtx);

      await expect(
        caller.create({
          name: 'Test Activity',
          type: 'run',
        })
      ).rejects.toThrow('UNAUTHORIZED');
    });
  });

  describe('list', () => {
    it('should return user activities only', async () => {
      const caller = activityRouter.createCaller(ctx);

      // Create activities for different users
      await db.activities.create({ userId: 'user1', name: 'Activity 1' });
      await db.activities.create({ userId: 'user2', name: 'Activity 2' });

      const activities = await caller.list({ limit: 10 });

      expect(activities).toHaveLength(1);
      expect(activities[0].name).toBe('Activity 1');
    });

    it('should support pagination', async () => {
      const caller = activityRouter.createCaller(ctx);

      // Create 25 activities
      for (let i = 0; i < 25; i++) {
        await db.activities.create({ userId: 'user1', name: `Activity ${i}` });
      }

      const page1 = await caller.list({ limit: 10, offset: 0 });
      const page2 = await caller.list({ limit: 10, offset: 10 });

      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(10);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });
});
```

### 5. E2E Tests - Critical User Flows (Future)

**For**: Complete user journeys

```typescript
// tests/e2e/recording-flow.test.ts
import { test, expect } from '@playwright/test';

test.describe('Activity Recording Flow', () => {
  test('should record and submit activity', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Start Recording');

    // Wait for GPS ready
    await expect(page.locator('text=GPS Ready')).toBeVisible();

    // Start recording
    await page.click('button:has-text("Start")');
    await expect(page.locator('text=Recording')).toBeVisible();

    // Wait 30 seconds
    await page.waitForTimeout(30000);

    // Stop recording
    await page.click('button:has-text("Stop")');
    await page.click('button:has-text("Finish")');

    // Submit activity
    await page.fill('input[name="name"]', 'Test Run');
    await page.click('button:has-text("Submit")');

    // Verify submission
    await expect(page.locator('text=Activity saved')).toBeVisible();
  });
});
```

## Mock Patterns

### Mock Bluetooth Sensors
```typescript
const mockHeartRateSensor = {
  id: 'hr-sensor-1',
  name: 'HRM',
  type: 'heartRate',
  read: jest.fn().mockResolvedValue({ heartRate: 150 }),
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true),
};
```

### Mock GPS Location
```typescript
const mockLocation = {
  coords: {
    latitude: 37.7749,
    longitude: -122.4194,
    altitude: 10,
    accuracy: 5,
    speed: 3.5,
  },
  timestamp: Date.now(),
};

jest.mock('expo-location', () => ({
  watchPositionAsync: jest.fn((options, callback) => {
    callback(mockLocation);
    return { remove: jest.fn() };
  }),
}));
```

### Mock tRPC
```typescript
import { createTRPCMsw } from 'msw-trpc';
import { type AppRouter } from '@repo/trpc';

const trpcMsw = createTRPCMsw<AppRouter>();

const handlers = [
  trpcMsw.activities.list.query(() => {
    return [mockActivity1, mockActivity2];
  }),
  trpcMsw.activities.create.mutation(() => {
    return mockCreatedActivity;
  }),
];
```

### Mock Supabase
```typescript
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockActivity }),
    })),
  })),
}));
```

## Test Utilities

### Test Helpers
```typescript
// tests/helpers/database.ts
export async function createTestDatabase() {
  const db = await createDatabase(':memory:');
  await runMigrations(db);
  return db;
}

// tests/helpers/factories.ts
export function createMockActivity(overrides?: Partial<Activity>): Activity {
  return {
    id: '1',
    name: 'Test Activity',
    type: 'run',
    distance: 5000,
    duration: 1800,
    ...overrides,
  };
}

// tests/helpers/wrappers.tsx
export function createWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

## Testing Frameworks

### Mobile (React Native)
- **Test Runner**: Jest
- **Component Testing**: React Native Testing Library
- **Mocking**: jest.mock(), @testing-library/react-native
- **Coverage**: jest --coverage

### Web (Next.js)
- **Test Runner**: Jest or Vitest
- **Component Testing**: React Testing Library
- **E2E**: Playwright (future)
- **Coverage**: jest --coverage or vitest --coverage

### Core Package
- **Test Runner**: Jest or Vitest
- **Mocking**: Not needed for pure functions
- **Coverage**: 100% for all calculations

## Running Tests

### Commands
```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @repo/core test
pnpm --filter mobile test
pnpm --filter web test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# Integration tests
pnpm test:integration

# E2E tests (future)
pnpm test:e2e
```

## CI/CD Integration

### Pre-commit Hook
```bash
# .husky/pre-commit (if configured)
pnpm lint
pnpm check-types
pnpm test --bail --passWithNoTests
```

### GitHub Actions (if configured)
```yaml
- name: Run tests
  run: pnpm test --coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Required Tests for New Features

When adding a new feature, you MUST include:

1. **Unit tests** for business logic and calculations
2. **Component tests** for UI rendering and interactions
3. **Integration tests** for API endpoints (if applicable)
4. **Hook tests** for custom React hooks (if applicable)
5. **Accessibility tests** for user-facing components

### Example: Adding New Metric to Recording

```typescript
// 1. Unit test for calculation
describe('calculateCadence', () => {
  it('should calculate running cadence correctly', () => {
    const cadence = calculateCadence(stepEvents, duration);
    expect(cadence).toBe(180); // steps per minute
  });
});

// 2. Integration test for ActivityRecorder
describe('ActivityRecorder - Cadence', () => {
  it('should track cadence during recording', async () => {
    const service = new ActivityRecorder(mockProfile);
    service.start();

    service.addStepEvent(timestamp1);
    service.addStepEvent(timestamp2);

    const stats = service.getSessionStats();
    expect(stats.cadence).toBeDefined();
  });
});

// 3. Component test for UI
describe('CadenceDisplay', () => {
  it('should display cadence value', () => {
    const { getByText } = render(<CadenceDisplay cadence={180} />);
    expect(getByText('180 spm')).toBeTruthy();
  });
});
```

## Test Quality Checklist

Before merging, ensure:

- [ ] All tests pass (`pnpm test`)
- [ ] Coverage meets minimum thresholds
- [ ] Tests are deterministic (no flaky tests)
- [ ] Tests are readable and well-named
- [ ] Mocks are used appropriately
- [ ] Edge cases are covered
- [ ] Error states are tested
- [ ] Tests run quickly (<30s for unit tests)

## Common Testing Mistakes to Avoid

- ❌ Testing implementation details instead of behavior
- ❌ Not cleaning up after tests (leaked state, timers, listeners)
- ❌ Over-mocking (makes tests brittle)
- ❌ Not testing edge cases and error states
- ❌ Writing tests that depend on execution order
- ❌ Not using proper test IDs for component testing
- ❌ Forgetting to await async operations
- ❌ Not asserting anything (test always passes)
