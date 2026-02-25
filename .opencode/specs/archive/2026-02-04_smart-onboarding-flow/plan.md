# Smart Onboarding Flow: Implementation Plan

## Quick Reference

**Files in this spec:**

- **[design.md](./design.md)** - Complete technical design, algorithms, data flow, experience paths
- **[plan.md](./plan.md)** (this file) - Phase-by-phase implementation guide with code examples
- **[tasks.md](./tasks.md)** - Granular task checklist for implementation

---

## Overview

This plan outlines the step-by-step implementation of the smart onboarding flow that derives `activity_efforts` and `profile_metrics` from minimal user input.

**Key Points:**

- **3 sports supported:** Cycling (FTP), Running (threshold pace), Swimming (CSS)
- **4 experience paths:** Beginner (auto-apply), Intermediate (validate), Advanced (manual), Skip
- **Core-first approach:** All calculations in `@repo/core` (database-independent)
- **4-week timeline:** Week 1 (core), Week 2 (API), Week 3 (UI), Week 4 (testing/launch)

---

## Phase 1: Core Calculation Functions (`@repo/core`)

### 1.1 Power Curve Derivation

**File:** `packages/core/calculations/power-curve.ts`

**Functions to implement:**

```typescript
export interface DerivedEffort {
  duration_seconds: number;
  effort_type: "power" | "speed";
  value: number;
  unit: string;
  activity_category: "bike" | "run" | "swim";
}

/**
 * Derives a complete power curve from FTP using Critical Power model.
 *
 * @param ftp - Functional Threshold Power in watts
 * @param wPrime - Anaerobic work capacity in joules (default: 20000)
 * @returns Array of power efforts for standard durations
 */
export function derivePowerCurveFromFTP(
  ftp: number,
  wPrime: number = 20000,
): DerivedEffort[];

/**
 * Estimates W' (anaerobic capacity) based on athlete profile.
 *
 * @param weightKg - Athlete weight in kg
 * @param gender - Athlete gender
 * @param trainingLevel - 'recreational' | 'trained' | 'elite'
 * @returns Estimated W' in joules
 */
export function estimateWPrime(
  weightKg: number,
  gender: "male" | "female" | "other",
  trainingLevel: "recreational" | "trained" | "elite" = "recreational",
): number;
```

**Standard Durations:**

```typescript
export const STANDARD_POWER_DURATIONS = [
  5, // 5 seconds (neuromuscular)
  10, // 10 seconds (neuromuscular)
  30, // 30 seconds (anaerobic)
  60, // 1 minute (anaerobic)
  180, // 3 minutes (VO2max)
  300, // 5 minutes (VO2max)
  600, // 10 minutes (threshold)
  1200, // 20 minutes (threshold)
  1800, // 30 minutes (threshold)
  3600, // 60 minutes (FTP)
];
```

**Critical Power Formula:**

```
Power(t) = CP + (W' / t)

Where:
- CP = Critical Power (≈ FTP)
- W' = Anaerobic work capacity (joules)
- t = Duration (seconds)
```

---

### 1.2 Speed Curve Derivation

**File:** `packages/core/calculations/speed-curve.ts`

**Functions to implement:**

```typescript
/**
 * Derives a complete speed curve from threshold pace.
 *
 * @param thresholdPaceSecondsPerKm - Threshold pace in seconds per kilometer
 * @returns Array of speed efforts for standard durations
 */
export function deriveSpeedCurveFromThresholdPace(
  thresholdPaceSecondsPerKm: number,
): DerivedEffort[];

/**
 * Converts pace (min/km) to speed (m/s).
 */
export function paceToSpeed(secondsPerKm: number): number;

/**
 * Converts speed (m/s) to pace (min/km).
 */
export function speedToPace(metersPerSecond: number): number;
```

**Standard Durations:**

```typescript
export const STANDARD_SPEED_DURATIONS = [
  5, // 5 seconds (sprint)
  10, // 10 seconds (sprint)
  30, // 30 seconds (sprint)
  60, // 1 minute (sprint)
  180, // 3 minutes (VO2max)
  300, // 5 minutes (VO2max)
  600, // 10 minutes (tempo)
  1200, // 20 minutes (threshold)
  1800, // 30 minutes (threshold)
  3600, // 60 minutes (tempo)
];
```

