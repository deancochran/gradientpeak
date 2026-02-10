# Training Plan Implementation Alignment Plan (MVP)

This plan is the implementation bridge between:

- product/design intent in `./design.md`, and
- current code in core, tRPC, and mobile.

It is written so a reviewer can understand exactly what will change, where, and why.

Document role alignment:

- `./design.md` defines high-level product intent and constraints.
- `./plan.md` defines low-level technical architecture, file-level implementation, and validation strategy.
- `./ui-plan-tab-and-onboarding.md` defines low-level UX behavior, screen composition, and interaction rules.
- If any conflict appears, resolve by preserving design intent while making technical and UX contracts explicit and testable.

## 1) Hard Constraints (must hold)

- No database schema changes in this phase.
- Setup must allow required user input only: one goal (`name + target_date`); goal priority must always exist via defaulting when omitted.
- Goal model must support both approachable intent goals and precise measurable goals.
- Goal metrics must use normalized standard units in contracts and persistence (e.g., meters, seconds, m/s), not raw pace strings.
- Enhance existing training plan schema; do not replace it with a brand-new root schema.
- Most plan/config fields should remain optional at creation time with safe defaults.
- Plans must support multiple goals, with at least one goal required.
- Activity category and advanced controls are optional.
- No recommendation engine / no auto-prescription language or behavior.
- Safety and feasibility boundaries must be explicit and visible.
- `profile_metrics` usage is limited to `weight_kg` and `lthr`.
- Prefer Supazod-generated schemas/types for DB-backed enums (`activity_categories`) over hardcoded Zod enum literals.

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
- Additional parallel creation paths currently exist:
  - `apps/mobile/app/(internal)/(standard)/training-plan-method-selector.tsx`
  - `apps/mobile/app/(internal)/(standard)/training-plan-wizard.tsx`
  - `apps/mobile/app/(internal)/(standard)/training-plan-review.tsx`
- Plan tab currently renders plan-vs-actual trend and cards:
  - `apps/mobile/app/(internal)/(tabs)/plan.tsx`
  - `apps/mobile/components/charts/PlanVsActualChart.tsx`

## 2.3 Known Design/Code Gaps

1. Creation UX is not yet minimal-first (one goal only).
2. Three-path contract exists in pieces, not as one canonical API payload.
3. Boundary + feasibility are not first-class response fields.
4. Capability projections are available but not integrated into plan insight timeline.
5. Mobile plan screens are functional but not yet aligned to minimal decision-support IA.
6. Training plan creation is over-segmented across multiple pages for first-time users.

## 2.4 Consolidation Audit Conclusion

- Yes, the current training plan creation flow is over-engineered for default user entry.
- First-plan creation should be a single minimal path (required: goal name + target date).
- Advanced schema configuration should be moved to post-create edit surfaces.
- Existing wizard/review/method selector should be consolidated into one lightweight entry and one advanced refine path.

---

## 3) Target Technical Architecture (MVP)

## 3.1 Enhance Existing Plan Schema (JSON in `training_plans.structure`)

No table changes and no root-schema replacement. Build on the current `trainingPlanCreateSchema` and goal model.

Design intent:

- Keep existing `periodized` and `maintenance` structures intact.
- Keep existing configurability for advanced users.
- Reduce required user input for creation to one goal only.
- Make most setup fields optional at creation and backfill safe defaults server-side.
- Keep a clean separation of concerns: goal objects describe performance outcomes; training structure (volume/frequency/caps) stays in plan config and constraints.

Additive goal enhancement (within existing goal objects):

