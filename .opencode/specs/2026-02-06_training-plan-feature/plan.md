# Training Plan Feature Alignment Plan (MVP)

## 1) Purpose

This plan aligns the current implementation with the vision in `design.md` while staying within MVP constraints:

- no database schema changes,
- minimal setup and minimal interaction,
- beautiful but minimal charts,
- safety-first boundaries,
- dynamic computations from existing data,
- only `weight_kg` and `lthr` from `profile_metrics`.

This document is written for implementers and reviewers to understand exactly what must change and in what order.

---

## 2) Scope and Constraints

### In Scope

- Training plan setup simplification to required `goal + target_date`.
- Optional advanced configuration for categories and constraints.
- Three-path system: Ideal, Scheduled, Actual.
- Adherence, safety boundaries, and feasibility classification.
- Capability and projection outputs from `activity_efforts` and activity history.
- Mobile plan pages update to minimal, low-friction UX.

### Out of Scope (MVP)

- Database migrations or new tables/columns.
- Recommendation or auto-prescription engine.
- New readiness features beyond `weight_kg` and `lthr`.
- Complex animation systems or style-heavy interactions.

---

## 3) Current System Baseline (What Exists)

### Backend + Data

- Training plans are stored in `training_plans.structure` JSON and validated by core schemas.
- Planned activities are stored in `planned_activities` with current fields only (`activity_plan_id`, `training_plan_id`, `scheduled_date`, `notes`, timestamps).
- CTL/ATL/TSB and planned-vs-actual style summaries already exist in `training_plans` and `home` routers.
- Capability primitives already exist via `analytics` router (`getSeasonBestCurve`, `predictPerformance`).

### Mobile

- Plan creation currently uses a high-configuration flow with many required/near-required controls.
- Plan tab and training-plan screens show progress and charting, but not full three-path + boundary + feasibility contract.

### Core

- Training plan structure schemas are rich and valid for periodized plans.
- Existing calculations can support CTL/ATL/TSB-based path derivation and guardrails.

---

## 4) Gap Summary (Design vs Current)

1. Setup is not yet truly minimal (`goal + date` first, everything else optional).
2. Ideal/Scheduled/Actual are partially represented but not unified under one canonical contract.
3. Safety/boundary state and feasibility classification are not first-class API outputs.
4. Capability and projection outputs are available in pieces, not integrated into plan insight payloads.
5. Mobile pages expose data but do not present the intended minimal decision-support flow.

---

## 5) Target MVP Architecture (No Schema Changes)

## 5.1 Canonical JSON in `training_plans.structure`

Add/standardize top-level JSON keys (backward-compatible):

- `goal`: `{ type, target_date, target_metric? }` (required for new flow)
- `defaults`: generated defaults for activity categories, weekly targets, progression
- `advanced`: optional user overrides (categories, availability, ramp aggressiveness, etc.)
- `safety`: computed thresholds used by guardrail logic
- `version`: semantic config version for migration-safe parsing

Notes:

- Keep legacy fields valid and continue parsing old structures.
- Add normalization layer in backend/core to map old and new shape into one internal model.

## 5.2 Canonical Insight Contract (Unified)

Create one response contract for plan insight endpoints:

- `timeline`: daily points with `ideal`, `scheduled`, `actual`, `adherence`
- `boundary`: `safe | caution | exceeded` + threshold reasons
- `feasibility`: `feasible | aggressive | unsafe` + reason summary
- `projection`: current and target-date projection + confidence/drivers

## 5.3 Derivation Model

- Ideal Path: perfect-athlete normative execution from plan configuration.
- Scheduled Path: planned calendar workload derived from `planned_activities` + plan estimations.
- Actual Path: completed activities from `activities` and current load metrics.
- Adherence: weighted score from Actual-vs-Scheduled and Scheduled-vs-Ideal.
- Capability: CP/CS from effort curve fits (with sparse-data confidence fallback).
- Feasibility: setup-time and refresh-time classification against safety/ramp limits.

---

## 6) Implementation Phases

## Phase 0 - Contract and Compatibility Foundation

Objective: define strict internal contracts before UI rewrite.

Work:

- Define internal normalized training plan model in core (new + legacy JSON compatibility).
- Define TypeScript/Zod contracts for:
  - three-path points,
  - adherence point,
  - boundary state,
  - feasibility state,
  - projection summary.
- Add parser/normalizer utilities used by routers.

Exit Criteria:

- Existing plans still parse.
- New plans parse with minimal `goal + target_date`.
- Contract tests pass for legacy and new JSON variants.

## Phase 1 - Minimal Plan Creation Flow

Objective: make plan creation fast and default-driven.

Work:

- Update mobile create flow so required inputs are only:
  - goal,
  - target date.
- Move categories/availability/ramp/distribution into optional advanced section.
- Add backend plan generation defaults for missing optional inputs.
- Add feasibility pre-check at setup submit.

