# Technical Specification: No-History Adaptive Demand Model (Implementation Blueprint)

Last Updated: 2026-02-12
Status: Ready for implementation
Owner: Core + tRPC + Mobile

## Goal

Implement a deterministic, confidence-weighted adaptive demand model that works across none/sparse/stale/rich data states, uses all available evidence, and preserves all existing safety invariants.

This document translates `design.md` into implementation-level details with concrete file paths, code touchpoints, and test expectations.

## User Experience Invariants

The data strategy must be invisible to the end user.

1. Plan creation must succeed whether the user has rich, sparse, stale, or zero prior data.
2. The app must use real database data automatically when available, with no extra user workflow.
3. If data is missing or low quality, weighting must shift automatically toward deterministic conservative baselines.
4. New activity/effort/metric data logged to the database must be reflected in subsequent previews/creates without manual intervention.
5. No additional mandatory onboarding fields are required to unlock planning.

## Evidence Weighting Model (Critical)

Use a single continuous model, not a binary fallback mode split.

Rules:

1. Always consume all available evidence (`activities`, `activity_efforts`, `profile_metrics`, creation inputs).
2. Derive per-signal confidence from freshness, sample sufficiency, and source quality.
3. Blend observed evidence with conservative baselines using deterministic weighting.
4. Let `none/sparse/stale/rich` states influence weighting strength, not whether the model runs.
5. Rich/fresh evidence should dominate naturally through higher confidence, not through a separate hard path.

Implementation note:

- Replace strict fallback gating with confidence-weighted blending.
- Preserve deterministic outputs and reason-token explainability.

## Dynamic Data Utilization Requirements

### Runtime data pull (source of truth)

Plan creation and preview must evaluate against current database state at request time.

- `deriveProfileAwareCreationContext(...)` in `packages/trpc/src/routers/training_plans.ts` already performs this pull.
- It should continue to load live evidence from:
  1. `activities` (recency, load, consistency)
  2. `activity_efforts` (performance signals)
  3. `profile_metrics` (physiological context)

### Continuous enrichment from ingestion

As new activities are logged, enrichment should happen via existing ingestion paths so creation context naturally improves over time.

Current path reference:

- `packages/trpc/src/routers/fit-files.ts`
  - inserts `activity_efforts`
  - updates `profile_metrics` (for example LTHR detection)

This means plan creation quality increases automatically with continued usage, without user-facing configuration steps.

### Failure-safe behavior

If any data source query fails or returns empty:

1. Continue with partial evidence (do not block creation).
2. Use conservative baseline ranges when confidence is low.
3. Keep output deterministic and explainable through reason tokens.

## Existing Baseline (As Implemented)

### Core projection engine

Primary implementation file:

- `packages/core/plan/projectionCalculations.ts`

Current no-history behavior has these critical elements:

1. No-history context + override input:

```ts
export interface NoHistoryAnchorContext {
  history_availability_state: "none" | "sparse" | "rich";
  goal_tier: NoHistoryGoalTier;
  weeks_to_event: number;
  total_horizon_weeks?: number;
  goal_count?: number;
  starting_ctl_override?: number;
  context_summary?: CreationContextSummary;
  availability_context?: NoHistoryAvailabilityContext;
  intensity_model?: Partial<NoHistoryIntensityModel>;
}
```

2. No-history start-state policy (default never-trained unless override):

```ts
const hasStartingCtlOverride =
  Number.isFinite(context.starting_ctl_override) &&
  (context.starting_ctl_override ?? 0) >= 0;
const startingCtlForProjection = round1(
  hasStartingCtlOverride
    ? (context.starting_ctl_override ?? NO_HISTORY_DEFAULT_STARTING_CTL)
    : NO_HISTORY_DEFAULT_STARTING_CTL,
);
const startingWeeklyTssForProjection = deriveWeeklyTssFromCtl(
  startingCtlForProjection,
);
```

3. Progressive no-history floor + demand interpolation in weekly loop:

```ts
const noHistoryGoalDemandFloor =
  enforceNoHistoryStartingFloor &&
  noHistory?.target_event_ctl !== null &&
  noHistory?.target_event_ctl !== undefined &&
  noHistoryWeeksToEvent > 0
    ? round1(
        (noHistory.starting_ctl_for_projection ?? 0) *
          (1 - Math.min(1, (projectionWeekIndex + 1) / noHistoryWeeksToEvent)) +
          noHistory.target_event_ctl *
            Math.min(1, (projectionWeekIndex + 1) / noHistoryWeeksToEvent),
      ) * 7
    : null;
```

