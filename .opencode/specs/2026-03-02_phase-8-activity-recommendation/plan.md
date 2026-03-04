# Phase 8 Implementation Plan

## Phase 8.1: Readiness Projection UI Integration

Objective: Surface the already-built projection calculations and readiness scores.

1. Wire `projectionCalculations.ts` readiness scores into Goal/Target UI.
2. Translate `unmet_gap` per target type into a "Zone Need" signal (e.g. `power_threshold` -> Z4).

## Phase 8.1.5: Database Migration (NEW)

Objective: Add dedicated continuous metric columns to the `activity_plans` table.

1. Create a Supabase migration to add columns:
   - `estimated_tss` (numeric)
   - `estimated_duration_seconds` (integer)
   - `intensity_factor` (numeric)
   - `target_z1_ratio` through `target_z7_ratio` (numeric, default 0.0)
2. Update `@repo/core` `activity_plan` schemas to reflect these new columns.
3. Update the tRPC `activityPlans.save` endpoint to compute these metrics (using heuristics for unstructured plans and structural calculations for structured ones) and store them in the database.

## Phase 8.2: Core Recommendation Engine

Objective: Pure function candidate scoring in `@repo/core` using Continuous Feature Distance.

1. Implement `calculateActivityPlanFeatures` (the helper that calculates the metrics prior to save).
2. Implement `scoreActivityPlanCandidates(targetProfile, plans)` that calculates the weighted absolute difference between the `targetProfile` and each plan's stored feature metrics.

## Phase 8.3: TRPC API

Objective: Transport layer for recommendations.

1. Add `trainingPlans.recommendDailyActivity` endpoint.
2. Fetch user's available `activity_plans` (owned + library).
3. Generate the user's daily `targetProfile` based on `unmet_gap`.
4. Call core scoring engine and return top 3.

## Phase 8.4: Mobile UX

Objective: Present recommendations to the user.

1. Add "Recommended for Today" section on Home feed / Calendar.
2. Show top 3 candidates with natural language rationale.
