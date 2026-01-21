# Core Package Rules for GradientPeak

## Critical Principle: Database Independence

The `@repo/core` package is **completely database-independent**. This is a **non-negotiable architectural constraint**.

### What This Means
- ❌ **NEVER** import Drizzle, Prisma, or any ORM
- ❌ **NEVER** import Supabase client or types
- ❌ **NEVER** import database-specific code
- ❌ **NEVER** import tRPC or API layer code
- ✅ **ONLY** pure TypeScript functions and Zod schemas

### Why This Matters
1. **Portability**: Core logic can run anywhere (mobile, web, server, CLI)
2. **Testability**: No database mocking required, pure function testing
3. **Performance**: Fast test execution with no I/O operations
4. **Consistency**: Same calculations across all platforms
5. **Clarity**: Business logic separated from infrastructure

## Package Responsibilities

### 1. Zod Schemas (`packages/core/schemas/`)
Define and validate all data structures for the application.

```typescript
// ✅ GOOD - Pure Zod schema
import { z } from 'zod';

export const activitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['run', 'bike', 'swim', 'other']),
  distance: z.number().nonnegative().optional(),
  duration: z.number().int().positive(),
  startTime: z.date(),
  endTime: z.date(),
});

export type Activity = z.infer<typeof activitySchema>;
```

```typescript
// ❌ BAD - Database import
import { activities } from '@repo/supabase/schema'; // NEVER DO THIS
```

### 2. Calculations (`packages/core/calculations/`)
Pure functions for performance metrics and training analytics.

```typescript
// ✅ GOOD - Pure calculation function
export function calculateTSS(params: {
  normalizedPower: number;
  duration: number; // seconds
  ftp: number;
}): number {
  const { normalizedPower, duration, ftp } = params;

  if (!ftp || ftp === 0) return 0;
  if (!duration || duration === 0) return 0;

  const intensityFactor = normalizedPower / ftp;
  const hours = duration / 3600;

  return (duration * normalizedPower * intensityFactor) / (ftp * 3600) * 100;
}
```

**Key Calculation Functions:**
- `calculateTSS()` - Training Stress Score
- `calculateNormalizedPower()` - 30-second rolling average power
- `calculateIntensityFactor()` - Intensity relative to FTP
- `calculateTrainingZones()` - Heart rate and power zones
- `calculateCTL()` - Chronic Training Load (fitness)
- `calculateATL()` - Acute Training Load (fatigue)
- `calculateTSB()` - Training Stress Balance (form)

### 3. Utilities (`packages/core/utils/`)
Pure utility functions for common operations.

```typescript
// ✅ GOOD - Pure utility functions
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function convertMetersToKilometers(meters: number): number {
  return meters / 1000;
}

export function convertMetersToMiles(meters: number): number {
  return meters * 0.000621371;
}
```

### 4. Validation (`packages/core/validation/`)
Validation logic and compliance scoring.

```typescript
// ✅ GOOD - Pure validation function
export function validateActivityStructure(activity: unknown): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const result = activitySchema.safeParse(activity);

  if (!result.success) {
    result.error.errors.forEach((err) => {
      errors.push(`${err.path.join('.')}: ${err.message}`);
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function calculateComplianceScore(
  activity: Activity,
  plan: ActivityPlan
): number {
  // Calculate how well activity matches the plan
  let score = 100;

  if (activity.duration < plan.targetDuration * 0.9) {
    score -= 20;
  }

  if (activity.distance < plan.targetDistance * 0.9) {
    score -= 20;
  }

  return Math.max(0, score);
}
```

### 5. Estimation (`packages/core/estimation/`)
Training metrics estimation and prediction.

```typescript
// ✅ GOOD - Pure estimation function
export function estimateVO2Max(params: {
  age: number;
  restingHeartRate: number;
  maxHeartRate: number;
  recentActivities: Activity[];
}): number {
  // Estimation algorithm using recent performance data
  // Returns estimated VO2 max in ml/kg/min
}

export function estimateFTP(recentActivities: Activity[]): number | null {
  // Analyze recent activities to estimate FTP
  // Returns estimated FTP in watts or null if insufficient data
}
```

