# Implementation Plan: Profile Goals + Projection Future-Proofing

## 1. Strategy

Use a clean canonical redesign. A full database reset and seed reinitialization are acceptable, so the implementation should prefer one clear source of truth instead of compatibility-safe dual shapes.

Database schema changes must follow the Supabase migration workflow:

1. generate migrations with `supabase db diff -f <filename>`
2. apply migrations with `supabase migration up`
3. update generated database types with `pnpm run update-types`

Implementation should proceed in layers:

1. define canonical persistence,
2. centralize domain parsing and invariants in `@repo/core`,
3. enrich athlete context and projection logic,
4. then simplify UI and API surfaces around the canonical model.

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
- `aggressiveness`, `optimization_profile`, and `goal_difficulty_preference` currently cover adjacent concepts, but there is no dedicated continuous preference for optimizing beyond the stated goal target.

## 3. Target Schema Changes

### Phase 1 schema additions

Add the following fields to `profile_goals`:

- `activity_category text null`
- `target_payload jsonb null`

Keep the canonical `profile_goals` table minimal. Do not add `source_type`, `source_provider`, `source_external_id`, `metadata`, or `status` to this spec.
Also remove plan-coupling and legacy decomposition fields that are no longer canonical: `training_plan_id`, `goal_type`, `target_metric`, `target_value`, and `target_date`.
Do not preserve legacy goal columns as canonical mirrors. The new schema should store the canonical shape directly.

Recommended canonical `profile_goals` shape:

- `id`
- `profile_id`
- `milestone_event_id`
- `title`
- `priority`
- `activity_category`
- `target_payload`
- `created_at`
- `updated_at`

### Additional canonical fields for modeling quality

Add or derive fields needed for better calculation quality with low complexity:

- goal-level `calculation_context` metadata for environment/course/test context,
- optional goal-level `demand_profile` cache or derived payload,
- session/activity-level `load_method`, `load_confidence`, and `source_provenance`,
- per-sport capability/evidence snapshot structures in core, even if not fully persisted initially,
- settings-level `target_surplus_preference` in the athlete preference layer.

### Timing invariant

Canonical goal timing must be event-linked through `milestone_event_id`.

Normative rules:

- `milestone_event_id` is required for every goal
- `target_date` should not be stored on `profile_goals` as a canonical field
- the resolved planning date comes from the linked event
- if the linked event date changes, the goal timing changes with it
- deleting the linked milestone event must delete the goal row
- the database foreign key should use `on delete cascade` for `milestone_event_id`

## 4. Core Package Refactor

### A. Canonical goal contract

Create the canonical goal domain in `@repo/core` with this shape:

