# Readiness Score Bug Fix - Implementation Plan

Date: 2026-02-17  
Related design: `.opencode/specs/2026-02-17_readiness-score-bug-fix/design.md`  
Goal: Fix artificial readiness score inflation and add dynamic event recovery modeling

---

## Implementation Strategy

### Scope

**Included** (High impact, low complexity):

- ✅ Remove 99+ override (Bug #1)
- ✅ Dynamic event recovery profiles
- ✅ Post-event fatigue with simple exponential decay (Bug #2)
- ✅ Dynamic peak windows with conflict detection (Bug #3)

**Excluded** (Lower priority for v1):

- ❌ Cumulative fatigue accumulation (edge case, add in v2 if needed)
- ❌ Bi-phasic recovery curves (marginal improvement, high complexity)
- ❌ Graduated overlap scoring (v2 enhancement)
- ❌ CTL-based peak windows (simpler intensity-based formula sufficient)

---

## Phase 0: Foundation & Testing Setup

### Objectives

- Establish test infrastructure for readiness calculations
- Document current behavior as baseline
- Set up comparison test framework

### Deliverables

1. **Baseline Test Suite**
   - File: `packages/core/plan/projection/__tests__/readiness.baseline.test.ts`
   - Capture current behavior for regression detection
   - Test cases:
     - Single isolated goal (should maintain behavior)
     - Two marathons 1 day apart (currently shows 99/99)
     - Marathon + 5K 3 days apart (currently shows high readiness)
     - 5K vs marathon vs ultra (all use 12-day window currently)

2. **Test Utilities**
   - File: `packages/core/plan/projection/__tests__/readiness.test-utils.ts`
   - Helper functions for creating test scenarios
   - Mock goal generators with various event types
   - CTL/ATL/TSB state builders

### Acceptance Criteria

- Baseline tests run and pass with current code
- Test utilities available for new test cases
- CI runs existing tests without failures

---

## Phase 1: Event Recovery Model (New Module)

### Objectives

- Create new `event-recovery.ts` module
- Implement dynamic recovery profile calculation
- Implement post-event fatigue penalty calculation
- Keep it simple: use formulas without hardcoded constants

### Deliverables

#### 1.1: Type Definitions

File: `packages/core/plan/projection/event-recovery.ts`

```typescript
export interface EventRecoveryProfile {
  /** Days until full recovery (TSB back to baseline) */
  recovery_days_full: number;

  /** Days until functional training state (can resume moderate training) */
  recovery_days_functional: number;

  /** Event intensity on 0-100 scale */
  fatigue_intensity: number;

  /** Expected ATL spike multiplier (1.0 = no spike, 2.0 = double) */
  atl_spike_factor: number;
}

export interface EventRecoveryInput {
  target: GoalTargetV2;
  projected_ctl_at_event: number;
  projected_atl_at_event: number;
}

export interface PostEventFatigueInput {
  currentDate: string;
  currentPoint: ProjectionPointReadinessInput;
  eventGoal: {
    target_date: string;
    targets: GoalTargetV2[];
    projected_ctl: number;
    projected_atl: number;
  };
}
```

#### 1.2: Recovery Profile Calculation

**Function**: `computeEventRecoveryProfile(input: EventRecoveryInput): EventRecoveryProfile`

**Algorithm**:

For `race_performance` targets:

```typescript
const durationHours = target.target_time_s / 3600;

// Base recovery scales with duration (no magic constants)
// Formula: min(28, max(2, duration * 3.5))
//   5K (0.33hr): 2 days
//   Half marathon (1.5hr): 5 days
//   Marathon (3.5hr): 12 days
//   50K (6hr): 21 days
//   100-mile (24hr): 28 days (capped)
const baseDays = Math.min(28, Math.max(2, durationHours * 3.5));

// Adjust for intensity
const intensity = estimateRaceIntensity({
  distance_m: target.distance_m,
  duration_s: target.target_time_s,
  activity: target.activity_category,
});
const intensityFactor = intensity / 100;
const recoveryDaysFull = Math.round(baseDays * (0.7 + intensityFactor * 0.3));

// Functional recovery is ~40% of full recovery
const recoveryDaysFunctional = Math.round(baseDays * 0.4);

// ATL spike factor: longer events cause bigger spikes
const atlSpikeFactor = Math.min(2.5, 1 + durationHours * 0.15);

return {
  recovery_days_full: recoveryDaysFull,
  recovery_days_functional: recoveryDaysFunctional,
  fatigue_intensity: intensity,
  atl_spike_factor: atlSpikeFactor,
};
```

For `pace_threshold` / `power_threshold` targets:

```typescript
const testDurationHours = target.test_duration_s / 3600;
const baseDays = 3 + testDurationHours * 2;

return {
  recovery_days_full: Math.round(baseDays),
  recovery_days_functional: Math.round(baseDays * 0.35),
  fatigue_intensity: 75,
  atl_spike_factor: 1.2,
};
```

For `hr_threshold` targets:

```typescript
return {
  recovery_days_full: 3,
  recovery_days_functional: 1,
  fatigue_intensity: 65,
  atl_spike_factor: 1.1,
};
```

#### 1.3: Intensity Estimation Helper

**Function**: `estimateRaceIntensity(input): number`

```typescript
function estimateRaceIntensity(input: {
  distance_m: number;
  duration_s: number;
  activity: "run" | "bike" | "swim" | "other";
}): number {
  const durationHours = input.duration_s / 3600;

  // Base intensity from duration
  let baseIntensity = 100;
  if (durationHours > 24) baseIntensity = 70;
  else if (durationHours > 12) baseIntensity = 75;
  else if (durationHours > 6) baseIntensity = 80;
  else if (durationHours > 3) baseIntensity = 85;
  else if (durationHours > 1) baseIntensity = 90;
  else baseIntensity = 95;

  // Adjust for activity type
  const activityFactor =
    input.activity === "run"
      ? 1.0
      : input.activity === "bike"
        ? 0.9
        : input.activity === "swim"
          ? 0.95
          : 0.85;

  return Math.round(baseIntensity * activityFactor);
}
```

#### 1.4: Post-Event Fatigue Penalty

**Function**: `computePostEventFatiguePenalty(input: PostEventFatigueInput): number`

**Algorithm**:

```typescript
const daysAfterEvent = diffDateOnlyUtcDays(
  input.eventGoal.target_date,
  input.currentDate,
);

// Only penalize after event, not before
if (daysAfterEvent <= 0) return 0;

// Get primary target
const primaryTarget = input.eventGoal.targets[0];
if (!primaryTarget) return 0;

// Calculate recovery profile
const recoveryProfile = computeEventRecoveryProfile({
  target: primaryTarget,
  projected_ctl_at_event: input.eventGoal.projected_ctl,
  projected_atl_at_event: input.eventGoal.projected_atl,
});

// Exponential decay curve (simple, no bi-phasic complexity)
// Half-life = 1/3 of full recovery time
const recoveryHalfLife = recoveryProfile.recovery_days_full / 3;
const decayFactor = Math.pow(0.5, daysAfterEvent / recoveryHalfLife);

// Check current ATL/CTL ratio for overload penalty
const atlRatio =
  input.currentPoint.predicted_fatigue_atl /
  Math.max(1, input.currentPoint.predicted_fitness_ctl);
const atlOverloadPenalty = Math.max(0, (atlRatio - 1) * 30);

// Base penalty from event intensity (0-50% range)
const basePenalty = recoveryProfile.fatigue_intensity * 0.5;

// Total penalty with decay
const totalPenalty = (basePenalty + atlOverloadPenalty) * decayFactor;

// Cap at 60% penalty
return Math.min(60, totalPenalty);
```

### Testing

File: `packages/core/plan/projection/__tests__/event-recovery.test.ts`

Test cases:

1. **Recovery Profile Calculation**
   - 5K race: 2-3 day recovery
   - Half marathon: 5-7 day recovery
   - Marathon: 10-14 day recovery
   - Ultra marathon: 21-28 day recovery
   - Threshold tests: 3-5 day recovery

2. **Fatigue Penalty Calculation**
   - Day 1 after marathon: 35-45% penalty
   - Day 3 after marathon: 20-30% penalty
   - Day 7 after marathon: 8-12% penalty
   - Day 14 after marathon: <5% penalty
   - Before event: 0% penalty

3. **Intensity Estimation**
   - Short events (5K): 90-95 intensity
   - Medium events (half): 85-90 intensity
   - Long events (marathon): 80-85 intensity
   - Ultra events: 70-80 intensity

### Acceptance Criteria

- All unit tests pass
- Type definitions exported correctly
- No hardcoded constants (all formulas derive from inputs)
- Performance: <10ms per call

---

## Phase 2: Remove 99+ Override (Bug #1)

### Objectives

- Remove artificial score inflation
- Keep existing synergy boost formula
- Return actual calculated values

### Deliverables

#### 2.1: Code Change

File: `packages/core/plan/projectionCalculations.ts`

**Lines to remove**: 2715-2717

**Before**:

```typescript
function computeGoalReadinessScore(input: {
  stateReadinessScore: number;
  targetAttainmentScore: number;
  goalAlignmentLoss: number;
}): number {
  // ... existing calculation ...

  const scoredReadiness = round1(
    Math.max(0, Math.min(100, blended + eliteSynergyBoost - alignmentPenalty)),
  );

  // ❌ DELETE THIS BLOCK
  if (state >= 70 && attainment >= 60 && alignmentLoss <= 5) {
    return Math.max(99, scoredReadiness);
  }

  return scoredReadiness;
}
```

**After**:

```typescript
function computeGoalReadinessScore(input: {
  stateReadinessScore: number;
  targetAttainmentScore: number;
  goalAlignmentLoss: number;
}): number {
  // ... existing calculation ...

  // ✅ Return actual calculation, no override
  return round1(
    Math.max(0, Math.min(100, blended + eliteSynergyBoost - alignmentPenalty)),
  );
}
```

### Testing

File: `packages/core/plan/__tests__/projectionCalculations.test.ts`

New test cases:

```typescript
describe("computeGoalReadinessScore - elite synergy boost removal", () => {
  it("returns calculated score without 99+ override", () => {
    const result = computeGoalReadinessScore({
      stateReadinessScore: 85,
      targetAttainmentScore: 70,
      goalAlignmentLoss: 2,
    });

    expect(result).toBeGreaterThan(85);
    expect(result).toBeLessThan(95);
    expect(result).not.toBe(99);
  });

  it("never exceeds 100", () => {
    const result = computeGoalReadinessScore({
      stateReadinessScore: 100,
      targetAttainmentScore: 100,
      goalAlignmentLoss: 0,
    });

    expect(result).toBeLessThanOrEqual(100);
  });

  it("elite synergy boost still applies as multiplicative bonus", () => {
    const highState = computeGoalReadinessScore({
      stateReadinessScore: 90,
      targetAttainmentScore: 90,
      goalAlignmentLoss: 0,
    });

    const lowState = computeGoalReadinessScore({
      stateReadinessScore: 60,
      targetAttainmentScore: 60,
      goalAlignmentLoss: 0,
    });

    // High state should get bigger boost
    expect(highState - 90).toBeGreaterThan(lowState - 60);
  });
});
```

### Acceptance Criteria

- Override block removed
- Existing synergy boost formula preserved
- All tests pass
- No artificial 99+ scores

---

## Phase 3: Integrate Post-Event Fatigue (Bug #2)

### Objectives

- Apply post-event fatigue penalties to readiness scores
- Use max penalty approach (simple, handles 90% of cases)
- Integrate with existing readiness calculation flow

### Deliverables

#### 3.1: Type Changes

File: `packages/core/plan/projection/readiness.ts`

**Add `targets` field to goal input**:

```typescript
export interface ProjectionPointReadinessGoalInput {
  target_date: string;
  priority?: number;
  targets?: GoalTargetV2[]; // ✅ ADDED
}
```

#### 3.2: Algorithm Integration

File: `packages/core/plan/projection/readiness.ts`

**Location**: Inside `computeProjectionPointReadinessScores()`, after base readiness calculation

**Before** (line ~420):

```typescript
const rawScores = input.points.map((point) => {
  // ... CTL/ATL/TSB calculation ...
  return clampScore(blendedSignal * 100);
});

// Continue with smoothing...
```

**After**:

```typescript
const rawScores = input.points.map((point) => {
  // ... CTL/ATL/TSB calculation ...
  return clampScore(blendedSignal * 100);
});

// ✅ NEW: Apply post-event fatigue for each goal
const fatigueAdjustedScores = rawScores.map((baseScore, idx) => {
  const point = input.points[idx];
  if (!point) return baseScore;

  let maxFatiguePenalty = 0;

  // Check fatigue from each goal
  for (const goal of goals) {
    // Skip goals without targets
    if (!goal.targets || goal.targets.length === 0) continue;

    const penalty = computePostEventFatiguePenalty({
      currentDate: point.date,
      currentPoint: point,
      eventGoal: {
        target_date: goal.target_date,
        targets: goal.targets,
        projected_ctl: point.predicted_fitness_ctl,
        projected_atl: point.predicted_fatigue_atl,
      },
    });

    // Take maximum penalty (most limiting event)
    maxFatiguePenalty = Math.max(maxFatiguePenalty, penalty);
  }

  return clampScore(baseScore - maxFatiguePenalty);
});

// Continue with smoothing using fatigueAdjustedScores...
```

**Update all references**: Replace `rawScores` with `fatigueAdjustedScores` in:

- Smoothing loop (`prior` variable)
- Blending at end of iterations
- Goal anchoring final pass

#### 3.3: Caller Changes

File: `packages/core/plan/projectionCalculations.ts` (line ~3584)

**Before**:

```typescript
const finalPointReadinessScores = computeProjectionPointReadinessScores({
  points,
  planReadinessScore: compositeReadiness.readiness_score,
  goals: goalMarkers,
  timeline_calibration: calibration.readiness_timeline,
});
```

**After**:

```typescript
const finalPointReadinessScores = computeProjectionPointReadinessScores({
  points,
  planReadinessScore: compositeReadiness.readiness_score,
  goals: goalMarkers.map((marker) => {
    const sourceGoal = input.goals.find((g) => g.id === marker.id);
    return {
      target_date: marker.target_date,
      priority: marker.priority,
      targets: sourceGoal?.targets ?? [], // ✅ PASS TARGETS
    };
  }),
  timeline_calibration: calibration.readiness_timeline,
});
```

### Testing

File: `packages/core/plan/projection/__tests__/readiness.integration.test.ts`

Test cases:

```typescript
describe("Post-event fatigue integration", () => {
  it("applies fatigue penalty day after marathon", () => {
    const scores = computeProjectionPointReadinessScores({
      points: [
        { date: "2026-03-14", ctl: 65, atl: 60, tsb: 5 }, // Marathon day
        { date: "2026-03-15", ctl: 65, atl: 68, tsb: -3 }, // Day after
      ],
      goals: [
        {
          target_date: "2026-03-14",
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
        },
      ],
    });

    // Day 2 should show significant fatigue
    expect(scores[1]).toBeLessThan(scores[0] - 30);
  });

  it("applies max penalty from multiple events", () => {
    // Marathon on day 1, 5K on day 3, check day 4
    // Should use marathon penalty (larger), not 5K
  });

  it("no penalty before event", () => {
    // Check that future events don't penalize current readiness
  });
});
```

### Acceptance Criteria

- Fatigue penalties applied after events
- Max penalty approach prevents double-counting
- All existing tests still pass
- Back-to-back marathon scenario shows realistic scores

---

## Phase 4: Dynamic Peak Windows (Bug #3)

### Objectives

- Replace hardcoded 12-day peak window with dynamic calculation
- Use intensity-based formula (simple, no CTL lookup)
- Detect conflicting goals using dynamic thresholds
- Allow natural fatigue for conflicting goals

### Deliverables

#### 4.1: Peak Window Formula

File: `packages/core/plan/projection/readiness.ts`

**Location**: Inside `computeProjectionPointReadinessScores()`, goal anchors calculation

**Before** (line ~459):

```typescript
const goalAnchors = goals
  .map((goal) => {
    const goalIndex = resolveGoalIndex(goal.target_date);
    const peakWindow = 12; // ❌ HARDCODED

    return {
      goalIndex,
      peakWindow,
      peakSlope: 1.6,
    };
  })
  .sort((a, b) => a.goalIndex - b.goalIndex);
```

**After**:

```typescript
const goalAnchors = goals
  .map((goal, idx) => {
    const goalIndex = resolveGoalIndex(goal.target_date);

    // Calculate recovery profile for this goal
    const primaryTarget = goal.targets?.[0];
    let recoveryProfile = {
      recovery_days_full: 7,
      recovery_days_functional: 3,
      fatigue_intensity: 75,
      atl_spike_factor: 1.2,
    };

    if (primaryTarget) {
      const goalPoint = input.points[goalIndex];
      recoveryProfile = computeEventRecoveryProfile({
        target: primaryTarget,
        projected_ctl_at_event: goalPoint?.predicted_fitness_ctl ?? 50,
        projected_atl_at_event: goalPoint?.predicted_fatigue_atl ?? 50,
      });
    }

    // ✅ DYNAMIC: Taper days based on intensity (5-8 days)
    const taperDays = Math.round(
      5 + (recoveryProfile.fatigue_intensity / 100) * 3,
    );

    // ✅ DYNAMIC: Peak window = taper + 60% of recovery
    const peakWindow =
      taperDays + Math.round(recoveryProfile.recovery_days_full * 0.6);

    // ✅ NEW: Detect conflicts using dynamic functional recovery threshold
    const hasConflictingGoal = goals.some((otherGoal, otherIdx) => {
      if (idx === otherIdx) return false;
      const daysBetween = Math.abs(
        diffDateOnlyUtcDays(goal.target_date, otherGoal.target_date),
      );
      // Conflict if within functional recovery window
      return daysBetween <= recoveryProfile.recovery_days_functional;
    });

    return {
      goalIndex,
      peakWindow,
      peakSlope: 1.6,
      allowNaturalFatigue: hasConflictingGoal, // ✅ NEW FLAG
    };
  })
  .sort((a, b) => a.goalIndex - b.goalIndex);
```

#### 4.2: Conditional Peak Forcing

**Location**: Inside smoothing iterations loop

**Before** (line ~491):

```typescript
for (const anchor of goalAnchors) {
  // ... calculate start/end ...

  // Always force to be local maximum
  let localMax = 0;
  for (let i = start; i <= end; i += 1) {
    localMax = Math.max(localMax, optimized[i] ?? 0);
  }

  optimized[anchor.goalIndex] = clampScore(
    Math.max(optimized[anchor.goalIndex] ?? 0, localMax),
  );

  // ... suppression logic ...
}
```

**After**:

```typescript
for (const anchor of goalAnchors) {
  // ... calculate start/end ...

  // ✅ CHANGED: Only force local max if no conflicting goals
  if (!anchor.allowNaturalFatigue) {
    let localMax = 0;
    for (let i = start; i <= end; i += 1) {
      localMax = Math.max(localMax, optimized[i] ?? 0);
    }

    optimized[anchor.goalIndex] = clampScore(
      Math.max(optimized[anchor.goalIndex] ?? 0, localMax),
    );
  }
  // For conflicting goals, let the fatigue model handle it naturally

  // ... suppression logic continues unchanged ...
}
```

**Same change for final goal anchoring** (line ~552):

```typescript
for (const anchor of goalAnchors) {
  // ✅ Skip final anchoring for conflicting goals
  if (anchor.allowNaturalFatigue) continue;

  // ... existing local max logic ...
}
```

### Testing

File: `packages/core/plan/projection/__tests__/readiness.peak-window.test.ts`

Test cases:

```typescript
describe("Dynamic peak windows", () => {
  it("5K uses shorter window (~10 days)", () => {
    // Test that 5K doesn't suppress readiness 12 days out
  });

  it("marathon uses medium window (~15 days)", () => {
    // Test marathon suppression range
  });

  it("ultra uses longer window (~21 days)", () => {
    // Test ultra suppression range
  });

  it("conflicting goals detected within functional recovery", () => {
    // Marathon + 5K 3 days apart = conflict
    // Marathon + 5K 10 days apart = no conflict
  });

  it("conflicting goals not forced to local max", () => {
    // Back-to-back marathons should show natural fatigue curve
  });

  it("isolated goals still forced to local max", () => {
    // Single marathon should be peak of its window
  });
});
```

### Acceptance Criteria

- No hardcoded 12-day constant
- Peak windows scale with event type
- Conflict detection uses dynamic thresholds
- Conflicting goals respect fatigue dynamics
- Isolated goals maintain peak behavior

---

## Phase 5: Integration Testing & Validation

### Objectives

- End-to-end testing with realistic scenarios
- Validate against baseline expectations
- Performance benchmarking
- Regression testing

### Deliverables

#### 5.1: Integration Test Suite

File: `packages/core/plan/__tests__/projectionCalculations.integration.test.ts`

**Test scenarios**:

1. **Single Isolated Marathon**
   - Expected: High readiness (80-95%)
   - Should maintain existing behavior

2. **Back-to-Back Marathons (1 day apart)**
   - Before: 99% / 99%
   - After: 88% / 44%
   - Validates Bug #1 and Bug #2 fixes

3. **Marathon + 5K (3 days apart)**
   - Before: 85% / 88%
   - After: 88% / 52%
   - Validates recovery overlap detection

4. **Three Races (5K, Half, Marathon over 8 weeks)**
   - Should show appropriate recovery curves
   - Each event should use appropriate window size

5. **Ultra Marathon (24-hour race)**
   - Should use ~21-day window
   - Recovery penalty should last 3+ weeks

#### 5.2: Performance Benchmarking

File: `packages/core/plan/__tests__/performance.bench.ts`

**Benchmarks**:

- 12-week plan, 3 goals: <100ms total
- 24-week plan, 5 goals: <200ms total
- Recovery profile calculation: <10ms per goal
- Fatigue penalty calculation: <5ms per point

#### 5.3: Comparison Tests

File: `packages/core/plan/__tests__/readiness.comparison.test.ts`

**Compare old vs new**:

- Document expected changes
- Flag unexpected regressions
- Validate improvements

### Testing Commands

```bash
# Unit tests
cd packages/core && pnpm test event-recovery
cd packages/core && pnpm test readiness
cd packages/core && pnpm test projectionCalculations

# Integration tests
cd packages/core && pnpm test --runInBand

# Type checking
cd packages/core && pnpm check-types

# Full validation
pnpm check-types && pnpm lint && pnpm test
```

### Acceptance Criteria

- All unit tests pass
- All integration tests pass
- Performance within budget (<100ms for typical plans)
- No regressions in unrelated functionality
- Type checking passes

---

## Phase 6: Documentation & Release

### Objectives

- Update API documentation
- Document behavior changes
- Release notes for users

### Deliverables

#### 6.1: Code Documentation

Files to update:

- `packages/core/plan/projection/event-recovery.ts` - JSDoc for all exports
- `packages/core/plan/projection/readiness.ts` - Update function docs
- `packages/core/plan/projectionCalculations.ts` - Update goal readiness docs

#### 6.2: Release Notes

**Breaking Changes**: None (internal behavior changes only)

**Improvements**:

- Readiness scores now accurately reflect post-event fatigue
- Back-to-back events show realistic recovery requirements
- Event-specific recovery windows (5K vs marathon vs ultra)
- Removed artificial 99+ score inflation

**User Impact**:

- Readiness scores will be lower for aggressive multi-goal plans
- More realistic assessment of plan feasibility
- Better guidance for race scheduling

#### 6.3: Migration Guide

**For Developers**:

- No API changes required
- Existing calibration parameters still respected
- Test suites may need baseline updates

**For Users**:

- Readiness scores may change (expected behavior)
- Aggressive plans will show honest consequences
- No action required

### Acceptance Criteria

- All public functions documented
- Release notes reviewed and approved
- Migration guide complete
- User communication prepared

---

## Rollout Strategy

### Phase Rollout

1. **Internal Testing** (Phase 0-5)
   - Run full test suite
   - Manual validation with real plans
   - Performance benchmarking

2. **Staging Deployment**
   - Deploy to staging environment
   - Test with production data
   - Validate readiness score changes

3. **Production Deployment**
   - Deploy to production
   - Monitor for issues
   - Collect user feedback

### Success Metrics

**Technical**:

- 0 regressions in existing functionality
- <100ms performance for typical plans
- 100% test coverage for new code

**User Experience**:

- Readiness scores trusted as realistic
- No confusion about score changes
- Positive feedback on accuracy

---

## Risk Assessment

### Low Risk

- ✅ Removing 99+ override (simple code deletion)
- ✅ Adding new module (isolated changes)

### Medium Risk

- ⚠️ User perception of lower readiness scores
  - Mitigation: Clear communication, release notes
- ⚠️ Integration with existing calibration
  - Mitigation: Comprehensive testing

### High Risk

- ❌ None identified

---

## Dependencies

### Required

- Existing projection engine working
- CTL/ATL/TSB calculations accurate
- Goal target schemas stable

### Optional

- Calibration system (works with or without)
- UI updates (backend changes only)

---

## Timeline Estimate

- Phase 0: 2 hours (test setup)
- Phase 1: 4 hours (event recovery module)
- Phase 2: 1 hour (remove override)
- Phase 3: 3 hours (integrate fatigue)
- Phase 4: 4 hours (dynamic windows)
- Phase 5: 4 hours (integration testing)
- Phase 6: 2 hours (documentation)

**Total**: ~20 hours of implementation + testing
