# Training Plan Implementation Alignment Plan (MVP)

This plan is the implementation bridge between:

- product/design intent in `./design.md`, and
- current code in core, tRPC, and mobile.

It is written so a reviewer can understand exactly what will change, where, and why.

## 1) Hard Constraints (must hold)

- No database schema changes in this phase.
- Setup must allow required input only: `goal + target_date`.
- Activity category and advanced controls are optional.
- No recommendation engine / no auto-prescription language or behavior.
- Safety and feasibility boundaries must be explicit and visible.
- `profile_metrics` usage is limited to `weight_kg` and `lthr`.

---

## 2) Current Implementation Baseline

## 2.1 Backend and Data (already implemented)

- Plan storage + validation:
  - `packages/trpc/src/routers/training_plans.ts`
  - `packages/core/schemas/index.ts`
  - `packages/core/schemas/training_plan_structure.ts`
- Planned activity CRUD + schedule constraint checks:
  - `packages/trpc/src/routers/planned_activities.ts`
- Current CTL/ATL/TSB and planned-vs-actual behavior:
  - `packages/trpc/src/routers/training_plans.ts`
  - `packages/trpc/src/routers/home.ts`
- Capability primitives from effort data:
  - `packages/trpc/src/routers/analytics.ts`

## 2.2 Mobile (already implemented)

- Current creation flow is config-heavy:
  - `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
  - `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
- Plan tab currently renders plan-vs-actual trend and cards:
  - `apps/mobile/app/(internal)/(tabs)/plan.tsx`
  - `apps/mobile/components/charts/PlanVsActualChart.tsx`

## 2.3 Known Design/Code Gaps

1. Creation UX is not yet minimal-first (`goal + date`).
2. Three-path contract exists in pieces, not as one canonical API payload.
3. Boundary + feasibility are not first-class response fields.
4. Capability projections are available but not integrated into plan insight timeline.
5. Mobile plan screens are functional but not yet aligned to minimal decision-support IA.

---

## 3) Target Technical Architecture (MVP)

## 3.1 Canonical Internal Plan Config (JSON in `training_plans.structure`)

No table changes; evolve JSON shape with compatibility parser.

```ts
// packages/core/schemas/training-plan-insight.ts (new)
export const mvpPlanConfigSchema = z.object({
  version: z.literal("mvp.v1"),
  goal: z.object({
    type: z.enum([
      "marathon",
      "half_marathon",
      "10k",
      "5k",
      "general_endurance",
      "custom",
    ]),
    target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    target_metric: z.string().optional(),
  }),
  defaults: z.object({
    activity_distribution: z.record(z.string(), z.number()).default({ run: 1 }),
    weekly_tss_start: z.number().min(0),
    ramp_rate: z.number().min(0.01).max(0.15),
  }),
  advanced: z.record(z.string(), z.unknown()).optional(),
  safety: z.object({
    weekly_ramp_soft: z.number(),
    weekly_ramp_hard: z.number(),
    max_consecutive_days: z.number().int().min(1).max(7),
  }),
});
```

Compatibility strategy:

- New plans write `version: "mvp.v1"`.
- Existing plans remain valid.
- Router-side normalization maps legacy shapes into one internal config model.

```ts
// packages/core/plan/normalizePlanConfig.ts (new)
export function normalizePlanConfig(structure: unknown): NormalizedPlanConfig {
  if (isMvpV1(structure)) return fromMvpV1(structure);
  if (isLegacyPeriodized(structure)) return fromLegacyPeriodized(structure);
  if (isLegacyMaintenance(structure)) return fromLegacyMaintenance(structure);
  throw new Error("Unsupported training plan structure");
}
```

## 3.2 Canonical Insight Contract (single payload)

```ts
// packages/core/schemas/training-plan-insight.ts (new)
export const planInsightPointSchema = z.object({
  date: z.string(),
  ideal_tss: z.number(),
  scheduled_tss: z.number(),
  actual_tss: z.number(),
  adherence_score: z.number().min(0).max(100),
  boundary_state: z.enum(["safe", "caution", "exceeded"]),
  boundary_reasons: z.array(z.string()),
});

export const planInsightResponseSchema = z.object({
  window: z.object({
    start_date: z.string(),
    end_date: z.string(),
    timezone: z.string(),
  }),
  feasibility: z.object({
    state: z.enum(["feasible", "aggressive", "unsafe"]),
    reasons: z.array(z.string()),
  }),
  capability: z.object({
    category: z.string(),
    cp_or_cs: z.number().nullable(),
    confidence: z.number().min(0).max(1),
  }),
  projection: z.object({
    at_goal_date: z.object({
      projected_goal_metric: z.number().nullable(),
      confidence: z.number().min(0).max(1),
    }),
    drivers: z.array(z.string()),
  }),
  timeline: z.array(planInsightPointSchema),
});
```

