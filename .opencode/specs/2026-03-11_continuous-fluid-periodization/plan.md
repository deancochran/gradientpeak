# Plan: Continuous Fluid Periodization

## Phase 1: Core Engine Refactoring (Continuous Curves)

- **Objective:** Shift the projection engine from block-based phase assignment to continuous EWMA curve generation.
- **Strategy:**
  - Update `projectionCalculations.ts` to prioritize target CTL/ATL/TSB calculations over rigid phase labels.
  - Implement reverse curve generation logic, starting from the target date and working backward using a safe maximum weekly Ramp Rate.

## Phase 2: Holistic Multi-Goal Optimization

- **Objective:** Process all profile goals simultaneously to generate a single, unified training curve.
- **Strategy:**
  - Modify the input vector to accept an array of all goals with their respective priorities (A, B, C) and demands.
  - Implement logic to handle overlapping goals and "training through" B/C priority races using micro-tapers and residual training effect calculations.

## Phase 3: Dynamic Taper & Recovery Scaling

- **Objective:** Scale taper and recovery durations based on event distance and TSS demand.
- **Strategy:**
  - Create helper functions to extract `distance_m` and `target_time_s` from `GoalTargetV2`.
  - Replace static taper windows (e.g., 7 days) with dynamic calculations (7 to 28 days based on demand).
  - Replace static proximity penalties with dynamic windows.
  - Implement dynamic post-goal recovery segments based on the Distance or TSS formulas.

## Phase 4: Micro-cycle Instantiation (DUP)

- **Objective:** Translate continuous daily TSS targets into specific workout structures.
- **Strategy:**
  - Implement Daily Undulating Periodization (DUP) logic to select workout types (Long, Threshold, VO2max) that fulfill the daily TSS requirement.
  - Enforce Polarized Training constraints (e.g., 80% low intensity, 20% high intensity) across the continuous curve.

## Phase 5: Validation & Testing

- **Objective:** Ensure the new continuous model generates safe, effective, and mathematically sound training plans.
- **Strategy:**
  - Write unit tests for the reverse curve generation and dynamic scaling logic.
  - Validate the multi-goal optimization with complex scenarios (e.g., overlapping A and B races).
  - Ensure backward compatibility or graceful migration for existing user plans.