**Speed Adjustment Logic:**

```typescript
// Multipliers based on duration
const SPEED_MULTIPLIERS = {
  sprint: 1.15, // < 60s: 15% faster than threshold
  vo2max: 1.08, // 60-300s: 8% faster
  threshold: 1.0, // 300-1200s: baseline
  tempo: 0.92, // > 1200s: 8% slower
};
```

---

### 1.3 Swim Pace Curve Derivation

**File:** `packages/core/calculations/swim-pace-curve.ts`

**Functions to implement:**

```typescript
/**
 * Derives a complete swim pace curve from Critical Swim Speed (CSS).
 *
 * @param cssSecondsPerHundredMeters - CSS in seconds per 100 meters
 * @returns Array of speed efforts for standard swim durations
 */
export function deriveSwimPaceCurveFromCSS(
  cssSecondsPerHundredMeters: number,
): DerivedEffort[];

/**
 * Converts pace per 100m to speed (m/s).
 */
export function pacePerHundredMetersToSpeed(
  secondsPerHundredMeters: number,
): number;

/**
 * Converts speed (m/s) to pace per 100m.
 */
export function speedToPacePerHundredMeters(metersPerSecond: number): number;
```

**Standard Durations:**

```typescript
export const STANDARD_SWIM_DURATIONS = [
  10, // 10 seconds (sprint 25m)
  20, // 20 seconds (sprint)
  30, // 30 seconds (50m sprint)
  60, // 1 minute (100m)
  120, // 2 minutes (200m)
  180, // 3 minutes (200m+)
  300, // 5 minutes (400m CSS)
  600, // 10 minutes (800m CSS)
  900, // 15 minutes (distance)
  1800, // 30 minutes (1500-2000m)
];
```

**Pace Adjustment Logic:**

```typescript
// Multipliers based on duration
const SWIM_PACE_MULTIPLIERS = {
  sprint: 1.1, // < 60s: 10% faster than CSS (25m, 50m)
  middle: 1.06, // 60-180s: 6% faster (100m, 200m)
  css: 1.0, // 180-600s: CSS baseline (400m, 800m)
  distance: 0.93, // > 600s: 7% slower (1500m+)
};
```

---

### 1.4 Heart Rate Calculations

**File:** `packages/core/calculations/heart-rate.ts`

**Functions to implement:**

```typescript
/**
 * Calculates VO2max from max and resting heart rate.
 * Uses Uth-Sørensen-Overgaard-Pedersen formula.
 *
 * @param maxHR - Maximum heart rate in bpm
 * @param restingHR - Resting heart rate in bpm
 * @returns Estimated VO2max in ml/kg/min
 */
export function calculateVO2MaxFromHR(maxHR: number, restingHR: number): number;

/**
 * Estimates lactate threshold heart rate from max HR.
 *
 * @param maxHR - Maximum heart rate in bpm
 * @returns Estimated LTHR (85% of max HR)
 */
export function estimateLTHR(maxHR: number): number;

/**
 * Estimates max heart rate from age.
 *
 * @param age - Age in years
 * @returns Estimated max HR using 220 - age formula
 */
export function estimateMaxHRFromAge(age: number): number;

/**
 * Calculates heart rate reserve (HRR).
 *
 * @param maxHR - Maximum heart rate
 * @param restingHR - Resting heart rate
 * @returns Heart rate reserve
 */
export function calculateHRReserve(maxHR: number, restingHR: number): number;
```

---

### 1.4 Performance Estimations

**File:** `packages/core/calculations/performance-estimates.ts`

**Functions to implement:**

```typescript
/**
 * Estimates FTP from weight and gender for recreational athletes.
 *
 * @param weightKg - Athlete weight in kg
 * @param gender - Athlete gender
 * @returns Estimated FTP in watts
 */
export function estimateFTPFromWeight(
  weightKg: number,
  gender: "male" | "female" | "other",
): number;

/**
 * Estimates threshold pace from gender for recreational runners.
 *
 * @param gender - Athlete gender
 * @returns Estimated threshold pace in seconds per km
 */
export function estimateThresholdPaceFromGender(
  gender: "male" | "female" | "other",
): number;

/**
 * Validates if a performance metric is realistic.
 *
 * @param metric - Metric type ('ftp', 'threshold_pace', 'vo2max', etc.)
 * @param value - Metric value
 * @param context - Additional context (weight, age, gender)
 * @returns Validation result with warnings
 */
export function validatePerformanceMetric(
  metric: string,
  value: number,
  context: {
    weightKg?: number;
    age?: number;
    gender?: "male" | "female" | "other";
  },
): {
  isValid: boolean;
  warnings: string[];
  confidence: "high" | "medium" | "low";
};
```

