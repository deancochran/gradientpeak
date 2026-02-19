# Training Plan Readiness Score Calculation - Bug Fix Design Specification

**Document Version**: 2.0  
**Date**: 2026-02-17  
**Status**: Design & Planning Phase  
**Authors**: AI Assistant, Dean Cochran  
**Reviewers**: [Pending]

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Design Philosophy & Principles](#design-philosophy--principles)
4. [Solution Architecture](#solution-architecture)
5. [Success Criteria](#success-criteria)

---

## Executive Summary

### Overview

This specification addresses critical bugs in the training plan readiness score calculation system that cause unrealistic readiness scores, particularly for users with multiple closely-spaced goals. The primary issue is an artificial "elite synergy boost" override that forces readiness scores to 99+ regardless of actual physiological state.

### Key Issues

1. **Artificial Score Inflation**: Hardcoded override forcing 99+ readiness scores
2. **Missing Post-Event Fatigue**: No recovery modeling after high-intensity events
3. **Static Goal Peaking**: Fixed constants instead of dynamic recovery calculations

### Solution Summary

- **Remove** elite synergy boost override to allow natural score calculation
- **Implement** dynamic event recovery modeling based on goal targets
- **Replace** static goal peaking with dynamic recovery-aware algorithm
- **Maintain** separation between readiness (state) and priority (optimization)

### Impact

- **Users**: More realistic and trustworthy readiness scores
- **System**: Better reflects physiological constraints and recovery needs
- **Performance**: Minimal impact (<100ms for typical plans)
- **Complexity**: Low - uses simple formulas without hardcoded constants

---

## Problem Statement

### Context

The GradientPeak training plan system uses a sophisticated projection engine that:

1. Optimizes weekly TSS allocation using Model Predictive Control (MPC)
2. Projects CTL/ATL/TSB (fitness/fatigue/form) over the plan timeline
3. Calculates readiness scores for each day, particularly at goal dates
4. Uses goal priority to weight optimization decisions

### Bug 1: Artificial Score Inflation

**Location**: `packages/core/plan/projectionCalculations.ts:2715-2717`

**Current Code**:

```typescript
if (state >= 70 && attainment >= 60 && alignmentLoss <= 5) {
  return Math.max(99, scoredReadiness); // Forces 99+
}
```

**Problem**: Overrides calculated readiness with artificial 99+ score, ignoring actual CTL/ATL/TSB physiological state.

**Real-World Impact**:

```
User Scenario: Two 2-hour marathons scheduled one day apart
- Day 1 Marathon: Shows 99% readiness
- Day 2 Marathon: Shows 99% readiness
- Reality: Day 2 should show ~30-40% due to severe fatigue
```

**Root Cause**: Conceptual error treating readiness as an achievement metric rather than a physiological state measurement.

---

### Bug 2: Missing Post-Event Fatigue Modeling

**Location**: `packages/core/plan/projection/readiness.ts:365-609`

**Problem**: Readiness scores don't model recovery time needed after high-intensity events. Adjacent goals treated as independent peaks rather than sequential physiological states.

**Current Behavior**:

```
Timeline: Marathon on Day 1, 5K on Day 3
- Day 1: 85% readiness (marathon)
- Day 2: 82% readiness (slight drop)
- Day 3: 88% readiness (5K) ← WRONG: Should be ~50% due to marathon recovery
```

**Expected Behavior**:

```
Timeline: Marathon on Day 1, 5K on Day 3
- Day 1: 85% readiness (marathon)
- Day 2: 45% readiness (severe fatigue)
- Day 3: 52% readiness (still recovering) ← CORRECT
```

---

### Bug 3: Static Goal Peaking Algorithm

**Location**: `packages/core/plan/projection/readiness.ts:459-526`

**Problem**: Current implementation uses fixed `peakWindow = 12` days constant. Forces each goal to be a local maximum regardless of adjacent goals.

**Current Code**:

```typescript
const goalAnchors = goals.map((goal) => {
  const goalIndex = resolveGoalIndex(goal.target_date);
  const peakWindow = 12; // ❌ HARDCODED CONSTANT
  return { goalIndex, peakWindow, peakSlope: 1.6 };
});
```

**Design Flaw**: Using static constants instead of dynamic calculation based on goal characteristics.

**Example Problem**:

```
5K Race:
  - Actual recovery needed: 2-3 days
  - Current peakWindow: 12 days
  - Result: Unnecessarily suppresses readiness 12 days before/after

24-Hour Ultra:
  - Actual recovery needed: 21-28 days
  - Current peakWindow: 12 days
  - Result: Doesn't suppress readiness enough, shows unrealistic scores
```

---

## Design Philosophy & Principles

### 1. Readiness = Physiological State Measurement

**Definition**: Readiness scores reflect the user's projected physiological preparedness at a specific point in time.

**Characteristics**:

- Pure function of CTL/ATL/TSB and preparedness metrics
- Descriptive, not prescriptive
- Independent of goal priority
- Reflects "what condition will you be in on this date"

**Analogy**: Like a thermometer measuring temperature - it reports the state, it doesn't judge whether the temperature is "good" or "bad".

---

### 2. Goal Priority = Training Optimization Driver

**Definition**: Priority determines which goals the MPC solver optimizes for during projection planning.

**Characteristics**:

- Affects TSS allocation decisions during projection
- Higher priority goals get more weight in objective function
- Does NOT directly inflate readiness scores

**Separation of Concerns**:

- **Projection Phase**: Priority-weighted optimization of weekly TSS
- **Readiness Calculation Phase**: State-based scoring independent of priority
- **Recovery Modeling**: Dynamic based on goal characteristics

---

### 3. Dynamic Recovery Modeling

**Definition**: Recovery time calculated from goal targets and event intensity, not fixed constants.

**Rationale**: Different event types require different recovery periods:

| Event Type     | Duration  | Recovery (Full) | Recovery (Functional) |
| -------------- | --------- | --------------- | --------------------- |
| 5K Race        | 20-30 min | 2-3 days        | 1 day                 |
| Half Marathon  | 1.5-2 hrs | 5-7 days        | 2-3 days              |
| Marathon       | 3-5 hrs   | 10-14 days      | 4-6 days              |
| 50K Ultra      | 5-8 hrs   | 14-18 days      | 6-8 days              |
| 100-Mile Ultra | 20-30 hrs | 21-28 days      | 10-14 days            |
| 24-Hour Race   | 24 hrs    | 28-35 days      | 14-21 days            |

**Key Insight**: Recovery is a function of:

- Event duration (longer = more recovery)
- Event intensity (harder effort = more recovery)
- Individual fitness level (CTL/ATL at event)
- Event type (race vs threshold test vs HR test)

**No Fixed Constants**: The system calculates recovery dynamically using simple formulas.

---

### 4. No Realism Penalties for Extreme Configurations

**Principle**: The system allows users to create aggressive or extreme training plans without artificial penalties.

**Rationale**: Users may have valid reasons for aggressive plans. Readiness scores should reflect the projected state, not judge feasibility.

**What This Means**:

```
❌ WRONG: "This plan is too aggressive, applying 30% penalty to all scores"
✅ CORRECT: "Based on projection, Day 2 marathon readiness is 35% due to fatigue"
```

**The Difference**:

- No artificial penalties based on "rules" or "thresholds"
- Natural consequences emerge from physiological modeling (CTL/ATL/TSB dynamics)
- Users see realistic outcomes, make informed decisions

---

## Solution Architecture

### Overview

The fix consists of four main components, prioritized by impact/complexity ratio:

1. **Remove Elite Synergy Boost Override** (Trivial complexity, high impact)
2. **Implement Dynamic Event Recovery Model** (Low complexity, high impact)
3. **Add Post-Event Fatigue Calculation** (Low complexity, high impact)
4. **Update Goal Peaking Algorithm** (Low complexity, medium-high impact)

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ UNCHANGED: Projection & MPC Optimization                        │
│ - Priority-weighted TSS allocation                              │
│ - CTL/ATL/TSB calculation                                       │
│ - Base readiness from fitness/fatigue/form                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ NEW MODULE: Event Recovery Model                                │
│ packages/core/plan/projection/event-recovery.ts                 │
│                                                                  │
│ computeEventRecoveryProfile(target, ctl, atl)                   │
│ ├─ Analyzes goal target (race, threshold test, etc.)           │
│ ├─ Calculates duration and intensity                           │
│ └─ Returns: recovery_days_full, recovery_days_functional       │
│                                                                  │
│ computePostEventFatiguePenalty(date, goal, point)               │
│ ├─ Checks days since event                                     │
│ ├─ Applies exponential decay curve                             │
│ ├─ Considers ATL spike and overload                            │
│ └─ Returns: fatigue penalty (0-60%)                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ MODIFIED: Readiness Score Calculation                           │
│ packages/core/plan/projection/readiness.ts                      │
│                                                                  │
│ computeProjectionPointReadinessScores()                         │
│ ├─ Calculate base readiness (existing)                         │
│ ├─ ✅ NEW: Apply post-event fatigue for each goal              │
│ ├─ Apply smoothing (existing)                                  │
│ ├─ ✅ MODIFIED: Dynamic goal peaking with recovery windows     │
│ └─ Anchor to plan readiness (existing)                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ MODIFIED: Goal Readiness Score                                  │
│ packages/core/plan/projectionCalculations.ts                    │
│                                                                  │
│ computeGoalReadinessScore()                                     │
│ ├─ Blend state + target attainment (existing)                  │
│ ├─ Apply elite synergy boost (existing)                        │
│ └─ ✅ REMOVED: No override to 99+                              │
│    Return actual calculation                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

### Component 1: Remove Elite Synergy Boost Override

**Purpose**: Eliminate artificial score inflation.

**File**: `packages/core/plan/projectionCalculations.ts`

**Change**: Delete lines 2715-2717 (the override block)

**Impact**: Readiness scores will reflect actual mathematical calculation without artificial 99+ ceiling.

---

### Component 2: Dynamic Event Recovery Model

**Purpose**: Calculate recovery requirements dynamically from goal targets.

**New File**: `packages/core/plan/projection/event-recovery.ts`

**Key Functions**:

```typescript
export interface EventRecoveryProfile {
  recovery_days_full: number; // Days to full recovery
  recovery_days_functional: number; // Days to functional training state
  fatigue_intensity: number; // 0-100 scale of event intensity
  atl_spike_factor: number; // Expected ATL spike multiplier
}

export function computeEventRecoveryProfile(input: {
  target: GoalTargetV2;
  projected_ctl_at_event: number;
  projected_atl_at_event: number;
}): EventRecoveryProfile;

export function computePostEventFatiguePenalty(input: {
  currentDate: string;
  currentPoint: ProjectionPointReadinessInput;
  eventGoal: {
    target_date: string;
    targets: GoalTargetV2[];
    projected_ctl: number;
    projected_atl: number;
  };
}): number;
```

**Recovery Formula** (Simple, no constants):

```typescript
// For race_performance targets:
const durationHours = target.target_time_s / 3600;
const baseDays = Math.min(28, Math.max(2, durationHours * 3.5));
// Examples:
//   5K (0.33hr): 2 days
//   Half (1.5hr): 5 days
//   Marathon (3.5hr): 12 days
//   100-mile (24hr): 28 days (capped)

const recoveryDaysFull = Math.round(baseDays * intensityFactor);
const recoveryDaysFunctional = Math.round(baseDays * 0.4);
```

**Fatigue Decay** (Simple exponential):

```typescript
const recoveryHalfLife = recoveryProfile.recovery_days_full / 3;
const decayFactor = Math.pow(0.5, daysAfterEvent / recoveryHalfLife);
const basePenalty = recoveryProfile.fatigue_intensity * 0.5;
const totalPenalty = (basePenalty + atlOverloadPenalty) * decayFactor;
```

---

### Component 3: Modified Readiness Calculation

**Purpose**: Integrate recovery modeling into readiness score calculation.

**File**: `packages/core/plan/projection/readiness.ts`

**Changes**:

1. Add `targets` field to `ProjectionPointReadinessGoalInput` interface
2. Apply post-event fatigue after base readiness calculation
3. Use dynamic recovery windows for goal peaking
4. Detect conflicting goals and allow natural fatigue

**Key Algorithm Change**:

```typescript
// Step 1: Calculate base readiness (EXISTING)
const rawScores = input.points.map((point) => {
  // ... existing CTL/ATL/TSB calculation ...
});

// Step 2: Apply post-event fatigue (NEW)
const fatigueAdjustedScores = rawScores.map((baseScore, idx) => {
  let maxFatiguePenalty = 0;

  for (const goal of goals) {
    const penalty = computePostEventFatiguePenalty({...});
    maxFatiguePenalty = Math.max(maxFatiguePenalty, penalty);
  }

  return clampScore(baseScore - maxFatiguePenalty);
});

// Step 3: Dynamic goal peaking (MODIFIED)
const goalAnchors = goals.map((goal) => {
  const recoveryProfile = computeEventRecoveryProfile({...});

  // Dynamic peak window (no hardcoded 12)
  const taperDays = Math.round(5 + (recoveryProfile.fatigue_intensity / 100) * 3);
  const peakWindow = taperDays + Math.round(recoveryProfile.recovery_days_full * 0.6);

  // Detect conflicts using dynamic threshold
  const hasConflictingGoal = goals.some((otherGoal) => {
    const daysBetween = Math.abs(diffDateOnlyUtcDays(goal.target_date, otherGoal.target_date));
    return daysBetween <= recoveryProfile.recovery_days_functional;
  });

  return { goalIndex, peakWindow, peakSlope: 1.6, allowNaturalFatigue: hasConflictingGoal };
});

// In peaking loop: skip forcing local max if allowNaturalFatigue is true
```

---

### Component 4: Simplified Peak Window Formula

**Purpose**: Remove hardcoded constants while keeping complexity low.

**Formula**:

```typescript
// Taper: 5-8 days based on event intensity
const taperDays = Math.round(5 + (recoveryProfile.fatigue_intensity / 100) * 3);

// Peak window = taper + 60% of full recovery
const peakWindow =
  taperDays + Math.round(recoveryProfile.recovery_days_full * 0.6);
```

**Examples**:

- **5K** (intensity 95, recovery 3 days): `8 + 1.8 = ~10 days`
- **Marathon** (intensity 85, recovery 12 days): `8 + 7.2 = ~15 days`
- **Ultra** (intensity 75, recovery 24 days): `7 + 14.4 = ~21 days`

**Benefits**:

- No hardcoded `8` or `12` constants
- Derives from event characteristics
- Simple linear math
- Event-specific windows

---

## Success Criteria

### Functional Requirements

1. **Realistic Readiness Scores**
   - Back-to-back marathons show appropriate fatigue (Day 2: 30-50% readiness)
   - Single isolated goals show high readiness when well-prepared (80-95%)
   - Recovery curves follow physiological expectations

2. **No Artificial Inflation**
   - No readiness scores forced to 99+
   - Scores reflect actual CTL/ATL/TSB state
   - Elite synergy boost still applies (multiplicative bonus) but doesn't override

3. **Dynamic Recovery Windows**
   - 5K races use ~10-day windows
   - Marathons use ~15-day windows
   - Ultras use ~21-day windows
   - No hardcoded constants

4. **Conflict Detection**
   - Goals within functional recovery window detected as conflicts
   - Conflicting goals don't force artificial peaks
   - Natural fatigue curves respected

### Performance Requirements

- Readiness calculation completes in <100ms for typical plans (12 weeks, 5 goals)
- No performance regression from current system
- Memory usage remains constant

### Testing Requirements

- Unit tests for all new functions (event-recovery.ts)
- Integration tests for readiness calculation with multiple goals
- Regression tests comparing old vs new behavior
- Edge case tests (3+ goals clustered, extreme durations)

### User Experience

- Users trust readiness scores as realistic assessments
- Aggressive plans show honest consequences (low readiness)
- Well-designed plans show achievable readiness (70-90%)
- No confusion about why scores changed

---

## Implementation Notes

### Scope Decisions (v1)

**Included** (High impact, low complexity):

- ✅ Remove 99+ override
- ✅ Dynamic event recovery profiles
- ✅ Post-event fatigue with simple exponential decay
- ✅ Dynamic peak windows with conflict detection

**Excluded** (Lower priority, higher complexity):

- ❌ Cumulative fatigue accumulation (edge case, add in v2 if needed)
- ❌ Bi-phasic recovery curves (marginal improvement, high complexity)
- ❌ Graduated overlap scoring (v2 enhancement)
- ❌ CTL-based peak windows (simpler intensity-based formula sufficient)

### Migration Strategy

- No breaking changes to public API
- Existing calibration parameters still respected
- Readiness scores will change (expected, document in release notes)
- No database migrations required

### Risk Mitigation

- Comprehensive test suite before deployment
- Feature flag for gradual rollout (optional)
- Monitor user feedback on readiness score changes
- Document expected behavior changes in release notes

---

## Next Steps

See `plan.md` for detailed technical implementation steps and `tasks.md` for granular task checklist.