## Package Structure

```
packages/core/
├── calculations/
│   ├── tss.ts
│   ├── tss.test.ts
│   ├── zones.ts
│   ├── zones.test.ts
│   ├── training-load.ts
│   └── training-load.test.ts
├── schemas/
│   ├── activity.ts
│   ├── activity.test.ts
│   ├── activity_plan_v2.ts
│   ├── profile.ts
│   └── form-schemas.ts
├── utils/
│   ├── time.ts
│   ├── time.test.ts
│   ├── distance.ts
│   ├── distance.test.ts
│   └── conversions.ts
├── validation/
│   ├── activity.ts
│   └── compliance.ts
├── estimation/
│   ├── vo2max.ts
│   └── ftp.ts
├── types/
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Dependencies Rules

### Allowed Dependencies
- ✅ `zod` - Schema validation
- ✅ `date-fns` or `dayjs` - Date manipulation (if needed)
- ✅ Pure utility libraries with no side effects

### Forbidden Dependencies
- ❌ `@supabase/*` - Database client
- ❌ `drizzle-orm`, `prisma`, `mongoose` - ORMs
- ❌ `@repo/trpc` - API layer
- ❌ `react`, `react-native` - UI frameworks
- ❌ `express`, `fastify` - Web frameworks
- ❌ Any library with I/O operations

## Function Signature Patterns

### Pure Functions Only
```typescript
// ✅ GOOD - Pure function (deterministic, no side effects)
export function calculatePace(distance: number, duration: number): number {
  return duration / distance; // seconds per meter
}

// ❌ BAD - Async function (indicates I/O)
export async function calculatePace(activityId: string): Promise<number> {
  const activity = await db.activities.findById(activityId); // DATABASE ACCESS
  return activity.duration / activity.distance;
}

// ❌ BAD - Side effects
let cache = {};
export function calculatePace(distance: number, duration: number): number {
  cache[distance] = duration; // SIDE EFFECT
  return duration / distance;
}
```

### Input/Output Patterns
```typescript
// ✅ GOOD - All inputs as parameters, return value
export function calculateZones(params: {
  ftp?: number;
  maxHeartRate?: number;
  zoneModel: 'coggan' | 'polarized';
}): TrainingZones {
  // Calculate zones based on inputs
  return zones;
}

// ❌ BAD - Reading from external state
export function calculateZones(): TrainingZones {
  const ftp = store.getState().profile.ftp; // EXTERNAL STATE
  // ...
}
```

## Type Definitions

### Prefer Inferred Types
```typescript
// ✅ GOOD - Infer type from schema
export const activitySchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type Activity = z.infer<typeof activitySchema>;
```

### Manual Types When Needed
```typescript
// ✅ GOOD - Manual type for non-schema types
export interface TrainingZones {
  powerZones?: PowerZone[];
  heartRateZones?: HeartRateZone[];
}

export interface PowerZone {
  zone: number;
  name: string;
  min: number;
  max: number;
  description: string;
}
```

## Testing Requirements

### 100% Coverage for Calculations
Every calculation function MUST have comprehensive tests:

```typescript
describe('calculateTSS', () => {
  it('should calculate TSS correctly for 1 hour at FTP', () => {
    const result = calculateTSS({
      normalizedPower: 250,
      duration: 3600,
      ftp: 250,
    });
    expect(result).toBe(100);
  });

  it('should handle zero FTP', () => {
    const result = calculateTSS({
      normalizedPower: 250,
      duration: 3600,
      ftp: 0,
    });
    expect(result).toBe(0);
  });

  it('should handle zero duration', () => {
    const result = calculateTSS({
      normalizedPower: 250,
      duration: 0,
      ftp: 250,
    });
    expect(result).toBe(0);
  });

  it('should calculate higher TSS for harder efforts', () => {
    const easy = calculateTSS({ normalizedPower: 200, duration: 3600, ftp: 250 });
    const hard = calculateTSS({ normalizedPower: 300, duration: 3600, ftp: 250 });
    expect(hard).toBeGreaterThan(easy);
  });
});
```

### Test Edge Cases
- Zero values
- Negative values (if applicable)
- Null/undefined values
- Very large values
- Very small values
- Boundary values

## Documentation Requirements

### Function Documentation
```typescript
/**
 * Calculates Training Stress Score (TSS) for an activity.
 *
 * TSS quantifies the training load of a workout based on:
 * - Intensity relative to FTP (Intensity Factor)
 * - Duration of the workout
 *
 * Formula: TSS = (duration * normalizedPower * IF) / (FTP * 3600) * 100
 *
 * @param params - Calculation parameters
 * @param params.normalizedPower - 30-second rolling average power (watts)
 * @param params.duration - Workout duration (seconds)
 * @param params.ftp - Functional Threshold Power (watts)
 * @returns Training Stress Score (0-300+ typical range)
 *
 * @example
 * ```typescript
 * const tss = calculateTSS({
 *   normalizedPower: 250,
 *   duration: 3600,
 *   ftp: 250,
 * });
 * console.log(tss); // 100
 * ```
 */