```ts
type CanonicalGoal = {
  id: string;
  profile_id: string;
  title: string;
  priority: number;
  activity_category: "run" | "bike" | "swim" | "other";
  milestone_event_id: string;
  objective: CanonicalGoalObjective;
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

The initial union is intentionally small. Add new objective variants only when a concrete supported product flow requires them.

Normative invariants:

- `activity_category` is a closed enum: `run | bike | swim | other`
- `activity_category` has one canonical storage location: the top-level `profile_goals.activity_category` field
- objective payload variants that include sport context must match the top-level `activity_category` exactly
- payload variants that do not need sport-specific fields must derive sport from the top-level `activity_category`
- canonical units are `meters`, `seconds`, `m/s`, `watts`, and `bpm`
- `event_performance` requires `activity_category` and at least one target outcome field that can be scored deterministically
- `threshold` requires exactly one `metric` and one numeric `value`
- `completion` must describe a finishable workload using distance, duration, or both
- `consistency` must use week-based cadence terms only, not free-form date spans
- invalid combinations should fail schema validation in `@repo/core` rather than being silently repaired downstream

Worked canonical examples:

- 5K time goal
  - `type: "event_performance"`
  - `activity_category: "run"`
  - `distance_m: 5000`
  - `target_time_s: <number>`
- FTP goal
  - `type: "threshold"`
  - `metric: "power"`
  - `activity_category: "bike"`
  - `value: <watts>`
  - `test_duration_s: 1200`
- event-linked completion goal
  - `type: "completion"`
  - `activity_category: <sport>`
  - timing via `milestone_event_id`

The implementation must include fixture coverage for these examples so serialization and projection inputs stay deterministic.

### B. Core parsers and resolvers

Add pure domain helpers in `@repo/core`:

- `parseProfileGoalRecord(record)`
- `resolveGoalEventDate(goal, linkedEvent)`
- `deriveGoalDemandProfile(goal)`
- `resolveEffectivePreferences(profileDefaults, planOverrides?)`

All tRPC and mobile consumers must rely on these helpers instead of duplicating heuristics.

### C. Athlete context split

Split current profile settings into:

- `AthletePreferenceProfile`
- `AthleteCapabilitySnapshot`
- `PlannerPolicyConfig`

`AthletePreferenceProfile` is user-editable and persisted as the canonical profile settings contract.
`AthleteCapabilitySnapshot` is derived from profile/history/metrics and is never directly user-edited.
`PlannerPolicyConfig` is internal and server-owned.

`AthletePreferenceProfile` must include a continuous field with these semantics:

```ts
target_surplus_preference: number; // 0..1
```

Interpretation:

- `0` = optimize to reliably meet the stated goal target.
- `1` = optimize toward a bounded surplus beyond the stated goal when confidence, time horizon, and feasibility support it.

This field is separate from:

- `aggressiveness` (load/ramp behavior),
- `optimization_profile` (risk/stability tradeoff),
- `goal_difficulty_preference` (ambition framing / feasibility posture).

### D. Normalize the user preference model

Do not let `AthletePreferenceProfile` remain a thin alias of `trainingPlanCreationConfigSchema`.

The canonical profile-level preference shape is smaller and centered on stable user intent. Use this shape:

```ts
type AthletePreferenceProfile = {
  availability: {
    weekly_windows: Array<{
      day: CreationWeekDay;
      windows: Array<{
        start_minute_of_day: number;
        end_minute_of_day: number;
      }>;
      max_sessions?: number;
    }>;
    hard_rest_days: CreationWeekDay[];
  };
  dose_limits: {
    min_sessions_per_week?: number;
    max_sessions_per_week?: number;
    max_single_session_duration_minutes?: number;
    max_weekly_duration_minutes?: number;
  };
  training_style: {
    progression_pace: number; // 0..1
    week_pattern_preference: number; // 0..1, steady -> varied
    key_session_density_preference?: number; // 0..1
  };
  recovery_preferences: {
    recovery_priority: number; // 0..1
    post_goal_recovery_days: number;
    double_day_tolerance?: number; // 0..1
    long_session_fatigue_tolerance?: number; // 0..1
  };
  adaptation_preferences: {
    recency_adaptation_preference?: number; // 0..1
    plan_churn_tolerance?: number; // 0..1
  };
  goal_strategy_preferences: {
    target_surplus_preference: number; // 0..1
    priority_tradeoff_preference?: number; // 0..1
  };
};
```

This is the canonical persisted profile preference contract.

The following should explicitly stay outside that user-facing schema:

- `PlannerPolicyConfig`
- optimizer calibration weights
- internal curve-shaping controls
- starting-fitness/model-confidence controls
- provenance payloads
- locks
- feasibility and diagnostic summaries

### E. Source of truth and ownership rules

The system should use these canonical ownership boundaries:

| Domain object                              | Canonical owner      | Persistence location     | User editable         | Returned to clients     |
| ------------------------------------------ | -------------------- | ------------------------ | --------------------- | ----------------------- |
| `CanonicalGoal`                            | goal domain          | `profile_goals`          | yes                   | yes                     |
| `AthletePreferenceProfile`                 | profile settings     | profile settings storage | yes                   | yes                     |
| `PlanPreferenceOverrides`                  | training plan domain | training plan storage    | yes, plan-scoped only | yes                     |
| `AthleteCapabilitySnapshot`                | projection domain    | derived/cache only       | no                    | summarized only         |
| `PlannerPolicyConfig`                      | server/core          | code/config only         | no                    | no                      |
| diagnostics / provenance / fallback detail | projection domain    | request output and logs  | no                    | selected summaries only |

Goal lifecycle rule:

- a goal exists only while its linked milestone event exists
- deleting the linked milestone event deletes the goal rather than orphaning it
- there is no separate goal `status` field in this spec
- goals are profile-owned, not training-plan-owned; `profile_goals` must not store `training_plan_id`
- training plans that need goal linkage must reference goals from the training-plan side through explicit goal ids or a join structure outside `profile_goals`

Classification rule:

- stable user intent belongs in `AthletePreferenceProfile`
- plan-specific deviations belong in `PlanPreferenceOverrides`
- history-derived measurable state belongs in `AthleteCapabilitySnapshot`
- algorithm-shaping non-user policy belongs in `PlannerPolicyConfig`
- explanations and transient reasoning belong in diagnostics, not persistence

### F. Preference field mapping decisions

Use the following mapping as the canonical field classification contract.

| Current field                                      | Proposed destination                                   | Treatment                     | Notes                                              |
| -------------------------------------------------- | ------------------------------------------------------ | ----------------------------- | -------------------------------------------------- |
| `availability_config.days[].windows`               | `availability.weekly_windows[].windows`                | keep                          | Direct mapping                                     |
| `availability_config.days[].max_sessions`          | `availability.weekly_windows[].max_sessions`           | keep                          | Direct mapping                                     |
| `constraints.hard_rest_days`                       | `availability.hard_rest_days`                          | keep                          | Direct mapping                                     |
| `constraints.min_sessions_per_week`                | `dose_limits.min_sessions_per_week`                    | keep                          | Direct mapping                                     |
| `constraints.max_sessions_per_week`                | `dose_limits.max_sessions_per_week`                    | keep                          | Direct mapping                                     |
| `constraints.max_single_session_duration_minutes`  | `dose_limits.max_single_session_duration_minutes`      | keep                          | Direct mapping                                     |
| `behavior_controls_v1.aggressiveness`              | `training_style.progression_pace`                      | rename                        | User-facing wording should avoid `aggressiveness`  |
| `behavior_controls_v1.variability`                 | `training_style.week_pattern_preference`               | rename                        | Interpreted as steady vs varied weeks              |
| `behavior_controls_v1.recovery_priority`           | `recovery_preferences.recovery_priority`               | keep                          | Still user-facing                                  |
| `post_goal_recovery_days`                          | `recovery_preferences.post_goal_recovery_days`         | keep                          | Still user-facing                                  |
| `target_surplus_preference`                        | `goal_strategy_preferences.target_surplus_preference`  | add                           | New dedicated ambition-upside field                |
| `recent_influence`                                 | `adaptation_preferences.recency_adaptation_preference` | optional reinterpretation     | Persist only if reframed as real user intent       |
| `recent_influence_action`                          | none                                                   | remove from canonical profile | Workflow/engine state, not preference              |
| `optimization_profile`                             | `PlannerPolicyConfig`                                  | move internal                 | Engine policy, not stable user intent              |
| `constraints.goal_difficulty_preference`           | none initially                                         | deprecate                     | Replace with clearer goal strategy semantics later |
| `behavior_controls_v1.spike_frequency`             | `PlannerPolicyConfig`                                  | move internal                 | Internal load-shaping parameter                    |
| `behavior_controls_v1.shape_target`                | `PlannerPolicyConfig`                                  | move internal                 | Internal curve-shaping parameter                   |
| `behavior_controls_v1.shape_strength`              | `PlannerPolicyConfig`                                  | move internal                 | Internal curve-shaping parameter                   |
| `behavior_controls_v1.starting_fitness_confidence` | `AthleteCapabilitySnapshot` or diagnostics             | move derived/internal         | Not a user preference                              |
| `availability_provenance`                          | diagnostics/provenance store                           | move internal                 | Not a preference                                   |
| `recent_influence_provenance`                      | diagnostics/provenance store                           | move internal                 | Not a preference                                   |
| `calibration`                                      | `PlannerPolicyConfig`                                  | move internal                 | Engine tuning only                                 |
| `calibration_composite_locks`                      | internal workflow state                                | move internal                 | Not a stable preference                            |
| `locks.*`                                          | internal workflow state                                | move internal                 | UI workflow support only                           |
| `context_summary`                                  | derived diagnostics                                    | move internal                 | Request-scoped/derived                             |
| `feasibility_safety_summary`                       | derived diagnostics                                    | move internal                 | Request-scoped/derived                             |

### G. Profile defaults vs plan overrides

The system distinguishes three layers:

1. `AthletePreferenceProfile`: stable profile defaults set by the user.
2. `PlanPreferenceOverrides`: optional plan-specific deviations from profile defaults.
3. `PlannerPolicyConfig`: internal engine policy and calibration.

The planner must resolve effective preference inputs with this order:

```ts
effective_preferences = applyPlanOverrides({
  profile_defaults,
  plan_overrides,
});
```

Then planner policy and derived capability are added separately:

```ts
projection_inputs = {
  goals,
  effective_preferences,
  athlete_capability_snapshot,
  planner_policy_config,
};
```

This prevents profile settings from silently becoming engine config and makes plan-specific tuning explicit.

`AthleteCapabilitySnapshot` must support these per-sport slices:

- `run`,
- `bike`,
- `swim`,
- `other`.

Each slice holds continuous factors such as:

- `aerobic_base`,
- `threshold_capacity`,
- `high_intensity_capacity`,
- `durability`,
- `recovery_speed`,
- `technical_proficiency`,
- `evidence_quality`,
- `evidence_recency_days`.

### H. Capability snapshot lifecycle

`AthleteCapabilitySnapshot` is derived state with explicit freshness rules.

Normative rules:

- the canonical source is derived computation, not direct persistence from client writes
- cached snapshots are optional, but if cached they must be invalidated by new activities, imported history, threshold/test updates, and major profile-setting changes that affect projection inputs
- projection outputs should expose enough provenance to explain whether capability came from strong same-sport evidence, weak adjacent-sport evidence, or conservative priors
- snapshot freshness should be evaluated at projection time; stale capability should reduce confidence rather than silently behaving as current truth
- if snapshot caching is introduced, the projection result should retain the snapshot timestamp used for explainability/debugging

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

Add an internal target-adjustment step before scoring. The engine should score against an `effective_target` rather than always the raw user-entered target.

Recommended helper:

```ts
resolveEffectiveScoringTarget({
  rawTarget,
  targetType,
  surplusPreference,
  readinessConfidence,
  feasibilityConfidence,
  weeksToGoal,
  limiterShare,
});
```

Recommended relationship:

1. Convert the user preference into a smooth surplus signal:

```ts
surplusSignal = smoothstep01(target_surplus_preference);
```

2. Bound the maximum surplus by target family:

```ts
maxSurplusPctByTargetType = {
  race_performance: 0.04,
  pace_threshold: 0.05,
  power_threshold: 0.05,
  hr_threshold: 0.015,
};
```

3. Attenuate surplus when evidence or feasibility is weak:

```ts
supportFactor = clamp01(
  0.4 * readinessConfidence +
    0.25 * feasibilityConfidence +
    0.2 * smoothstep01((weeksToGoal - 4) / 12) +
    0.15 * (1 - limiterShare),
);
```

4. Compute an applied surplus percentage:

```ts
appliedSurplusPct =
  maxSurplusPctByTargetType[targetType] * surplusSignal * supportFactor;
