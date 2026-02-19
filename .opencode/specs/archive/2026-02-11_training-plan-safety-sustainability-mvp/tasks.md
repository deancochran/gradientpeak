# Training Plan Safety + Sustainability MVP (Task Checklist)

Last Updated: 2026-02-11 (implemented)
Status: Implemented (targeted validation complete)
Owner: Mobile + Core + Backend

This checklist implements `./design.md` and `./plan.md`.

## Phase 1 - Core Schema + API Contract

- [x] Add `optimization_profile` enum (`outcome_first | balanced | sustainable`) to creation config schemas.
- [x] Add `post_goal_recovery_days` with integer bounds.
- [x] Add `max_weekly_tss_ramp_pct` and `max_ctl_ramp_per_week` with hard bounds.
- [x] Thread all four fields through preview/create input and normalized output payloads.
- [x] Preserve backward compatibility by defaulting missing values server-side.

## Phase 2 - Normalization + Suggestions + Conflict Resolution

- [x] Apply profile-first defaulting for recovery days and ramp caps.
- [x] Merge user overrides deterministically when inside safety bounds.
- [x] Emit blocking conflict when required TSS/CTL ramp exceeds configured caps.
- [x] Emit blocking conflict when post-goal recovery windows compress or overlap next-goal preparation.
- [x] Return field-level conflict guidance with concrete suggestions.

## Phase 3 - Feasibility Scoring

- [x] Update feasibility classification to use constrained (capped) progression, not unconstrained progression.
- [x] Mark near-cap trajectories as `aggressive` with explicit reasons.
- [x] Mark cap-violating trajectories as `unsafe` with explicit reasons.
- [x] Ensure feasibility output remains stable between preview and create paths.

## Phase 4 - Projection Logic + Multi-Goal Recovery Windows

- [x] Clamp week-over-week TSS ramp by `max_weekly_tss_ramp_pct`.
- [x] Clamp week-over-week CTL ramp by `max_ctl_ramp_per_week`.
- [x] Insert explicit post-goal recovery windows after each goal in multi-goal plans.
- [x] Ensure recovery windows reduce planned load before next build segment.
- [x] Include recovery/ramp constraint metadata in projection payload for UI explanation.

## Phase 5 - Mobile Create UX

- [x] Add UI controls for profile, recovery days, and both ramp caps in create flow.
- [x] Add deterministic helper copy explaining tradeoffs and safety behavior.
- [x] Trigger preview recompute on every relevant field change.
- [x] Display recovery windows and constrained ramp context in chart-adjacent details.
- [x] Ensure accessibility labels describe safety controls clearly.

## Phase 6 - Test Coverage

### Core

- [x] Add/extend tests for ramp clamping and deterministic recovery insertion.
- [x] Add/extend tests for multi-goal continuity with recovery windows.

### tRPC

- [x] Test normalization defaults by profile for all four fields.
- [x] Test blocking conflicts for cap violations and recovery compression.
- [x] Test feasibility reason outputs tied to constrained progression.
- [x] Test preview/create contract parity for normalized config + feasibility payloads.

### Mobile

- [ ] Test control rendering and payload threading for new fields. (No existing create-flow mobile test harness in this area yet.)
- [ ] Test preview refresh behavior after control changes. (No existing create-flow mobile test harness in this area yet.)
- [ ] Test recovery window/ramp explanation rendering from projection payload. (No existing create-flow mobile test harness in this area yet.)

## Phase 7 - Quality Gates

- [x] `pnpm --filter @repo/core check-types`
- [x] `pnpm --filter @repo/trpc check-types`
- [x] `pnpm --filter mobile check-types`
- [x] `pnpm --filter @repo/core exec vitest run plan/__tests__/training-plan-preview.test.ts`
- [x] `pnpm --filter @repo/trpc exec vitest run src/routers/__tests__/training-plans.test.ts`
- [ ] `pnpm check-types && pnpm lint && pnpm test` (when full run is feasible)

## Concrete File Touchpoints

- [x] `packages/core/schemas/training_plan_structure.ts`
- [x] `packages/trpc/src/routers/training_plans.ts`
- [x] `packages/core/plan/__tests__/training-plan-preview.test.ts`
- [x] `packages/trpc/src/routers/__tests__/training-plans.test.ts`
- [x] `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`
- [x] `apps/mobile/components/training-plan/create/SinglePageForm.tsx` (or nearest equivalent)
- [x] `apps/mobile/components/training-plan/create/CreationProjectionChart.tsx` (or nearest equivalent)

## Definition of Done

- [x] Users can explicitly choose optimization intent with deterministic behavior.
- [x] Multi-goal plans include explicit post-goal recovery windows by contract and projection output.
- [x] Weekly TSS and CTL progression never exceed configured caps.
- [x] Preview/create feasibility and conflict outputs are consistent and explainable.
- [x] Mobile create UI clearly exposes and explains safety/sustainability controls.
- [x] Type checks and targeted tests pass for touched packages.
