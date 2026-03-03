# Phase 8 Implementation Plan

## Phase 8.1: Readiness Projection UI Integration
Objective: Surface the already-built projection calculations and readiness scores.
1. Wire `projectionCalculations.ts` readiness scores into Goal/Target UI.
2. Translate `unmet_gap` per target type into a "Zone Need" signal (e.g. `power_threshold` -> Z4).

## Phase 8.2: Core Recommendation Engine
Objective: Pure function candidate scoring in `@repo/core`.
1. Implement `calculateActivityPlanTss` and `calculateZoneDistribution` if not fully exposed.
2. Implement `scoreActivityPlanCandidates(target, plans, context)` returning scored, sorted candidates with rationale codes.

## Phase 8.3: TRPC API
Objective: Transport layer for recommendations.
1. Add `trainingPlans.recommendDailyActivity` endpoint.
2. Fetch user's available `activity_plans` (owned + library).
3. Call core scoring engine and return top 3.

## Phase 8.4: Mobile UX
Objective: Present recommendations to the user.
1. Add "Recommended for Today" section on Home feed / Calendar.
2. Show top 3 candidates with natural language rationale (derived from codes).