---

### 1.5 Zod Schemas

**File:** `packages/core/schemas/onboarding.ts`

**Schemas to create:**

```typescript
import { z } from "zod";

export const onboardingStep1Schema = z.object({
  dob: z.string().datetime(),
  weight_kg: z.number().positive().max(500),
  weight_unit: z.enum(["kg", "lbs"]),
  gender: z.enum(["male", "female", "other"]),
  primary_sport: z.enum([
    "cycling",
    "running",
    "swimming",
    "triathlon",
    "other",
  ]),
});

export const onboardingStep2Schema = z.object({
  max_hr: z.number().int().min(100).max(250).optional(),
  resting_hr: z.number().int().min(30).max(120).optional(),
  lthr: z.number().int().min(80).max(220).optional(),
});

export const onboardingStep3Schema = z.object({
  ftp: z.number().positive().max(1000).optional(),
  threshold_pace_seconds_per_km: z.number().positive().max(600).optional(),
  vo2max: z.number().positive().max(100).optional(),
});

export const onboardingStep4Schema = z.object({
  training_frequency: z.enum(["1-2", "3-4", "5-6", "7+"]).optional(),
  equipment: z.array(z.string()).optional(),
  goals: z.array(z.string()).optional(),
});

export const completeOnboardingSchema = onboardingStep1Schema
  .merge(onboardingStep2Schema)
  .merge(onboardingStep3Schema)
  .merge(onboardingStep4Schema);

export type OnboardingStep1 = z.infer<typeof onboardingStep1Schema>;
export type OnboardingStep2 = z.infer<typeof onboardingStep2Schema>;
export type OnboardingStep3 = z.infer<typeof onboardingStep3Schema>;
export type OnboardingStep4 = z.infer<typeof onboardingStep4Schema>;
export type CompleteOnboarding = z.infer<typeof completeOnboardingSchema>;
```

---

## Phase 2: tRPC API Layer (`@repo/trpc`)

### 2.1 Helper Functions for Code Reuse (RECOMMENDED) ⚡

**File:** `packages/trpc/src/utils/onboarding-helpers.ts`

Create reusable helper functions to reduce duplication:

```typescript
/**
 * Batch insert profile metrics with proper formatting
 */
export async function batchInsertProfileMetrics(
  supabase: SupabaseClient,
  profileId: string,
  metrics: Array<{
    metric_type: ProfileMetricType;
    value: number;
    unit: string;
    source?: string;
  }>,
) {
  return supabase.from("profile_metrics").insert(
    metrics.map((m) => ({
      profile_id: profileId,
      metric_type: m.metric_type,
      value: m.value,
      unit: m.unit,
      recorded_at: new Date().toISOString(),
      notes: m.source ? `Auto-generated from ${m.source}` : null,
    })),
  );
}

/**
 * Batch insert activity efforts from derived efforts
 */
export async function batchInsertActivityEfforts(
  supabase: SupabaseClient,
  profileId: string,
  efforts: DerivedEffort[],
  source: string = "onboarding",
) {
  return supabase.from("activity_efforts").insert(
    efforts.map((e) => ({
      profile_id: profileId,
      activity_id: null,
      activity_category: e.activity_category,
      duration_seconds: e.duration_seconds,
      effort_type: e.effort_type,
      value: e.value,
      unit: e.unit,
      recorded_at: new Date().toISOString(),
      source,
    })),
  );
}

/**
 * Derive all efforts for a sport based on baseline profile
 */
export function deriveEffortsForSport(
  sport: "cycling" | "running" | "swimming",
  metric: number,
): DerivedEffort[] {
  switch (sport) {
    case "cycling":
      return derivePowerCurveFromFTP(metric);
    case "running":
      return deriveSpeedCurveFromThresholdPace(metric);
    case "swimming":
      return deriveSwimPaceCurveFromCSS(metric);
  }
}
```

