# Onboarding tRPC Abstractions - Code Reduction Summary

## Overview

This document outlines the **abstraction opportunities** identified in the onboarding tRPC implementation to reduce code duplication and development time.

---

## Key Abstractions Implemented

### 1. Helper Functions Layer ⚡

**File:** `packages/trpc/src/utils/onboarding-helpers.ts`

**Purpose:** Extract common batch operations and data transformation logic into reusable helpers.

#### Functions:

```typescript
// Batch insert profile metrics with consistent formatting
batchInsertProfileMetrics(supabase, profileId, metrics[]) → Promise<Result>

// Batch insert activity efforts with consistent formatting
batchInsertActivityEfforts(supabase, profileId, efforts[], source) → Promise<Result>

// Derive efforts for any sport with single function
deriveEffortsForSport(sport: 'cycling'|'running'|'swimming', metric) → DerivedEffort[]

// Prepare metrics by merging input with baseline
prepareProfileMetrics(input, baseline) → Metric[]
```

**Benefits:**

- ✅ **33% code reduction** in main router (~60 lines → ~40 lines)
- ✅ **Single source of truth** for batch operations
- ✅ **Consistent error handling** across all database operations
- ✅ **Easier testing** - helpers can be tested independently
- ✅ **Better maintainability** - change logic in one place

---

### 2. Skip Activity Efforts Router (MVP) ⚡

**Recommendation:** **Don't create** `activity-efforts.ts` router for MVP.

**Why?**

- Activity efforts are only created during onboarding (batch insert)
- No UI for viewing/editing individual efforts in MVP
- Standard CRUD operations can be added later if needed

**What you need instead:**

- Direct Supabase batch insert in `completeOnboarding` (already abstracted in helpers)

**When to add it:**

- When you need "view my power curve" chart
- When you add manual effort entry UI
- When you add "compare to baseline" feature

**Time saved:** ~4 hours development + 2 hours testing = **6 hours**

---

### 3. Reuse Existing Profile Metrics Router

**Recommendation:** **Don't add new procedures** to profile-metrics router.

**Why?**

- `create`, `list`, `getAtDate` already exist
- For onboarding, batch insert directly is more efficient than multiple tRPC calls

**Use existing router for:**

- Viewing metrics history (already has `list`)
- Getting metric at specific date (already has `getAtDate`)
- Manual metric entry (already has `create`)

**Time saved:** ~2 hours (no new procedures needed)

---

## Code Comparison

### Before Abstractions

```typescript
// In onboarding.completeOnboarding() - ~60 lines
completeOnboarding: protectedProcedure
  .mutation(async ({ ctx, input }) => {
    // 1. Update profile (5 lines)
    await supabase.from('profiles').update({...}).eq('id', userId);

    // 2. Create metrics (25 lines) - REPETITIVE
    const metricsToCreate = [];

    metricsToCreate.push({
      profile_id: userId,
      metric_type: 'weight_kg',
      value: input.weight_kg,
      unit: 'kg',
      recorded_at: new Date().toISOString(),
    });

    if (input.max_hr) {
      metricsToCreate.push({
        profile_id: userId,
        metric_type: 'max_hr',
        value: input.max_hr,
        unit: 'bpm',
        recorded_at: new Date().toISOString(),
      });
    }

    // ... 15 more lines of repetitive code

    await supabase.from('profile_metrics').insert(metricsToCreate);

    // 3. Derive efforts (30 lines) - REPETITIVE
    if (input.ftp) {
      const powerCurve = derivePowerCurveFromFTP(input.ftp);
      const effortsToCreate = powerCurve.map(effort => ({
        activity_id: null,
        profile_id: userId,
        activity_category: 'bike',
        duration_seconds: effort.duration_seconds,
        effort_type: 'power',
        value: effort.value,
        unit: 'watts',
        recorded_at: new Date().toISOString(),
      }));

      await supabase.from('activity_efforts').insert(effortsToCreate);
    }

    if (input.threshold_pace) {
      const speedCurve = deriveSpeedCurveFromThresholdPace(input.threshold_pace);
      const effortsToCreate = speedCurve.map(effort => ({
        activity_id: null,
        profile_id: userId,
        activity_category: 'run',
        duration_seconds: effort.duration_seconds,
        effort_type: 'speed',
        value: effort.value,
        unit: 'meters_per_second',
        recorded_at: new Date().toISOString(),
      }));

      await supabase.from('activity_efforts').insert(effortsToCreate);
    }

    // ... repeat for swimming

    return { success: true, created: { ... } };
  });
```