Exit Criteria:

- New user can create a valid plan in <= 60 seconds with only goal/date.
- Advanced options remain available but optional.
- Feasibility result is visible before final create.

## Phase 2 - Three-Path + Safety Engine

Objective: make insight computation consistent and dynamic.

Work:

- Implement/standardize backend computation module for:
  - Ideal/Scheduled/Actual daily points,
  - adherence score and state,
  - boundary state and violated thresholds.
- Add recompute triggers in existing mutation/query flows:
  - activity create/update/delete,
  - planned activity create/update/delete,
  - training plan update/adjustment.
- Ensure timezone/week-boundary handling is consistent across endpoints.

Exit Criteria:

- All path outputs available for 7/30/90 windows.
- Boundary states and reasons present for each point.
- Missed/rescheduled behavior updates insights on next fetch.

## Phase 3 - Capability + Projection Integration

Objective: connect capability math to plan decision support.

Work:

- Reuse `activity_efforts` analytics to produce capability timeline summaries by category.
- Add projection endpoint for arbitrary date within plan horizon.
- Add confidence and driver explanations (sparse data handling included).
- Restrict profile metric influence to weight + LTHR in this phase.

Exit Criteria:

- CP/CS-based projection available at goal date and arbitrary date.
- Confidence and top drivers returned consistently.
- Behavior is deterministic under sparse/noisy input conditions.

## Phase 4 - Mobile Plan Page Alignment (Minimal UX)

Objective: deliver minimalistic, clear, functional UI.

Work:

- Update plan-related pages to show one primary insight path:
  - top summary card (on-track/boundary/feasibility),
  - three-path chart,
  - compact adherence trend,
  - expandable details for reasons/drivers.
- Keep interactions minimal (tap-to-expand only where needed).
- Remove noisy controls from main surfaces; keep advanced actions secondary.

Chart Requirements:

- clear contrast,
- clean grid/legend,
- consistent color semantics for safe/caution/exceeded,
- no animation dependency for comprehension.

Exit Criteria:

- User can understand current state in <= 2 taps.
- Visual hierarchy prioritizes safety and progression clarity.
- No functionality loss vs current screens.

## Phase 5 - Activity Plan and Scheduling Alignment

Objective: ensure activity-plan workflows feed the new insight model correctly.

Work:

- Ensure planned activity operations preserve Scheduled Path stability.
- Standardize interpretation rules for:
  - completed,
  - skipped,
  - rescheduled,
  - expired,
    via application logic (no new columns).
- Validate scheduling constraints against safety boundaries during edits.

Exit Criteria:

- Calendar edits immediately reflect in Scheduled/Adherence outputs.
- Status interpretation is consistent across backend and mobile UI.

## Phase 6 - QA, Instrumentation, Rollout

Objective: ship safely with measurable quality.

Work:

- Unit tests for formulas, guardrails, feasibility thresholds, confidence behavior.
- Integration tests for endpoint contract completeness and recomputation behavior.
- Mobile E2E for:
  - quick create,
  - plan insight view,
  - schedule change impact.
- Add instrumentation for insight generation, boundary rates, adherence distribution, latency.

Exit Criteria:

- All acceptance criteria in `design.md` are mapped to tests.
- Feature flag rollout path is verified.
- Regression checklist signed by reviewer.

---

## 7) File-Level Execution Map

Likely primary implementation areas:

- Core schemas/calculations:
  - `packages/core/schemas/training_plan_structure.ts`
  - `packages/core/calculations.ts`
  - new or adjacent plan-insight calculation modules in `packages/core`
- tRPC routers:
  - `packages/trpc/src/routers/training_plans.ts`
  - `packages/trpc/src/routers/planned_activities.ts`
  - `packages/trpc/src/routers/analytics.ts`
  - `packages/trpc/src/routers/home.ts`
- Mobile pages/components:
  - `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
  - `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
  - `apps/mobile/app/(internal)/(tabs)/plan.tsx`
  - `apps/mobile/components/charts/PlanVsActualChart.tsx`

---

## 8) Reviewer Checklist

- Setup flow requires only goal + target date.
- Advanced setup is optional and does not block creation.
- No DB schema migration included.
- Three-path contract is present and consistent in API responses.
- Boundary and feasibility states are explicit and human-readable.
- Projection/capability outputs include confidence and drivers.
- Mobile plan UX is minimal, clear, and functionally complete.
- Tests prove safety logic, sparse-data fallback, and recompute behavior.

---

## 9) Completion Definition for This Feature

Feature is complete when:

1. A new user can create a plan from goal + date only, quickly.
2. Plan screens clearly show Ideal/Scheduled/Actual with adherence and safety boundaries.
3. Unsafe or unrealistic plans are clearly flagged with reasons.
4. Capability and projection insights are available and confidence-labeled.
5. All of the above ship without database schema changes.