**Benefits:**

- ✅ Single source of truth for batch operations
- ✅ Consistent error handling
- ✅ Easy to add logging/monitoring
- ✅ Reduces code in main procedure by ~40%

---

### 2.2 Onboarding Router

**File:** `packages/trpc/src/routers/onboarding.ts`

**Procedures to implement:**

#### `completeOnboarding`

```typescript
completeOnboarding: protectedProcedure
  .input(completeOnboardingSchema)
  .mutation(async ({ ctx, input }) => {
    // 1. Update profiles table
    // 2. Create profile_metrics records
    // 3. Derive and create activity_efforts from FTP
    // 4. Derive and create activity_efforts from threshold pace
    // 5. Return summary of created records
  });
```

**Implementation Steps (with helper abstraction):**

```typescript
// Simplified with helpers
completeOnboarding: protectedProcedure
  .input(completeOnboardingSchema)
  .mutation(async ({ ctx, input }) => {
    const { supabase, session } = ctx;
    const userId = session.user.id;

    // 1. Calculate baseline if needed
    const baseline =
      input.experience_level !== "skip"
        ? getBaselineProfile(
            input.experience_level,
            input.weight_kg,
            input.gender,
            calculateAge(input.dob),
            input.primary_sport,
          )
        : null;

    // 2. Update profile
    await supabase
      .from("profiles")
      .update({
        dob: input.dob,
        gender: input.gender,
        primary_sport: input.primary_sport,
        experience_level: input.experience_level,
      })
      .eq("id", userId);

    // 3. Prepare metrics (merge input with baseline)
    const metrics = prepareProfileMetrics(input, baseline);
    await batchInsertProfileMetrics(supabase, userId, metrics);

    // 4. Derive and insert all efforts
    const allEfforts = [];

    if (input.ftp || baseline?.ftp) {
      allEfforts.push(
        ...deriveEffortsForSport("cycling", input.ftp || baseline.ftp),
      );
    }
    if (
      input.threshold_pace_seconds_per_km ||
      baseline?.threshold_pace_seconds_per_km
    ) {
      allEfforts.push(
        ...deriveEffortsForSport(
          "running",
          input.threshold_pace_seconds_per_km ||
            baseline.threshold_pace_seconds_per_km,
        ),
      );
    }
    if (
      input.css_seconds_per_hundred_meters ||
      baseline?.css_seconds_per_hundred_meters
    ) {
      allEfforts.push(
        ...deriveEffortsForSport(
          "swimming",
          input.css_seconds_per_hundred_meters ||
            baseline.css_seconds_per_hundred_meters,
        ),
      );
    }

    if (allEfforts.length > 0) {
      await batchInsertActivityEfforts(
        supabase,
        userId,
        allEfforts,
        input.experience_level,
      );
    }

    // 5. Return summary
    return {
      success: true,
      created: {
        profile_metrics: metrics.length,
        activity_efforts: allEfforts.length,
      },
      baseline_used: !!baseline,
      confidence: baseline?.confidence || "high",
    };
  });
```

**Code reduction:** ~60 lines → ~40 lines (33% reduction)

**Helper function:** `prepareProfileMetrics()`

```typescript
function prepareProfileMetrics(input, baseline) {
  const metrics = [];

  // Weight (always)
  metrics.push({
    metric_type: "weight_kg",
    value: input.weight_kg,
    unit: "kg",
  });

  // HR metrics (with baseline fallback)
  const maxHR = input.max_hr || baseline?.max_hr;
  const restingHR = input.resting_hr || baseline?.resting_hr;

  if (maxHR) metrics.push({ metric_type: "max_hr", value: maxHR, unit: "bpm" });
  if (restingHR)
    metrics.push({ metric_type: "resting_hr", value: restingHR, unit: "bpm" });

  // Calculated metrics
  if (maxHR && restingHR) {
    const vo2max = input.vo2max || calculateVO2MaxFromHR(maxHR, restingHR);
    metrics.push({
      metric_type: "vo2_max",
      value: vo2max,
      unit: "ml/kg/min",
      source: "calculated",
    });
  }

  if (maxHR) {
    const lthr = input.lthr || estimateLTHR(maxHR);
    metrics.push({
      metric_type: "lthr",
      value: lthr,
      unit: "bpm",
      source: "estimated",
    });
  }

  return metrics;
}
```

