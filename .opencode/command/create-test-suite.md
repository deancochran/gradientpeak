---
description: Generates comprehensive test suites for files, functions, components, or features, ensuring proper test coverage and quality.
agent: code-improvement-reviewer
subtask: true
---

# Create Test Suite Command

## Purpose

Generates comprehensive test suites for files, functions, components, or features, ensuring proper test coverage and quality.

## When to Invoke

- Creating tests for new features
- Backfilling tests for existing code
- User explicitly invokes `/create-test-suite <path>`
- After implementing new functionality
- When test coverage is insufficient

## Usage

```bash
/create-test-suite <file-path>
/create-test-suite <feature-name>
/create-test-suite <directory>
```

**Examples:**

```bash
/create-test-suite packages/core/calculations/tss.ts
/create-test-suite apps/mobile/components/activity/ActivityCard.tsx
/create-test-suite apps/mobile/lib/hooks/useActivityRecorder.ts
/create-test-suite recording-feature
```

## What This Command Does

1. **Analyzes the code to test:**
   - Identifies functions, components, or features
   - Determines test type needed (unit, integration, component)
   - Analyzes dependencies and edge cases
   - Identifies mocking requirements

2. **Generates test files:**
   - Creates test file in proper location (`__tests__/` directory or `.test.ts` suffix)
   - Sets up test framework imports
   - Creates describe blocks
   - Generates test cases

3. **Creates test cases for:**
   - **Happy path** - Normal, expected usage
   - **Edge cases** - Boundary values, empty inputs, etc.
   - **Error scenarios** - Invalid inputs, network failures, etc.
   - **Loading states** - Async operations, pending states
   - **Cleanup** - Resource cleanup, unmounting

4. **Sets up mocks:**
   - Mock external dependencies
   - Mock API calls
   - Mock sensors/GPS
   - Mock database queries

## Test Types Generated

### 1. Unit Tests

For pure functions, calculations, utilities

**What's tested:**

- Function logic
- Edge cases
- Error handling
- Return values

**Example:**

```typescript
// packages/core/calculations/tss.test.ts
describe("calculateTSS", () => {
  it("should calculate TSS correctly for 1 hour at FTP", () => {
    expect(
      calculateTSS({ normalizedPower: 250, duration: 3600, ftp: 250 }),
    ).toBe(100);
  });

  it("should return 0 for zero duration", () => {
    expect(calculateTSS({ normalizedPower: 250, duration: 0, ftp: 250 })).toBe(
      0,
    );
  });

  it("should handle missing FTP", () => {
    expect(
      calculateTSS({ normalizedPower: 250, duration: 3600, ftp: undefined }),
    ).toBeNull();
  });
});
```

### 2. Hook Tests

For custom React hooks

**What's tested:**

- Hook initialization
- State updates
- Side effects
- Cleanup

**Example:**

```typescript
// apps/mobile/lib/hooks/__tests__/useActivityRecorder.test.ts
describe("useActivityRecorder", () => {
  it("should initialize service with profile", () => {
    const { result } = renderHook(() => useActivityRecorder(mockProfile));
    expect(result.current).toBeDefined();
  });

  it("should clean up on unmount", () => {
    const { unmount } = renderHook(() => useActivityRecorder(mockProfile));
    const cleanupSpy = jest.spyOn(service, "cleanup");
    unmount();
    expect(cleanupSpy).toHaveBeenCalled();
  });
});
```

### 3. Component Tests

For React/React Native components

**What's tested:**

- Rendering
- Props handling
- User interactions
- Conditional rendering
- Accessibility

**Example:**

