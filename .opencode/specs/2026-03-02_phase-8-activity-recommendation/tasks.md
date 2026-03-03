# Phase 8 Tasks: Goals Engine & Activity Recommendation

**Status:** In Progress
**Owner:** Coordinator Agent
**Date:** 2026-03-03

This is a living document. Sub-agents should update the status of tasks as they progress, add notes, and mark items as complete `[x]`.

## 1. Core Engine (Phase 8.2)

- [x] **Task 1.1:** (core) Implement `ActivityRecommendationEngine` with TSS proximity and zone alignment scoring.
  - _Status:_ Completed
  - _Notes:_ Implemented in `packages/core/plan/recommendation/engine.ts`.
- [x] **Task 1.2:** (core) Add safety caps (ACWR) rejection logic to candidate scoring.
  - _Status:_ Completed
  - _Notes:_ Added hard rejection for plans pushing ACWR > 1.5.
- [x] **Task 1.3:** (core) Write unit tests for recommendation sorting and rationale codes.
  - _Status:_ Completed
  - _Notes:_ Tests added in `packages/core/plan/recommendation/__tests__/engine.test.ts`.

## 2. API Transport (Phase 8.3)

- [x] **Task 2.1:** (trpc) Create `training-plans.recommendations.ts` or add to existing router.
  - _Status:_ Completed
  - _Notes:_ Added `recommendDailyActivity` endpoint to `activity_plans.ts` router.
- [x] **Task 2.2:** (trpc) Wire database fetch for candidate plans (owned + library).
  - _Status:_ Completed
  - _Notes:_ Fetches owned and public plans, applies dynamic estimation for TSS and zones.
- [x] **Task 2.3:** (trpc) Add API endpoint tests.
  - _Status:_ Completed
  - _Notes:_ Added test in `packages/trpc/src/routers/__tests__/activity-plans.recommendations.test.ts`.

## 3. UI Integration (Phase 8.1 & 8.4)

- [x] **Task 3.1:** (mobile) Surface goal readiness `unmet_gap` on goal details screen.
  - _Status:_ Completed
  - _Notes:_ Verified `projectionCalculations.ts` output is fully surfaced in `SinglePageForm.tsx`.
- [x] **Task 3.2:** (mobile) Build "Recommended for Today" UI component on Home feed / Calendar.
  - _Status:_ Completed
  - _Notes:_ Built `RecommendedActivitySection.tsx` on Home Feed and mapped target type.
- [x] **Task 3.3:** (mobile) Map rationale codes to human-readable explanations.
  - _Status:_ Completed
  - _Notes:_ Mapped inside `RecommendedActivitySection.tsx`.
