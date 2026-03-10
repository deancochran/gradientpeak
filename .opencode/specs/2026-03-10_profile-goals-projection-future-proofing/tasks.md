# Tasks: Profile Goals + Projection Future-Proofing

## Phase 0: Spec Alignment

- [ ] Review `design.md`.
- [ ] Review `plan.md`.
- [ ] Confirm canonical terms: `Goal`, `Goal Objective`, `Athlete Snapshot`, `Preference Profile`.

## Phase 1: Persistence + Core Schema Foundation

- [ ] Replace the current `profile_goals` contract with canonical fields for `activity_category`, `target_payload`, source fields, and `metadata`.
- [ ] Update Supabase schema/types to match the new `profile_goals` contract.
- [ ] Refactor `packages/core/schemas/goals/profile_goals.ts` to introduce a canonical typed objective schema.
- [ ] Define and document the goal timing invariant (`target_date` vs `milestone_event_id`).
- [ ] Define canonical units, enums, and required-field invariants for each goal objective type.
- [ ] Define sport-specific load-method enums and provenance contracts.
- [ ] Replace the profile-settings alias to full creation config with a canonical `AthletePreferenceProfile` schema.
- [ ] Define canonical preference sections: `availability`, `dose_limits`, `training_style`, `recovery_preferences`, `adaptation_preferences`, `goal_strategy_preferences`.
- [ ] Add `target_surplus_preference` under canonical goal strategy preferences.
- [ ] Define explicit separation between profile defaults, plan overrides, planner policy, and derived diagnostics.
- [ ] Define the ownership/persistence rules for canonical goals, preferences, overrides, capability snapshots, and planner policy.

## Phase 2: Canonical Core Adapters

- [ ] Create canonical goal parsing and resolution helpers in `@repo/core`.
- [ ] Add tests for canonical goal parsing, validation, and timing resolution.
- [ ] Add canonical derivation of continuous `goal_demand_profile` from typed objectives.
- [ ] Add effective-preference resolution for profile defaults plus plan-level overrides.
- [ ] Add capability-snapshot derivation and freshness/invalidation rules in core.

## Phase 3: tRPC Integration

- [ ] Update `packages/trpc/src/routers/goals.ts` to read/write additive goal fields.
- [ ] Remove router-level goal reconstruction heuristics from `packages/trpc/src/routers/training-plans.base.ts`.
- [ ] Refactor projection-related procedures to consume canonical goals from `@repo/core`.
- [ ] Add focused `@repo/trpc` tests for canonical goal projection inputs.
- [ ] Return fallback mode, load provenance, and richer confidence metadata through projection APIs.
- [ ] Plumb canonical profile preferences through settings reads and projection request assembly.
- [ ] Ensure planner internals (`optimization_profile`, calibration, locks, diagnostics) are not treated as canonical profile preferences.

## Phase 4: Athlete Context Separation

- [ ] Split current profile training settings into user preferences vs engine policy concepts in `@repo/core`.
- [ ] Define an `AthleteCapabilitySnapshot` contract for projection inputs.
- [ ] Preserve current settings UX while switching it to canonical preference persistence.
- [ ] Add per-sport capability slices and evidence-recency fields.
- [ ] Move model-confidence and starting-state controls out of canonical user preference persistence.
- [ ] Move provenance, locks, and feasibility/context summaries out of canonical user preference persistence.
- [ ] Define `PlanPreferenceOverrides` for plan-specific deviations from profile defaults.

## Phase 5: Projection Modeling Improvements

- [ ] Add per-sport rolling load state before any combined load summary.
- [ ] Add sport-specific load-family calculations and method-aware confidence.
- [ ] Add continuous evidence decay and metric reliability weighting.
- [ ] Add simple `mechanical_stress_score` for impact-heavy sports.
- [ ] Add `resolveEffectiveScoringTarget(...)` helper with smooth bounded surplus logic.
- [ ] Refactor target scoring to prefer explicit projected metrics over readiness-proxy estimates.
- [ ] Upgrade sparse-data athlete modeling from binary buckets to a small continuous capability profile.
- [ ] Add dose-based recommendation outputs alongside existing load outputs.
- [ ] Add per-goal feasibility decomposition with limiters, confidence, and interference notes.
- [ ] Add continuous limiter-share outputs instead of only dominant limiter labels.
- [ ] Add continuous goal demand profiles by objective and sport.
- [ ] Replace remaining hard threshold cliffs in feasibility and readiness with smooth curves where appropriate.
- [ ] Attenuate target surplus automatically when confidence, time horizon, or limiter pressure is weak.
- [ ] Include effective-target metadata and rationale codes in target, goal, and plan scoring outputs.
- [ ] Extend projection tests for multi-goal and multi-discipline scenarios.

## Phase 6: Mobile UX Follow-Up

- [ ] Keep current goal editor working while writing canonical goal payloads directly.
- [ ] Add goal-type-aware form controls backed by the typed objective payload.
- [ ] Surface richer goal readiness and feasibility explanations where useful.
- [ ] Surface fallback mode, calculation method, confidence, and plain-language next-best-action guidance.
- [ ] Rework training preferences UI around user-language sections (`Schedule`, `Training style`, `Recovery`, `Goal strategy`).
- [ ] Add a dedicated training-preferences control for `target_surplus_preference` separate from progression pace/aggressiveness.
- [ ] Remove engine-internal controls from canonical profile settings UX.
- [ ] Explain when the engine is optimizing to slightly exceed the visible goal target.

## Validation

- [ ] Run `pnpm --filter @repo/core check-types`.
- [ ] Run `pnpm --filter @repo/trpc check-types`.
- [ ] Run focused `vitest` coverage for goal parsing, invalid canonical payload rejection, projection scoring, effective-target surplus logic, sport-specific load methods, and multi-goal feasibility.
- [ ] Run `pnpm --filter mobile check-types` after any mobile contract changes.
- [ ] Verify structured diagnostics/logging for parse failures, fallback frequency, and canonical load-method/provenance outputs.
