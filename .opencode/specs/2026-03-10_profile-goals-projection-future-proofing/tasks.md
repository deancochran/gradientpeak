# Tasks: Profile Goals + Projection Future-Proofing

## Coordination Rules

- [ ] Every implementation task is owned by one subagent and updated in this file by that subagent.
- [ ] A task is only marked complete when code changes land, focused tests pass, and the success check in the task text is satisfied.
- [ ] Each subagent must leave the task unchecked if blocked and add a short blocker note inline.

## Phase 1: Persistence + Canonical Schemas

- [x] Task A - Canonical `profile_goals` schema. Success: `profile_goals` stores only the canonical fields from `plan.md`, `milestone_event_id` is required, and deleting the linked event cascades to the goal.
- [x] Task B - Supabase migration workflow. Success: the schema diff is generated with `supabase db diff -f <filename>`, applied with `supabase migration up`, and `pnpm run update-types` completes with updated generated types checked in.
- [x] Task C - Canonical goal schema in `@repo/core`. Success: `packages/core/schemas/goals/profile_goals.ts` defines the typed objective union, canonical units/enums/invariants, and fixture-backed validation for supported goal types.
- [x] Task D - Canonical athlete preference schema. Success: `packages/core/schemas/settings/profile_settings.ts` persists `AthletePreferenceProfile` sections only, including `goal_strategy_preferences.target_surplus_preference`, with planner-only fields excluded from canonical persistence.
- [x] Task E - Ownership contracts. Success: core types/helpers clearly separate profile defaults, plan overrides, planner policy, and derived diagnostics, with tests covering accepted and rejected shapes.

## Phase 2: Canonical Core Adapters

- [x] Task F - Goal parsing helpers. Success: `@repo/core` exposes canonical goal parsing, event-date resolution, and demand-profile derivation helpers with passing unit tests for valid and invalid records.
- [x] Task G - Preference resolution helpers. Success: `@repo/core` resolves effective preferences from profile defaults plus plan overrides with deterministic tests for merge behavior.
- [x] Task H - Capability snapshot contract. Success: `@repo/core` defines `AthleteCapabilitySnapshot` with per-sport slices, freshness metadata, and tests covering invalidation/freshness rules.

## Phase 3: tRPC Integration

- [x] Task I - Goals router cutover. Success: `packages/trpc/src/routers/goals.ts` reads and writes canonical goal fields directly and focused router tests pass.
- [x] Task J - Projection input cutover. Success: `packages/trpc/src/routers/training-plans.base.ts` and related projection procedures consume canonical core helpers instead of router-level goal reconstruction, with focused integration tests passing.
- [x] Task K - Canonical preference plumbing. Success: settings/projection procedures persist and read canonical profile preferences only, and planner-internal fields are excluded by schema tests.
- [x] Task L - Projection API diagnostics. Success: projection responses include fallback mode, load provenance, and richer confidence metadata with test coverage.

## Phase 4: Projection Modeling

- [x] Task M - Effective target scoring. Success: `resolveEffectiveScoringTarget(...)` is implemented, surplus stays separate from aggressiveness, and unit tests cover applied and suppressed surplus cases.
- [x] Task N - Continuous evidence + sparse-data modeling. Success: projection inputs and outputs use continuous evidence/capability factors instead of binary buckets, and sparse-data tests still return bounded non-null outputs.
- [x] Task O - Sport-specific load modeling. Success: projection logic emits per-sport rolling load state, `load_method`, `load_confidence`, `fallback_mode`, and `mechanical_stress_score` with passing tests.
- [x] Task P - Goal feasibility decomposition. Success: goal scoring exposes per-goal limiter shares, interference notes, effective-target metadata, and multi-goal tests show materially different goal explanations.
- [x] Task Q - Dose-based recommendation outputs. Success: projection outputs include user-facing dose recommendations alongside load outputs with focused tests.

## Phase 5: Mobile App Integration

- [x] Task R - Goal editor persistence. Success: the current mobile goal flow continues to work while writing canonical goal payloads directly, with focused mobile tests passing.
- [x] Task S - Training preferences UX cutover. Success: the training preferences screen uses the canonical user-language sections, includes a dedicated `target_surplus_preference` control, and removes planner-internal controls from canonical settings UX.
- [x] Task T - Projection explainability UX. Success: mobile projection surfaces show readiness/feasibility explanations plus fallback, confidence, and effective-target copy backed by focused tests.

## Validation Gate

- [x] Validation 1 - Core validation. Success: `pnpm --filter @repo/core check-types` and focused core vitest suites pass for canonical goals, preferences, parsing, and projection logic.
- [x] Validation 2 - tRPC validation. Success: `pnpm --filter @repo/trpc check-types` and focused router/integration tests pass.
- [x] Validation 3 - Mobile validation. Success: `pnpm --filter mobile check-types` and focused mobile vitest suites pass for updated goal and preference flows.
- [x] Validation 4 - Diagnostics validation. Success: parse-failure handling, fallback frequency reporting, and canonical load-method/provenance outputs are exercised by automated tests.