```typescript
// apps/mobile/components/activity/__tests__/ActivityCard.test.tsx
describe('ActivityCard', () => {
  it('should render activity name', () => {
    const { getByText } = render(<ActivityCard activity={mockActivity} />);
    expect(getByText('Morning Run')).toBeTruthy();
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

### 4. Integration Tests

For API endpoints, tRPC routers, database operations

**What's tested:**

- API endpoint functionality
- Database queries
- Authentication
- Authorization
- Error responses

**Example:**

```typescript
// tests/integration/trpc/activities.test.ts
describe("activityRouter.create", () => {
  it("should create activity with valid input", async () => {
    const caller = activityRouter.createCaller(ctx);
    const activity = await caller.create({ name: "Test", type: "run" });
    expect(activity.id).toBeDefined();
  });

  it("should require authentication", async () => {
    const unauthCtx = createInnerTRPCContext({ session: null });
    const caller = activityRouter.createCaller(unauthCtx);
    await expect(caller.create({ name: "Test", type: "run" })).rejects.toThrow(
      "UNAUTHORIZED",
    );
  });
});
```

## Test Coverage Requirements

### Minimum Coverage Targets

- **Critical paths**: 80% minimum
- **New features**: 100% required
- **Pure functions**: 100% required
- **Components**: 70% minimum

### What Must Be Covered

1. Happy path (normal usage)
2. Edge cases (boundary values)
3. Error scenarios (invalid inputs)
4. Loading states (async operations)
5. Cleanup (unmounting, disposal)

## Mock Patterns Included

### Mock Sensors

```typescript
const mockHeartRateSensor = {
  id: "hr-1",
  type: "heartRate",
  read: jest.fn().mockResolvedValue({ heartRate: 150 }),
  connect: jest.fn().mockResolvedValue(true),
};
```

### Mock GPS

```typescript
jest.mock("expo-location", () => ({
  watchPositionAsync: jest.fn((options, callback) => {
    callback(mockLocation);
    return { remove: jest.fn() };
  }),
}));
```

### Mock tRPC

```typescript
const handlers = [
  trpcMsw.activities.list.query(() => [mockActivity]),
  trpcMsw.activities.create.mutation(() => mockActivity),
];
```

### Mock Database

```typescript
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: mockData }),
    })),
  })),
}));
```

## Test File Organization

### File Naming

```
ComponentName.test.tsx        # Component tests
functionName.test.ts          # Function tests
useSomething.test.ts          # Hook tests
routerName.test.ts            # Integration tests
```

### Directory Structure

```
apps/mobile/
├── components/
│   └── activity/
│       ├── ActivityCard.tsx
│       └── __tests__/
│           └── ActivityCard.test.tsx
├── lib/
│   ├── hooks/
│   │   ├── useActivityRecorder.ts
│   │   └── __tests__/
│   │       └── useActivityRecorder.test.ts
│   └── utils/
│       ├── time.ts
│       └── time.test.ts
```

## Test Frameworks Used

- **Mobile**: Jest + React Native Testing Library
- **Web**: Jest/Vitest + React Testing Library
- **Core**: Jest/Vitest

## Process

### Step 1: Analyze Code

1. Read the file to test
2. Identify functions/components
3. Determine dependencies
4. Identify edge cases

### Step 2: Create Test File

1. Create test file in proper location
2. Add necessary imports
3. Set up test framework

### Step 3: Generate Test Cases

1. Write happy path tests
2. Write edge case tests
3. Write error scenario tests
4. Add cleanup tests if needed

### Step 4: Set Up Mocks

1. Mock external dependencies
2. Create test fixtures
3. Add helper functions

### Step 5: Verify Tests

1. Run tests to ensure they pass
2. Check coverage report
3. Add missing test cases
4. Refactor if needed

## Example: Complete Test Suite

### Input: `calculateTSS` function

**Generated test file:**

```typescript
// packages/core/calculations/tss.test.ts
import { calculateTSS } from "./tss";

describe("calculateTSS", () => {
  describe("happy path", () => {
    it("should calculate TSS correctly for 1 hour at FTP", () => {
      const result = calculateTSS({
        normalizedPower: 250,
        duration: 3600,
        ftp: 250,
      });
      expect(result).toBe(100);
    });

    it("should calculate TSS for sub-threshold ride", () => {
      const result = calculateTSS({
        normalizedPower: 200,
        duration: 3600,
        ftp: 250,
      });
      expect(result).toBeLessThan(100);
    });
  });

  describe("edge cases", () => {
    it("should return 0 for zero duration", () => {
      const result = calculateTSS({
        normalizedPower: 250,
        duration: 0,
        ftp: 250,
      });
      expect(result).toBe(0);
    });

    it("should return 0 for zero FTP", () => {
      const result = calculateTSS({
        normalizedPower: 250,
        duration: 3600,
        ftp: 0,
      });
      expect(result).toBe(0);
    });

    it("should handle missing FTP", () => {
      const result = calculateTSS({
        normalizedPower: 250,
        duration: 3600,
        ftp: undefined,
      });
      expect(result).toBeNull();
    });

    it("should handle very large values", () => {
      const result = calculateTSS({
        normalizedPower: 500,
        duration: 36000,
        ftp: 250,
      });
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(10000);
    });
  });

  describe("validation", () => {
    it("should calculate higher TSS for harder efforts", () => {
      const easy = calculateTSS({
        normalizedPower: 200,
        duration: 3600,
        ftp: 250,
      });
      const hard = calculateTSS({
        normalizedPower: 300,
        duration: 3600,
        ftp: 250,
      });
      expect(hard).toBeGreaterThan(easy);
    });

    it("should calculate higher TSS for longer durations", () => {
      const short = calculateTSS({
        normalizedPower: 250,
        duration: 1800,
        ftp: 250,
      });
      const long = calculateTSS({
        normalizedPower: 250,
        duration: 3600,
        ftp: 250,
      });
      expect(long).toBeGreaterThan(short);
    });
  });
});
```

## Test Quality Checklist

- [ ] Tests are deterministic (no random values)
- [ ] Tests are independent (can run in any order)
- [ ] Tests have clear, descriptive names
- [ ] Tests follow Arrange-Act-Assert pattern
- [ ] Tests clean up after themselves
- [ ] Mocks are properly set up
- [ ] Edge cases are covered
- [ ] Error scenarios are tested

## Running Generated Tests

```bash
# Run tests for specific file
pnpm test path/to/test/file.test.ts

# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

## Critical Don'ts

- ❌ Don't test implementation details
- ❌ Don't create flaky tests (non-deterministic)
- ❌ Don't skip cleanup
- ❌ Don't write interdependent tests
- ❌ Don't over-mock (makes tests brittle)
- ❌ Don't skip error scenarios
- ❌ Don't forget to test edge cases

## Success Criteria

Test suite generation is successful when:

1. ✅ All critical paths are tested
2. ✅ Edge cases are covered
3. ✅ Error scenarios are handled
4. ✅ Tests are readable and maintainable
5. ✅ Tests pass consistently
6. ✅ Coverage targets are met
7. ✅ Mocks are properly set up

## Related Commands

- `/update-documentation` - Update test documentation
- `/evaluate-repository` - Check test coverage

## Notes

- Always run tests after generation to ensure they pass
- Update tests when code changes
- Keep tests close to code (co-located)
- Tests are documentation - make them readable
