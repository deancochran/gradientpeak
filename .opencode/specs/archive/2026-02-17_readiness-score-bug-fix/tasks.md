# Tasks: Readiness Score Bug Fix

Date: 2026-02-17  
Spec: `.opencode/specs/2026-02-17_readiness-score-bug-fix/`

## Dependency Notes

- Execution order is strict: **Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6**
- All changes are in `@repo/core` package (no API or UI changes)
- Each phase must pass tests before proceeding to next phase

## Current Status Snapshot

- [ ] Phase 0 complete (Foundation & Testing Setup)
- [ ] Phase 1 complete (Event Recovery Model)
- [ ] Phase 2 complete (Remove 99+ Override)
- [ ] Phase 3 complete (Integrate Post-Event Fatigue)
- [ ] Phase 4 complete (Dynamic Peak Windows)
- [ ] Phase 5 complete (Integration Testing)
- [ ] Phase 6 complete (Documentation & Release)

---

## Phase 0 - Foundation & Testing Setup

**Objective**: Establish test infrastructure and baseline behavior

### Checklist

- [ ] Create baseline test file: `packages/core/plan/projection/__tests__/readiness.baseline.test.ts`
  - [ ] Single isolated goal test case
  - [ ] Back-to-back marathons test case (should show 99/99 before fix)
  - [ ] Marathon + 5K test case
  - [ ] Different event types (5K, marathon, ultra) test case
  - [ ] Run tests to capture current behavior

- [ ] Create test utilities: `packages/core/plan/projection/__tests__/readiness.test-utils.ts`
  - [ ] Helper function: `createMockGoal()`
  - [ ] Helper function: `createMockProjectionPoint()`
  - [ ] Helper function: `createTestScenario()`
  - [ ] Goal generators for race_performance targets
  - [ ] CTL/ATL/TSB state builders

- [ ] Verify CI pipeline
  - [ ] Ensure existing tests pass
  - [ ] Run `pnpm check-types` successfully
  - [ ] Run `pnpm lint` successfully
  - [ ] Run `pnpm test` successfully in core package

### Test Commands

```bash
cd packages/core
pnpm check-types
pnpm lint
pnpm test readiness.baseline
```

### Acceptance

- [ ] Baseline tests run and pass with current code
- [ ] Test utilities available and documented
- [ ] CI shows all green

---

## Phase 1 - Event Recovery Model (New Module)

**Objective**: Create new module for dynamic recovery calculations

Depends on: **Phase 0 complete**

### Checklist

#### 1.1: Create New File

- [ ] Create file: `packages/core/plan/projection/event-recovery.ts`
- [ ] Add imports:
  - [ ] `GoalTargetV2` from `../../schemas/training_plan_structure`
  - [ ] `ProjectionPointReadinessInput` from `./readiness`
- [ ] Add utility functions:
  - [ ] `round1(value: number): number`
  - [ ] `clamp(value, min, max): number`
  - [ ] `diffDateOnlyUtcDays(from, to): number` (copy from readiness.ts if needed)

#### 1.2: Type Definitions

- [ ] Define `EventRecoveryProfile` interface
  - [ ] `recovery_days_full: number`
  - [ ] `recovery_days_functional: number`
  - [ ] `fatigue_intensity: number`
  - [ ] `atl_spike_factor: number`

- [ ] Define `EventRecoveryInput` interface
  - [ ] `target: GoalTargetV2`
  - [ ] `projected_ctl_at_event: number`
  - [ ] `projected_atl_at_event: number`

- [ ] Define `PostEventFatigueInput` interface
  - [ ] `currentDate: string`
  - [ ] `currentPoint: ProjectionPointReadinessInput`
  - [ ] `eventGoal` object with fields

#### 1.3: Implement `estimateRaceIntensity()`

- [ ] Create function signature
- [ ] Add duration-based intensity logic:
  - [ ] > 24hr: 70 intensity
  - [ ] 12-24hr: 75 intensity
  - [ ] 6-12hr: 80 intensity
  - [ ] 3-6hr: 85 intensity
  - [ ] 1-3hr: 90 intensity
  - [ ] <1hr: 95 intensity
