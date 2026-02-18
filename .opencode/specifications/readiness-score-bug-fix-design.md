# Training Plan Readiness Score Calculation - Bug Fix Design Specification

**Document Version**: 1.0  
**Date**: 2026-02-17  
**Status**: Design & Planning Phase  
**Authors**: AI Assistant, Dean Cochran  
**Reviewers**: [Pending]

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Design Philosophy & Principles](#design-philosophy--principles)
4. [Current System Analysis](#current-system-analysis)
5. [Proposed Solution Architecture](#proposed-solution-architecture)
6. [Technical Design](#technical-design)
7. [Data Flow & Architecture](#data-flow--architecture)
8. [Interface Changes](#interface-changes)
9. [Testing Strategy](#testing-strategy)
10. [Implementation Plan](#implementation-plan)
11. [Migration & Rollout Strategy](#migration--rollout-strategy)
12. [Risk Assessment](#risk-assessment)
13. [Success Criteria](#success-criteria)
14. [Appendices](#appendices)

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

---

## Problem Statement

### Context

The GradientPeak training plan system uses a sophisticated projection engine that:

1. Optimizes weekly TSS allocation using Model Predictive Control (MPC)
2. Projects CTL/ATL/TSB (fitness/fatigue/form) over the plan timeline
3. Calculates readiness scores for each day, particularly at goal dates
4. Uses goal priority to weight optimization decisions

### Critical Bug: Artificial Score Inflation

**Location**: `packages/core/plan/projectionCalculations.ts:2715-2717`

**Current Code**:

```typescript
if (state >= 70 && attainment >= 60 && alignmentLoss <= 5) {
  return Math.max(99, scoredReadiness); // Forces 99+
}
```

**Problem Description**:

- Overrides calculated readiness with artificial 99+ score
- Ignores actual CTL/ATL/TSB physiological state
- Violates design principle: readiness should be descriptive, not prescriptive
- Treats readiness as a "performance reward" rather than a "state measurement"

**Real-World Impact**:

```
User Scenario: Two 2-hour marathons scheduled one day apart
- Day 1 Marathon: Shows 99% readiness
- Day 2 Marathon: Shows 99% readiness
- Reality: Day 2 should show ~30-40% due to severe fatigue
```

**Root Cause**: Conceptual error in treating readiness as an achievement metric rather than a physiological state measurement.

---

### Bug 2: Missing Post-Event Fatigue Modeling

**Location**: `packages/core/plan/projection/readiness.ts:365-609`

**Problem Description**:

- Readiness scores don't model recovery time needed after high-intensity events
- ATL (acute training load/fatigue) accumulation from consecutive efforts not reflected
- TSB (form) recovery dynamics not captured in day-to-day scoring
- Adjacent goals treated as independent peaks rather than sequential physiological states

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

**Impact**: Users cannot accurately assess whether multiple goals are achievable within their timeline.

---

### Bug 3: Static Goal Peaking Algorithm

**Location**: `packages/core/plan/projection/readiness.ts:459-526`

**Problem Description**:

- Current implementation uses fixed `peakWindow = 12` days constant
- Forces each goal to be a local maximum regardless of adjacent goals
- Doesn't consider:
  - Event intensity (5K vs ultra-marathon have different recovery needs)
  - Goal targets (pace vs power vs race performance)
  - Dynamic recovery requirements based on actual projected workload

**Current Code**:

```typescript
const goalAnchors = goals.map((goal) => {
  const goalIndex = resolveGoalIndex(goal.target_date);
  const peakWindow = 12; // ❌ HARDCODED CONSTANT

  return {
    goalIndex,
    peakWindow,
    peakSlope: 1.6,
  };
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

### Core Design Principles

#### 1. Readiness = Physiological State Measurement

**Definition**: Readiness scores reflect the user's projected physiological preparedness at a specific point in time.

**Characteristics**:

- Pure function of CTL/ATL/TSB and preparedness metrics
- Descriptive, not prescriptive
- Independent of goal priority
- Reflects "what condition will you be in on this date"

**Analogy**: Like a thermometer measuring temperature - it reports the state, it doesn't judge whether the temperature is "good" or "bad".

**Example**:

```
User has two marathons:
- Marathon A (Priority 10): 75% readiness
- Marathon B (Priority 1): 35% readiness (day after Marathon A)

Priority 10 doesn't inflate the score to 99%.
Priority determines which goal the projection optimized for.
Readiness shows the actual physiological state at each goal.
```

---

#### 2. Goal Priority = Training Optimization Driver

**Definition**: Priority determines which goals the MPC solver optimizes for during projection planning.

**Characteristics**:

- Affects TSS allocation decisions during projection
- Higher priority goals get more weight in objective function
- Goals with same priority rank are treated equally
- Does NOT directly inflate readiness scores

**How Priority Works**:

```
MPC Objective Function:
  weightedGoalReadiness = Σ(readiness[goal] * priorityWeight[goal])

High Priority Goal (10):
  - Gets weight of 11 in objective
  - Projection allocates more TSS toward this goal
  - May sacrifice lower priority goals

Low Priority Goal (1):
  - Gets weight of 2 in objective
  - Projection may under-prepare for this goal
  - Readiness score honestly reflects under-preparation
```

**Separation of Concerns**:

- **Projection Phase**: Priority-weighted optimization of weekly TSS
- **Readiness Calculation Phase**: State-based scoring independent of priority
- **Recovery Modeling**: Dynamic based on goal characteristics

---

#### 3. Dynamic Recovery Modeling

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

**No Fixed Constants**: The system should calculate recovery dynamically, not use hardcoded "7-day window" or "12-day peak window" values.

---

#### 4. Separation of Concerns

**Clear Boundaries**:

```
┌─────────────────────────────────────────────────────────────┐
│ PROJECTION PHASE (Priority-Driven)                         │
│ - MPC Solver optimizes weekly TSS                          │
│ - Priority weights influence objective function            │
│ - Decides: "How much to train each week?"                  │
│ - Output: Weekly TSS sequence                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ CTL/ATL/TSB CALCULATION (Physics-Based)                    │
│ - Exponential weighted moving averages                     │
│ - CTL (42-day time constant), ATL (7-day time constant)    │
│ - TSB = CTL - ATL                                           │
│ - Output: Daily CTL/ATL/TSB values                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ READINESS CALCULATION (State-Based)                        │
│ - Pure function of CTL/ATL/TSB                             │
│ - Independent of goal priority                             │
│ - Applies post-event fatigue modeling                      │
│ - Output: Daily readiness scores                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ RECOVERY MODELING (Dynamic)                                 │
│ - Calculates recovery profiles from goal targets           │
│ - Applies fatigue penalties after events                   │
│ - No fixed constants                                        │
│ - Output: Recovery-adjusted readiness                      │
└─────────────────────────────────────────────────────────────┘
```

**Why This Matters**:

- Each phase has a single responsibility
- Changes to one phase don't break others
- Easy to test and validate each component
- Clear data flow and dependencies

---

#### 5. No Realism Penalties for Extreme Configurations

**Principle**: The system allows users to create aggressive or extreme training plans without artificial penalties.

**Rationale**:

- Users may have valid reasons for aggressive plans (experienced athletes, specific circumstances)
- Readiness scores should reflect the projected state, not judge feasibility
- If a user wants to attempt back-to-back marathons, show them the realistic readiness, don't artificially penalize

**What This Means**:

```
❌ WRONG: "This plan is too aggressive, applying 30% penalty to all scores"
✅ CORRECT: "Based on projection, Day 2 marathon readiness is 35% due to fatigue"

❌ WRONG: "Initial CTL too low, reducing readiness by 20%"
✅ CORRECT: "Projection shows CTL growth of 15/week (above safe 8/week),
            resulting in high ATL and lower readiness"
```

**The Difference**:

- No artificial penalties based on "rules" or "thresholds"
- Natural consequences emerge from physiological modeling (CTL/ATL/TSB dynamics)
- Users see realistic outcomes, make informed decisions

---

## Current System Analysis

### System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Training Plan Creation Input                                    │
│ - Timeline (start/end dates)                                    │
│ - Goals (dates, priorities, targets)                            │
│ - Blocks (phases, TSS ranges)                                   │
│ - Starting CTL/ATL                                              │
│ - Configuration (optimization profile, constraints)             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ buildDeterministicProjectionPayload()                           │
│ Location: packages/core/plan/projectionCalculations.ts          │
│                                                                  │
│ 1. Resolve starting state (CTL/ATL bootstrap)                   │
│ 2. Build microcycle structure (weekly planning)                 │
│ 3. For each week:                                               │
│    a. MPC Solver optimizes weekly TSS                           │
│    b. Apply safety caps (max ramp rates)                        │
│    c. Calculate CTL/ATL/TSB                                     │
│ 4. Calculate readiness scores                                   │
│ 5. Assess goals                                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ MPC Solver (Weekly TSS Optimization)                            │
│ Location: packages/core/plan/projection/mpc/solver.ts           │
│                                                                  │
│ - Generates candidate TSS values                                │
│ - Evaluates each candidate:                                     │
│   * Simulates CTL/ATL/TSB over lookahead window                 │
│   * Calculates readiness at goal dates                          │
│   * Applies priority weights                                    │
│   * Computes objective score                                    │
│ - Selects best candidate                                        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Readiness Score Calculation                                     │
│ Location: packages/core/plan/projection/readiness.ts            │
│                                                                  │
│ 1. computeProjectionPointReadinessScores()                      │
│    - Calculate base readiness from CTL/ATL/TSB                  │
│    - Apply smoothing                                            │
│    - Force goal peaking (12-day window) ← BUG HERE              │
│    - Anchor to plan readiness score                             │
│                                                                  │
│ 2. computeGoalReadinessScore()                                  │
│    - Blend state + target attainment                            │
│    - Apply elite synergy boost                                  │
│    - OVERRIDE TO 99+ ← BUG HERE                                 │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Goal Assessment                                                 │
│ Location: packages/core/plan/scoring/goalScore.ts               │
│                                                                  │
│ - Score each goal's targets                                     │
│ - Aggregate to goal score                                       │
│ - Return goal assessments with readiness                        │
└─────────────────────────────────────────────────────────────────┘
```

---

### Key Files & Functions

#### 1. Projection Calculations

**File**: `packages/core/plan/projectionCalculations.ts` (3,891 lines)

**Key Functions**:

- `buildDeterministicProjectionPayload()` (line 2742): Main entry point
- `computeGoalReadinessScore()` (line 2692): **BUG LOCATION #1**
- `resolveGoalDateReadiness()` (line 2646): Finds readiness at goal date
- `resolveGoalAlignmentLoss()` (line 2668): Calculates alignment penalty
- `evaluateWeeklyTssCandidateObjectiveDetails()` (line 2296): MPC objective evaluation

**Bug Location**:

```typescript
// Line 2692-2720
function computeGoalReadinessScore(input: {
  stateReadinessScore: number;
  targetAttainmentScore: number;
  goalAlignmentLoss: number;
}): number {
  // ... calculation ...

  // ❌ BUG: Artificial override
  if (state >= 70 && attainment >= 60 && alignmentLoss <= 5) {
    return Math.max(99, scoredReadiness);
  }

  return scoredReadiness;
}
```

---

#### 2. Readiness Calculations

**File**: `packages/core/plan/projection/readiness.ts` (610 lines)

**Key Functions**:

- `computeProjectionPointReadinessScores()` (line 365): **BUG LOCATION #2**
- `computeCompositeReadiness()` (line 123): Plan-level readiness
- `computeDurabilityScore()` (line 78): Monotony/strain penalties
- `computeProjectionFeasibilityMetadata()` (line 233): Demand gap analysis

**Bug Location**:

```typescript
// Line 459-470: Static goal anchors
const goalAnchors = goals.map((goal) => {
  const goalIndex = resolveGoalIndex(goal.target_date);
  const peakWindow = 12; // ❌ BUG: Hardcoded constant

  return {
    goalIndex,
    peakWindow,
    peakSlope: 1.6,
  };
});

// Line 491-526: Forced local maxima
for (const anchor of goalAnchors) {
  // ❌ BUG: Forces every goal to be a local peak
  optimized[anchor.goalIndex] = clampScore(
    Math.max(optimized[anchor.goalIndex] ?? 0, requiredPeak),
  );

  // Suppresses nearby scores
  for (let i = start; i <= end; i += 1) {
    const cap = goalScore - (peakWindow - dayDistance) * peakSlope;
    optimized[i] = Math.min(optimized[i] ?? 0, cap);
  }
}
```

---

#### 3. Goal Scoring

**File**: `packages/core/plan/scoring/goalScore.ts` (104 lines)

**Key Functions**:

- `scoreGoalAssessment()` (line 62): Aggregates target scores to goal score

**File**: `packages/core/plan/scoring/targetSatisfaction.ts` (296 lines)

**Key Functions**:

- `scoreTargetSatisfaction()` (line 125): Scores individual targets
- Uses probabilistic attainment distributions (normal CDF)

---

#### 4. MPC Solver

**File**: `packages/core/plan/projection/mpc/solver.ts` (126 lines)

**Key Functions**:

- `solveDeterministicBoundedMpc()` (line 58): Main solver
- Generates candidate lattice, evaluates each, picks best

**File**: `packages/core/plan/projection/mpc/objective.ts` (89 lines)

**Key Functions**:

- `evaluateMpcObjective()` (line 51): Computes objective score
- Weights: goal attainment, readiness, risk, volatility, etc.

---

### Data Flow Analysis

#### Current Flow (With Bugs)

```
1. User Input
   ├─ Goals: [{date: "2026-03-14", priority: 5, targets: [marathon]},
   │          {date: "2026-03-15", priority: 5, targets: [marathon]}]
   ├─ Starting CTL: 35
   └─ Timeline: 12 weeks

2. Projection Phase
   ├─ Week 1-11: MPC optimizes TSS (priority-weighted)
   │  └─ Both goals have priority 5 → equal weight
   ├─ Week 12: Taper for both goals
   └─ Output: CTL reaches ~65, ATL ~60

3. CTL/ATL/TSB Calculation
   ├─ Day 13 (Marathon A): CTL=65, ATL=60, TSB=5
   └─ Day 14 (Marathon B): CTL=65, ATL=62, TSB=3
      (ATL slightly higher from Day 13 effort)

4. Base Readiness Calculation
   ├─ Day 13: formSignal=0.85, fitnessSignal=0.75 → base=82%
   └─ Day 14: formSignal=0.80, fitnessSignal=0.75 → base=80%

5. Goal Peaking Algorithm ❌ BUG
   ├─ Marathon A: peakWindow=12, forced to local max → 85%
   └─ Marathon B: peakWindow=12, forced to local max → 85%
      (Both forced to be peaks, ignoring 1-day gap)

6. Goal Readiness Score ❌ BUG
   ├─ Marathon A: state=85, attainment=70, alignmentLoss=2
   │  └─ Triggers override: return Math.max(99, 85) → 99%
   └─ Marathon B: state=85, attainment=70, alignmentLoss=2
      └─ Triggers override: return Math.max(99, 85) → 99%

7. Final Output ❌ WRONG
   ├─ Marathon A: 99% readiness
   └─ Marathon B: 99% readiness
      (Both show 99%, ignoring physiological impossibility)
```

---

#### Expected Flow (Without Bugs)

```
1. User Input
   [Same as above]

2. Projection Phase
   [Same as above]

3. CTL/ATL/TSB Calculation
   [Same as above]

4. Base Readiness Calculation
   [Same as above]

5. Dynamic Recovery Modeling ✅ NEW
   ├─ Marathon A (Day 13):
   │  ├─ Calculate recovery profile:
   │  │  └─ Duration: 3.5 hrs → recovery_full: 12 days
   │  └─ No prior events → no fatigue penalty
   │
   └─ Marathon B (Day 14):
      ├─ Calculate recovery profile:
      │  └─ Duration: 3.5 hrs → recovery_full: 12 days
      ├─ Check prior events:
      │  └─ Marathon A was 1 day ago
      ├─ Calculate fatigue penalty:
      │  ├─ daysAfterEvent: 1
      │  ├─ recoveryHalfLife: 4 days
      │  ├─ decayFactor: 0.5^(1/4) = 0.84
      │  ├─ atlRatio: 62/65 = 0.95
      │  ├─ basePenalty: 75 * 0.5 = 37.5
      │  └─ totalPenalty: 37.5 * 0.84 = 31.5%
      └─ Apply penalty: 80% - 31.5% = 48.5%

6. Goal Peaking Algorithm ✅ FIXED
   ├─ Marathon A:
   │  ├─ peakWindow: dynamic (8 + 12*0.7 = 16 days)
   │  ├─ hasConflictingGoal: true (Marathon B 1 day later)
   │  └─ allowNaturalFatigue: true → don't force peak
   │
   └─ Marathon B:
      ├─ peakWindow: dynamic (16 days)
      ├─ hasConflictingGoal: true (Marathon A 1 day prior)
      └─ allowNaturalFatigue: true → let fatigue model handle it

7. Goal Readiness Score ✅ FIXED
   ├─ Marathon A: state=82, attainment=70, alignmentLoss=2
   │  ├─ blended: 82*0.55 + 75*0.45 = 78.85
   │  ├─ eliteSynergyBoost: 25 * 0.82² * 0.75² = 9.45
   │  ├─ alignmentPenalty: 2 * 0.2 = 0.4
   │  └─ readiness: 78.85 + 9.45 - 0.4 = 87.9% → 88%
   │
   └─ Marathon B: state=48.5, attainment=70, alignmentLoss=2
      ├─ blended: 48.5*0.55 + 75*0.45 = 60.43
      ├─ eliteSynergyBoost: 25 * 0.485² * 0.75² = 3.30
      ├─ alignmentPenalty: 2 * 0.2 = 0.4
      └─ readiness: 60.43 + 3.30 - 0.4 = 63.33% → 63%
         (But with fatigue: 48.5% from step 5)

8. Final Output ✅ CORRECT
   ├─ Marathon A: 88% readiness (challenging but achievable)
   └─ Marathon B: 48% readiness (severe fatigue from Day 1)
      (Realistic scores reflecting physiological constraints)
```

---

### Priority Weighting in MPC

**How Priority Currently Works** (This is CORRECT, keep it):

```typescript
// In evaluateWeeklyTssCandidateObjectiveDetails() - Line 2486-2489
for (const goal of goalsInWindow) {
  const priorityWeight = getPriorityInfluenceWeight(goal.priority);
  weightedGoalReadiness +=
    (readinessScores[nearestIndex] ?? 0) * priorityWeight;
  weightedGoalCount += priorityWeight;
}

// getPriorityInfluenceWeight() - Line 1049-1052
function getPriorityInfluenceWeight(priority: number | undefined): number {
  const normalizedPriority = normalizePriority(priority); // 0-10
  return normalizedPriority + 1; // Returns 1-11
}
```

**Example**:

```
Goal A (Priority 10): weight = 11
Goal B (Priority 1):  weight = 2

If both have 70% readiness:
  weightedGoalReadiness = (70 * 11) + (70 * 2) = 770 + 140 = 910
  weightedGoalCount = 11 + 2 = 13
  normalizedGoalReadiness = 910 / 13 = 70%

If Goal A has 80%, Goal B has 50%:
  weightedGoalReadiness = (80 * 11) + (50 * 2) = 880 + 100 = 980
  weightedGoalCount = 13
  normalizedGoalReadiness = 980 / 13 = 75.4%

This higher score makes the MPC solver prefer TSS allocations that
optimize for Goal A (priority 10) over Goal B (priority 1).
```

**Key Point**: Priority affects the MPC solver's decisions (which TSS to allocate), but does NOT inflate the final readiness scores shown to users.

---

## Proposed Solution Architecture

### Solution Overview

The fix consists of three main components:

1. **Remove Elite Synergy Boost Override**: Allow natural score calculation
2. **Implement Dynamic Event Recovery Model**: Calculate recovery from goal targets
3. **Update Goal Peaking Algorithm**: Use dynamic recovery windows instead of static constants

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

### Component Design

#### Component 1: Event Recovery Model

**Purpose**: Dynamically calculate recovery requirements based on goal targets.

**Location**: New file `packages/core/plan/projection/event-recovery.ts`

**Key Concepts**:

- **Recovery Profile**: Describes how long recovery takes for a specific event
- **Fatigue Decay**: Exponential recovery curve (fast initial recovery, slower later)
- **Event Intensity**: Estimated from target type, duration, and effort level

**Public API**:

```typescript
export interface EventRecoveryProfile {
  recovery_days_full: number; // Days to full recovery (TSB back to baseline)
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

---

#### Component 2: Modified Readiness Calculation

**Purpose**: Integrate recovery modeling into readiness score calculation.

**Location**: `packages/core/plan/projection/readiness.ts`

**Changes**:

1. Add post-event fatigue application in `computeProjectionPointReadinessScores()`
2. Modify goal anchoring to use dynamic recovery windows
3. Detect conflicting goals and allow natural fatigue curves

**Modified Function Signature**:

```typescript
export interface ProjectionPointReadinessGoalInput {
  target_date: string;
  priority?: number;
  targets?: GoalTargetV2[]; // ✅ ADDED
}

export function computeProjectionPointReadinessScores(input: {
  points: ProjectionPointReadinessInput[];
  planReadinessScore?: number;
  goals?: ProjectionPointReadinessGoalInput[]; // Now includes targets
  timeline_calibration?: TrainingPlanCalibrationConfig["readiness_timeline"];
}): number[];
```

---

#### Component 3: Fixed Goal Readiness Score

**Purpose**: Remove artificial override, return actual calculation.

**Location**: `packages/core/plan/projectionCalculations.ts`

**Changes**:

1. Remove `if (state >= 70 && attainment >= 60 && alignmentLoss <= 5)` override
2. Keep existing blend + synergy boost formula
3. Return actual calculated value

**Modified Function**:

```typescript
function computeGoalReadinessScore(input: {
  stateReadinessScore: number;
  targetAttainmentScore: number;
  goalAlignmentLoss: number;
}): number {
  // ... existing calculation ...

  const blended = state * 0.55 + nonlinearAttainment * 0.45;
  const eliteSynergyBoost =
    25 *
    Math.pow(stateNormalized, 2) *
    Math.pow(nonlinearAttainmentNormalized, 2);
  const alignmentPenalty = alignmentLoss * 0.2;

  // ✅ CHANGED: Return actual calculation, no override
  return round1(
    Math.max(0, Math.min(100, blended + eliteSynergyBoost - alignmentPenalty)),
  );
}
```

---

## Technical Design

### Phase 1: Remove Elite Synergy Boost Override

**Objective**: Eliminate artificial score inflation.

**File**: `packages/core/plan/projectionCalculations.ts`

**Current Code** (Lines 2692-2720):

```typescript
function computeGoalReadinessScore(input: {
  stateReadinessScore: number;
  targetAttainmentScore: number;
  goalAlignmentLoss: number;
}): number {
  const state = Math.max(0, Math.min(100, input.stateReadinessScore));
  const attainment = Math.max(0, Math.min(100, input.targetAttainmentScore));
  const alignmentLoss = Math.max(0, Math.min(100, input.goalAlignmentLoss));
  const attainmentNormalized = attainment / 100;
  const nonlinearAttainment = Math.pow(attainmentNormalized, 1.4) * 100;
  const stateNormalized = state / 100;
  const nonlinearAttainmentNormalized = nonlinearAttainment / 100;

  const blended = state * 0.55 + nonlinearAttainment * 0.45;
  const eliteSynergyBoost =
    25 *
    Math.pow(stateNormalized, 2) *
    Math.pow(nonlinearAttainmentNormalized, 2);
  const alignmentPenalty = alignmentLoss * 0.2;
  const scoredReadiness = round1(
    Math.max(0, Math.min(100, blended + eliteSynergyBoost - alignmentPenalty)),
  );

  // ❌ REMOVE THIS BLOCK
  if (state >= 70 && attainment >= 60 && alignmentLoss <= 5) {
    return Math.max(99, scoredReadiness);
  }

  return scoredReadiness;
}
```

**New Code**:

```typescript
function computeGoalReadinessScore(input: {
  stateReadinessScore: number;
  targetAttainmentScore: number;
  goalAlignmentLoss: number;
}): number {
  const state = Math.max(0, Math.min(100, input.stateReadinessScore));
  const attainment = Math.max(0, Math.min(100, input.targetAttainmentScore));
  const alignmentLoss = Math.max(0, Math.min(100, input.goalAlignmentLoss));
  const attainmentNormalized = attainment / 100;
  const nonlinearAttainment = Math.pow(attainmentNormalized, 1.4) * 100;
  const stateNormalized = state / 100;
  const nonlinearAttainmentNormalized = nonlinearAttainment / 100;

  const blended = state * 0.55 + nonlinearAttainment * 0.45;
  const eliteSynergyBoost =
    25 *
    Math.pow(stateNormalized, 2) *
    Math.pow(nonlinearAttainmentNormalized, 2);
  const alignmentPenalty = alignmentLoss * 0.2;

  // ✅ CHANGED: Return actual calculation, no override
  return round1(
    Math.max(0, Math.min(100, blended + eliteSynergyBoost - alignmentPenalty)),
  );
}
```

**Impact**:

- Readiness scores will reflect actual mathematical calculation
- Removes artificial 99+ ceiling
- Preserves existing synergy boost formula (multiplicative bonus for high performance)
- Just removes the override that forced minimum 99

**Testing**:

```typescript
describe("computeGoalReadinessScore - elite synergy boost removal", () => {
  it("returns calculated score without override", () => {
    const result = computeGoalReadinessScore({
      stateReadinessScore: 85,
      targetAttainmentScore: 70,
      goalAlignmentLoss: 2,
    });

    // Should return ~88%, not 99%
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
});
```

---

### Phase 2: Dynamic Event Recovery Model

**Objective**: Calculate recovery requirements dynamically from goal targets.

**New File**: `packages/core/plan/projection/event-recovery.ts`

**Type Definitions**:

```typescript
import type { GoalTargetV2 } from "../../schemas/training_plan_structure";
import type { ProjectionPointReadinessInput } from "./readiness";

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

**Implementation**:

```typescript
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function diffDateOnlyUtcDays(fromDate: string, toDate: string): number {
  const fromMs = Date.parse(`${fromDate}T00:00:00.000Z`);
  const toMs = Date.parse(`${toDate}T00:00:00.000Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return 0;
  }
  return Math.round((toMs - fromMs) / 86400000);
}

/**
 * Estimate race intensity based on duration and distance.
 * Returns 0-100 scale where 100 = maximum intensity.
 */
function estimateRaceIntensity(input: {
  distance_m: number;
  duration_s: number;
  activity: "run" | "bike" | "swim" | "other";
}): number {
  const durationHours = input.duration_s / 3600;
  const speedMps = input.distance_m / input.duration_s;

  // Intensity decreases with duration (can't sustain max effort for long)
  // But increases with speed relative to typical paces

  // Base intensity from duration
  let baseIntensity = 100;
  if (durationHours > 24) {
    baseIntensity = 70; // Multi-day events
  } else if (durationHours > 12) {
    baseIntensity = 75; // 12-24 hour events
  } else if (durationHours > 6) {
    baseIntensity = 80; // 6-12 hour ultras
  } else if (durationHours > 3) {
    baseIntensity = 85; // 3-6 hour events (marathon+)
  } else if (durationHours > 1) {
    baseIntensity = 90; // 1-3 hour events (half marathon)
  } else {
    baseIntensity = 95; // <1 hour events (5K, 10K)
  }

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

/**
 * Dynamically calculate recovery profile based on goal target.
 *
 * Recovery time scales with:
 * - Event duration (longer = more recovery)
 * - Event intensity (harder = more recovery)
 * - Individual fitness (higher CTL = faster recovery)
 */
export function computeEventRecoveryProfile(
  input: EventRecoveryInput,
): EventRecoveryProfile {
  switch (input.target.target_type) {
    case "race_performance": {
      const durationHours = input.target.target_time_s / 3600;
      const intensity = estimateRaceIntensity({
        distance_m: input.target.distance_m,
        duration_s: input.target.target_time_s,
        activity: input.target.activity_category,
      });

      // Base recovery scales with duration
      // Formula: min(28, max(2, duration * 3.5))
      // - 5K (0.5hr): 2 days
      // - Half marathon (1.5hr): 5 days
      // - Marathon (3.5hr): 12 days
      // - 50K (6hr): 21 days
      // - 100-mile (24hr): 28 days (capped)
      const baseDays = Math.min(28, Math.max(2, durationHours * 3.5));

      // Adjust for intensity
      const intensityFactor = intensity / 100;
      const recoveryDaysFull = Math.round(
        baseDays * (0.7 + intensityFactor * 0.3),
      );

      // Functional recovery is ~40% of full recovery
      const recoveryDaysFunctional = Math.round(baseDays * 0.4);

      // ATL spike factor: longer events cause bigger spikes
      const atlSpikeFactor = 1 + durationHours * 0.15;

      return {
        recovery_days_full: recoveryDaysFull,
        recovery_days_functional: recoveryDaysFunctional,
        fatigue_intensity: intensity,
        atl_spike_factor: Math.min(2.5, atlSpikeFactor),
      };
    }

    case "pace_threshold":
    case "power_threshold": {
      // Threshold tests are shorter but intense
      const testDurationHours = input.target.test_duration_s / 3600;
      const baseDays = 3 + testDurationHours * 2;

      return {
        recovery_days_full: Math.round(baseDays),
        recovery_days_functional: Math.round(baseDays * 0.35),
        fatigue_intensity: 75,
        atl_spike_factor: 1.2,
      };
    }

    case "hr_threshold": {
      // HR threshold tests are relatively low impact
      return {
        recovery_days_full: 3,
        recovery_days_functional: 1,
        fatigue_intensity: 65,
        atl_spike_factor: 1.1,
      };
    }
  }
}

/**
 * Calculate readiness penalty for points after an event.
 *
 * Uses exponential decay curve:
 * - Day 1 after marathon: ~35-40% penalty
 * - Day 3: ~20-25% penalty
 * - Day 7: ~8-10% penalty
 * - Day 14: ~2-3% penalty
 *
 * Penalty scales with:
 * - Event intensity (harder events = bigger penalty)
 * - ATL/CTL ratio (higher fatigue = bigger penalty)
 * - Days since event (exponential decay)
 */
export function computePostEventFatiguePenalty(
  input: PostEventFatigueInput,
): number {
  const daysAfterEvent = diffDateOnlyUtcDays(
    input.eventGoal.target_date,
    input.currentDate,
  );

  // Only penalize after event, not before
  if (daysAfterEvent <= 0) return 0;

  // Get primary target (first target in list)
  const primaryTarget = input.eventGoal.targets[0];
  if (!primaryTarget) return 0;

  // Calculate recovery profile for this event
  const recoveryProfile = computeEventRecoveryProfile({
    target: primaryTarget,
    projected_ctl_at_event: input.eventGoal.projected_ctl,
    projected_atl_at_event: input.eventGoal.projected_atl,
  });

  // Exponential decay curve
  // Half-life = 1/3 of full recovery time
  // Example: 12-day recovery → 4-day half-life
  const recoveryHalfLife = recoveryProfile.recovery_days_full / 3;
  const decayFactor = Math.pow(0.5, daysAfterEvent / recoveryHalfLife);

  // Check current ATL/CTL ratio for overload penalty
  const atlRatio =
    input.currentPoint.predicted_fatigue_atl /
    Math.max(1, input.currentPoint.predicted_fitness_ctl);
  const atlOverloadPenalty = Math.max(0, (atlRatio - 1) * 30);

  // Base penalty from event intensity
  // Scale: 0-50 range (50% max base penalty)
  const basePenalty = recoveryProfile.fatigue_intensity * 0.5;

  // Total penalty with decay
  const totalPenalty = (basePenalty + atlOverloadPenalty) * decayFactor;

  // Cap at 60% penalty (even day 1 after ultra shouldn't zero out readiness)
  return Math.min(60, totalPenalty);
}
```

**Testing**:

```typescript
describe("Event Recovery Model", () => {
  describe("computeEventRecoveryProfile", () => {
    it("calculates short recovery for 5K race", () => {
      const profile = computeEventRecoveryProfile({
        target: {
          target_type: "race_performance",
          activity_category: "run",
          distance_m: 5000,
          target_time_s: 1200, // 20 minutes
        },
        projected_ctl_at_event: 50,
        projected_atl_at_event: 48,
      });

      expect(profile.recovery_days_full).toBeGreaterThanOrEqual(2);
      expect(profile.recovery_days_full).toBeLessThanOrEqual(4);
      expect(profile.recovery_days_functional).toBeLessThanOrEqual(2);
    });

    it("calculates long recovery for marathon", () => {
      const profile = computeEventRecoveryProfile({
        target: {
          target_type: "race_performance",
          activity_category: "run",
          distance_m: 42195,
          target_time_s: 12600, // 3.5 hours
        },
        projected_ctl_at_event: 65,
        projected_atl_at_event: 60,
      });

      expect(profile.recovery_days_full).toBeGreaterThanOrEqual(10);
      expect(profile.recovery_days_full).toBeLessThanOrEqual(14);
      expect(profile.recovery_days_functional).toBeGreaterThanOrEqual(4);
      expect(profile.recovery_days_functional).toBeLessThanOrEqual(6);
    });

    it("calculates very long recovery for 24-hour ultra", () => {
      const profile = computeEventRecoveryProfile({
        target: {
          target_type: "race_performance",
          activity_category: "run",
          distance_m: 160934, // 100 miles
          target_time_s: 86400, // 24 hours
        },
        projected_ctl_at_event: 80,
        projected_atl_at_event: 75,
      });

      expect(profile.recovery_days_full).toBeGreaterThanOrEqual(21);
      expect(profile.recovery_days_full).toBeLessThanOrEqual(28);
      expect(profile.recovery_days_functional).toBeGreaterThanOrEqual(10);
    });
  });

  describe("computePostEventFatiguePenalty", () => {
    it("applies heavy penalty day after marathon", () => {
      const penalty = computePostEventFatiguePenalty({
        currentDate: "2026-03-15",
        currentPoint: {
          date: "2026-03-15",
          predicted_fitness_ctl: 65,
          predicted_fatigue_atl: 68,
          predicted_form_tsb: -3,
        },
        eventGoal: {
          target_date: "2026-03-14",
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
          projected_ctl: 65,
          projected_atl: 60,
        },
      });

      expect(penalty).toBeGreaterThan(30);
      expect(penalty).toBeLessThan(50);
    });

    it("applies moderate penalty 3 days after marathon", () => {
      const penalty = computePostEventFatiguePenalty({
        currentDate: "2026-03-17",
        currentPoint: {
          date: "2026-03-17",
          predicted_fitness_ctl: 64,
          predicted_fatigue_atl: 62,
          predicted_form_tsb: 2,
        },
        eventGoal: {
          target_date: "2026-03-14",
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
          projected_ctl: 65,
          projected_atl: 60,
        },
      });

      expect(penalty).toBeGreaterThan(15);
      expect(penalty).toBeLessThan(30);
    });

    it("applies minimal penalty 2 weeks after marathon", () => {
      const penalty = computePostEventFatiguePenalty({
        currentDate: "2026-03-28",
        currentPoint: {
          date: "2026-03-28",
          predicted_fitness_ctl: 66,
          predicted_fatigue_atl: 58,
          predicted_form_tsb: 8,
        },
        eventGoal: {
          target_date: "2026-03-14",
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
          projected_ctl: 65,
          projected_atl: 60,
        },
      });

      expect(penalty).toBeLessThan(10);
    });

    it("applies no penalty before event", () => {
      const penalty = computePostEventFatiguePenalty({
        currentDate: "2026-03-13",
        currentPoint: {
          date: "2026-03-13",
          predicted_fitness_ctl: 65,
          predicted_fatigue_atl: 60,
          predicted_form_tsb: 5,
        },
        eventGoal: {
          target_date: "2026-03-14",
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
          projected_ctl: 65,
          projected_atl: 60,
        },
      });

      expect(penalty).toBe(0);
    });
  });
});
```

---

### Phase 3: Integrate Recovery into Readiness Calculation

**Objective**: Apply dynamic recovery modeling across all goals in timeline.

**File**: `packages/core/plan/projection/readiness.ts`

**Type Changes**:

```typescript
// Add targets field to goal input
export interface ProjectionPointReadinessGoalInput {
  target_date: string;
  priority?: number;
  targets?: GoalTargetV2[]; // ✅ ADDED
}
```

**Modified Function** (Lines 365-609):

```typescript
import { computePostEventFatiguePenalty } from "./event-recovery";
import type { GoalTargetV2 } from "../../schemas/training_plan_structure";

export function computeProjectionPointReadinessScores(input: {
  points: ProjectionPointReadinessInput[];
  planReadinessScore?: number;
  goals?: ProjectionPointReadinessGoalInput[];
  timeline_calibration?: TrainingPlanCalibrationConfig["readiness_timeline"];
}): number[] {
  if (input.points.length === 0) {
    return [];
  }

  // Step 1: Calculate base readiness from CTL/ATL/TSB (EXISTING LOGIC)
  const peakProjectedCtl = Math.max(
    1,
    ...input.points.map((point) => Math.max(0, point.predicted_fitness_ctl)),
  );
  const startingProjectedCtl = Math.max(
    0,
    input.points[0]?.predicted_fitness_ctl ?? 0,
  );
  const feasibilitySignal = clamp01((input.planReadinessScore ?? 50) / 100);

  const goals = input.goals ?? [];
  const timelineCalibration = input.timeline_calibration;
  const targetTsb = timelineCalibration?.target_tsb ?? 8;
  const formTolerance = timelineCalibration?.form_tolerance ?? 20;
  const fatigueOverflowScale =
    timelineCalibration?.fatigue_overflow_scale ?? 0.4;
  const feasibilityBlendWeight =
    timelineCalibration?.feasibility_blend_weight ?? 0.15;

  const rawScores = input.points.map((point) => {
    const ctl = Math.max(0, point.predicted_fitness_ctl);
    const atl = Math.max(0, point.predicted_fatigue_atl);
    const tsb = point.predicted_form_tsb;

    const ctlProgress = clamp01(
      (ctl - startingProjectedCtl) /
        Math.max(1, peakProjectedCtl - startingProjectedCtl),
    );
    const progressiveFitnessSignal = clamp01(Math.pow(ctlProgress, 1.35));
    const absoluteFitnessSignal = clamp01(
      ctl / Math.max(1, peakProjectedCtl * 1.15),
    );
    const fitnessSignal = clamp01(
      progressiveFitnessSignal * 0.7 + absoluteFitnessSignal * 0.3,
    );
    const formSignal = clamp01(1 - Math.abs(tsb - targetTsb) / formTolerance);

    const fatigueOverflow = Math.max(0, atl - ctl);
    const fatigueSignal = clamp01(
      1 -
        fatigueOverflow / Math.max(1, peakProjectedCtl * fatigueOverflowScale),
    );

    const readinessSignal =
      formSignal * 0.5 + fitnessSignal * 0.3 + fatigueSignal * 0.2;
    const blendedSignal =
      readinessSignal * (1 - feasibilityBlendWeight) +
      feasibilitySignal * feasibilityBlendWeight;

    return clampScore(blendedSignal * 100);
  });

  // ✅ NEW: Step 2 - Apply post-event fatigue for each goal
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
      // If multiple events recently, the one causing most fatigue dominates
      maxFatiguePenalty = Math.max(maxFatiguePenalty, penalty);
    }

    return clampScore(baseScore - maxFatiguePenalty);
  });

  // Step 3: Apply smoothing and goal peaking (MODIFIED - see Phase 4)
  if (goals.length === 0) {
    return fatigueAdjustedScores; // Use fatigue-adjusted instead of raw
  }

  // ... rest of existing smoothing and anchoring logic ...
  // (Use fatigueAdjustedScores as input instead of rawScores)
}
```

**Caller Changes** (`projectionCalculations.ts` line 3584):

```typescript
// BEFORE:
const finalPointReadinessScores = computeProjectionPointReadinessScores({
  points,
  planReadinessScore: compositeReadiness.readiness_score,
  goals: goalMarkers,
  timeline_calibration: calibration.readiness_timeline,
});

// AFTER:
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

---

### Phase 4: Update Goal Peaking Algorithm

**Objective**: Use dynamic recovery windows instead of static constants.

**File**: `packages/core/plan/projection/readiness.ts`

**Modified Code** (Lines 459-526):

```typescript
import { computeEventRecoveryProfile } from "./event-recovery";

// Inside computeProjectionPointReadinessScores(), after fatigue adjustment:

const resolveGoalIndex = (targetDate: string): number => {
  const exactIndex = input.points.findIndex(
    (point) => point.date === targetDate,
  );
  if (exactIndex >= 0) {
    return exactIndex;
  }

  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestIndex = 0;
  for (let i = 0; i < input.points.length; i += 1) {
    const candidatePoint = input.points[i];
    if (!candidatePoint) {
      continue;
    }

    const distance = Math.abs(
      diffDateOnlyUtcDays(candidatePoint.date, targetDate),
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }

  return nearestIndex;
};

// ✅ MODIFIED: Calculate dynamic peak windows based on recovery profiles
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

    // ✅ CHANGED: Dynamic peak window
    // Pre-taper (8 days) + post-recovery (70% of full recovery)
    // Example: Marathon (12-day recovery) → 8 + 8.4 = 16-day window
    const peakWindow = Math.round(8 + recoveryProfile.recovery_days_full * 0.7);

    // ✅ NEW: Check if other goals are within this goal's functional recovery window
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

let optimized = [...fatigueAdjustedScores]; // ✅ Use fatigue-adjusted scores
const iterations = timelineCalibration?.smoothing_iterations ?? 24;
const smoothingLambda = timelineCalibration?.smoothing_lambda ?? 0.28;
const maxStepDelta = timelineCalibration?.max_step_delta ?? 9;

for (let iteration = 0; iteration < iterations; iteration += 1) {
  // Smoothing pass (EXISTING LOGIC)
  const smoothed = [...optimized];
  for (let i = 1; i < optimized.length - 1; i += 1) {
    const left = optimized[i - 1] ?? optimized[i] ?? 0;
    const center = optimized[i] ?? 0;
    const right = optimized[i + 1] ?? optimized[i] ?? 0;
    const prior = fatigueAdjustedScores[i] ?? center; // ✅ Use fatigue-adjusted
    const updated =
      (prior + smoothingLambda * left + smoothingLambda * right) /
      (1 + 2 * smoothingLambda);
    smoothed[i] = clampScore(updated);
  }
  optimized = smoothed;

  // ✅ MODIFIED: Goal anchoring with conflict detection
  for (const anchor of goalAnchors) {
    const start = Math.max(0, anchor.goalIndex - anchor.peakWindow);
    const end = Math.min(
      optimized.length - 1,
      anchor.goalIndex + anchor.peakWindow,
    );

    // ✅ CHANGED: Only force local max if no conflicting goals
    if (!anchor.allowNaturalFatigue) {
      let localMax = 0;
      for (let i = start; i <= end; i += 1) {
        localMax = Math.max(localMax, optimized[i] ?? 0);
      }

      const requiredPeak = localMax;
      optimized[anchor.goalIndex] = clampScore(
        Math.max(optimized[anchor.goalIndex] ?? 0, requiredPeak),
      );
    }
    // For conflicting goals, let the fatigue model handle it naturally
    // Don't force this goal to be a local maximum

    // Still apply suppression around the goal (EXISTING LOGIC)
    const goalScore = optimized[anchor.goalIndex] ?? 0;
    for (let i = start; i <= end; i += 1) {
      if (i === anchor.goalIndex) {
        continue;
      }

      const dayDistance = Math.abs(
        diffDateOnlyUtcDays(
          input.points[i]?.date ?? "",
          input.points[anchor.goalIndex]?.date ?? "",
        ),
      );
      const cap = clampScore(
        goalScore -
          Math.max(0, anchor.peakWindow - dayDistance) * anchor.peakSlope,
      );
      optimized[i] = Math.min(optimized[i] ?? 0, cap);
    }
  }

  // Gradient constraints (EXISTING LOGIC)
  for (let i = 1; i < optimized.length; i += 1) {
    const prev = optimized[i - 1] ?? 0;
    optimized[i] = clampScore(
      Math.min(
        prev + maxStepDelta,
        Math.max(prev - maxStepDelta, optimized[i] ?? prev),
      ),
    );
  }
  for (let i = optimized.length - 2; i >= 0; i -= 1) {
    const next = optimized[i + 1] ?? 0;
    optimized[i] = clampScore(
      Math.min(
        next + maxStepDelta,
        Math.max(next - maxStepDelta, optimized[i] ?? next),
      ),
    );
  }

  // Blend with raw scores (EXISTING LOGIC)
  optimized = optimized.map(
    (value, i) =>
      clampScore((value ?? 0) * 0.9 + (fatigueAdjustedScores[i] ?? 0) * 0.1), // ✅ Use fatigue-adjusted
  );
}

// Final goal anchoring (EXISTING LOGIC, but with conflict awareness)
for (const anchor of goalAnchors) {
  if (anchor.allowNaturalFatigue) {
    // Skip final anchoring for conflicting goals
    continue;
  }

  const start = Math.max(0, anchor.goalIndex - anchor.peakWindow);
  const end = Math.min(
    optimized.length - 1,
    anchor.goalIndex + anchor.peakWindow,
  );
  let localMax = 0;
  for (let i = start; i <= end; i += 1) {
    localMax = Math.max(localMax, optimized[i] ?? 0);
  }

  optimized[anchor.goalIndex] = clampScore(
    Math.max(optimized[anchor.goalIndex] ?? 0, localMax),
  );
}

// Plan readiness anchoring (EXISTING LOGIC)
if (typeof input.planReadinessScore === "number") {
  // ... existing anchoring logic ...
}

return optimized;
```

---

## Data Flow & Architecture

### Complete Data Flow (Fixed System)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER INPUT                                                   │
│ ─────────────────────────────────────────────────────────────── │
│ Goals:                                                          │
│   - Marathon A: 2026-03-14, Priority 5, 2hr target             │
│   - Marathon B: 2026-03-15, Priority 5, 2hr target             │
│ Starting CTL: 35                                                │
│ Timeline: 12 weeks                                              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. PROJECTION PHASE (UNCHANGED)                                │
│ ─────────────────────────────────────────────────────────────── │
│ MPC Solver optimizes weekly TSS:                               │
│   - Week 1-11: Build phase (priority-weighted)                 │
│   - Week 12: Taper for both goals                              │
│   - Both goals have equal priority → equal optimization        │
│                                                                  │
│ Output: Weekly TSS sequence                                     │
│   Week 1: 250 TSS, Week 2: 280 TSS, ... Week 11: 420 TSS       │
│   Week 12: 280 TSS (taper)                                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. CTL/ATL/TSB CALCULATION (UNCHANGED)                         │
│ ─────────────────────────────────────────────────────────────── │
│ Daily calculations using exponential moving averages:          │
│                                                                  │
│ Day 13 (Marathon A):                                            │
│   CTL: 65 (42-day EMA)                                          │
│   ATL: 60 (7-day EMA)                                           │
│   TSB: 5 (CTL - ATL)                                            │
│                                                                  │
│ Day 14 (Marathon B):                                            │
│   CTL: 65 (minimal change in 1 day)                            │
│   ATL: 62 (increased from Day 13 effort)                       │
│   TSB: 3 (slightly lower form)                                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. BASE READINESS CALCULATION (UNCHANGED)                      │
│ ─────────────────────────────────────────────────────────────── │
│ From CTL/ATL/TSB metrics:                                       │
│                                                                  │
│ Day 13:                                                          │
│   fitnessSignal: 0.75 (CTL progress)                           │
│   formSignal: 0.85 (TSB near target)                           │
│   fatigueSignal: 0.90 (ATL < CTL)                              │
│   → baseReadiness: 82%                                          │
│                                                                  │
│ Day 14:                                                          │
│   fitnessSignal: 0.75 (same CTL)                               │
│   formSignal: 0.80 (TSB slightly lower)                        │
│   fatigueSignal: 0.88 (ATL closer to CTL)                      │
│   → baseReadiness: 80%                                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. DYNAMIC EVENT RECOVERY (✅ NEW)                              │
│ ─────────────────────────────────────────────────────────────── │
│ For each goal, calculate recovery profile:                     │
│                                                                  │
│ Marathon A (Day 13):                                            │
│   Duration: 3.5 hours                                           │
│   Intensity: 85/100                                             │
│   → recovery_days_full: 12 days                                 │
│   → recovery_days_functional: 5 days                            │
│   → fatigue_intensity: 85                                       │
│                                                                  │
│ Marathon B (Day 14):                                            │
│   Same profile as Marathon A                                    │
│                                                                  │
│ Apply post-event fatigue:                                       │
│   Day 13: No prior events → penalty: 0%                         │
│   Day 14: Marathon A was 1 day ago                             │
│     - daysAfterEvent: 1                                         │
│     - recoveryHalfLife: 4 days                                  │
│     - decayFactor: 0.84                                         │
│     - basePenalty: 42.5                                         │
│     - atlOverloadPenalty: 0 (ATL/CTL < 1)                      │
│     - totalPenalty: 35.7%                                       │
│                                                                  │
│ Adjusted readiness:                                             │
│   Day 13: 82% - 0% = 82%                                        │
│   Day 14: 80% - 35.7% = 44.3%                                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. GOAL PEAKING ALGORITHM (✅ MODIFIED)                         │
│ ─────────────────────────────────────────────────────────────── │
│ Calculate dynamic peak windows:                                │
│                                                                  │
│ Marathon A:                                                      │
│   peakWindow: 8 + (12 * 0.7) = 16 days                         │
│   hasConflictingGoal: true (Marathon B 1 day later)            │
│   allowNaturalFatigue: true                                     │
│   → Don't force to be local maximum                             │
│                                                                  │
│ Marathon B:                                                      │
│   peakWindow: 16 days                                           │
│   hasConflictingGoal: true (Marathon A 1 day prior)            │
│   allowNaturalFatigue: true                                     │
│   → Let fatigue model handle it naturally                       │
│                                                                  │
│ Result: Both goals respect fatigue dynamics                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. GOAL READINESS SCORE (✅ FIXED)                              │
│ ─────────────────────────────────────────────────────────────── │
│ Marathon A:                                                      │
│   stateReadiness: 82%                                           │
│   targetAttainment: 70%                                         │
│   alignmentLoss: 2                                              │
│   → blended: 78.85                                              │
│   → eliteSynergyBoost: 9.45                                     │
│   → alignmentPenalty: 0.4                                       │
│   → readiness: 87.9% ✅ (no override)                           │
│                                                                  │
│ Marathon B:                                                      │
│   stateReadiness: 44.3% (after fatigue penalty)                │
│   targetAttainment: 70%                                         │
│   alignmentLoss: 2                                              │
│   → blended: 55.37                                              │
│   → eliteSynergyBoost: 2.74                                     │
│   → alignmentPenalty: 0.4                                       │
│   → readiness: 57.7% ✅ (no override)                           │
│   → But fatigue-adjusted: 44.3% from step 5                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. FINAL OUTPUT (✅ CORRECT)                                    │
│ ─────────────────────────────────────────────────────────────── │
│ Goal Assessments:                                               │
│   Marathon A: 88% readiness                                     │
│     - Challenging but achievable                                │
│     - Reflects good preparation                                 │
│                                                                  │
│   Marathon B: 44% readiness                                     │
│     - Severe fatigue from Day 1                                 │
│     - Realistic assessment of back-to-back difficulty           │
│                                                                  │
│ User sees honest, physiologically-grounded readiness scores     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Interface Changes

### Modified Types

#### 1. ProjectionPointReadinessGoalInput

**File**: `packages/core/plan/projection/readiness.ts`

**Before**:

```typescript
export interface ProjectionPointReadinessGoalInput {
  target_date: string;
  priority?: number;
}
```

**After**:

```typescript
export interface ProjectionPointReadinessGoalInput {
  target_date: string;
  priority?: number;
  targets?: GoalTargetV2[]; // ✅ ADDED
}
```

**Impact**: Allows readiness calculation to access goal targets for recovery modeling.

---

### New Types

#### 1. EventRecoveryProfile

**File**: `packages/core/plan/projection/event-recovery.ts` (NEW)

```typescript
export interface EventRecoveryProfile {
  recovery_days_full: number;
  recovery_days_functional: number;
  fatigue_intensity: number;
  atl_spike_factor: number;
}
```

#### 2. EventRecoveryInput

**File**: `packages/core/plan/projection/event-recovery.ts` (NEW)

```typescript
export interface EventRecoveryInput {
  target: GoalTargetV2;
  projected_ctl_at_event: number;
  projected_atl_at_event: number;
}
```

#### 3. PostEventFatigueInput

**File**: `packages/core/plan/projection/event-recovery.ts` (NEW)

```typescript
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

---

### New Public Functions

#### 1. computeEventRecoveryProfile

**File**: `packages/core/plan/projection/event-recovery.ts` (NEW)

```typescript
export function computeEventRecoveryProfile(
  input: EventRecoveryInput,
): EventRecoveryProfile;
```

**Purpose**: Calculate dynamic recovery requirements from goal target.

**Usage**:

```typescript
const profile = computeEventRecoveryProfile({
  target: {
    target_type: "race_performance",
    activity_category: "run",
    distance_m: 42195,
    target_time_s: 12600,
  },
  projected_ctl_at_event: 65,
  projected_atl_at_event: 60,
});

console.log(profile);
// {
//   recovery_days_full: 12,
//   recovery_days_functional: 5,
//   fatigue_intensity: 85,
//   atl_spike_factor: 1.53
// }
```

---

#### 2. computePostEventFatiguePenalty

**File**: `packages/core/plan/projection/event-recovery.ts` (NEW)

```typescript
export function computePostEventFatiguePenalty(
  input: PostEventFatigueInput,
): number;
```

**Purpose**: Calculate readiness penalty for days after an event.

**Usage**:

```typescript
const penalty = computePostEventFatiguePenalty({
  currentDate: "2026-03-15",
  currentPoint: {
    date: "2026-03-15",
    predicted_fitness_ctl: 65,
    predicted_fatigue_atl: 68,
    predicted_form_tsb: -3,
  },
  eventGoal: {
    target_date: "2026-03-14",
    targets: [
      {
        /* marathon target */
      },
    ],
    projected_ctl: 65,
    projected_atl: 60,
  },
});

console.log(penalty); // ~35-40 (35-40% penalty)
```

---

### Modified Function Signatures

#### 1. computeProjectionPointReadinessScores

**File**: `packages/core/plan/projection/readiness.ts`

**Before**:

```typescript
export function computeProjectionPointReadinessScores(input: {
  points: ProjectionPointReadinessInput[];
  planReadinessScore?: number;
  goals?: ProjectionPointReadinessGoalInput[]; // No targets
  timeline_calibration?: TrainingPlanCalibrationConfig["readiness_timeline"];
}): number[];
```

**After**:

```typescript
export function computeProjectionPointReadinessScores(input: {
  points: ProjectionPointReadinessInput[];
  planReadinessScore?: number;
  goals?: ProjectionPointReadinessGoalInput[]; // Now includes targets
  timeline_calibration?: TrainingPlanCalibrationConfig["readiness_timeline"];
}): number[];
```

**Change**: `goals` parameter now expects `targets` field in each goal.

---

#### 2. computeGoalReadinessScore

**File**: `packages/core/plan/projectionCalculations.ts`

**Before**:

```typescript
function computeGoalReadinessScore(input: {
  stateReadinessScore: number;
  targetAttainmentScore: number;
  goalAlignmentLoss: number;
}): number {
  // ... calculation ...
  if (state >= 70 && attainment >= 60 && alignmentLoss <= 5) {
    return Math.max(99, scoredReadiness); // ❌ OVERRIDE
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
  // ... calculation ...
  // ✅ REMOVED OVERRIDE
  return round1(
    Math.max(0, Math.min(100, blended + eliteSynergyBoost - alignmentPenalty)),
  );
}
```

**Change**: Removed artificial 99+ override.

---

### Caller Updates Required

#### 1. buildDeterministicProjectionPayload

**File**: `packages/core/plan/projectionCalculations.ts` (Line 3584)

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

---

## Testing Strategy

### Unit Tests

#### Test Suite 1: Elite Synergy Boost Removal

**File**: `packages/core/plan/__tests__/projection-readiness.test.ts`

**Tests**:

```typescript
describe("computeGoalReadinessScore - elite synergy boost removal", () => {
  it("returns calculated score without override", () => {
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

  it("handles low scores correctly", () => {
    const result = computeGoalReadinessScore({
      stateReadinessScore: 40,
      targetAttainmentScore: 50,
      goalAlignmentLoss: 10,
    });

    expect(result).toBeGreaterThan(30);
    expect(result).toBeLessThan(60);
  });
});
```

---

#### Test Suite 2: Dynamic Event Recovery

**File**: `packages/core/plan/__tests__/event-recovery.test.ts` (NEW)

**Tests**:

```typescript
describe("Event Recovery Model", () => {
  describe("computeEventRecoveryProfile", () => {
    it("calculates short recovery for 5K race", () => {
      const profile = computeEventRecoveryProfile({
        target: {
          target_type: "race_performance",
          activity_category: "run",
          distance_m: 5000,
          target_time_s: 1200,
        },
        projected_ctl_at_event: 50,
        projected_atl_at_event: 48,
      });

      expect(profile.recovery_days_full).toBeGreaterThanOrEqual(2);
      expect(profile.recovery_days_full).toBeLessThanOrEqual(4);
    });

    it("calculates long recovery for marathon", () => {
      const profile = computeEventRecoveryProfile({
        target: {
          target_type: "race_performance",
          activity_category: "run",
          distance_m: 42195,
          target_time_s: 12600,
        },
        projected_ctl_at_event: 65,
        projected_atl_at_event: 60,
      });

      expect(profile.recovery_days_full).toBeGreaterThanOrEqual(10);
      expect(profile.recovery_days_full).toBeLessThanOrEqual(14);
    });

    it("calculates very long recovery for 24-hour ultra", () => {
      const profile = computeEventRecoveryProfile({
        target: {
          target_type: "race_performance",
          activity_category: "run",
          distance_m: 160934,
          target_time_s: 86400,
        },
        projected_ctl_at_event: 80,
        projected_atl_at_event: 75,
      });

      expect(profile.recovery_days_full).toBeGreaterThanOrEqual(21);
      expect(profile.recovery_days_full).toBeLessThanOrEqual(28);
    });
  });

  describe("computePostEventFatiguePenalty", () => {
    it("applies heavy penalty day after marathon", () => {
      const penalty = computePostEventFatiguePenalty({
        currentDate: "2026-03-15",
        currentPoint: {
          date: "2026-03-15",
          predicted_fitness_ctl: 65,
          predicted_fatigue_atl: 68,
          predicted_form_tsb: -3,
        },
        eventGoal: {
          target_date: "2026-03-14",
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
          projected_ctl: 65,
          projected_atl: 60,
        },
      });

      expect(penalty).toBeGreaterThan(30);
      expect(penalty).toBeLessThan(50);
    });

    it("applies no penalty before event", () => {
      const penalty = computePostEventFatiguePenalty({
        currentDate: "2026-03-13",
        currentPoint: {
          date: "2026-03-13",
          predicted_fitness_ctl: 65,
          predicted_fatigue_atl: 60,
          predicted_form_tsb: 5,
        },
        eventGoal: {
          target_date: "2026-03-14",
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 12600,
            },
          ],
          projected_ctl: 65,
          projected_atl: 60,
        },
      });

      expect(penalty).toBe(0);
    });
  });
});
```

---

### Integration Tests

#### Scenario 1: Back-to-Back Impossible Goals

**File**: `packages/core/plan/__tests__/projection-calculations.test.ts`

```typescript
describe("Back-to-back goals readiness", () => {
  it("shows realistic fatigue for consecutive marathons", () => {
    const result = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-01",
        end_date: "2026-03-20",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-01",
          end_date: "2026-03-20",
          target_weekly_tss_range: { min: 400, max: 400 },
        },
      ],
      goals: [
        {
          id: "marathon-a",
          name: "Marathon A",
          target_date: "2026-03-14",
          priority: 5,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 7200,
            },
          ],
        },
        {
          id: "marathon-b",
          name: "Marathon B",
          target_date: "2026-03-15",
          priority: 5,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 7200,
            },
          ],
        },
      ],
      starting_ctl: 35,
    });

    const marathonA = result.goal_assessments.find(
      (g) => g.goal_id === "marathon-a",
    );
    const marathonB = result.goal_assessments.find(
      (g) => g.goal_id === "marathon-b",
    );

    // Marathon A should be challenging but achievable
    expect(marathonA?.goal_readiness_score).toBeGreaterThan(60);
    expect(marathonA?.goal_readiness_score).toBeLessThan(90);

    // Marathon B should show severe fatigue
    expect(marathonB?.goal_readiness_score).toBeLessThan(50);

    // Marathon B should be significantly lower than Marathon A
    expect(marathonB?.goal_readiness_score).toBeLessThan(
      marathonA?.goal_readiness_score! - 20,
    );

    // Neither should be 99%
    expect(marathonA?.goal_readiness_score).not.toBe(99);
    expect(marathonB?.goal_readiness_score).not.toBe(99);
  });
});
```

---

#### Scenario 2: Priority Differentiation

**File**: `packages/core/plan/__tests__/projection-calculations.test.ts`

```typescript
describe("Priority affects optimization, not readiness inflation", () => {
  it("high priority goal gets better preparation, not artificial boost", () => {
    const result = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-01",
        end_date: "2026-03-20",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-01",
          end_date: "2026-03-20",
          target_weekly_tss_range: { min: 400, max: 400 },
        },
      ],
      goals: [
        {
          id: "marathon-a",
          name: "Marathon A",
          target_date: "2026-03-14",
          priority: 10, // High priority
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 7200,
            },
          ],
        },
        {
          id: "marathon-b",
          name: "Marathon B",
          target_date: "2026-03-15",
          priority: 1, // Low priority
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 7200,
            },
          ],
        },
      ],
      starting_ctl: 35,
    });

    const marathonA = result.goal_assessments.find(
      (g) => g.goal_id === "marathon-a",
    );
    const marathonB = result.goal_assessments.find(
      (g) => g.goal_id === "marathon-b",
    );

    // Marathon A (high priority) should have better readiness
    // due to projection optimization, not artificial inflation
    expect(marathonA?.goal_readiness_score).toBeGreaterThan(
      marathonB?.goal_readiness_score!,
    );

    // But Marathon B should still show fatigue from being day after
    expect(marathonB?.goal_readiness_score).toBeLessThan(50);

    // Neither should be artificially inflated to 99%
    expect(marathonA?.goal_readiness_score).toBeLessThan(95);
  });
});
```

---

#### Scenario 3: Well-Spaced Goals (Regression Test)

**File**: `packages/core/plan/__tests__/projection-calculations.test.ts`

```typescript
describe("Well-spaced goals maintain high readiness", () => {
  it("shows high readiness for goals 6+ weeks apart", () => {
    const result = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-01",
        end_date: "2026-05-10",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-01",
          end_date: "2026-05-10",
          target_weekly_tss_range: { min: 400, max: 450 },
        },
      ],
      goals: [
        {
          id: "marathon-a",
          name: "Marathon A",
          target_date: "2026-03-14",
          priority: 5,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 7200,
            },
          ],
        },
        {
          id: "marathon-b",
          name: "Marathon B",
          target_date: "2026-05-02", // 7 weeks later
          priority: 5,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 42195,
              target_time_s: 7200,
            },
          ],
        },
      ],
      starting_ctl: 35,
    });

    const marathonA = result.goal_assessments.find(
      (g) => g.goal_id === "marathon-a",
    );
    const marathonB = result.goal_assessments.find(
      (g) => g.goal_id === "marathon-b",
    );

    // Both should have good readiness (no interference)
    expect(marathonA?.goal_readiness_score).toBeGreaterThan(70);
    expect(marathonB?.goal_readiness_score).toBeGreaterThan(70);

    // Should be similar (both well-prepared)
    const diff = Math.abs(
      marathonA?.goal_readiness_score! - marathonB?.goal_readiness_score!,
    );
    expect(diff).toBeLessThan(15);
  });
});
```

---

## Implementation Plan

### Phase 1: Remove Elite Synergy Boost Override

**Estimated Effort**: 2 hours

**Tasks**:

1. ✅ Modify `computeGoalReadinessScore()` in `projectionCalculations.ts`
2. ✅ Remove lines 2715-2717 (override block)
3. ✅ Add unit tests for score calculation
4. ✅ Run existing test suite to ensure no regressions

**Files Modified**:

- `packages/core/plan/projectionCalculations.ts` (1 function, 3 lines removed)

**Tests Added**:

- 3 unit tests in `projection-readiness.test.ts`

**Risk**: Low - Simple removal of override logic

**Validation**:

- All existing tests pass
- New tests verify no 99+ override
- Scores remain in 0-100 range

---

### Phase 2: Create Event Recovery Module

**Estimated Effort**: 8 hours

**Tasks**:

1. ✅ Create new file `event-recovery.ts`
2. ✅ Implement `computeEventRecoveryProfile()`
3. ✅ Implement `computePostEventFatiguePenalty()`
4. ✅ Implement `estimateRaceIntensity()` helper
5. ✅ Add comprehensive unit tests
6. ✅ Document formulas and rationale

**Files Created**:

- `packages/core/plan/projection/event-recovery.ts` (~300 lines)

**Tests Added**:

- New test file `event-recovery.test.ts` (~200 lines)
- 8-10 unit tests covering different event types

**Risk**: Medium - New module, needs thorough testing

**Validation**:

- Recovery profiles match expected ranges for each event type
- Fatigue penalties decay exponentially
- Edge cases handled (no targets, invalid dates, etc.)

---

### Phase 3: Integrate Recovery into Readiness Calculation

**Estimated Effort**: 12 hours

**Tasks**:

1. ✅ Modify `ProjectionPointReadinessGoalInput` type
2. ✅ Update `computeProjectionPointReadinessScores()` to apply fatigue
3. ✅ Update caller in `buildDeterministicProjectionPayload()` to pass targets
4. ✅ Add integration tests for multi-goal scenarios
5. ✅ Test edge cases (no goals, no targets, etc.)
6. ✅ Performance profiling

**Files Modified**:

- `packages/core/plan/projection/readiness.ts` (major changes to 1 function)
- `packages/core/plan/projectionCalculations.ts` (update caller)

**Type Changes**:

- `ProjectionPointReadinessGoalInput` interface modified

**Tests Added**:

- 6-8 integration tests in `projection-readiness.test.ts`

**Risk**: High - Core calculation logic changes

**Validation**:

- Back-to-back goals show realistic fatigue
- Well-spaced goals unaffected
- Performance acceptable (<100ms for typical plan)

---

### Phase 4: Update Goal Peaking Algorithm

**Estimated Effort**: 6 hours

**Tasks**:

1. ✅ Modify goal anchor calculation to use dynamic windows
2. ✅ Add conflict detection logic
3. ✅ Update peaking to respect `allowNaturalFatigue` flag
4. ✅ Test edge cases (many goals, overlapping windows, etc.)
5. ✅ Validate smoothing still works correctly

**Files Modified**:

- `packages/core/plan/projection/readiness.ts` (peaking algorithm section)

**Tests Added**:

- 4-5 tests for edge cases in `projection-readiness.test.ts`

**Risk**: Medium - Changes existing algorithm

**Validation**:

- Conflicting goals don't force local maxima
- Non-conflicting goals still peak correctly
- Smoothing and anchoring work as expected

---

### Phase 5: Comprehensive Testing & Validation

**Estimated Effort**: 8 hours

**Tasks**:

1. ✅ End-to-end scenario testing (all integration tests)
2. ✅ Regression testing on existing plans
3. ✅ Performance profiling and optimization
4. ✅ Documentation updates (JSDoc, README)
5. ✅ Code review and refinement

**Deliverables**:

- All tests passing
- Performance benchmarks documented
- Code reviewed and approved
- Documentation complete

**Risk**: Low - Validation phase

---

### Total Estimated Effort: 36 hours

**Timeline** (assuming 1 developer):

- Week 1: Phases 1-2 (10 hours)
- Week 2: Phase 3 (12 hours)
- Week 3: Phases 4-5 (14 hours)

---

## Migration & Rollout Strategy

### Backward Compatibility

**Breaking Changes**: None

- All changes are internal to calculation logic
- No API signature changes (except adding optional `targets` field)
- Existing training plans will recalculate with new logic
- No database schema changes required

**Data Migration**: Not required

- Changes are pure calculation logic
- Plans will automatically use new calculations on next evaluation
- No stored data needs updating

---

### Rollout Phases

#### Phase 1: Development & Testing (Week 1-3)

- Implement all changes per implementation plan
- Comprehensive unit and integration testing
- Code review and refinement

#### Phase 2: Shadow Mode (Week 4) - OPTIONAL

- Calculate both old and new readiness scores
- Log differences for analysis
- Don't expose new scores to users yet
- Validate against known edge cases

**Metrics to Track**:

- Average readiness score (old vs new)
- Distribution of scores (histogram)
- Goals with <40% readiness (should increase)
- Performance impact (calculation time)

#### Phase 3: Beta Testing (Week 5)

- Enable new calculations for internal testing
- Test with real user plans
- Gather feedback on score realism
- Validate UI messaging

**Success Criteria**:

- Scores feel realistic and trustworthy
- No performance degradation
- No critical bugs found

#### Phase 4: Production Rollout (Week 6)

- Deploy to production
- Monitor for anomalies
- User communication about improved accuracy
- Support team briefed on changes

**Monitoring**:

- Error rates
- Calculation time (p50, p95, p99)
- User feedback/support tickets
- Score distribution changes

---

### User Communication

**Messaging Strategy**:

**Before Rollout**:

- Blog post: "Improving Readiness Score Accuracy"
- Explain: "We're making readiness scores more realistic"
- Emphasize: "Better reflects physiological constraints"

**During Rollout**:

- In-app notification: "Readiness scores now more accurate"
- Tooltip updates: "70-80% is excellent for challenging goals"
- Help center article: "Understanding Readiness Scores"

**After Rollout**:

- Monitor support tickets
- Gather user feedback
- Iterate on messaging if needed

**Key Messages**:

- "More realistic scores help better planning"
- "Lower scores don't mean bad plans, just honest assessments"
- "Back-to-back goals now show realistic recovery needs"

---

### Monitoring & Validation

**Key Metrics**:

1. **Score Distribution**
   - Before: Heavy skew toward 90-99%
   - After: More normal distribution, 60-85% range

2. **Back-to-Back Goals**
   - Before: Both show 99%
   - After: Day 2 shows 30-50% (realistic fatigue)

3. **Performance**
   - Calculation time: <100ms for typical plan (90 days, 5 goals)
   - Memory usage: No increase
   - CPU usage: Minimal increase

4. **User Feedback**
   - Support tickets about "low scores"
   - Positive feedback on realism
   - Feature requests related to readiness

**Success Criteria**:

- ✅ Back-to-back goals show realistic fatigue patterns
- ✅ Well-spaced goals maintain high readiness
- ✅ No artificial 99% inflation
- ✅ Calculation time <100ms for typical plan
- ✅ User feedback positive or neutral
- ✅ No critical bugs in production

---

## Risk Assessment

### Technical Risks

#### Risk 1: Performance Impact

**Severity**: Low  
**Probability**: Low

**Description**: Recovery calculations add O(n\*m) complexity where n=points, m=goals.

**Mitigation**:

- Typical plan: 90 days \* 5 goals = 450 calculations
- Each calculation: <1ms
- Total overhead: <50ms (negligible)
- Profile and optimize if needed

**Contingency**: Add caching for recovery profiles if performance issues arise.

---

#### Risk 2: Edge Cases

**Severity**: Medium  
**Probability**: Medium

**Description**: Unexpected behavior with unusual goal configurations.

**Mitigation**:

- Comprehensive test suite covering:
  - No goals
  - Single goal
  - Many goals (>10)
  - Extreme durations (5K to multi-day ultras)
  - Invalid dates
  - Missing targets
- Beta testing with real user plans

**Contingency**: Add defensive checks and fallbacks for edge cases.

---

#### Risk 3: Calculation Accuracy

**Severity**: Medium  
**Probability**: Low

**Description**: Recovery formulas may not match real-world physiology.

**Mitigation**:

- Validate formulas against physiological literature
- Test against known recovery timelines
- Beta testing with experienced athletes
- Make formulas configurable for future tuning

**Contingency**: Adjust recovery formula parameters based on feedback.

---

### User Experience Risks

#### Risk 1: Score Deflation

**Severity**: Medium  
**Probability**: High

**Description**: Users may see lower readiness scores than before.

**Impact**: Confusion, concern about plan quality, support tickets.

**Mitigation**:

- Clear communication about improved accuracy
- Emphasize: "Realistic scores help better planning"
- Provide tooltips explaining factors
- Help center article: "Understanding Readiness Scores"
- Gradual rollout with feedback loop

**Contingency**: Enhanced UI messaging, support team training, FAQ updates.

---

#### Risk 2: Expectation Mismatch

**Severity**: Low  
**Probability**: Medium

**Description**: Users expecting 99% for challenging goals.

**Impact**: Disappointment, questioning plan effectiveness.

**Mitigation**:

- Education: "70-80% is excellent for challenging goals"
- Contextual messaging in UI
- Show historical context (if available)
- Explain what different ranges mean

**Contingency**: Add "readiness interpretation" guide in UI.

---

## Success Criteria

### Functional Success

✅ **Back-to-back marathons show realistic fatigue**

- Day 1: 65-85% readiness
- Day 2: <50% readiness (fatigue penalty applied)

✅ **Elite synergy boost removed**

- No artificial 99+ inflation
- Scores reflect actual calculation

✅ **Recovery time scales with event intensity**

- 5K: 2-3 day recovery
- Marathon: 10-14 day recovery
- Ultra: 21-28 day recovery

✅ **Initial CTL properly influences final scores**

- Low starting CTL → lower readiness (can't build safely)
- High starting CTL → higher readiness (already fit)

✅ **Well-spaced goals maintain high readiness**

- Goals 6+ weeks apart: Both show 70-85%
- No interference from recovery modeling

---

### Performance Success

✅ **Calculation time <100ms for typical plan**

- 90 days, 5 goals
- Measured on typical hardware

✅ **No memory leaks or performance degradation**

- Long-running tests show stable memory
- No accumulation over multiple calculations

✅ **Efficient caching of recovery profiles**

- Same goal targets reuse profile
- Minimal redundant calculations

---

### User Experience Success

✅ **Scores feel realistic and trustworthy**

- User feedback positive or neutral
- Support tickets about "low scores" manageable

✅ **Users understand what readiness percentage means**

- Tooltip views increase
- Help center article traffic
- Reduced confusion in support tickets

✅ **Clearer differentiation between achievable and aggressive goals**

- Users can identify challenging plans
- Better informed decision-making

---

## Appendices

### Appendix A: Mathematical Formulas

#### A.1: Current Elite Synergy Calculation (KEPT)

```
attainmentNormalized = attainment / 100
nonlinearAttainment = (attainmentNormalized ^ 1.4) * 100
stateNormalized = state / 100
nonlinearAttainmentNormalized = nonlinearAttainment / 100