**Issues:**

- ❌ Lots of repetitive mapping code
- ❌ Hard to test
- ❌ Difficult to maintain (change in one place requires changes in 3 places)
- ❌ Error handling duplicated

---

### After Abstractions

```typescript
// In onboarding.completeOnboarding() - ~40 lines
completeOnboarding: protectedProcedure.mutation(async ({ ctx, input }) => {
  const { supabase, session } = ctx;
  const userId = session.user.id;

  // 1. Calculate baseline if needed (3 lines)
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

  // 2. Update profile (5 lines)
  await supabase
    .from("profiles")
    .update({
      dob: input.dob,
      gender: input.gender,
      primary_sport: input.primary_sport,
      experience_level: input.experience_level,
    })
    .eq("id", userId);

  // 3. Prepare and insert metrics (3 lines) - ABSTRACTED
  const metrics = prepareProfileMetrics(input, baseline);
  await batchInsertProfileMetrics(supabase, userId, metrics);

  // 4. Derive and insert all efforts (12 lines) - ABSTRACTED
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

  // 5. Return summary (5 lines)
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

**Benefits:**

- ✅ **33% less code** (60 → 40 lines)
- ✅ **Single responsibility** - main procedure orchestrates, helpers do work
- ✅ **Easy to test** - test helpers independently
- ✅ **Easy to extend** - add new sport by updating `deriveEffortsForSport()`
- ✅ **Consistent error handling** - centralized in helpers

---

## Time Savings Summary

| Task                        | Before   | After    | Time Saved                    |
| --------------------------- | -------- | -------- | ----------------------------- |
| **Helper functions**        | 0 hours  | 3 hours  | -3 hours (upfront investment) |
| **Main router code**        | 6 hours  | 4 hours  | +2 hours (33% faster)         |
| **Activity efforts router** | 6 hours  | 0 hours  | +6 hours (skip for MVP)       |
| **Profile metrics updates** | 2 hours  | 0 hours  | +2 hours (reuse existing)     |
| **Testing**                 | 4 hours  | 3 hours  | +1 hour (fewer endpoints)     |
| **Debugging/maintenance**   | 4 hours  | 2 hours  | +2 hours (cleaner code)       |
| **TOTAL**                   | 22 hours | 12 hours | **+10 hours (45% faster)**    |

**Net result:** Complete onboarding implementation in **12 hours instead of 22 hours**.

---

## Implementation Checklist

### Phase 1: Create Helpers (3 hours)

- [ ] Create `packages/trpc/src/utils/onboarding-helpers.ts`
- [ ] Implement `batchInsertProfileMetrics()`
- [ ] Implement `batchInsertActivityEfforts()`
- [ ] Implement `deriveEffortsForSport()`
- [ ] Implement `prepareProfileMetrics()`
- [ ] Write unit tests for each helper
- [ ] Document all functions with JSDoc

### Phase 2: Use Helpers in Router (4 hours)

- [ ] Create `packages/trpc/src/routers/onboarding.ts`
- [ ] Import all helpers
- [ ] Implement `completeOnboarding` using helpers
- [ ] Implement `estimateMetrics` (simple, no helpers needed)
- [ ] Add error handling
- [ ] Write integration tests

### Phase 3: Update Root Router (1 hour)

- [ ] Import onboarding router in `packages/trpc/src/root.ts`
- [ ] Export in appRouter
- [ ] Verify type generation
- [ ] Test from client

### Phase 4: Skip for MVP (0 hours)

- [ ] ~~Create activity-efforts router~~ (skip for MVP)
- [ ] ~~Add profile-metrics procedures~~ (already exist)

**Total:** 8 hours of actual work (vs 22 hours without abstractions)

---

## Testing Strategy

### Unit Tests (2 hours)

**File:** `packages/trpc/src/utils/__tests__/onboarding-helpers.test.ts`

```typescript
describe("batchInsertProfileMetrics", () => {
  it("should format and insert metrics correctly", async () => {
    const metrics = [
      { metric_type: "weight_kg", value: 70, unit: "kg" },
      { metric_type: "max_hr", value: 190, unit: "bpm" },
    ];

    const result = await batchInsertProfileMetrics(
      mockSupabase,
      "user-id",
      metrics,
    );

    expect(mockSupabase.from).toHaveBeenCalledWith("profile_metrics");
    expect(result.data).toHaveLength(2);
  });
});

