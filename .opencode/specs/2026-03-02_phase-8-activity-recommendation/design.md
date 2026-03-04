# Phase 8: Goals Engine & Activity Recommendation Design

## Problem

Goals and targets currently exist and projection calculations are largely complete (Phase 8.1 MVP), but the system cannot translate a projected gap into a concrete, actionable daily recommendation. Users need to know exactly which activity plan to perform on a given day to close the gap to their goals safely.

## Solution

1. **Goal Readiness Completion (8.1)**: Verify and expose the readiness and optimal performance curve outputs already implemented in `projectionCalculations.ts` to the UI. Ensure `unmet_gap` translates cleanly to target metric signals.
2. **Activity Recommendation Engine (8.2)**: Build a new recommendation engine in `@repo/core` that computes a target daily profile (target TSS, target Zone Ratios, etc.) and compares it to available Activity Plans using a Continuous Feature Distance model.
3. **TRPC and Mobile UI**: Expose the recommendation engine via a new TRPC endpoint and build the daily recommendation view on the mobile calendar/home feed.

## Continuous Feature Distance Model

Instead of relying on arbitrary point-scoring heuristics or requiring detailed interval structures, we represent both the **User's Target Daily Need** and **Every Activity Plan** as a vector of continuous features.

The recommendation score is simply the absolute difference (distance) between the user's target vector and the plan's feature vector. The plan with the lowest distance is the best recommendation.

### Core Metrics (The Feature Vector)

Every `activity_plan` will have the following dedicated numeric columns in the database:

- `estimated_tss` (Numeric)
- `estimated_duration_seconds` (Integer)
- `intensity_factor` (Numeric)
- `target_z1_ratio` (0.0 - 1.0)
- `target_z2_ratio` (0.0 - 1.0)
- `target_z3_ratio` (0.0 - 1.0)
- `target_z4_ratio` (0.0 - 1.0)
- `target_z5_ratio` (0.0 - 1.0)
- `target_z6_ratio` (0.0 - 1.0)
- `target_z7_ratio` (0.0 - 1.0)

### CRITICAL REQUIREMENT: Universal Applicability

These metrics **MUST** be applicable to _all_ types of activity plans, not just those with derivable zone data (like structural cycling workouts).

- If a plan is unstructured (e.g., "Run for 45 mins at RPE 4"), the system _must_ still generate a valid feature profile upon saving the plan. It will use heuristics to map RPE to an estimated Intensity Factor (IF) and allocate a primary zone ratio (e.g., 80% Z2) so it can be scored mathematically alongside structured workouts.

### Scoring Math

When the user requests a recommendation, the engine will:

1. Determine the user's `TargetProfile` (e.g., Target TSS: 50, Target Z2 Ratio: 0.8).
2. For each available plan, calculate a weighted absolute difference:
   `Distance = Weight_TSS * |Target_TSS - Plan_TSS| + Weight_Zone * Σ|Target_Zone_Ratio[i] - Plan_Zone_Ratio[i]|`
3. Filter out plans that violate safety constraints (e.g., pushing ACWR > 1.5).
4. Return the plans with the lowest `Distance` score.