eliteSynergyBoost = 25 * (stateNormalized ^ 2) * (nonlinearAttainmentNormalized ^ 2)

blended = state * 0.55 + nonlinearAttainment * 0.45
alignmentPenalty = alignmentLoss * 0.2

readiness = blended + eliteSynergyBoost - alignmentPenalty
```

**Note**: The synergy boost formula is kept, only the override is removed.

---

#### A.2: Recovery Fatigue Decay (NEW)

```
recoveryHalfLife = recovery_days_full / 3
decayFactor = 0.5 ^ (daysAfterEvent / recoveryHalfLife)

atlRatio = atl / max(1, ctl)
atlOverloadPenalty = max(0, (atlRatio - 1) * 30)

basePenalty = fatigue_intensity * 0.5
totalPenalty = min(60, (basePenalty + atlOverloadPenalty) * decayFactor)

adjustedReadiness = baseReadiness - totalPenalty
```

**Example** (Marathon, Day 1 after):

```
recovery_days_full = 12
recoveryHalfLife = 12 / 3 = 4
daysAfterEvent = 1
decayFactor = 0.5 ^ (1/4) = 0.84

atlRatio = 68 / 65 = 1.046
atlOverloadPenalty = max(0, (1.046 - 1) * 30) = 1.38

basePenalty = 85 * 0.5 = 42.5
totalPenalty = min(60, (42.5 + 1.38) * 0.84) = 36.9