## 3.3 Core Calculation Rules (deterministic)

Adherence formula (documented and testable):

```ts
// packages/core/plan/adherence.ts (new)
// Keep weights configurable via constants for MVP tuning.
const W_ACTUAL_VS_SCHEDULED = 0.7;
const W_SCHEDULED_VS_IDEAL = 0.3;

export function adherenceScore(
  idealTss: number,
  scheduledTss: number,
  actualTss: number,
): number {
  const avs = ratioScore(actualTss, scheduledTss); // 0..100
  const svi = ratioScore(scheduledTss, idealTss); // 0..100
  return clamp(
    Math.round(avs * W_ACTUAL_VS_SCHEDULED + svi * W_SCHEDULED_VS_IDEAL),
    0,
    100,
  );
}
```

Boundary classification (no recommendation, only safety state):

```ts
// packages/core/plan/boundary.ts (new)
export function classifyBoundary(input: BoundaryInput): BoundaryResult {
  const reasons: string[] = [];
  if (input.weeklyRampPct > input.hardRampPct)
    reasons.push("ramp_rate_hard_exceeded");
  if (input.consecutiveTrainingDays > input.maxConsecutiveDays)
    reasons.push("consecutive_days_exceeded");
  if (input.tsb < input.tsbHardFloor) reasons.push("fatigue_exceeded");

  if (reasons.length > 0) return { state: "exceeded", reasons };

  const caution =
    input.weeklyRampPct > input.softRampPct || input.tsb < input.tsbSoftFloor;

  return caution
    ? { state: "caution", reasons: ["near_boundary"] }
    : { state: "safe", reasons: [] };
}
```

Feasibility classification at setup (required for unrealistic goals):

```ts
// packages/core/plan/feasibility.ts (new)
export function classifyFeasibility(x: FeasibilityInput): FeasibilityResult {
  // Example thresholds from design; finalize in product tuning.
  if (
    x.prepTimeRatio < 0.5 ||
    x.requiredWeeklyRampPct > 15 ||
    x.capabilityDeficitPct > 40
  ) {
    return {
      state: "unsafe",
      reasons: ["insufficient_prep_time_or_excessive_ramp"],
    };
  }
  if (x.requiredWeeklyRampPct > 10 || x.capabilityDeficitPct > 20) {
    return { state: "aggressive", reasons: ["near_max_safe_progression"] };
  }
  return { state: "feasible", reasons: [] };
}
```

---

## 4) Endpoint Plan (add/extend without breaking existing clients)

## 4.1 Extend `trainingPlans` router

Primary file:

- `packages/trpc/src/routers/training_plans.ts`

Keep existing endpoints for backward compatibility:

- `getCurrentStatus`, `getIdealCurve`, `getActualCurve`, `getWeeklySummary`

Add new endpoints:

1. `getInsightTimeline`
   - input: `{ training_plan_id, start_date, end_date, timezone }`
   - output: canonical `planInsightResponseSchema`

2. `getFeasibilityPreview`
   - input: minimal create payload (`goal`, `target_date`, optional advanced)
   - output: `{ state, reasons, key_metrics }`

3. `getProjectionAtDate`
   - input: `{ training_plan_id, date, activity_category }`
   - output: projection point + confidence + drivers

4. `getCapabilityTimeline`
   - input: `{ training_plan_id, activity_category, days }`
   - output: `{date, cp_or_cs, confidence, effort_count}`[]

Implementation notes:

- Reuse effort retrieval logic already used in `analytics.ts`.
- Reuse `addEstimationToPlans` behavior used in `planned_activities.ts` and `home.ts`.
- Reuse existing CTL/ATL/TSB math from current routers/core.

## 4.2 Keep planned activities workflow compatible

Primary file:

- `packages/trpc/src/routers/planned_activities.ts`

Changes:

- No schema changes.
- Add a shared status interpretation helper for `scheduled/completed/skipped/rescheduled/expired` computed from timestamps/date windows and activity presence.
- Reuse it in `list`, `listByWeek`, and insight aggregations.

---

## 5) Mobile Plan and Create Flow Plan

## 5.1 Simplify create flow

Primary files:

- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`

Required UX behavior:

- Step 1 (default visible):
  - goal type,
  - target date,
  - create button.
- Advanced (collapsed by default):
  - activity categories,
  - availability,
  - ramp/distribution overrides.

Technical changes:

- Reduce required form validation fields to goal/date only.
- On submit:
  - call `getFeasibilityPreview` first,
  - show clear feasibility state,
  - allow create with warning state for `aggressive`, block with explicit confirmation pattern for `unsafe` (MVP policy to confirm exact behavior).

## 5.2 Plan tab and chart surfaces

Primary files:

- `apps/mobile/app/(internal)/(tabs)/plan.tsx`
- `apps/mobile/components/charts/PlanVsActualChart.tsx`

UI structure (minimalistic, low interaction):

1. Top status card:
   - boundary state,
   - feasibility state,
   - one-sentence divergence explanation.
2. Three-path chart:
   - Ideal, Scheduled, Actual.
3. Compact adherence trend.
4. Expandable detail panel for reasons/drivers.

Chart updates:

- Keep visual style minimal and clean.
- Use stable, semantic color mapping:
  - safe = green,
  - caution = amber,
  - exceeded = red.
- Do not rely on animation for meaning.

---

## 6) Activity Plan Feature Alignment

Goal: ensure activity plan and scheduling feed the same insight model.

Primary files:

- `packages/trpc/src/routers/planned_activities.ts`
- `apps/mobile/components/ScheduleActivityModal.tsx`
- `apps/mobile/components/shared/ActivityPlanCard.tsx`

Changes:

- Keep existing scheduling constraints and extend response details to include boundary impact preview.
- On schedule create/update, return enough info for client to refresh insight timeline immediately.
- Standardize date handling with athlete-local timezone across schedule and insight endpoints.

---

## 7) Work Breakdown with Deliverables

## Workstream A - Contracts + Normalization (Core)

- Add new schemas and normalization utilities.
- Add backward compatibility tests for legacy structures.

Deliverables:

- `packages/core/schemas/training-plan-insight.ts` (new)
- `packages/core/plan/normalizePlanConfig.ts` (new)
- `packages/core/plan/*.ts` calculations (new)

## Workstream B - Insight API (tRPC)

- Implement new insight/projection/feasibility endpoints.
- Keep existing endpoints stable.

Deliverables:

- `packages/trpc/src/routers/training_plans.ts` updates

## Workstream C - Minimal Create UX (Mobile)

- Collapse advanced configuration.
- Goal/date required only.
- Feasibility preview integration.

Deliverables:

- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx` updates
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx` updates

## Workstream D - Plan Screen UX (Mobile)

- Replace fragmented cards with one insight-first hierarchy.
- Integrate canonical timeline payload.

Deliverables:

- `apps/mobile/app/(internal)/(tabs)/plan.tsx` updates
- `apps/mobile/components/charts/PlanVsActualChart.tsx` updates

## Workstream E - Scheduling Alignment

- Unify computed schedule status behavior.
- Ensure planned activity edits reflect in insight quickly.

Deliverables:

- `packages/trpc/src/routers/planned_activities.ts` updates

---

## 8) Testing Plan (must be completed before rollout)

## 8.1 Unit (core)

Suggested file paths:

- `packages/core/__tests__/plan/adherence.test.ts`
- `packages/core/__tests__/plan/boundary.test.ts`
- `packages/core/__tests__/plan/feasibility.test.ts`
- `packages/core/__tests__/plan/normalizePlanConfig.test.ts`

## 8.2 Integration (tRPC)

Suggested file paths:

- `packages/trpc/src/routers/__tests__/training_plans.insight.test.ts`
- `packages/trpc/src/routers/__tests__/training_plans.feasibility.test.ts`

Coverage requirements:

- Legacy and new plan structure inputs.
- Sparse effort data confidence fallback.
- Unsafe-goal classification edge cases.
- Timezone/week boundary consistency.

## 8.3 Mobile E2E

Scenarios:

- quick create with goal/date only,
- aggressive/unsafe feasibility handling,
- schedule edit updates insight chart state.

---

## 9) Rollout and Risk Controls

- Add feature flag: `feature.trainingPlanInsightsMvp`.
- Rollout stages:
  1. internal users,
  2. small cohort,
  3. wider rollout.
- Rollback triggers:
  - insight endpoint error rate spike,
  - latency regressions,
  - boundary misclassification incidents.

---

## 10) Reviewer Sign-Off Checklist

- Plan creation requires only goal + date.
- Advanced config is optional and non-blocking.
- No schema migration included.
- Canonical insight payload includes timeline + boundary + feasibility + projection.
- Feasibility flags unrealistic goals with clear reasons.
- Boundary states are visible and explainable in mobile UI.
- Capability/projection confidence is present and understandable.
- Existing endpoints remain functional for current clients.
- Tests cover formulas, fallbacks, timezone behavior, and create flow.

---

## 11) Definition of Complete

This feature is complete when a user can:

1. Create a usable plan quickly with only goal/date.
2. See Ideal vs Scheduled vs Actual clearly in minimal UI.
3. Understand whether plan execution is safe, caution, or exceeded, and why.
4. See feasibility for aggressive/unrealistic goals before committing.
5. See confidence-labeled capability/projection insights.

All of the above must ship without database schema changes.
