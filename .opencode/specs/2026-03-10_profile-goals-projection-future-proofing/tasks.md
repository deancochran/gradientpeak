# Tasks: Profile Goals + Projection Future-Proofing

## Phase 0: Spec Alignment

- [ ] Review `design.md`.
- [ ] Review `plan.md`.
- [ ] Confirm canonical terms: `Goal`, `Goal Objective`, `Athlete Snapshot`, `Preference Profile`.

## Phase 1: Persistence + Core Schema Foundation

- [ ] Add additive `profile_goals` columns for `activity_category`, `target_payload`, `target_payload_version`, source fields, and `metadata`.
- [ ] Update Supabase schema/types to match the new `profile_goals` contract.
- [ ] Refactor `packages/core/schemas/goals/profile_goals.ts` to introduce a canonical typed objective schema.
- [ ] Preserve compatibility-safe create/update schemas for existing CRUD flows.
- [ ] Define and document the goal timing invariant (`target_date` vs `milestone_event_id`).
- [ ] Define sport-specific load-method enums and provenance contracts.

## Phase 2: Canonical Core Adapters

- [ ] Create canonical goal parsing and serialization helpers in `@repo/core`.
- [ ] Move legacy-field-to-typed-objective translation into `@repo/core`.
- [ ] Add tests for canonical goal parsing, timing resolution, and compatibility serialization.
- [ ] Add canonical derivation of continuous `goal_demand_profile` from typed objectives.

## Phase 3: tRPC Integration

- [ ] Update `packages/trpc/src/routers/goals.ts` to read/write additive goal fields.
- [ ] Remove router-level goal reconstruction heuristics from `packages/trpc/src/routers/training-plans.base.ts`.
- [ ] Refactor projection-related procedures to consume canonical goals from `@repo/core`.
- [ ] Add focused `@repo/trpc` tests for canonical goal projection inputs.
- [ ] Return fallback mode, load provenance, and richer confidence metadata through projection APIs.

## Phase 4: Athlete Context Separation

- [ ] Split current profile training settings into user preferences vs engine policy concepts in `@repo/core`.
- [ ] Define an `AthleteCapabilitySnapshot` contract for projection inputs.
- [ ] Preserve current settings UX while introducing compatibility mapping.
- [ ] Add per-sport capability slices and evidence-recency fields.

## Phase 5: Projection Modeling Improvements

- [ ] Add per-sport rolling load state before any combined load summary.
- [ ] Add sport-specific load-family calculations and method-aware confidence.
- [ ] Add continuous evidence decay and metric reliability weighting.
- [ ] Add simple `mechanical_stress_score` for impact-heavy sports.
- [ ] Refactor target scoring to prefer explicit projected metrics over readiness-proxy estimates.
- [ ] Upgrade sparse-data athlete modeling from binary buckets to a small continuous capability profile.
- [ ] Add dose-based recommendation outputs alongside existing load outputs.
- [ ] Add per-goal feasibility decomposition with limiters, confidence, and interference notes.
- [ ] Add continuous limiter-share outputs instead of only dominant limiter labels.
- [ ] Add continuous goal demand profiles by objective and sport.
- [ ] Replace remaining hard threshold cliffs in feasibility and readiness with smooth curves where appropriate.
- [ ] Extend projection tests for multi-goal and multi-discipline scenarios.

## Phase 6: Mobile UX Follow-Up

- [ ] Keep current goal editor working against compatibility fields.
- [ ] Add goal-type-aware form controls backed by the typed objective payload.
- [ ] Surface richer goal readiness and feasibility explanations where useful.
- [ ] Surface fallback mode, calculation method, confidence, and plain-language next-best-action guidance.

## Validation

- [ ] Run `pnpm --filter @repo/core check-types`.
- [ ] Run `pnpm --filter @repo/trpc check-types`.
- [ ] Run focused `vitest` coverage for goal parsing, projection scoring, sport-specific load methods, and multi-goal feasibility.
- [ ] Run `pnpm --filter mobile check-types` after any mobile contract changes.