```

5. Translate that into an internal scoring target:

- lower-is-better targets (`race_performance`, target time):
  - `effective_target = raw_target * (1 - appliedSurplusPct)`
- higher-is-better targets (`pace`, `power`, `hr`):
  - `effective_target = raw_target * (1 + appliedSurplusPct)`

The user-visible goal remains unchanged. Only the internal optimization/scoring target changes.

This logic should live close to `packages/core/plan/scoring/targetSatisfaction.ts` so ambition semantics stay attached to target attainment, not load shaping.

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

Normative load/provenance contract:

- `load_method` is a closed enum owned by `@repo/core`
- initial allowed values: `bike_power`, `run_pace`, `swim_threshold_speed`, `heart_rate`, `manual_estimate`
- `load_confidence` is a bounded `0..1` numeric score for the selected method
- `source_quality` is a bounded `0..1` score representing sensor/source trustworthiness
- `fallback_mode` is a closed enum describing why a weaker method was used
- fallback order should prefer same-sport primary methods first, then same-sport weaker methods, then conservative fallback methods
- combined cross-sport summaries may exist for convenience, but per-sport state remains authoritative for scoring and safety

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

Recommendation outputs should also include the effective target context used by the optimizer, for example:

- `raw_target`,
- `effective_scoring_target`,
- `applied_surplus_pct`,
- `surplus_support_factor`.

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

Normative demand-profile rules:

- each demand dimension is a bounded `0..1` value
- dimensions do not need to sum to `1`; they represent independent pressure components
- each supported objective type must emit a complete demand profile with deterministic defaults for omitted dimensions
- fixture examples should cover at least: 5K race goal, marathon completion goal, FTP goal, and consistency goal

### H. Add continuous evidence decay and uncertainty propagation

Replace stepwise confidence adjustments with continuous evidence modeling based on:

- recency decay,
- sample density,
- same-sport vs adjacent-sport relevance,
- metric reliability,
- model fallback depth.

Target scoring, feasibility, and recommendations should all consume propagated uncertainty rather than independent ad hoc confidence rules.

The target-surplus relationship should also consume this uncertainty so the engine naturally collapses back toward the raw target when evidence is stale, sparse, or heavily inferred.

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
7. Add a dedicated continuous target-surplus preference instead of overloading `aggressiveness`.

### Priority 2: Highest impact, medium effort

1. Replace readiness-proxy target estimation with sport-specific forward estimators.
2. Replace binary sparse-data athlete priors with continuous capability factors.
3. Add sport-specific load family modeling.
4. Add dose-based recommendation outputs.
5. Add continuous goal demand profiles.
6. Add effective-target scoring with uncertainty-aware surplus attenuation.

### Priority 3: Important follow-ons

1. Add partial cross-sport transfer rules.
2. Add environment and course modifiers.
3. Replace remaining hard threshold cliffs with smooth utility or penalty curves.
4. Replace session-count midpoint heuristics in creation feasibility with smoother dose utility functions.

## 7. Concrete Code Modification Targets

### A. Schema and settings

- `packages/core/schemas/settings/profile_settings.ts`
  - replace the direct alias to `trainingPlanCreationConfigSchema` with a canonical `athletePreferenceProfileSchema`
- `packages/core/schemas/training-plan-structure/creation-config-schemas.ts`
  - remove or narrow planner-facing creation config fields so this file is not treated as the canonical profile-settings contract
  - mark `optimization_profile`, `goal_difficulty_preference`, `spike_frequency`, `shape_target`, `shape_strength`, and `starting_fitness_confidence` as internal/planner-facing fields rather than canonical profile preferences
  - introduce separate `planPreferenceOverridesSchema` if plan-specific overrides are stored explicitly

### Preference profile modules

- `packages/core/schemas/settings/profile_settings.ts`
  - define top-level sections: `availability`, `dose_limits`, `training_style`, `recovery_preferences`, `adaptation_preferences`, `goal_strategy_preferences`
- `packages/core/schemas/settings/`
  - add parsing, validation, and effective preference resolution helpers

### B. Core scoring and projection

- `packages/core/plan/scoring/targetSatisfaction.ts`
  - add `resolveEffectiveScoringTarget(...)`
  - compute `effective_target` before attainment probability
  - include rationale codes such as `effective_target_surplus_applied` and `effective_target_surplus_suppressed_low_support`
- `packages/core/plan/scoring/goalScore.ts`
  - propagate effective-target metadata from target scores so goal summaries can explain why a score changed
- `packages/core/plan/scoring/planScore.ts`
  - keep aggregate math mostly unchanged; consume revised goal scores
- `packages/core/plan/projectionCalculations.ts`
  - pass `target_surplus_preference`, feasibility confidence, weeks-to-goal, and limiter signals into scoring inputs
- `packages/core/plan/projection/readiness.ts`
  - expose limiter-share signals needed to attenuate surplus ambition smoothly

### C. Feasibility and suggestions

- `packages/core/plan/classifyCreationFeasibility.ts`
  - do not treat target surplus as identical to aggressiveness; optionally add a mild safety advisory only when surplus preference is high and the plan is already over-reaching
- `packages/core/plan/deriveCreationSuggestions.ts`
  - if implemented, recommend lowering surplus preference when timeline/capacity constraints are dominant

### D. Mobile UX

- `apps/mobile/app/(internal)/(standard)/training-preferences.tsx`
  - regroup the screen around user-language sections: `Schedule`, `Training style`, `Recovery`, `Goal strategy`
  - add a slider for `target_surplus_preference`
  - keep it separate from aggressiveness in copy and grouping
  - stop presenting engine-internal controls on the profile settings screen
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
  - preserve existing advanced planner tuning if needed for create/edit experimentation, but do not treat those controls as canonical profile preferences
  - show clear helper text distinguishing progression pace from goal surplus intent
- `apps/mobile/components/settings/TrainingPreferencesSummaryCard.tsx`
  - summarize only stable user-facing preference concepts rather than raw planner controls
- projection preview surfaces
  - show concise copy such as `Planning to slightly exceed your target when safely supported`
  - prefer user-facing dose/readiness/feasibility explanations over CTL-only wording where possible

## 8. tRPC Refactor

### Phase 1

- Update goals CRUD schemas to accept the new additive fields.
- Read and write canonical fields directly.
- Stop reconstructing goal meaning from legacy-compatible goal strings and values.

### Phase 2

- Replace router-level heuristic goal reconstruction with `@repo/core` canonical parsers/resolvers.
- Make projection endpoints consume canonical goals directly.
- Return richer goal diagnostics to mobile without exposing internal-only calibration details.

## 9. Mobile App Strategy

Keep the current goal editor simple in the first pass.

### Phase 1

- Add hidden support for `activity_category` and typed payload serialization.
- Keep current simple controls only if they map deterministically into canonical payloads.
- Persist `target_surplus_preference` as part of canonical profile settings.

### Phase 2

- Upgrade the goal editor to be goal-type aware.
- Render fields based on the typed objective rather than free-form metric strings.
- Add source-aware and event-linked goal affordances only when there is a real user flow for them.
- Surface user-facing confidence, fallback mode, and plain-language limiter explanations.
- Surface effective-target copy so users can tell when the system is planning to slightly exceed their stated goal.

## 10. Validation

Required checks after each phase:

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/trpc check-types
pnpm --filter mobile check-types
```