- [ ] Add activity type adjustment:
  - [ ] Run: 1.0x
  - [ ] Bike: 0.9x
  - [ ] Swim: 0.95x
  - [ ] Other: 0.85x
- [ ] Return rounded intensity value

#### 1.4: Implement `computeEventRecoveryProfile()`

- [ ] Create function with `EventRecoveryInput` parameter
- [ ] Add switch/case on `target.target_type`

- [ ] **Case: race_performance**
  - [ ] Calculate `durationHours` from `target.target_time_s`
  - [ ] Calculate `baseDays = Math.min(28, Math.max(2, durationHours * 3.5))`
  - [ ] Call `estimateRaceIntensity()` to get intensity
  - [ ] Calculate `intensityFactor = intensity / 100`
  - [ ] Calculate `recoveryDaysFull = round(baseDays * (0.7 + intensityFactor * 0.3))`
  - [ ] Calculate `recoveryDaysFunctional = round(baseDays * 0.4)`
  - [ ] Calculate `atlSpikeFactor = min(2.5, 1 + durationHours * 0.15)`
  - [ ] Return EventRecoveryProfile

- [ ] **Case: pace_threshold / power_threshold**
  - [ ] Calculate test duration hours
  - [ ] Calculate `baseDays = 3 + testDurationHours * 2`
  - [ ] Return profile with intensity 75

- [ ] **Case: hr_threshold**
  - [ ] Return fixed profile: recovery 3 days, functional 1 day, intensity 65

#### 1.5: Implement `computePostEventFatiguePenalty()`

- [ ] Create function with `PostEventFatigueInput` parameter
- [ ] Calculate `daysAfterEvent` using `diffDateOnlyUtcDays()`
- [ ] Return 0 if `daysAfterEvent <= 0`
- [ ] Get primary target from `eventGoal.targets[0]`
- [ ] Return 0 if no primary target
- [ ] Call `computeEventRecoveryProfile()` to get recovery profile
- [ ] Calculate exponential decay:
  - [ ] `recoveryHalfLife = recoveryProfile.recovery_days_full / 3`
  - [ ] `decayFactor = Math.pow(0.5, daysAfterEvent / recoveryHalfLife)`
- [ ] Calculate ATL overload penalty:
  - [ ] `atlRatio = atl / max(1, ctl)`
  - [ ] `atlOverloadPenalty = max(0, (atlRatio - 1) * 30)`
- [ ] Calculate base penalty:
  - [ ] `basePenalty = recoveryProfile.fatigue_intensity * 0.5`
- [ ] Calculate total penalty with decay
- [ ] Cap at 60% and return

#### 1.6: Export Functions

- [ ] Export `EventRecoveryProfile` type
- [ ] Export `computeEventRecoveryProfile` function
- [ ] Export `computePostEventFatiguePenalty` function

#### 1.7: Write Unit Tests

- [ ] Create file: `packages/core/plan/projection/__tests__/event-recovery.test.ts`

- [ ] **Test: computeEventRecoveryProfile**
  - [ ] 5K race (20 min): 2-3 day recovery
  - [ ] Half marathon (1.5 hr): 5-7 day recovery
  - [ ] Marathon (3.5 hr): 10-14 day recovery
  - [ ] 50K ultra (6 hr): 14-18 day recovery
  - [ ] 100-mile ultra (24 hr): 21-28 day recovery
  - [ ] Pace threshold test: 3-5 day recovery
  - [ ] HR threshold test: 3 day recovery

- [ ] **Test: computePostEventFatiguePenalty**
  - [ ] Day 1 after marathon: 35-45% penalty
  - [ ] Day 3 after marathon: 20-30% penalty
  - [ ] Day 7 after marathon: 8-12% penalty
  - [ ] Day 14 after marathon: <5% penalty
  - [ ] Before event (negative days): 0% penalty
  - [ ] No target: 0% penalty

- [ ] **Test: estimateRaceIntensity**
  - [ ] 5K run: 90-95 intensity
  - [ ] Marathon run: 80-85 intensity
  - [ ] Ultra run: 70-80 intensity
  - [ ] Bike events: lower than run (0.9x)

### Test Commands