#### `estimateMetrics`

```typescript
estimateMetrics: protectedProcedure
  .input(
    z.object({
      weight_kg: z.number().positive(),
      gender: z.enum(["male", "female", "other"]),
      age: z.number().int().positive(),
      max_hr: z.number().int().optional(),
      resting_hr: z.number().int().optional(),
    }),
  )
  .query(async ({ input }) => {
    // Return estimated FTP, threshold pace, max HR, VO2max
  });
```

**Purpose:** Provide real-time estimates as user fills out form.

---

### 2.2 Update Existing Routers

#### `profile-metrics.ts` - ABSTRACTION OPPORTUNITY ⚡

**RECOMMENDATION:** `getLatest` already exists in profile-metrics router. **No changes needed.**

Check existing implementation in `packages/trpc/src/routers/profile-metrics.ts`:

```typescript
// Likely already has:
getAtDate: protectedProcedure; // Get metric at specific date
list: protectedProcedure; // List all metrics with filters
create: protectedProcedure; // Create new metric
```

**For onboarding:** Use existing `create` procedure in batch:

```typescript
// In onboarding.completeOnboarding()
const metricsToCreate = [
  { metric_type: 'weight_kg', value: input.weight_kg, ... },
  { metric_type: 'max_hr', value: calculatedMaxHR, ... },
  // etc.
];

await supabase.from('profile_metrics').insert(metricsToCreate);
// OR
await Promise.all(
  metricsToCreate.map(m => trpc.profileMetrics.create.mutate(m))
);
```

**Why abstract?**

- profile-metrics router already has all needed operations
- No need to add `getLatest` if `list` with filters exists
- Reuse existing validated schemas and RLS policies

#### `activity-efforts.ts` - ABSTRACTION OPPORTUNITY ⚡

**RECOMMENDATION:** Since `activity_efforts` router is purely CRUD with standard operations, consider **reusing or extending existing CRUD patterns** instead of creating a new router.

**Option 1: Extend existing patterns (RECOMMENDED)**
If you already have generic CRUD helpers, use them:

```typescript
// No new router needed - use direct Supabase queries in onboarding
// Only create router if you need complex business logic
```

**Option 2: Minimal router (if needed for business logic)**
Only implement what's unique to activity efforts:

```typescript
export const activityEffortsRouter = createTRPCRouter({
  // Generic CRUD - can use helper functions
  list: createQueryProcedure("activity_efforts", ["profile_id"]),
  create: createMutationProcedure("activity_efforts"),

  // Custom business logic only
  getBestForDuration: protectedProcedure
    .input(
      z.object({
        activity_category: publicActivityCategorySchema,
        effort_type: effortTypeSchema,
        duration_seconds: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Max value aggregation - unique logic
    }),
});
```

**Why abstract?**

- `list`: Standard paginated query with filters
- `create`: Standard insert operation
- `getBest`: Only unique operation (aggregation query)

**Alternative approach:**
For onboarding, **batch insert directly** in `completeOnboarding` procedure:

```typescript
// In onboarding.completeOnboarding()
const efforts = [
  ...derivePowerCurveFromFTP(ftp),
  ...deriveSpeedCurveFromThresholdPace(pace),
  ...deriveSwimPaceCurveFromCSS(css),
];

await supabase.from("activity_efforts").insert(
  efforts.map((e) => ({
    ...e,
    profile_id: userId,
    activity_id: null,
    recorded_at: new Date().toISOString(),
  })),
);
```

**Recommendation:** Skip dedicated activity-efforts router for now. Add it later if you need complex queries (e.g., "show my power curve", "compare to baseline").

---

## Phase 3: Mobile UI (`apps/mobile`)

### 3.1 Update Onboarding Screen

**File:** `apps/mobile/app/(external)/onboarding.tsx`

**Changes:**

#### Step 2: Add Estimation Buttons