Required database workflow after any schema change:

```bash
supabase db diff -f <filename>
supabase migration up
pnpm run update-types
```

Required focused test areas:

- canonical goal parsing and validation,
- preference-profile parsing and validation,
- effective preference resolution from profile defaults plus plan overrides,
- per-goal date resolution,
- invalid timing-mode rejection,
- invalid objective-shape rejection,
- sparse-data projection starting state,
- target scoring with explicit metric projections,
- effective-target surplus adjustment behavior by target type,
- suppression of surplus when confidence or feasibility is weak,
- sport-specific load method calculation and provenance,
- continuous evidence decay behavior,
- mechanical stress behavior for running and cross-sport comparisons,
- multi-goal interference and feasibility breakdown,
- tRPC goal read/write and projection integration,
- malformed canonical payload logging and parse-failure observability.

Required operational validation:

- structured logs/counters for goal-parse failures, invalid canonical payloads, fallback-mode frequency, and load-method usage
- verification that supported sparse-data athletes still receive non-null bounded outputs
- verification that invalid canonical records fail early with explicit reason codes rather than downstream heuristic repair

Acceptance criteria additions:

- invalid canonical goal shapes are rejected in `@repo/core` validation with explicit reason codes
- supported canonical goal shapes produce deterministic projection inputs without router-level reconstruction
- profile settings writes persist only canonical `AthletePreferenceProfile` fields
- planner-only fields are not stored in canonical user preference persistence
- sparse-data athletes still receive non-null outputs with explicit fallback and confidence metadata
- per-goal limiter shares differ when goals materially differ rather than inheriting one plan-global limiter explanation