```ts
// packages/core/schemas/training_plan_structure.ts (enhancement, not overhaul)
// Use Supazod-generated schemas/types where possible.
import { activityCategorySchema } from "@repo/supabase/supazod";

const goalMetricSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("race_performance"),
    distance_m: z.number().positive(),
    target_time_s: z.number().int().positive(),
    activity_category: activityCategorySchema,
  }),
  z.object({
    type: z.literal("power_threshold"),
    target_watts: z.number().positive(),
    test_duration_s: z.number().int().positive().default(1200),
    activity_category: activityCategorySchema,
  }),
  z.object({
    type: z.literal("pace_threshold"),
    target_speed_mps: z.number().positive(),
    test_distance_m: z.number().positive().default(400),
    activity_category: activityCategorySchema,
  }),
  z.object({
    type: z.literal("hr_threshold"),
    target_lthr_bpm: z.number().int().positive(),
    activity_category: activityCategorySchema,
  }),
  z.object({
    type: z.literal("multisport_event"),
    event_name: z.string().optional(),
    segments: z
      .array(
        z.object({
          activity_category: activityCategorySchema,
          distance_m: z.number().positive().optional(),
          target_time_s: z.number().int().positive().optional(),
        }),
      )
      .min(2),
    total_target_time_s: z.number().int().positive(),
  }),
  z.object({ type: z.literal("none") }),
]);

export const trainingGoalSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Always present for weighting when goals conflict; default applied if omitted.
  priority: z.number().int().min(1).max(10).default(1),
  metric: goalMetricSchema.optional(), // additive
});
```

Minimum-create contract (derived server-side into existing structure):

```ts
// new lightweight create input mapped to existing trainingPlanCreateSchema
const minimalPlanCreateSchema = z.object({
  goal: z.object({
    name: z.string().min(1),
    target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    priority: z.number().int().min(1).max(10).default(1),
    metric: goalMetricSchema.optional(),
  }),
});
```

Compatibility strategy:

- Existing plans remain valid with no migration.
- Existing full-create flows remain valid.
- New minimal-create flow compiles into existing periodized structure with defaults for blocks, progression, distribution, and constraints.
- Plans support multiple goals (`goals[]`), with `min(1)` preserved.
- Goal priority is mandatory in normalized plan data and used to weight planning tradeoffs when goals are near-conflicting.
- Goal metric category fields are validated with Supazod-generated activity category schemas to keep DB and app contracts synchronized.

Approachable-to-precise goal normalization:

- Accept simple goal input first.
- Optionally attach measurable detail via explicit metric types: `race_performance`, `power_threshold`, `pace_threshold`, `hr_threshold`, or `multisport_event`.
- Persist and compute with normalized numeric units (`distance_m`, `target_time_s`, `target_speed_mps` where relevant); avoid raw pace strings in API/storage contracts.

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
  plan_feasibility: z.object({
    state: z.enum(["feasible", "aggressive", "unsafe"]),
    reasons: z.array(z.string()),
  }),
  goal_feasibility: z.array(
    z.object({
      goal_id: z.string().uuid(),
      goal_name: z.string(),
      state: z.enum(["feasible", "aggressive", "unsafe"]),
      reasons: z.array(z.string()),
    }),
  ),
  plan_safety: z.object({
    state: z.enum(["safe", "caution", "exceeded"]),
    reasons: z.array(z.string()),
  }),
  goal_safety: z.array(
    z.object({
      goal_id: z.string().uuid(),
      goal_name: z.string(),
      state: z.enum(["safe", "caution", "exceeded"]),
      reasons: z.array(z.string()),
    }),
  ),
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
   - input: minimal create payload (`goal` object with name + target_date, optional `priority`, optional metric)
   - output: `{ plan_assessment, goal_assessments, key_metrics, normalized_goal }`
   - requirement: return both per-goal and plan-wide feasibility/safety explanations

3. `createFromMinimalGoal`
   - input: `minimalPlanCreateSchema`
   - behavior: generates default periodized structure with one required goal and optional advanced defaults
   - output: standard training plan record (same shape returned by existing `create`)

4. `getProjectionAtDate`
   - input: `{ training_plan_id, date, activity_category }`
   - output: projection point + confidence + drivers

5. `getCapabilityTimeline`
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

- Default create path (single screen):
  - one goal (name + target date; priority auto-defaulted if not set),
  - create button,
  - optional collapsed precision helper.
- Nice-to-have follow-up: allow plan creation entry point before full onboarding completion, then enrich profile later without invalidating the plan.
- Optional precision helper (collapsed by default):
  - race performance (distance + target time + activity),
  - power threshold (watts + activity),
  - speed threshold (m/s + activity),
  - heart-rate threshold (LTHR),
  - multisport event segments + total target time.