```bash
cd packages/core
pnpm check-types
pnpm test event-recovery
```

### Acceptance

- [ ] All functions implemented
- [ ] All unit tests pass
- [ ] No hardcoded constants
- [ ] Type checking passes
- [ ] Code documented with JSDoc comments

---

## Phase 2 - Remove 99+ Override (Bug #1)

**Objective**: Remove artificial score inflation

Depends on: **Phase 1 complete**

### Checklist

#### 2.1: Code Change

- [ ] Open file: `packages/core/plan/projectionCalculations.ts`
- [ ] Locate `computeGoalReadinessScore()` function (around line 2692)
- [ ] Find the override block (lines 2715-2717):
  ```typescript
  if (state >= 70 && attainment >= 60 && alignmentLoss <= 5) {
    return Math.max(99, scoredReadiness);
  }
  ```
- [ ] Delete the override block (3 lines)
- [ ] Verify the function now returns `scoredReadiness` directly
- [ ] Verify existing synergy boost calculation is preserved

#### 2.2: Write Tests

- [ ] Open/create file: `packages/core/plan/__tests__/projectionCalculations.test.ts`
- [ ] Add test suite: "computeGoalReadinessScore - elite synergy boost removal"

- [ ] **Test: "returns calculated score without 99+ override"**
  - [ ] Call with state=85, attainment=70, alignmentLoss=2
  - [ ] Assert result > 85
  - [ ] Assert result < 95
  - [ ] Assert result !== 99

- [ ] **Test: "never exceeds 100"**
  - [ ] Call with state=100, attainment=100, alignmentLoss=0
  - [ ] Assert result <= 100

- [ ] **Test: "elite synergy boost still applies"**
  - [ ] Call with high state (90, 90, 0)
  - [ ] Call with low state (60, 60, 0)
  - [ ] Assert high state gets bigger boost (multiplicative effect)

- [ ] **Test: "alignment loss still penalizes"**
  - [ ] Call with high scores but high alignment loss
  - [ ] Verify penalty applied

### Test Commands

```bash
cd packages/core
pnpm check-types
pnpm test projectionCalculations
```

### Acceptance

- [ ] Override block removed
- [ ] All new tests pass
- [ ] Existing tests still pass
- [ ] No artificial 99+ scores in test output
- [ ] Type checking passes

---

## Phase 3 - Integrate Post-Event Fatigue (Bug #2)

**Objective**: Apply fatigue penalties after events

Depends on: **Phase 2 complete**

### Checklist

#### 3.1: Update Type Definitions

- [ ] Open file: `packages/core/plan/projection/readiness.ts`
- [ ] Locate `ProjectionPointReadinessGoalInput` interface
- [ ] Add field: `targets?: GoalTargetV2[]`
- [ ] Add import for `GoalTargetV2` type if not present

#### 3.2: Add Import

- [ ] Add import at top of readiness.ts:
  ```typescript
  import {
    computePostEventFatiguePenalty,
    type EventRecoveryProfile,
  } from "./event-recovery";
  ```

#### 3.3: Integrate Fatigue Calculation

- [ ] Open file: `packages/core/plan/projection/readiness.ts`
- [ ] Locate `computeProjectionPointReadinessScores()` function
- [ ] Find where `rawScores` is calculated (around line 420-475)
- [ ] After `rawScores` calculation, add fatigue adjustment:

- [ ] **Add fatigue adjustment block**
  - [ ] Create `fatigueAdjustedScores` array
  - [ ] Map over `rawScores` with index
  - [ ] Initialize `maxFatiguePenalty = 0`
  - [ ] Loop through `goals` array
  - [ ] Skip goals without targets
  - [ ] Call `computePostEventFatiguePenalty()` for each goal
  - [ ] Track max penalty
  - [ ] Return `clampScore(baseScore - maxFatiguePenalty)`

- [ ] **Update all references to use fatigueAdjustedScores**
  - [ ] Smoothing loop: change `prior = rawScores[i]` to `prior = fatigueAdjustedScores[i]`
  - [ ] Blending: change `rawScores[i] ?? 0` to `fatigueAdjustedScores[i] ?? 0`
  - [ ] Goal anchoring: use `fatigueAdjustedScores` in final pass
  - [ ] Early return: change `return rawScores` to `return fatigueAdjustedScores` (if no goals)

