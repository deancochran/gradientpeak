# Tasks: Continuous Fluid Periodization (MVP Architecture)

## Phase 1: The Heuristic Reference Generator

- [ ] Create `resolveEventDemand` helper to extract max distance/duration from `GoalTargetV2`.
- [ ] Implement dynamic taper duration logic (7-28 days) based on event demand.
- [ ] Create `generateReferenceTrajectory` function that outputs an array of daily target CTL values.
- [ ] Implement reverse curve generation logic (tracing backward from goal date using max safe ramp rate).

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
