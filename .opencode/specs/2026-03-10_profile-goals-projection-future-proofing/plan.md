# Implementation Plan: Profile Goals + Projection Future-Proofing

## 1. Strategy

Use an additive, compatibility-safe migration. Do not break the current mobile CRUD flow or the current `profile_goals` consumer paths in one step. Introduce a canonical typed goal contract and gradually move translation and projection logic onto it.

Implementation should proceed in layers:

1. stabilize persistence,
2. centralize translation in `@repo/core`,
3. enrich athlete context and projection logic,
4. then retire brittle fallbacks.

## 2. Current Issues To Address

### A. Flat persisted goal shape is lossy

Current persisted fields in `packages/supabase/schemas/init.sql` and `packages/core/schemas/goals/profile_goals.ts` cannot fully encode the richer target variants already used by projection logic.

### B. Translation is in the wrong layer

`packages/trpc/src/routers/training-plans.base.ts` currently reconstructs projection targets from ambiguous fields, title text, and fallback assumptions. This logic should move into `@repo/core`.

### C. Athlete settings are over-coupled to planner internals

`packages/core/schemas/settings/profile_settings.ts` currently aliases the broader training-plan creation config. Separate user preferences from engine policy and generated diagnostics.

### D. Scoring still relies too heavily on readiness proxies

`packages/core/plan/scoring/targetSatisfaction.ts` should become a true target-projection scoring layer rather than primarily inferring performance from generic readiness.

### E. Current calculations still contain avoidable hard edges

Several current calculations should be upgraded with better modeling patterns:

- `packages/core/plan/scoring/targetSatisfaction.ts` currently uses readiness-scaled target estimates and fixed sport caps as major fallbacks.
- `packages/core/plan/projectionCalculations.ts` still compresses sparse-data athletes into `weak | strong`, uses goal-tier thresholds, and uses discrete build-time feasibility bands.
- `packages/core/plan/projection/readiness.ts` still converts continuous internal signals into coarse band thresholds and discrete limiter modes too early.
- `packages/core/plan/classifyCreationFeasibility.ts` still uses session-count midpoint heuristics and step penalties where smoother utility curves would better match real behavior.

## 3. Target Schema Changes

### Phase 1 schema additions

Add the following fields to `profile_goals`:

- `activity_category text null`
- `target_payload jsonb null`
- `target_payload_version integer null`
- `source_type text null`
- `source_provider text null`
- `source_external_id text null`
- `metadata jsonb null`
- `status text null` or a constrained enum if goal lifecycle needs to be explicit

Preserve current columns:

- `goal_type`
- `target_metric`
- `target_value`
- `target_date`
- `milestone_event_id`

Use them as compatibility fields until all readers move to the typed payload.

### Additional compatibility-safe fields for modeling quality

Add or derive fields needed for better calculation quality with low complexity:

- goal-level `calculation_context` metadata for environment/course/test context,
- optional goal-level `demand_profile` cache or derived payload,
- session/activity-level `load_method`, `load_confidence`, and `source_provenance`,
- per-sport capability/evidence snapshot structures in core, even if not fully persisted initially.

### Timing invariant

Enforce one of these strategies:

- explicit target date on the goal, or
- event-derived target date via `milestone_event_id`

If both are present during migration, define precedence and emit a diagnostic reason code.

## 4. Core Package Refactor

### A. Canonical goal contract

Create a new canonical goal domain in `@repo/core` with shapes equivalent to:

```ts
type CanonicalGoal = {
  id: string;
  profile_id: string;
  title: string;
  priority: number;
  status?: "active" | "completed" | "archived";
  activity_category?: string | null;
  timing: {
    mode: "explicit_date" | "event_linked";
    target_date?: string;
    milestone_event_id?: string;
  };
  source?: {
    type?: string;
    provider?: string;
    external_id?: string;
  };
  objective: CanonicalGoalObjective;
  metadata?: Record<string, unknown>;
};
```

Where `CanonicalGoalObjective` is a discriminated union that starts with:

```ts
type CanonicalGoalObjective =
  | {
      type: "event_performance";
      activity_category: "run" | "bike" | "swim" | "other";
      distance_m?: number;
      target_time_s?: number;
      target_speed_mps?: number;
      environment?: string;
      tolerance_pct?: number;
    }
  | {
      type: "threshold";
      metric: "pace" | "power" | "hr";
      activity_category?: "run" | "bike" | "swim" | "other";
      value: number;
      test_duration_s?: number;
      tolerance_pct?: number;
    }
  | {
      type: "completion";
      activity_category?: "run" | "bike" | "swim" | "other";
      distance_m?: number;
      duration_s?: number;
    }
  | {
      type: "consistency";
      target_sessions_per_week?: number;
      target_weeks?: number;
    };
```