## 11. Rollout Order

1. Add DB fields and core schemas.
2. Introduce canonical `AthletePreferenceProfile` and explicit ownership boundaries.
3. Add canonical goal/domain parser layer in `@repo/core`.
4. Add provenance, fallback-mode, per-sport rolling state outputs, and `target_surplus_preference` plumbing.
5. Update tRPC goals router and projection readers to use the canonical goal and preference model directly.
6. Refactor profile settings reads/writes so canonical user preferences are no longer a thin alias of planner config.
7. Refactor target scoring, sparse-data capability modeling, continuous evidence decay, and effective-target surplus handling.
8. Expand projection outputs with dose recommendations, limiter shares, sport-specific load methods, and effective-target metadata.
9. Upgrade mobile goal editing UX and explainability once the backend contract is stable.

## 12. Expected Outcomes

- Goals become future-proof without forcing immediate UI complexity.
- Projection logic becomes easier to extend across sports and athlete types.
- Recommended load becomes more context-aware and honest.
- Current calculations gain better behavior without requiring a full algorithmic rewrite.
- Outputs become more trustworthy because uncertainty, fallback depth, and method provenance are visible.
- Run, bike, and swim planning become more accurate without pretending they share one identical stress equation.
- Athletes can smoothly express whether they want to merely hit a target or optimize for bounded upside beyond it.
- Overachievement intent influences target scoring without being confused with training ramp aggressiveness.
- The app retains MVP simplicity while gaining a stable long-term planning foundation.