describe("deriveEffortsForSport", () => {
  it("should call correct derivation function for cycling", () => {
    const efforts = deriveEffortsForSport("cycling", 250);

    expect(efforts).toHaveLength(10);
    expect(efforts[0].activity_category).toBe("bike");
    expect(efforts[0].effort_type).toBe("power");
  });

  it("should call correct derivation function for swimming", () => {
    const efforts = deriveEffortsForSport("swimming", 90);

    expect(efforts).toHaveLength(10);
    expect(efforts[0].activity_category).toBe("swim");
    expect(efforts[0].effort_type).toBe("speed");
  });
});
```

### Integration Tests (1 hour)

**File:** `packages/trpc/src/routers/__tests__/onboarding.test.ts`

Test only the main procedure (helpers already tested):

```typescript
describe("onboarding.completeOnboarding", () => {
  it("should create all records using helpers", async () => {
    const result = await caller.onboarding.completeOnboarding({
      experience_level: "beginner",
      dob: "1990-01-01",
      weight_kg: 70,
      gender: "male",
      primary_sport: "cycling",
    });

    expect(result.success).toBe(true);
    expect(result.created.profile_metrics).toBe(5);
    expect(result.created.activity_efforts).toBe(10);
    expect(result.baseline_used).toBe(true);
  });
});
```

---

## Future Enhancements (Post-MVP)

### When to add Activity Efforts Router:

**Trigger:** User requests "view my power curve" feature

**Implementation:**

```typescript
// Only add custom queries, reuse helpers for CRUD
export const activityEffortsRouter = createTRPCRouter({
  // Use existing helper for batch creation
  batchCreate: protectedProcedure
    .input(z.object({ efforts: z.array(BestEffortSchema) }))
    .mutation(async ({ ctx, input }) => {
      return batchInsertActivityEfforts(
        ctx.supabase,
        ctx.session.user.id,
        input.efforts,
        "manual",
      );
    }),

  // Custom query: Get power curve for charting
  getPowerCurve: protectedProcedure
    .input(z.object({ activity_category: publicActivityCategorySchema }))
    .query(async ({ ctx, input }) => {
      const { data } = await ctx.supabase
        .from("activity_efforts")
        .select("duration_seconds, value")
        .eq("profile_id", ctx.session.user.id)
        .eq("activity_category", input.activity_category)
        .eq("effort_type", "power")
        .order("duration_seconds", { ascending: true });

      return data;
    }),
});
```

**Time to implement:** 2 hours (vs 6 hours if building from scratch)

---

## Recommendations

### ✅ DO:

1. Create helper functions first (Task 2.1)
2. Use helpers in main router (Task 2.2)
3. Skip activity-efforts router for MVP (Task 2.3 - optional)
4. Reuse existing profile-metrics router

### ❌ DON'T:

1. Copy-paste batch insert code
2. Create routers you don't need yet
3. Add procedures to existing routers unless required
4. Duplicate mapping/transformation logic

### 🎯 Result:

- **45% faster development** (10 hours saved)
- **Cleaner codebase** (33% less code)
- **Easier maintenance** (single source of truth)
- **Better testability** (isolated helpers)

---

## Summary

By introducing a **helper functions abstraction layer** and **skipping unnecessary routers** for MVP, you can:

1. ✅ **Reduce code by 33%** in main router
2. ✅ **Save 10 hours** of development time (45% faster)
3. ✅ **Improve maintainability** with single source of truth
4. ✅ **Simplify testing** with isolated, reusable helpers
5. ✅ **Stay flexible** - easy to add activity-efforts router later when needed

**Bottom line:** Build only what you need for MVP, abstract common patterns, and add complexity incrementally based on actual user needs.