```tsx
<View>
  <Label>Max Heart Rate (bpm)</Label>
  <View className="flex-row gap-2">
    <Input
      placeholder="190"
      keyboardType="numeric"
      value={data.max_hr?.toString() || ""}
      onChangeText={(text) => {
        const value = parseInt(text);
        updateData({ max_hr: isNaN(value) ? null : value });
      }}
      className="flex-1"
    />
    <Button variant="outline" onPress={estimateMaxHR} className="px-4">
      <Text>Estimate</Text>
    </Button>
  </View>
  {data.dob && (
    <Text className="text-xs text-muted-foreground mt-1">
      Formula: 220 - age = {220 - calculateAge()} bpm
    </Text>
  )}
</View>
```

#### Step 3: Add Smart Derivation Preview

```tsx
{
  data.ftp && (
    <View className="mt-4 p-4 bg-muted rounded-lg">
      <Text className="text-sm font-semibold mb-2">
        📊 We'll create your power curve
      </Text>
      <Text className="text-xs text-muted-foreground">
        Based on your FTP of {data.ftp}W, we'll estimate your best efforts for:
      </Text>
      <View className="mt-2 gap-1">
        <Text className="text-xs">
          • 5 seconds: {Math.round(data.ftp + 20000 / 5)}W
        </Text>
        <Text className="text-xs">
          • 1 minute: {Math.round(data.ftp + 20000 / 60)}W
        </Text>
        <Text className="text-xs">
          • 5 minutes: {Math.round(data.ftp + 20000 / 300)}W
        </Text>
        <Text className="text-xs">
          • 20 minutes: {Math.round(data.ftp + 20000 / 1200)}W
        </Text>
        <Text className="text-xs text-muted-foreground mt-1">
          ...and 6 more durations
        </Text>
      </View>
    </View>
  );
}
```

#### Completion Handler: Use New tRPC Procedure

```tsx
const completeOnboardingMutation =
  trpc.onboarding.completeOnboarding.useMutation();

const handleComplete = async () => {
  try {
    const result = await completeOnboardingMutation.mutateAsync({
      dob: data.dob!,
      weight_kg: data.weight_kg!,
      gender: data.gender!,
      primary_sport: data.primary_sport!,
      max_hr: data.max_hr,
      resting_hr: data.resting_hr,
      lthr: data.lthr,
      ftp: data.ftp,
      threshold_pace_seconds_per_km: data.threshold_pace,
      vo2max: data.vo2max,
      training_frequency: data.training_frequency,
    });

    Alert.alert(
      "Welcome to GradientPeak!",
      `Your profile is ready! We created ${result.created.profile_metrics} biometric records and ${result.created.activity_efforts} performance benchmarks.`,
      [
        {
          text: "Get Started",
          onPress: () => router.replace("/(internal)/(tabs)/home"),
        },
      ],
    );
  } catch (error) {
    console.error("[Onboarding] Failed:", error);
    Alert.alert("Error", "Failed to save your profile. Please try again.");
  }
};
```

---

### 3.2 Add Real-Time Estimation

**Hook:** `apps/mobile/lib/hooks/useMetricEstimation.ts`

```tsx
import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

export function useMetricEstimation(input: {
  weight_kg?: number;
  gender?: "male" | "female" | "other";
  age?: number;
  max_hr?: number;
  resting_hr?: number;
}) {
  const { data, isLoading } = trpc.onboarding.estimateMetrics.useQuery(
    input as any,
    {
      enabled: !!(input.weight_kg && input.gender && input.age),
    },
  );

  return {
    estimatedFTP: data?.ftp,
    estimatedThresholdPace: data?.threshold_pace,
    estimatedMaxHR: data?.max_hr,
    estimatedVO2max: data?.vo2max,
    isLoading,
  };
}
```

**Usage in Onboarding:**

```tsx
const { estimatedFTP, estimatedThresholdPace } = useMetricEstimation({
  weight_kg: data.weight_kg,
  gender: data.gender,
  age: calculateAge(),
});

// Show as placeholder
<Input
  placeholder={estimatedFTP ? `${estimatedFTP}W (estimated)` : "250"}
  value={data.ftp?.toString() || ""}
  onChangeText={(text) => {
    const value = parseInt(text);
    updateData({ ftp: isNaN(value) ? null : value });
  }}
/>;
```

---

## Phase 4: Testing