- Advanced configuration is post-create by default:
  - activity categories,
  - availability,
  - ramp/distribution overrides,
  - weekly volume/frequency/duration caps.

Route consolidation policy:

- Keep as primary create entry:
  - `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
- Convert to optional/refine-only or deprecate from default navigation:
  - `apps/mobile/app/(internal)/(standard)/training-plan-method-selector.tsx`
  - `apps/mobile/app/(internal)/(standard)/training-plan-wizard.tsx`
  - `apps/mobile/app/(internal)/(standard)/training-plan-review.tsx`

Technical changes:

- Reduce required form validation fields to one goal (name + target date) only.
- Ensure goal priority is always present in submit payload (user-selected or defaulted).
- On submit:
  - call `getFeasibilityPreview` first,
  - normalize optional goal metric input into standard units for deterministic projections,
  - show both plan-wide and per-goal feasibility/safety states,
  - allow create with warning state for `aggressive`, block with explicit confirmation pattern for `unsafe` (MVP policy to confirm exact behavior),
  - create plan through minimal-goal endpoint that expands defaults into full schema.
- After successful create:
  - route to training plan view with a prominent `Refine Plan` action,
  - open advanced configuration only on explicit user action.

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
4. No expandable detail panel in MVP.

Chart updates:

- Keep visual style minimal and clean.
- Use stable, semantic color mapping:
  - safe = green,
  - caution = amber,
  - exceeded = red.
- Do not rely on animation for meaning.

Detailed mobile visual specification (component hierarchy, chart definitions, interaction behavior, and onboarding quickstart UX) is documented in:

- `./ui-plan-tab-and-onboarding.md`

This visual spec is authoritative for Plan tab UI implementation details and should be kept in sync with this plan.

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

## 7) Chronological Implementation Phases

This section is execution-ordered. Later phases depend on earlier phases being complete.

## Phase 0 - Preflight and Guardrails (no behavior change)

Goal:

- Lock scope and confirm no DB migrations are required in this release.

Tasks:

- Confirm all planned changes are additive to existing JSON structures.
- Confirm backward compatibility expectations for existing training plans.
- Add/confirm feature flag strategy for staged rollout.

Primary outputs:

- Finalized constraints in this plan.

## Phase 1 - Core Contracts and Schema Normalization (highest priority)

Goal:

- Establish canonical, type-safe contracts in `@repo/core` before any endpoint or UI change.

Tasks:

- Enhance training goal schema with normalized metric variants and priority defaulting.
- Add minimal-goal input schema and default-expansion utilities.
- Add goal-priority weighting helpers for multi-goal conflict handling.
- Add or update form schemas so UI state derives from Zod-inferred types.
- Validate backward compatibility for existing periodized/maintenance plan shapes.

Primary files:

- `packages/core/schemas/training_plan_structure.ts` (update)
- `packages/core/schemas/form-schemas.ts` (update)
- `packages/core/schemas/index.ts` (update)
- `packages/core/plan/normalizeGoalInput.ts` (create)
- `packages/core/plan/expandMinimalGoalToPlan.ts` (create)
- `packages/core/plan/goalPriorityWeighting.ts` (create)

## Phase 2 - Backend API Alignment (tRPC)

Goal:

- Make backend consume Phase 1 contracts and expose stable minimal-create + insight endpoints.

Tasks:

- Add `getFeasibilityPreview` and `createFromMinimalGoal`.
- Ensure feasibility and safety are produced both per-goal and plan-wide.
- Add/complete canonical insight timeline/projection endpoints.
- Keep existing `create` and legacy endpoints stable for compatibility.
- Ensure planned activity status helpers are unified and insight-refresh friendly.

Primary files:

- `packages/trpc/src/routers/training_plans.ts` (update)
- `packages/trpc/src/routers/planned_activities.ts` (update)

## Phase 3 - Training Plan Create Flow Consolidation (mobile)

Goal:

- Reduce first-plan creation to minimum required input and remove multi-entry default complexity.

Tasks:

- Keep one default create path (`goal name + target date`, optional precision helper).
- Route create submit through feasibility preview then minimal-create endpoint.
- Move advanced configuration to post-create `Refine Plan` surfaces.
- Demote or deprecate wizard/method-selector/review from default first-plan entry.

Primary files:

- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx` (update)
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/training-plan-method-selector.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/training-plan-wizard.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/training-plan-review.tsx` (update)

## Phase 4 - Plan Tab and View UX Integration (mobile)

Goal:

- Bind UI to canonical insight payload with lightweight interaction model.

Tasks:

- Update plan tab hierarchy to status + three-path chart + compact secondary charts.
- Ensure passive refresh behavior when active plan data changes.
- Keep interaction lightweight (no manual recalc, no long-press modal behavior).

Primary files:

- `apps/mobile/app/(internal)/(tabs)/plan.tsx` (update)
- `apps/mobile/components/charts/PlanVsActualChart.tsx` (update)
- `apps/mobile/components/charts/TrainingLoadChart.tsx` (update)

## Phase 5 - Activity Plan + Scheduling UX Simplification

Goal:

- Align activity-plan creation and scheduling flows to the same minimal-first philosophy.

Tasks:

- Simplify activity-plan authoring path while preserving advanced editing for explicit use.
- Ensure schedule actions from detail/calendar trigger immediate insight refresh.

Primary files:

- `apps/mobile/app/(internal)/(standard)/create-activity-plan.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/create-activity-plan-structure.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/create-activity-plan-repeat.tsx` (update)
- `apps/mobile/components/ScheduleActivityModal.tsx` (update)
- `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx` (update)

## Phase 6 - Validation, Rollout, and Cleanup

Goal:

- Verify no regressions and roll out safely.

Tasks:

- Validate backward compatibility with existing plans and existing clients.
- Roll out behind feature flag and monitor error/latency indicators.
- Remove dead navigation branches only after stabilization window.

---

## 8) Validation Notes (tests deferred in this phase)

## 8.1 Core validation focus

Suggested future file paths (when tests are re-enabled):

- `packages/core/__tests__/plan/adherence.test.ts`
- `packages/core/__tests__/plan/boundary.test.ts`
- `packages/core/__tests__/plan/feasibility.test.ts`
- `packages/core/__tests__/plan/normalizeGoalInput.test.ts`
- `packages/core/__tests__/plan/expandMinimalGoalToPlan.test.ts`

## 8.2 API validation focus

Suggested future file paths (when tests are re-enabled):

- `packages/trpc/src/routers/__tests__/training_plans.insight.test.ts`
- `packages/trpc/src/routers/__tests__/training_plans.feasibility.test.ts`

Validation requirements:

- Existing full structure inputs and new minimal-goal inputs.
- All goal metric variants validate and normalize correctly.
- Goal priority defaulting and weighting behavior under conflicting goals.
- Sparse effort data confidence fallback.
- Unsafe-goal classification edge cases.
- Timezone/week boundary consistency.

## 8.3 Mobile flow validation

Scenarios to validate manually:

- quick create with one goal only,
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

- Plan creation requires only goal + date user input; priority is defaulted when omitted.
- Only one default training plan create entry is exposed to users.
- Wizard/review/method-selector pages are no longer part of default first-plan flow.
- Goal priority is always present for each goal and used for conflict weighting.
- Schema enhancement is additive to current training plan schema (no root replacement).
- Most plan configuration fields are optional at creation and defaulted server-side.
- Plans support multiple goals with at least one goal required.
- Goal model supports race performance, power threshold, speed-threshold metrics in normalized units, HR threshold, multisport events, and intent-only (`none`) under one contract.
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

1. Create a usable plan quickly with one goal (name + target date), with priority auto-attached by default when omitted.
2. Use either general intent goals or precise measurable goals without changing the core flow.
3. See Ideal vs Scheduled vs Actual clearly in minimal UI.
4. Understand whether plan execution is safe, caution, or exceeded, and why.
5. See feasibility for aggressive/unrealistic goals before committing.
6. See confidence-labeled capability/projection insights.

All of the above must ship without database schema changes.
