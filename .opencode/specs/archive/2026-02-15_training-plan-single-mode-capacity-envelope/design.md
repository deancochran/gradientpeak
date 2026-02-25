# Design: Single-Mode Planning with Capacity-Envelope Readiness

Date: 2026-02-15
Owner: Core planning + API + mobile create flow
Status: Proposed

## Problem

Current planning behavior still carries explicit safe/risk mode contracts, override acknowledgement flow, and override persistence/reporting. This is no longer aligned with product direction.

We need one planning model where:

1. Safety is the default parameterization, not a mode.
2. Users can freely customize constraints, load, and targets without gated acknowledgements.
3. Readiness is represented by one metric that already reflects capacity-envelope realism.
4. CTL/ATL/TSB remain training-state signals only, not athlete suitability claims.

## Goals

1. Remove planning mode toggle and all mode-conditional behavior.
2. Remove risk acceptance acknowledgement requirements and all persisted override metadata.
3. Replace multi-line readiness interpretation with a single readiness metric that includes profile/history-aware capacity-envelope realism.
4. Preserve deterministic planning outputs for identical inputs.
5. Keep CTL/ATL/TSB available as profile-agnostic training-state metrics, explicitly separated from suitability inference.
6. Default planning must maximize the highest safely achievable preparedness toward 100 within timeframe and capacity constraints.

## Non-Goals

- No second planner architecture.
- No hidden server-side override audit trail.
- No backwards compatibility aliases for removed mode/risk fields beyond a bounded migration window.
- No changes to CTL/ATL/TSB formulas themselves in this spec.

## Product Constraints (Hard)

1. No `safe_default` or `risk_accepted` mode toggle in product, API, or schema.
2. No required acknowledgement step before creating aggressive plans.
3. No persistence/reporting of "what was overridden".
4. Readiness output must be one scalar metric (0-100) that already includes realism.
5. CTL/ATL/TSB must not be used alone as athlete suitability, selection, or screening metrics.

## Core Behavior Model

The planner has one mode only: `single_mode` (implicit, not user-configurable).

- Default inputs remain conservative (safe parameter seeds).
- Users can edit constraints and targets directly.
- Planner always computes realism penalties from profile/history-aware capacity envelope.
- No branch that disables realism accounting.

### Safety-first default optimization policy

1. Default solver objective is to maximize achievable preparedness toward `readiness_score = 100`.
2. Safety constraints remain hard constraints in default planning (weekly TSS ramp, CTL ramp, recovery behavior).
3. If a goal is not feasible, planner still returns the highest safe readiness trajectory instead of blocking creation.
4. Users may choose higher-risk custom edits after initialization; this is explicit user customization, not default planner behavior.

## Domain Contract Changes

## `PlanConfiguration` (target state)

```ts
type PlanConfiguration = {
  optimization_style: "sustainable" | "balanced" | "outcome_first";

  // User-editable constraints, always allowed
  constraints?: {
    max_weekly_tss_ramp_pct?: number;
    max_ctl_ramp_per_week?: number;
    min_recovery_days_per_cycle?: number;
    long_session_cap_minutes?: number;
  };

  // Existing goals/targets contract remains, with canonical sorting
  goals: GoalDefinition[];
};
```

Removed fields:

- `mode`
- `risk_acceptance`
- `constraint_policy`
- `overrides_applied` (output)

## `ProjectionOutput` (readiness-related target state)

```ts
type ProjectionOutput = {
  readiness_score: number; // 0..100, single truth metric
  readiness_confidence: number; // 0..100 confidence in readiness estimate
  readiness_rationale_codes: string[];

  capacity_envelope: {
    envelope_score: number; // 0..100, realism quality
    envelope_state: "inside" | "edge" | "outside";
    limiting_factors: string[];
  };

  training_state: {
    ctl: number;
    atl: number;
    tsb: number;
  };

  // existing feasibility/conflict diagnostics retained where still relevant
  risk_flags: string[];
};
```

`training_state` is descriptive only and must not be interpreted as suitability or eligibility.

## Readiness Metric (Single Score)

Readiness is computed as one bounded composite:

```text
readiness_raw =
  0.45 * target_attainment_score
  + 0.30 * envelope_score
  + 0.15 * durability_score
  + 0.10 * evidence_score

readiness_score = clamp(round(readiness_raw), 0, 100)
```

Components:

1. `target_attainment_score` (0-100): deterministic aggregation from goal/target satisfaction.
2. `envelope_score` (0-100): how realistic projected loads/ramps are relative to profile/history-aware envelope.
3. `durability_score` (0-100): monotony/strain/deload debt penalties.
4. `evidence_score` (0-100): confidence adjustment from data quality/coverage/recency.

No secondary readiness line is published. Any explanatory subcomponents are metadata only.

## Capacity Envelope Realism

For each projected week `w`, derive envelope bounds from profile + history:

- `safe_low_w`, `safe_high_w` (expected sustainable range)
- `ramp_limit_w` (history-aware progression bound)

Week realism penalty:

```text
over_high = max(0, projected_tss_w - safe_high_w)
under_low = max(0, safe_low_w - projected_tss_w)
over_ramp = max(0, projected_ramp_pct_w - ramp_limit_w)

week_penalty_w =
  a * norm(over_high)
  + b * norm(under_low)
  + c * norm(over_ramp)
```

Envelope score:

```text
envelope_score = clamp(100 - 100 * weighted_mean(week_penalty_w), 0, 100)
```

Deterministic constants `a,b,c` are versioned in core and test-locked.

## CTL/ATL/TSB Guardrails

1. Keep CTL/ATL/TSB calculations unchanged and profile-agnostic.
2. Use CTL/ATL/TSB only as load-state inputs to readiness components.
3. Do not expose copy or labels implying CTL/ATL/TSB alone means "ready" or "suitable".
4. Block any API field or UI badge that maps CTL-only thresholds to athlete suitability classes.

## Validation Rules

1. Reject payloads containing removed fields: `mode`, `risk_acceptance`, `constraint_policy`.
2. Accept customized constraints without acknowledgement requirements.
3. Canonicalize goal/target ordering before scoring: `priority`, `event_date`, `id`, then target key.
4. Readiness must always be emitted as one scalar `readiness_score`.
5. `risk_flags` remain diagnostic; they do not gate plan creation.
6. Contract inputs must not include fields that are fully derivable from canonical input objects.

### Schema governance: no inferred duplicates

1. Keep only canonical nested objects for domain values.
2. Do not add duplicate scalar aliases when the value is derivable from existing objects.
3. Example: accept `recent_influence.influence_score`, not `recent_influence_score` as a separate field.
4. Canonical domain schema in core is the single source of truth; transport adapters map to it without introducing inferred duplicates.

## API and UI Requirements

1. Remove mode selector and risk acknowledgement controls from create flow.
2. Keep editable constraints section (advanced) always available.
3. Show one readiness score and one confidence indicator.
4. Show capacity envelope status (`inside/edge/outside`) with limiting factors.
5. Show CTL/ATL/TSB in a "Training state" block with explicit non-suitability disclaimer text.

## Migration Guidance (Old Mode/Risk -> Single Mode)

## Input contract migration

1. Remove `mode`, `risk_acceptance`, and `constraint_policy` from request schema.
2. Map previously policy-driven constraint values into `constraints` directly.
3. Ignore legacy acknowledgement fields if seen during short migration window; emit deprecation warning code.
4. After migration window, fail validation on legacy fields.
5. Remove duplicate inferred scalar input aliases (for example, `recent_influence_score`) and require canonical object form.

## Output contract migration

1. Remove `mode_applied` and `overrides_applied`.
2. Keep `risk_flags` as diagnostics only.
3. Replace any multiple readiness fields with single `readiness_score` + `readiness_confidence`.

## Data persistence migration

1. Stop writing acceptance timestamps/reasons immediately.
2. Stop writing override-policy blobs immediately.
3. Keep historical records readable but do not backfill or reclassify old plans.
4. For analytics, treat old mode/override columns as deprecated and excluded from new dashboards.

## Testing Specification

### Unit

1. Schema rejects removed mode/risk fields after migration cutoff.
2. Constraint customization works without acknowledgement fields.
3. Readiness composite remains bounded and deterministic.
4. Envelope score decreases when loads/ramp exceed profile/history envelope.
5. CTL/ATL/TSB-only perturbations do not produce suitability labels.

### Property

1. Same input produces identical readiness and diagnostics.
2. Tightening constraints cannot increase envelope violations.
3. Increasing target difficulty cannot increase target attainment score.
4. Reordered goals/targets produce identical outputs.

### Golden

1. Prior `risk_accepted` high-load scenario now runs without acknowledgement and reports lower envelope score when unrealistic.
2. Conservative default scenario produces high envelope score and stable readiness.
3. Sparse-history athlete scenario lowers evidence/envelope confidence while preserving single readiness output.

## Release Gates

Release is blocked unless all are true:

1. No mode/acknowledgement UI or API contracts remain.
2. No persistence/reporting path for override metadata remains active.
3. Single readiness metric is the only readiness headline in preview/create responses.
4. Capacity-envelope realism is active and profile/history-aware in production path.
5. CTL/ATL/TSB are presented as training-state metrics only, with no suitability semantics.

## Acceptance Criteria

1. User can create any plan by editing constraints and targets directly, with no override acknowledgement step.
2. Planner returns one readiness score that already reflects realism and evidence quality.
3. Unreasonable progression lowers envelope/readiness automatically instead of requiring mode gating.
4. No override metadata is stored or shown for new plans.
5. Determinism and bounded-compute behavior remain intact.