adjustedReadiness = 80 - 36.9 = 43.1%
```

---

#### A.3: Event Recovery Profile (NEW)

**For race_performance**:

```
durationHours = target_time_s / 3600
intensity = estimateRaceIntensity(distance, duration, activity)
baseDays = min(28, max(2, durationHours * 3.5))
intensityFactor = intensity / 100

recovery_days_full = round(baseDays * (0.7 + intensityFactor * 0.3))
recovery_days_functional = round(baseDays * 0.4)
fatigue_intensity = intensity
atl_spike_factor = min(2.5, 1 + durationHours * 0.15)
```

**Examples**:

| Event          | Duration | Base Days | Intensity | Recovery Full | Recovery Functional |
| -------------- | -------- | --------- | --------- | ------------- | ------------------- |
| 5K             | 0.33 hr  | 2         | 95        | 2             | 1                   |
| Half Marathon  | 1.5 hr   | 5         | 90        | 6             | 2                   |
| Marathon       | 3.5 hr   | 12        | 85        | 13            | 5                   |
| 50K Ultra      | 6 hr     | 21        | 80        | 22            | 8                   |
| 100-Mile Ultra | 24 hr    | 28        | 70        | 28            | 11                  |

---

### Appendix B: Files to be Modified

#### Core Logic Changes

1. **`packages/core/plan/projectionCalculations.ts`**
   - Line 2692-2720: Remove elite synergy boost override
   - Line 3584: Pass goal targets to readiness calculation
   - **Estimated Changes**: 30 lines modified

2. **`packages/core/plan/projection/readiness.ts`**
   - Line 365-609: Add post-event fatigue calculation
   - Line 459-526: Update goal peaking algorithm
   - Add `ProjectionPointReadinessGoalInput.targets` field
   - **Estimated Changes**: 150 lines modified

3. **`packages/core/plan/projection/event-recovery.ts`** (NEW FILE)
   - `computeEventRecoveryProfile()`
   - `computePostEventFatiguePenalty()`
   - `estimateRaceIntensity()` helper
   - **Estimated Size**: 300 lines

---

#### Test Files

4. **`packages/core/plan/__tests__/projection-readiness.test.ts`**
   - Add elite synergy boost removal tests
   - Add multi-goal fatigue tests
   - Add edge case coverage
   - **Estimated Changes**: 100 lines added

5. **`packages/core/plan/__tests__/event-recovery.test.ts`** (NEW FILE)
   - Recovery profile calculation tests
   - Fatigue penalty decay tests
   - Different event type tests
   - **Estimated Size**: 200 lines

6. **`packages/core/plan/__tests__/projection-calculations.test.ts`**
   - Integration tests for complete flow
   - Back-to-back scenario tests
   - Regression tests
   - **Estimated Changes**: 150 lines added

---

### Appendix C: References & Research

#### Physiological Recovery Research

1. **Marathon Recovery**:
   - Clarkson PM, Hubal MJ. "Exercise-induced muscle damage in humans." Am J Phys Med Rehabil. 2002.
   - Typical recovery: 10-14 days for full muscle function restoration

2. **Ultra-Marathon Recovery**:
   - Millet GY, et al. "Neuromuscular consequences of an extreme mountain ultra-marathon." PLoS One. 2011.
   - Extended recovery: 21-28 days for ultra-distance events

3. **Training Load & Fatigue**:
   - Banister EW, et al. "A systems model of training for athletic performance." Aust J Sports Med. 1975.
   - Foundation for CTL/ATL/TSB modeling

4. **Recovery Time Constants**:
   - Busso T. "Variable dose-response relationship between exercise training and performance." Med Sci Sports Exerc. 2003.
   - Exponential decay models for fatigue recovery

---

### Appendix D: Glossary

**CTL (Chronic Training Load)**: Long-term fitness metric, 42-day exponential moving average of TSS.

**ATL (Acute Training Load)**: Short-term fatigue metric, 7-day exponential moving average of TSS.

**TSB (Training Stress Balance)**: Form metric, calculated as CTL - ATL. Positive = fresh, negative = fatigued.

**TSS (Training Stress Score)**: Quantification of training load for a single workout.

**MPC (Model Predictive Control)**: Optimization algorithm that looks ahead to make optimal decisions.

**Readiness Score**: 0-100 metric representing physiological preparedness for a goal.

**Goal Priority**: 0-10 value determining optimization weight in projection planning.

**Recovery Profile**: Calculated recovery requirements for a specific event type.

**Fatigue Penalty**: Readiness reduction applied after high-intensity events.

**Elite Synergy Boost**: Multiplicative bonus in readiness calculation for high performance (kept in formula, override removed).

---

### Appendix E: Open Questions

#### Question 1: Recovery Formula Calibration

**Status**: Needs validation

**Question**: Do the recovery formulas match real-world athlete experiences?

**Current Approach**:

- Marathon: 12-day full recovery
- Ultra: 21-28 day full recovery
- Exponential decay with 1/3 half-life

**Action Items**:

- Literature review of recovery research
- Beta testing with experienced athletes
- Gather feedback on recovery timelines
- Adjust parameters if needed

---

#### Question 2: ATL Spike Factor

**Status**: Needs validation

**Question**: How should projected ATL spike from events be modeled?

**Current Approach**: Simple multiplier based on duration

- `atl_spike_factor = 1 + (durationHours * 0.15)`

**Alternative**: More complex based on intensity zones

**Action Items**:

- Validate with real activity data
- Compare predicted vs actual ATL after events
- Refine formula if needed

---

#### Question 3: Calibration Parameters

**Status**: Design decision needed

**Question**: Should recovery formulas be configurable via `TrainingPlanCalibrationConfig`?

**Pros**:

- Allows future tuning without code changes
- Can adjust for different athlete populations
- Easier experimentation

**Cons**:

- More complexity
- Harder to reason about
- More testing required

**Recommendation**: Start hardcoded, make configurable in v2 if needed.

---

#### Question 4: UI Communication

**Status**: Needs UX design

**Question**: How to explain lower scores to users?

**Requirements**:

- Tooltips/help text for readiness scores
- Explain what different ranges mean (60-70% = challenging but achievable)
- Contextual messaging based on score

**Action Items**:

- UX team to design messaging
- User testing of explanations
- Iterate based on feedback

---

### Appendix F: Version History

| Version | Date       | Author                     | Changes               |
| ------- | ---------- | -------------------------- | --------------------- |
| 1.0     | 2026-02-17 | AI Assistant, Dean Cochran | Initial specification |

---

**Document End**

---

## Next Steps

1. **Review & Approval**: Team review of specification
2. **Questions Resolution**: Address open questions in Appendix E
3. **Implementation**: Proceed with phased implementation per plan
4. **Testing**: Execute comprehensive test plan
5. **Deployment**: Rollout per migration strategy
6. **Monitoring**: Track success criteria and metrics

**Estimated Timeline**: 6 weeks from approval to production rollout

**Primary Contact**: [To be assigned]  
**Technical Lead**: [To be assigned]  
**Product Owner**: [To be assigned]