Keep the initial union intentionally small. Add extensibility, not premature exhaustiveness.

### B. Core adapters

Add pure adapters in `@repo/core`:

- `parseProfileGoalRecordToCanonicalGoal(record)`
- `deriveCanonicalGoalObjectiveFromLegacyFields(record)`
- `resolveCanonicalGoalDate(goal, linkedEvent?)`
- `serializeCanonicalGoalForCompatibility(goal)`

All tRPC and mobile consumers should eventually rely on these adapters instead of duplicating heuristics.

### C. Athlete context split

Split current profile settings into:

- `AthletePreferenceProfile`
- `AthleteCapabilitySnapshot`
- `PlannerPolicyConfig`

`AthletePreferenceProfile` should remain user-editable.
`AthleteCapabilitySnapshot` should be derived from profile/history/metrics and optionally persisted later.
`PlannerPolicyConfig` should remain internal/versioned.

The first useful additive shape for `AthleteCapabilitySnapshot` should support per-sport slices such as:

- `run`,
- `bike`,
- `swim`,
- `other`.

Each slice should be able to hold continuous factors like:

- `aerobic_base`,
- `threshold_capacity`,
- `high_intensity_capacity`,
- `durability`,
- `recovery_speed`,
- `technical_proficiency`,
- `evidence_quality`,
- `evidence_recency_days`.

## 5. Projection Modeling Refactor

### A. Separate three outputs

Projection should compute and expose separately:

1. `target_attainment`
2. `event_readiness`
3. `plan_feasibility`

These can still roll up into one summary score for UI convenience, but they should not be treated as the same concept internally.

### B. Replace readiness-proxy target scoring

Refactor `packages/core/plan/scoring/targetSatisfaction.ts` so target scoring prefers explicit projected metrics over generic readiness-derived estimates.

Introduce discipline-aware forward metric estimators such as:

- projected race time from demand and state,
- projected threshold pace,
- projected threshold power,
- projected threshold HR only as a weak-support proxy.

Use readiness-derived fallbacks only when explicit projections are unavailable.

Add metric reliability weighting so estimator confidence depends on sport and source quality. Power and direct pace-based signals should generally outrank HR-based or manually inferred signals.

### C. Upgrade sparse-data athlete modeling

Replace the current binary `weak | strong` no-history classification with a small continuous profile including:

- aerobic base,
- durability,
- recovery speed,
- intensity support,
- evidence quality.

These values can still be heuristically derived at first.

Replace the current binary sparse-data classification gradually by introducing a continuous prior and shrinking each factor toward sport-specific defaults when evidence is weak.

### D. Introduce sport-specific load family modeling

Model training load as a family of sport-specific stress methods:

- bike power stress,
- run pace or grade-aware stress,
- swim threshold-speed stress,
- heart-rate stress fallback,
- manual estimated stress fallback.

Per-session load should carry:

- `sport`,
- `load_method`,
- `load_confidence`,
- `source_quality`.

Per-sport rolling state should be computed before any combined or convenience summary.

Add a lightweight secondary stress dimension for impact-heavy sports:

- `mechanical_stress_score`,
- initially driven by sport, duration, and intensity,
- especially used for run safety and recovery guidance.

### E. Make recommendation output dose-based

Expand projection output to support recommended dose fields such as:

- recommended weekly load,
- recommended weekly duration,
- key-session count,
- long-session ceiling,
- intensity distribution target,
- ramp pressure and recovery pressure.

This should coexist with current TSS-based outputs rather than replace them immediately.

Combined recommendation payloads should include both:

- load-family outputs for internal consistency, and
- user-facing dose outputs for clarity.

### F. Add per-goal feasibility decomposition

Each goal assessment should include its own:

- demand gap,
- limiting factors,
- confidence,
- interference notes,
- marginal feasibility band.

Avoid applying a single plan-global demand gap to every goal when multiple goals differ materially.

Add continuous limiter shares, for example:

- timeline pressure,
- capacity pressure,
- evidence weakness,
- recovery strain,
- mechanical stress,
- goal interference.

These should remain continuous internally even if UI later maps them to summarized labels.

### G. Add continuous goal demand profiles

Derive a `goal_demand_profile` for each canonical objective with continuous weights such as:

- `endurance_demand`,
- `threshold_demand`,
- `high_intensity_demand`,
- `durability_demand`,
- `technical_demand`,
- `specificity_demand`.

This should replace over-reliance on simple goal tiers and make multi-sport extension easier.

### H. Add continuous evidence decay and uncertainty propagation

Replace stepwise confidence adjustments with continuous evidence modeling based on:

- recency decay,
- sample density,
- same-sport vs adjacent-sport relevance,
- metric reliability,
- model fallback depth.

Target scoring, feasibility, and recommendations should all consume propagated uncertainty rather than independent ad hoc confidence rules.

### I. Add limited cross-sport transfer rules

Support partial transfer of general aerobic capability across sports while preserving sport-specific and tissue-specific readiness.

This should be implemented with simple explicit coefficients first, not a heavy learned model.

## 6. Calculation Audit Priorities

### Priority 1: Highest impact, lowest effort

1. Add `load_method`, `load_confidence`, `fallback_mode`, and provenance outputs.
2. Keep per-sport rolling load state before any combined summary.
3. Add continuous evidence decay instead of relying primarily on `none | sparse | stale | rich` transitions.
4. Separate output semantics into `target_attainment`, `event_readiness`, and `plan_feasibility`.
5. Add per-goal limiter shares instead of only dominant limiter labels.
6. Add a simple `mechanical_stress_score` for impact-heavy sports.

### Priority 2: Highest impact, medium effort

1. Replace readiness-proxy target estimation with sport-specific forward estimators.
2. Replace binary sparse-data athlete priors with continuous capability factors.
3. Add sport-specific load family modeling.
4. Add dose-based recommendation outputs.
5. Add continuous goal demand profiles.

### Priority 3: Important follow-ons

1. Add partial cross-sport transfer rules.
2. Add environment and course modifiers.
3. Replace remaining hard threshold cliffs with smooth utility or penalty curves.
4. Replace session-count midpoint heuristics in creation feasibility with smoother dose utility functions.

## 7. tRPC Refactor

### Phase 1

- Update goals CRUD schemas to accept the new additive fields.
- Read and write compatibility fields plus `target_payload`.
- Stop assuming the DB shape is identical to the full core schema until the table is updated.

### Phase 2

- Replace router-level heuristic goal reconstruction with `@repo/core` adapters.
- Make projection endpoints consume canonical goals directly.
- Return richer goal diagnostics to mobile without exposing internal-only calibration details.

## 8. Mobile App Strategy

Keep the current goal editor simple in the first pass.

### Phase 1

- Add hidden support for `activity_category` and typed payload serialization.
- Keep current simple controls for `goal_type`, `target_metric`, `target_value`, and `target_date`.

### Phase 2

- Upgrade the goal editor to be goal-type aware.
- Render fields based on the typed objective rather than free-form metric strings.
- Add source-aware and event-linked goal affordances only when there is a real user flow for them.
- Surface user-facing confidence, fallback mode, and plain-language limiter explanations.

## 9. Validation

Required checks after each phase:

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/trpc check-types
pnpm --filter mobile check-types
```

Required focused test areas:

- canonical goal parsing and compatibility serialization,
- per-goal date resolution,
- sparse-data projection starting state,
- target scoring with explicit metric projections,
- sport-specific load method calculation and provenance,
- continuous evidence decay behavior,
- mechanical stress behavior for running and cross-sport comparisons,
- multi-goal interference and feasibility breakdown,
- tRPC goal read/write and projection integration.

## 10. Rollout Order

1. Add DB fields and core schemas.
2. Add canonical goal adapter layer in `@repo/core`.
3. Add provenance, fallback-mode, and per-sport rolling state outputs.
4. Update tRPC goals router and projection readers to use the adapter layer.
5. Refactor target scoring, sparse-data capability modeling, and continuous evidence decay.
6. Expand projection outputs with dose recommendations, limiter shares, and sport-specific load methods.
7. Upgrade mobile goal editing UX and explainability once the backend contract is stable.

## 11. Expected Outcomes

- Goals become future-proof without forcing immediate UI complexity.
- Projection logic becomes easier to extend across sports and athlete types.
- Recommended load becomes more context-aware and honest.
- Current calculations gain better behavior without requiring a full algorithmic rewrite.
- Outputs become more trustworthy because uncertainty, fallback depth, and method provenance are visible.
- Run, bike, and swim planning become more accurate without pretending they share one identical stress equation.
- The app retains MVP simplicity while gaining a stable long-term planning foundation.