export function calculateTSS(params: {
  normalizedPower: number;
  duration: number;
  ftp: number;
}): number {
  // Implementation
}
```

## Export Patterns

### Named Exports Only
```typescript
// ✅ GOOD - Named exports
export { calculateTSS } from './calculations/tss';
export { activitySchema } from './schemas/activity';
export type { Activity } from './schemas/activity';

// ❌ BAD - Default exports
export default calculateTSS;
```

### Barrel Exports
```typescript
// packages/core/index.ts
export * from './calculations';
export * from './schemas';
export * from './utils';
export * from './validation';
export * from './estimation';
```

## Adding New Functionality

### Checklist
1. ✅ Function is pure (no side effects, deterministic)
2. ✅ No database/ORM imports
3. ✅ No async operations (unless JSON parsing, which is rare)
4. ✅ All inputs as parameters
5. ✅ Return value, not mutations
6. ✅ Comprehensive tests (edge cases)
7. ✅ JSDoc documentation
8. ✅ Named exports
9. ✅ TypeScript strict mode compliant

### Review Checklist
Before merging, verify:
- [ ] No `import` from database packages
- [ ] No `async` functions (exceptions documented)
- [ ] All functions are pure
- [ ] 100% test coverage for calculations
- [ ] All tests pass
- [ ] Types properly exported
- [ ] Documentation complete

## Common Mistakes to Avoid

### 1. Database Imports
```typescript
// ❌ WRONG
import { db } from '@repo/supabase';

export async function calculateUserTSS(userId: string) {
  const activities = await db.activities.findMany({ userId });
  return activities.reduce((sum, act) => sum + act.tss, 0);
}

// ✅ CORRECT - Move to tRPC layer
// In packages/trpc/src/routers/activities.ts
export const activityRouter = router({
  getUserTSS: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input, ctx }) => {
      const activities = await ctx.db.activities.findMany({ userId: input.userId });
      return activities.reduce((sum, act) => sum + act.tss, 0);
    }),
});
```

### 2. Side Effects
```typescript
// ❌ WRONG - Mutation
export function addActivityToList(activity: Activity, list: Activity[]) {
  list.push(activity); // MUTATES INPUT
  return list;
}

// ✅ CORRECT - Immutable
export function addActivityToList(activity: Activity, list: Activity[]): Activity[] {
  return [...list, activity];
}
```

### 3. External State
```typescript
// ❌ WRONG
let userFTP = 250;

export function calculateZones() {
  return calculatePowerZones(userFTP); // EXTERNAL STATE
}

// ✅ CORRECT
export function calculateZones(ftp: number) {
  return calculatePowerZones(ftp); // PARAMETER
}
```

## Critical Don'ts

- ❌ Don't import from database packages
- ❌ Don't use async/await (except rare cases)
- ❌ Don't mutate inputs
- ❌ Don't read from external state
- ❌ Don't perform I/O operations
- ❌ Don't use global variables
- ❌ Don't create side effects
- ❌ Don't skip tests