#### 3.4: Update Caller

- [ ] Open file: `packages/core/plan/projectionCalculations.ts`
- [ ] Locate `computeProjectionPointReadinessScores()` call (around line 3584)
- [ ] Modify `goals` parameter to include targets:
  - [ ] Map over `goalMarkers`
  - [ ] Find source goal using `input.goals.find()`
  - [ ] Include `targets: sourceGoal?.targets ?? []`

#### 3.5: Write Integration Tests

- [ ] Create file: `packages/core/plan/projection/__tests__/readiness.integration.test.ts`

- [ ] **Test: "applies fatigue penalty day after marathon"**
  - [ ] Create 2-day scenario with marathon on day 1
  - [ ] Assert day 2 readiness < day 1 readiness - 30

- [ ] **Test: "applies max penalty from multiple events"**
  - [ ] Create scenario with marathon day 1, 5K day 3
  - [ ] Check day 4 uses marathon penalty (larger)

- [ ] **Test: "no penalty before event"**
  - [ ] Create scenario with future event
  - [ ] Assert current day not penalized

- [ ] **Test: "penalty decays over time"**
  - [ ] Check days 1, 3, 7, 14 after marathon
  - [ ] Assert decreasing penalty over time

### Test Commands

```bash
cd packages/core
pnpm check-types
pnpm test readiness.integration
pnpm test readiness -- --watch
```

### Acceptance

- [ ] Type definitions updated
- [ ] Fatigue adjustment integrated
- [ ] All references updated correctly
- [ ] Caller passes targets
- [ ] All tests pass
- [ ] Back-to-back marathon scenario shows realistic scores
- [ ] Type checking passes

---

## Phase 4 - Dynamic Peak Windows (Bug #3)

**Objective**: Replace hardcoded 12-day window with dynamic calculation

Depends on: **Phase 3 complete**

### Checklist

#### 4.1: Add Import

- [ ] Open file: `packages/core/plan/projection/readiness.ts`
- [ ] Add `computeEventRecoveryProfile` to existing import from `./event-recovery`

#### 4.2: Update Goal Anchors Calculation

- [ ] Locate goal anchors calculation (around line 459)
- [ ] Replace hardcoded `peakWindow = 12` with dynamic calculation

- [ ] **For each goal in map**:
  - [ ] Get `goalIndex` using `resolveGoalIndex()`
  - [ ] Get `primaryTarget = goal.targets?.[0]`
  - [ ] Create default recovery profile (fallback)
  - [ ] If `primaryTarget` exists:
    - [ ] Get goal point from `input.points[goalIndex]`
    - [ ] Call `computeEventRecoveryProfile()` with target and CTL/ATL
  - [ ] Calculate `taperDays = round(5 + (intensity / 100) * 3)`
  - [ ] Calculate `peakWindow = taperDays + round(recovery_days_full * 0.6)`
  - [ ] Detect conflicts:
    - [ ] Loop through other goals
    - [ ] Calculate days between
    - [ ] Check if `<= recovery_days_functional`
  - [ ] Set `hasConflictingGoal` flag
  - [ ] Return anchor object with new `allowNaturalFatigue` field

#### 4.3: Update Peak Forcing Logic

- [ ] Locate smoothing iterations loop (around line 477)
- [ ] Find goal anchoring section inside loop (around line 491)

- [ ] **Modify peak forcing**:
  - [ ] Add condition: `if (!anchor.allowNaturalFatigue)`
  - [ ] Wrap existing local max logic inside condition
  - [ ] Keep suppression logic outside (still applies to all)

- [ ] Locate final goal anchoring (around line 552)
- [ ] Add same condition for final pass:
  - [ ] Skip anchoring if `anchor.allowNaturalFatigue`

#### 4.4: Write Tests

- [ ] Create file: `packages/core/plan/projection/__tests__/readiness.peak-window.test.ts`

- [ ] **Test: "5K uses shorter window (~10 days)"**
  - [ ] Create 5K goal
  - [ ] Verify suppression range ~10 days

