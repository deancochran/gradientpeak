# Tasks: Continuous Fluid Periodization

## Phase 1: Core Engine Refactoring

- [ ] Update `projectionCalculations.ts` to support continuous EWMA curve generation.
- [ ] Implement reverse curve generation logic from a target date and CTL.
- [ ] Define safe maximum weekly Ramp Rate constraints within the continuous model.

## Phase 2: Holistic Multi-Goal Optimization

- [ ] Update projection input to accept an array of all profile goals with priorities and demands.
- [ ] Implement logic to identify A, B, and C priority events on the timeline.
- [ ] Implement "training through" logic for B/C events (micro-tapers).
- [ ] Implement residual training effect calculations for overlapping goals.

## Phase 3: Dynamic Taper & Recovery Scaling

- [ ] Create `resolveEventDemand` helper to extract max distance/duration from `GoalTargetV2`.
- [ ] Update `buildGoalPatternInfluence` to use dynamic taper days (7-28 days) based on event demand.
- [ ] Update `computeContinuousTransitionAdjustment` to use dynamic proximity penalty windows.
- [ ] Update post-goal recovery segment generation to use Distance or TSS formulas.

## Phase 4: Micro-cycle Instantiation (DUP)

- [ ] Implement Daily Undulating Periodization (DUP) workout selection logic based on daily TSS targets.
- [ ] Enforce 80/20 Polarized Training constraints across the generated micro-cycles.

## Phase 5: Validation & Testing

- [ ] Write unit tests for dynamic taper and recovery scaling.
- [ ] Write unit tests for reverse continuous curve generation.
- [ ] Write integration tests for multi-goal scenarios (e.g., A-race 4 weeks after a B-race).
- [ ] Verify no regressions in existing projection payload schemas.