4. Metadata currently emitted for explainability:

```ts
tss_ramp: {
  previous_week_tss: number;
  requested_weekly_tss: number;
  raw_requested_weekly_tss: number;
  applied_weekly_tss: number;
  max_weekly_tss_ramp_pct: number;
  clamped: boolean;
  floor_override_applied: boolean;
  floor_minimum_weekly_tss: number | null;
  weekly_load_override_reason: "no_history_floor" | null;
}
```

### Canonical projection contract

- `packages/core/plan/projectionTypes.ts`

No-history metadata is currently floor-era focused:

```ts
export interface NoHistoryProjectionMetadata {
  projection_floor_applied: boolean;
  projection_floor_values: {
    start_ctl: number;
    start_weekly_tss: number;
  } | null;
  fitness_level: "weak" | "strong" | null;
  fitness_inference_reasons: string[];
  projection_floor_confidence: "high" | "medium" | "low" | null;
  floor_clamped_by_availability: boolean;
}
```

### tRPC threading + parity

- `packages/trpc/src/routers/training_plans.ts`

Current inputs already support override threading:

```ts
const previewCreationConfigInputSchema = z.object({
  minimal_plan: minimalTrainingPlanV2InputSchema,
  creation_input: creationNormalizationInputSchema,
  starting_ctl_override: z.number().min(0).max(150).optional(),
  post_create_behavior: postCreateBehaviorSchema.optional(),
});
```

No-history context construction is centralized:

```ts
return {
  history_availability_state: "none",
  goal_tier: deriveNoHistoryGoalTierFromTargets(...),
  weeks_to_event: ...,
  total_horizon_weeks: ...,
  goal_count: input.expandedPlan.goals.length,
  starting_ctl_override: input.startingCtlOverride,
  context_summary: input.contextSummary,
  availability_context: {
    availability_days: input.finalConfig.availability_config.days,
    hard_rest_days: input.finalConfig.constraints.hard_rest_days,
    max_single_session_duration_minutes:
      input.finalConfig.constraints.max_single_session_duration_minutes,
  },
};
```

Required weighting extension in router orchestration:

1. Pass freshness-sensitive evidence summaries into core on both preview and create paths.
2. Pass reason tokens that explain weighting posture (for example `confidence_low_sparse_history`, `confidence_discount_stale_history`, `confidence_high_fresh_history`).
3. Ensure weighting inputs use freshly queried context in both `previewCreationConfig` and `createFromCreationConfig` so behavior tracks newly logged data automatically.

### Mobile projection consumption

- `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`

UI already reads no-history metadata and constrained-week diagnostics:

```ts
const noHistoryMetadata = projectionChart?.no_history;
...
Weekly load: requested {raw_requested_weekly_tss}
{floor_override_applied ? `, floored to ${requested_weekly_tss}` : ""},
applied {applied_weekly_tss}
```

## Target Model (What to Implement)

### Design intent to operationalize

1. Keep no-history default start assumption (`starting_ctl = 0`) unless user override is provided.
2. Replace single-point endpoint assumptions with demand-band semantics.
3. Preserve all current safety authorities (weekly TSS ramp cap, CTL ramp cap, recovery/taper semantics).
4. Expose explicit infeasibility (`demand_gap`) and readiness (`readiness_band`) without duplicating logic outside core.

### New domain concepts

1. `DemandBand`: `{ min, target, stretch }`
2. `GoalDemandProfile`: target-derived intrinsic demand summary
3. `ProjectionDemandGap`: required vs feasible under caps/availability
4. `ReadinessBand`: `low | medium | high`

## File-by-File Implementation Plan

### 1) Core contracts and algorithm ownership

#### File: `packages/core/plan/projectionTypes.ts`

Update projection metadata types in place.

```ts
export type ReadinessBand = "low" | "medium" | "high";
export type DemandConfidence = "high" | "medium" | "low";

export interface DemandBand {
  min: number;
  target: number;
  stretch: number;
}

export interface ProjectionDemandGap {
  required_weekly_tss_target: number;
  feasible_weekly_tss_applied: number;
  unmet_weekly_tss: number;
  unmet_ratio: number;
}

export interface ProjectionFeasibilityMetadata {
  demand_gap: ProjectionDemandGap;
  readiness_band: ReadinessBand;
  dominant_limiters: string[];
}
```

Update `NoHistoryProjectionMetadata` with demand-model fields:

```ts
export interface NoHistoryProjectionMetadata {
  projection_floor_applied: boolean;
  projection_floor_values: {
    start_ctl: number;
    start_weekly_tss: number;
  } | null;
  fitness_level: "weak" | "strong" | null;
  fitness_inference_reasons: string[];
  projection_floor_confidence: "high" | "medium" | "low" | null;
  floor_clamped_by_availability: boolean;

  starting_ctl_for_projection?: number | null;
  starting_weekly_tss_for_projection?: number | null;
  required_event_demand_range?: DemandBand | null;
  required_peak_weekly_tss?: DemandBand | null;
  projection_feasibility?: ProjectionFeasibilityMetadata | null;
}
```

#### File: `packages/core/plan/projectionCalculations.ts`

Add deterministic helper functions (keep in same file for v1, extract later if needed):

```ts
function deriveGoalDemandProfileFromTargets(input: {
  goalTargets: NoHistoryGoalTargetInput[];
  goalTier: NoHistoryGoalTier;
  weeksToEvent: number;
}): {
  required_event_demand_range: DemandBand;
  required_peak_weekly_tss: DemandBand;
  demand_confidence: "high" | "medium" | "low";
  rationale_codes: string[];
} { ... }
```

Add explicit evidence confidence utility:

```ts
function deriveEvidenceWeighting(input: {
  historyAvailabilityState: "none" | "sparse" | "rich";
  lastHistoryDate?: string | null;
  nowDate: string;
  staleDaysThreshold: number;
  effortSampleCount: number;
  activitySampleCount: number;
}): {
  confidence: number;
  state: "none" | "sparse" | "stale" | "rich";
  reasons: string[];
} { ... }
```

Behavioral requirement for this utility:

1. Consume context derived from current DB data snapshot.
2. Return deterministic confidence and reason outputs for the same snapshot.
3. Never throw or block plan projection generation.

```ts
function computeNoHistoryDemandFloorWeek(input: {
  projectionWeekIndex: number;
  weeksToEvent: number;
  startWeeklyTss: number;
  requiredPeakWeeklyTssTarget: number;
  isRecoveryWeek: boolean;
  weekPattern: ProjectionMicrocyclePattern;
}): number | null { ... }
```

In weekly loop, replace single floor override behavior with confidence-weighted demand semantics:

```ts
type WeeklyLoadOverrideReason = "no_history_floor" | "demand_band_floor" | null;
```

```ts
const demandFloorWeeklyTss = computeNoHistoryDemandFloorWeek(...);
const weightedDemandWeeklyTss = blendDemandWithConfidence({
  demandFloorWeeklyTss,
  conservativeBaselineWeeklyTss,
  confidence: evidenceWeighting.confidence,
});
const requestedWithDemandFloor =
  weightedDemandWeeklyTss === null
    ? recoveryAdjustedWeeklyTss
    : Math.max(recoveryAdjustedWeeklyTss, weightedDemandWeeklyTss);

const floorOverrideApplied =
  weightedDemandWeeklyTss !== null &&
  recoveryAdjustedWeeklyTss < weightedDemandWeeklyTss;
```

Keep ramp-cap/CTL-cap clamp pipeline unchanged after requested load is formed.

Emit additional fields in week metadata:

```ts
tss_ramp: {
  ...
  demand_band_minimum_weekly_tss: weightedDemandWeeklyTss,
  demand_gap_unmet_weekly_tss: Math.max(
    0,
    (weightedDemandWeeklyTss ?? 0) - appliedWeeklyTss,
  ),
  weekly_load_override_reason: floorOverrideApplied
    ? "demand_band_floor"
    : null,
}
```

At payload return, emit top-level no-history demand fields and feasibility summary:

```ts
no_history: {
  ...existing,
  starting_ctl_for_projection: noHistory?.starting_ctl_for_projection ?? null,
  starting_weekly_tss_for_projection:
    noHistory?.starting_weekly_tss_for_projection ?? null,
  required_event_demand_range,
  required_peak_weekly_tss,
  projection_feasibility,
  evidence_confidence,
}
```

#### File: `packages/core/plan/index.ts`

Ensure all new projection demand types are exported from the core barrel so tRPC/mobile can consume without local type duplication.

### 2) tRPC orchestration and snapshot parity

#### File: `packages/trpc/src/routers/training_plans.ts`

Keep preview/create parity path unchanged (already centralized through `buildCreationProjectionArtifacts`).

Required updates:

1. Ensure no-history context includes any additional target metadata required for demand profile derivation.
2. Ensure snapshot token captures new no-history demand metadata.

Current snapshot version constant:

```ts
const CREATION_PREVIEW_SNAPSHOT_VERSION = "creation_preview_v1";
```

If token input schema changes materially, update snapshot token inputs in place and keep stale-token error behavior unchanged.