### 4.1 Unit Tests (`@repo/core`)

**File:** `packages/core/calculations/__tests__/power-curve.test.ts`

```typescript
describe("derivePowerCurveFromFTP", () => {
  it("should generate 10 power efforts from FTP", () => {
    const ftp = 250;
    const curve = derivePowerCurveFromFTP(ftp);

    expect(curve).toHaveLength(10);
    expect(curve[9].value).toBe(250); // 60-min = FTP
    expect(curve[0].value).toBeGreaterThan(1000); // 5s sprint
  });

  it("should use custom W' if provided", () => {
    const ftp = 250;
    const wPrime = 25000; // Higher anaerobic capacity
    const curve = derivePowerCurveFromFTP(ftp, wPrime);

    expect(curve[0].value).toBeGreaterThan(5000); // 5s sprint
  });
});
```

**File:** `packages/core/calculations/__tests__/heart-rate.test.ts`

```typescript
describe("calculateVO2MaxFromHR", () => {
  it("should calculate VO2max from HR data", () => {
    const vo2max = calculateVO2MaxFromHR(190, 55);
    expect(vo2max).toBeCloseTo(52.8, 1);
  });
});

describe("estimateLTHR", () => {
  it("should estimate LTHR as 85% of max HR", () => {
    const lthr = estimateLTHR(190);
    expect(lthr).toBe(162);
  });
});
```

---

### 4.2 Integration Tests (`@repo/trpc`)

**File:** `packages/trpc/src/routers/__tests__/onboarding.test.ts`

```typescript
describe("onboarding.completeOnboarding", () => {
  it("should create profile_metrics and activity_efforts", async () => {
    const result = await caller.onboarding.completeOnboarding({
      dob: "1990-01-01T00:00:00Z",
      weight_kg: 70,
      gender: "male",
      primary_sport: "cycling",
      max_hr: 190,
      resting_hr: 55,
      ftp: 250,
    });

    expect(result.success).toBe(true);
    expect(result.created.profile_metrics).toBeGreaterThanOrEqual(4);
    expect(result.created.activity_efforts).toBe(10);
  });

  it("should handle optional fields gracefully", async () => {
    const result = await caller.onboarding.completeOnboarding({
      dob: "1990-01-01T00:00:00Z",
      weight_kg: 70,
      gender: "male",
      primary_sport: "running",
      // No optional fields
    });

    expect(result.success).toBe(true);
    expect(result.created.profile_metrics).toBe(1); // Only weight
    expect(result.created.activity_efforts).toBe(0); // No FTP/pace
  });
});
```

---

### 4.3 E2E Tests (`apps/mobile`)

**File:** `apps/mobile/__tests__/onboarding.e2e.test.tsx`

```typescript
describe("Onboarding Flow", () => {
  it("should complete onboarding with minimal input", async () => {
    // Step 1: Basic profile
    await fillInput("dob", "1990-01-01");
    await fillInput("weight", "70");
    await pressButton("Male");
    await pressButton("Cycling");
    await pressButton("Next");

    // Step 2: Skip heart rate
    await pressButton("Skip for Now");

    // Step 3: Enter FTP
    await fillInput("ftp", "250");
    await pressButton("Next");

    // Step 4: Skip training context
    await pressButton("Skip & Finish");

    // Verify success
    await waitFor(() => {
      expect(screen.getByText(/Your profile is ready/)).toBeVisible();
    });
  });

  it("should show estimation helpers", async () => {
    await fillInput("dob", "1990-01-01");
    await pressButton("Next");

    // Step 2: Estimate max HR
    await pressButton("Estimate"); // Max HR estimate button
    await waitFor(() => {
      expect(screen.getByDisplayValue("184")).toBeVisible(); // 220 - 36
    });
  });
});
```

---

## Phase 5: Database Migrations

### 5.1 Add Source Tracking (Optional)

**Migration:** `packages/supabase/migrations/YYYYMMDDHHMMSS_add_effort_source.sql`

