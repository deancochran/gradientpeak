# Phase 8 Tasks: Continuous Feature Recommendation Engine

## Database & Models (8.1.5)
- [ ] Create Supabase migration to add metrics columns (`estimated_tss`, `estimated_duration_seconds`, `intensity_factor`, `target_z1_ratio`, `target_z2_ratio`, `target_z3_ratio`, `target_z4_ratio`, `target_z5_ratio`, `target_z6_ratio`, `target_z7_ratio`) to `activity_plans` table.
- [ ] Update `activity_plan` schema in `@repo/core` to include the new continuous metric fields.
- [ ] Implement `calculateActivityPlanFeatures` logic in `@repo/core` to generate continuous metric profiles for both structured AND unstructured plans.
- [ ] Update `activityPlans.save` tRPC endpoint to calculate and save these continuous metrics in the database upon creation/update of a plan.

## Core Scoring Engine (8.2)
- [ ] Implement `ActivityTargetProfile` type/schema matching the continuous metrics shape.
- [ ] Implement `scoreActivityPlanCandidates(targetProfile, plans)` in `@repo/core` calculating mathematical distance. Implement safety/constraint rejections (e.g., hard rejection if ACWR > 1.5).
- [ ] Write unit tests for the core distance scoring and constraint logic.

## TRPC API (8.3)
- [ ] Implement TRPC endpoint `trainingPlans.recommendDailyActivity`.
- [ ] Given user's `unmet_gap`, dynamically construct a daily `TargetProfile`.
- [ ] Fetch the user's available `activity_plans`.
- [ ] Use `scoreActivityPlanCandidates` to score plans, select the top 3, and return them with rationales.

## Mobile UI (8.4)
- [ ] Add "Recommended for Today" section on home/calendar view.
- [ ] Integrate TRPC call to fetch recommendations.
- [ ] Build visual card for recommended plans showing expected TSS and duration.
- [ ] Verify navigation flows to start the recommended plan.
