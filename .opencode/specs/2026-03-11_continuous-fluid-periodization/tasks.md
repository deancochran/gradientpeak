# Tasks: Continuous Fluid Periodization (MVP Architecture)

## Phase 1: The Heuristic Reference Generator

- [ ] Create `resolveEventDemand` helper to extract max distance/duration from `GoalTargetV2`.
- [ ] Implement dynamic taper duration logic (7-28 days) based on event demand.
- [ ] Create `generateReferenceTrajectory` function that outputs an array of daily target CTL values.
- [ ] Architect the `generateReferenceTrajectory` to be completely independent of planned/completed calendar events, outputting a smoothed daily baseline.
- [ ] Implement `ConstraintResolver` to map user Risk Profile (Conservative, Moderate, Aggressive) to Max Ramp, Max ACWR, and Min TSB.
- [ ] Implement `FeasibilityEngine` to detect if required ramp rate exceeds the user's Max Ramp limit.
- [ ] Implement _Target-Seeking Mode_ (reverse curve generation tracing backward from goal date) for feasible goals.
- [ ] Implement _Capacity-Bounded Mode_ (forward simulation "Best Effort" curve) for infeasible goals, calculating the "Readiness Gap".

## Phase 2: Multi-Goal Trajectory Merging

- [ ] Update projection input to accept an array of all profile goals with priorities and demands.
- [ ] Implement logic to identify A, B, and C priority events on the timeline.
- [ ] Implement "training through" logic: draw micro-tapers on the reference curve for B/C events.
- [ ] Implement residual training effect calculations to connect multiple peaks smoothly.

## Phase 3: MPC Objective Function Refactoring

- [ ] Inject the `ReferenceTrajectory` into the `WeeklyTssOptimizerInput`.
- [ ] Refactor `evaluateWeeklyTssCandidateObjectiveDetails` to calculate MSE against the reference curve.
- [ ] Tune objective weights: balance trajectory tracking vs. safety/fatigue penalties.
- [ ] Verify the MPC receding horizon correctly anticipates upcoming tapers on the reference curve.

## Phase 4: Micro-cycle Instantiation (DUP)

- [ ] Implement Daily Undulating Periodization (DUP) workout selection logic based on daily TSS targets.
- [ ] Enforce 80/20 Polarized Training constraints across the generated micro-cycles.

## Phase 5: Validation & Testing

- [ ] Write unit tests for dynamic taper scaling based on distance/duration.
- [ ] Write unit tests for multi-goal reference curve generation (e.g., A-race 4 weeks after a B-race).
- [ ] Write integration tests for the MPC trajectory tracker (normal state vs. high fatigue state).
- [ ] Benchmark MPC execution time to ensure it remains under 50ms per projection.
