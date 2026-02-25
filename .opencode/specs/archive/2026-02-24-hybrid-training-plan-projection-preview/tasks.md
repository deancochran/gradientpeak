# Tasks - Hybrid Projection Preview With Server-Authoritative Commit

Last Updated: 2026-02-24
Status: In Progress
Owner: Mobile + Core + tRPC + QA

Implements `./design.md` and `./plan.md`.

## Phase 0 - Baseline and Contracts

- [ ] Measure current preview API p50/p95 latency and request volume.
- [x] Document the single active hybrid payload shape (no version fields, no legacy aliases).
- [x] Define and document commit stale/invalid/conflict error codes and UX mapping.
- [x] Record rollback criteria and feature flag plan.

## Phase 1 - Core Compute and Canonicalization

- [x] Validate mobile-safe import/use of `buildDeterministicProjectionPayload` via `packages/core/plan/projection/engine.ts`.
- [x] Define canonical input shaping helper used identically by client preview and server commit.
- [x] Confirm deterministic rounding/serialization policy in `packages/core/plan/projectionCalculations.ts`.
- [x] Build representative parity fixtures (low/sparse/rich/no-history).

## Phase 2 - Mobile Composer Local Preview

- [x] Update `apps/mobile/components/training-plan/create/TrainingPlanComposerScreen.tsx` to compute preview locally.
- [x] Remove per-change dependency on `previewCreationConfig` API for normal interactions.
- [x] Preserve existing debounce and stale-response protections for local compute lifecycle.
- [x] Add fallback UX for local preview compute failure and retry.
- [x] Add/extend mobile tests for local recompute-on-change behavior.

## Phase 3 - Server Authoritative Commit

- [x] Update commit handling in `packages/trpc/src/routers/training-plans.base.ts` to always recompute projection server-side before write.
- [x] Enforce hard-cutover create/edit payload validation (reject legacy/removed fields).
- [x] Return recoverable stale/invalid/conflict errors when server recompute cannot proceed.
- [x] Ensure persisted projection artifacts always come from server recompute, never direct client projection payload.
- [x] Add router/use-case tests for happy path, stale path, invalid payload path, legacy payload rejection path, auth/ownership path.

## Phase 4 - Suggestions and Context Freshness

- [x] Keep suggestion/context hydration server-owned via `packages/core/plan/deriveCreationSuggestions.ts` integration.
- [x] Add explicit client refresh trigger rules when context is stale before commit.
- [x] Add tests for commit after context drift and expected stale/conflict handling.

## Phase 5 - Parity and Integrity Validation

- [x] Add parity tests comparing client-preview and server-recompute outputs on shared fixtures.
- [x] Add tolerance thresholds for numeric equality and deterministic ordering.
- [x] Add integration tests for create/update parity under hybrid mode.
- [x] Add regression tests confirming no trust of client projection artifacts for persistence.

## Phase 6 - Rollout and Cleanup

- [x] Gate hybrid preview behind feature flag and enable internally first.
- [ ] Monitor latency improvement, stale/conflict rate, and legacy payload rejection rate.
- [ ] Remove legacy API-preview hot path once metrics pass rollout thresholds.
- [ ] Publish post-rollout verification note in spec folder.

## Quality Gates

- [x] `pnpm check-types`
- [x] `pnpm lint`
- [x] Targeted tests for `packages/core`, `packages/trpc`, and `apps/mobile` modified areas
- [ ] Full `pnpm test` before full rollout

## Definition of Done

- [x] Training-plan composer preview is hybrid: local client compute for interaction loop.
- [x] Create/update commit is server-authoritative with mandatory server recompute.
- [x] Projection parity is validated by automated fixture tests.
- [x] Single-shape hard cutover is enforced with legacy payload rejection.
- [x] Legacy API-driven preview hot path is removed or disabled in production path.