- [ ] **Test: "marathon uses medium window (~15 days)"**
  - [ ] Create marathon goal
  - [ ] Verify suppression range ~15 days

- [ ] **Test: "ultra uses longer window (~21 days)"**
  - [ ] Create ultra goal
  - [ ] Verify suppression range ~21 days

- [ ] **Test: "conflicting goals detected"**
  - [ ] Marathon + 5K 3 days apart = conflict
  - [ ] Marathon + 5K 10 days apart = no conflict

- [ ] **Test: "conflicting goals not forced to peak"**
  - [ ] Back-to-back marathons
  - [ ] Verify day 2 not forced to local max

- [ ] **Test: "isolated goals still forced to peak"**
  - [ ] Single marathon
  - [ ] Verify it's peak of its window

### Test Commands

```bash
cd packages/core
pnpm check-types
pnpm test readiness.peak-window
pnpm test readiness -- --watch
```

### Acceptance

- [ ] No hardcoded 12-day constant
- [ ] Peak windows scale with event type
- [ ] Conflict detection uses dynamic thresholds
- [ ] Conflicting goals respect fatigue
- [ ] Isolated goals maintain peak behavior
- [ ] All tests pass
- [ ] Type checking passes

---

## Phase 5 - Integration Testing & Validation

**Objective**: End-to-end testing and performance validation

Depends on: **Phase 4 complete**

### Checklist

#### 5.1: Integration Test Suite

- [ ] Create file: `packages/core/plan/__tests__/projectionCalculations.integration.test.ts`

- [ ] **Test: "single isolated marathon"**
  - [ ] Create 12-week plan with one marathon
  - [ ] Assert readiness 80-95%
  - [ ] Compare with baseline (should be similar)

- [ ] **Test: "back-to-back marathons (1 day apart)"**
  - [ ] Create scenario with consecutive marathons
  - [ ] Before fix: expect 99/99 (from baseline)
  - [ ] After fix: expect ~88/44
  - [ ] Document the change

- [ ] **Test: "marathon + 5K (3 days apart)"**
  - [ ] Create scenario
  - [ ] Expect 5K shows recovery fatigue
  - [ ] Compare with baseline

- [ ] **Test: "three races over 8 weeks"**
  - [ ] 5K, half marathon, marathon
  - [ ] Each should use appropriate window
  - [ ] Recovery curves should be realistic

- [ ] **Test: "ultra marathon (24-hour race)"**
  - [ ] Should use ~21-day window
  - [ ] Recovery should last 3+ weeks

#### 5.2: Performance Benchmarking

- [ ] Create file: `packages/core/plan/__tests__/performance.bench.ts`

- [ ] **Benchmark: 12-week plan, 3 goals**
  - [ ] Measure total execution time
  - [ ] Assert < 100ms

- [ ] **Benchmark: 24-week plan, 5 goals**
  - [ ] Measure total execution time
  - [ ] Assert < 200ms

- [ ] **Benchmark: recovery profile per goal**
  - [ ] Measure `computeEventRecoveryProfile()` time
  - [ ] Assert < 10ms

- [ ] **Benchmark: fatigue penalty per point**
  - [ ] Measure `computePostEventFatiguePenalty()` time
  - [ ] Assert < 5ms

#### 5.3: Regression Testing

- [ ] Run all existing core tests: `cd packages/core && pnpm test`
- [ ] Check for unexpected failures
- [ ] Update any tests that relied on 99+ override behavior
- [ ] Verify no breaking changes to:
  - [ ] MPC solver
  - [ ] CTL/ATL/TSB calculations
  - [ ] Goal scoring
  - [ ] Calibration system

#### 5.4: Full Validation

- [ ] Run full monorepo validation:
  ```bash
  pnpm check-types && pnpm lint && pnpm test
  ```
- [ ] Fix any type errors
- [ ] Fix any lint warnings
- [ ] Fix any test failures

### Test Commands

```bash
# Unit tests
cd packages/core
pnpm test event-recovery
pnpm test readiness
pnpm test projectionCalculations

# Integration tests
cd packages/core
pnpm test --runInBand

# Performance
cd packages/core
pnpm test performance.bench

# Full validation
cd /home/deancochran/GradientPeak
pnpm check-types && pnpm lint && pnpm test
```