### 3) Mobile projection cues (read-only rendering)

#### File: `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx`

Continue rendering existing fields, and add demand/readiness cues directly:

1. If `projectionChart.no_history?.projection_feasibility` exists, show:
   - `readiness_band`
   - `demand_gap.unmet_weekly_tss`
   - `dominant_limiters`
2. Show updated override semantics in constrained-week details.

Keep the weekly constrained context panel and include the new override token where present.

## Algorithmic Rules (Deterministic)

1. Weekly requested load composition:

```text
requested_weekly_tss
  = max(base_block_request, adaptation_floor, demand_floor)
```

2. Applied load remains safety-authoritative:

```text
applied_weekly_tss = clamp_by_tss_ramp_cap_then_ctl_ramp_cap(requested_weekly_tss)
```

3. Demand gap (week or aggregate):

```text
demand_gap = max(0, required_target - feasible_applied)
```

4. Readiness band classification (deterministic thresholds):

- `high`: low gap, low clamp pressure, medium/high confidence
- `medium`: moderate gap or moderate clamp pressure
- `low`: high gap and/or repeated clamp pressure and/or low confidence

5. Demand weighting rules:

- Always compute from all available evidence plus conservative baseline
- Discount stale or low-volume evidence through confidence decay
- Keep taper/event/recovery exclusions for floor influence
- Never bypass safety clamps

## In-Place Update Strategy

Apply demand-model changes directly to current contracts and implementation (no parallel schema track, no feature-version split).

1. Replace floor-centric semantics in `NoHistoryProjectionMetadata` with demand-centric fields as the canonical current contract.
2. Keep preview/create parity by updating only shared core-driven projection artifacts.
3. Update mobile labels and interpretation to the new semantics in the same implementation pass.
4. Keep weighting continuous so rich/fresh users become evidence-dominant without mode switching.
5. Keep the end-user flow unchanged regardless of data availability state.

## Testing Specification

### Core tests

Primary existing test file:

- `packages/core/plan/__tests__/projection-calculations.test.ts`

Add/extend tests for:

1. Hard-goal no-history progression remains monotonic in early build unless constrained.
2. Demand-band override reason (`demand_band_floor`) is emitted when floor drives request.
3. Demand-gap is non-zero when caps/availability prevent meeting target demand.
4. Start-state logic remains deterministic (`starting_ctl_for_projection = 0` unless override).
5. Confidence weighting discounts stale/sparse/none evidence and increases with richer/fresher evidence.
6. Preview/create succeed with empty data, partial data, stale data, and rich/fresh data.
7. Newly logged activities/efforts/metrics change context classification and projection outputs on next preview call without extra user input.

Example existing assertions to preserve:

```ts
expect(resolved.starting_ctl_for_projection).toBe(0);
expect(resolved.fitness_inference_reasons).toContain(
  "starting_ctl_defaulted_never_trained",
);
```

```ts
expect(resolved.starting_ctl_for_projection).toBe(18);
expect(resolved.fitness_inference_reasons).toContain(
  "starting_ctl_override_applied",
);
```

### tRPC tests

- `packages/trpc/src/routers/__tests__/training-plans.test.ts`

Add/extend tests for:

1. Preview and create return parity for new no-history demand metadata.
2. Snapshot token includes relevant new fields; stale token behavior still enforced.

### Mobile tests

Add new test file:

- `apps/mobile/components/training-plan/create/__tests__/CreationProjectionChart.test.tsx`

Test cases:

1. Renders readiness and demand-gap cues from `no_history.projection_feasibility`.
2. Constrained week panel displays updated override reason labels.
3. No binary fallback branch is required for this implementation.

## Acceptance Criteria

1. No-history demanding goals do not show immediate collapse after start unless constrained.
2. Projection payload explicitly reports demand pressure (`demand_gap`), readiness (`readiness_band`), and evidence confidence.
3. Safety semantics remain unchanged and authoritative.
4. Preview/create parity is maintained for identical inputs.
5. Mobile renders explainability metadata without local projection math.
6. End-user creation flow is unaffected by data availability (none/sparse/stale/rich all succeed with no blocking UX).
7. Real DB evidence is consumed dynamically at request time and improves projection quality as data accumulates.

## Suggested Execution Order

1. Core types and helper scaffolding (`projectionTypes.ts`, `projectionCalculations.ts`).
2. Weekly loop migration to demand-band floor while preserving clamp order.
3. Payload contract emission and barrel exports.
4. tRPC snapshot/token updates and parity tests.
5. Mobile demand/readiness rendering tests.