```sql
-- Add source column to activity_efforts to track origin
ALTER TABLE public.activity_efforts
  ADD COLUMN source TEXT DEFAULT 'activity';

-- Add check constraint for valid sources
ALTER TABLE public.activity_efforts
  ADD CONSTRAINT activity_efforts_source_check
  CHECK (source IN ('activity', 'manual', 'estimated', 'imported', 'test'));

-- Add index for querying by source
CREATE INDEX idx_activity_efforts_source
  ON public.activity_efforts(profile_id, source);

COMMENT ON COLUMN public.activity_efforts.source IS
  'Origin of the effort: activity (from FIT file), manual (user-entered), estimated (derived from FTP/pace), imported (Strava/Garmin), test (structured test result)';
```

---

## Phase 6: Documentation

### 6.1 User-Facing Documentation

**File:** `docs/onboarding-guide.md`

Topics:

- What metrics to enter
- How to find your FTP/threshold pace
- What happens with your data
- How to update metrics later

### 6.2 Developer Documentation

**File:** `packages/core/calculations/README.md`

Topics:

- Critical Power model explanation
- Speed curve derivation logic
- VO2max calculation formula
- When to use each function

---

## Implementation Order

### Week 1: Core Functions

1. ✅ Create `power-curve.ts` with `derivePowerCurveFromFTP()`
2. ✅ Create `speed-curve.ts` with `deriveSpeedCurveFromThresholdPace()`
3. ✅ Create `heart-rate.ts` with HR calculations
4. ✅ Create `performance-estimates.ts` with estimation functions
5. ✅ Create `onboarding.ts` schemas
6. ✅ Write unit tests for all functions

### Week 2: API Layer

1. ✅ Create `onboarding.ts` router
2. ✅ Implement `completeOnboarding` procedure
3. ✅ Implement `estimateMetrics` procedure
4. ✅ Create `activity-efforts.ts` router
5. ✅ Write integration tests

### Week 3: Mobile UI

1. ✅ Update `onboarding.tsx` with estimation buttons
2. ✅ Add derivation preview cards
3. ✅ Create `useMetricEstimation` hook
4. ✅ Update completion handler to use new tRPC procedure
5. ✅ Add loading states and error handling

### Week 4: Testing & Polish

1. ✅ E2E tests for onboarding flow
2. ✅ Manual testing on real devices
3. ✅ Performance optimization (batch inserts)
4. ✅ Documentation
5. ✅ User feedback collection

---

## Success Criteria

### Functional

- [ ] User can complete onboarding in < 3 minutes
- [ ] System creates 15+ database records from 7 inputs
- [ ] Estimation buttons work correctly
- [ ] All validations pass
- [ ] No crashes or errors

### Performance

- [ ] Onboarding completion < 2 seconds
- [ ] Database inserts batched (< 5 queries total)
- [ ] UI remains responsive during calculations

### Quality

- [ ] 100% test coverage for core functions
- [ ] 80% test coverage for tRPC procedures
- [ ] No TypeScript errors
- [ ] Passes all linting rules

---

## Rollout Plan

### Phase 1: Internal Testing (Week 1)

- Deploy to staging
- Test with team members
- Collect feedback

### Phase 2: Beta Testing (Week 2)

- Deploy to production (feature flag)
- Invite 10-20 beta users
- Monitor analytics

### Phase 3: General Availability (Week 3)

- Enable for all new users
- Monitor completion rates
- Iterate based on feedback

---

## Monitoring & Analytics

### Key Metrics to Track

1. **Completion Rate:** % of users who finish all steps
2. **Drop-off Points:** Which step do users abandon?
3. **Estimation Usage:** % of users who click "Estimate" buttons
4. **Data Density:** Avg # of records created per user
5. **Time to Complete:** Median time from start to finish

### Alerts

- Completion rate < 70%
- Error rate > 5%
- Avg completion time > 5 minutes

---

## Future Enhancements

### Phase 2 Features

1. **Test Result Import:** Upload CSV/JSON from Ramp Test
2. **Strava Sync:** Auto-populate from recent activities
3. **Manual Best Efforts:** Advanced users can enter specific durations
4. **Adaptive Refinement:** Suggest updates after first few activities

### Phase 3 Features

1. **Onboarding Wizard Replay:** Allow users to re-run onboarding
2. **Performance Profile Dashboard:** Visualize power/speed curves
3. **Comparison to Peers:** "Your FTP is in the 75th percentile"
4. **Training Plan Recommendations:** Based on onboarding data