### Acceptance

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Performance within budget
- [ ] No regressions detected
- [ ] Type checking passes across monorepo
- [ ] Linting passes across monorepo

---

## Phase 6 - Documentation & Release

**Objective**: Document changes and prepare for release

Depends on: **Phase 5 complete**

### Checklist

#### 6.1: Code Documentation

- [ ] Add JSDoc to `packages/core/plan/projection/event-recovery.ts`:
  - [ ] `EventRecoveryProfile` interface
  - [ ] `computeEventRecoveryProfile()` function
  - [ ] `computePostEventFatiguePenalty()` function
  - [ ] Document formulas and rationale

- [ ] Update JSDoc in `packages/core/plan/projection/readiness.ts`:
  - [ ] `computeProjectionPointReadinessScores()` function
  - [ ] Document post-event fatigue integration
  - [ ] Document dynamic peak window logic

- [ ] Update JSDoc in `packages/core/plan/projectionCalculations.ts`:
  - [ ] `computeGoalReadinessScore()` function
  - [ ] Document removal of 99+ override
  - [ ] Explain elite synergy boost formula

#### 6.2: Release Notes

- [ ] Create draft release notes
- [ ] **Breaking Changes**: None
- [ ] **Improvements**:
  - [ ] Readiness scores now reflect post-event fatigue
  - [ ] Back-to-back events show realistic recovery
  - [ ] Event-specific recovery windows (dynamic, no constants)
  - [ ] Removed artificial 99+ score inflation
- [ ] **User Impact**:
  - [ ] Readiness scores may be lower for aggressive plans
  - [ ] More realistic feasibility assessment
  - [ ] Better race scheduling guidance
- [ ] **Technical Details**:
  - [ ] List affected functions
  - [ ] Document formula changes
  - [ ] Performance characteristics

#### 6.3: Migration Guide

- [ ] **For Developers**:
  - [ ] No API changes required
  - [ ] Existing calibration parameters respected
  - [ ] Test baselines may need updates
  - [ ] Expected score changes documented

- [ ] **For Users**:
  - [ ] Readiness scores will change (expected)
  - [ ] Aggressive plans show honest consequences
  - [ ] No action required
  - [ ] Benefits of more realistic scores

#### 6.4: Update Spec Files

- [ ] Mark all tasks complete in this file
- [ ] Update design.md with any learnings
- [ ] Update plan.md with actual implementation notes
- [ ] Archive to `.opencode/specs/2026-02-17_readiness-score-bug-fix/`

### Acceptance

- [ ] All code documented
- [ ] Release notes drafted and reviewed
- [ ] Migration guide complete
- [ ] Spec files updated
- [ ] Ready for deployment

---

## Rollout Checklist

### Pre-Deployment

- [ ] All phases 0-6 complete
- [ ] Full test suite passes
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] Release notes approved

### Deployment

- [ ] Deploy to staging environment
- [ ] Run smoke tests on staging
- [ ] Validate readiness score changes
- [ ] Deploy to production
- [ ] Monitor for issues

### Post-Deployment

- [ ] Monitor error logs
- [ ] Collect user feedback
- [ ] Track performance metrics
- [ ] Document any issues
- [ ] Plan for v2 improvements if needed

---

## Success Metrics

### Technical

- [ ] 0 regressions in existing functionality
- [ ] <100ms performance for typical plans
- [ ] 100% test coverage for new code
- [ ] All type checking passes

### User Experience

- [ ] Readiness scores trusted as realistic
- [ ] No confusion about score changes
- [ ] Positive feedback on accuracy
- [ ] No critical bugs reported

---

## Notes

- Keep changes isolated to `@repo/core` package
- No API or database changes required
- No UI changes required
- Existing calibration system still works
- Can be deployed independently

## Estimated Time

- Phase 0: 2 hours
- Phase 1: 4 hours
- Phase 2: 1 hour
- Phase 3: 3 hours
- Phase 4: 4 hours
- Phase 5: 4 hours
- Phase 6: 2 hours

**Total**: ~20 hours
