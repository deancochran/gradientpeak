# Technical Plan: Hybrid Projection Preview + Server-Authoritative Commit

Last Updated: 2026-02-24
Status: Proposed
Depends On: `./design.md`
Owner: Mobile + tRPC + Core

## Objective

Shift training-plan projection preview from API-driven to hybrid compute: client-side preview for responsiveness, server-authoritative recompute and persistence for create/update integrity.

## Scope

### In Scope

- Mobile composer local preview compute integration
- Commit-time server recompute enforcement
- Single-shape hard-cutover contract
- Parity and commit-recompute diagnostics/tests
- Rollout with guardrails/telemetry

### Out of Scope

- Client-authoritative persistence
- Rewriting projection math outside `@repo/core`
- Removing server context/suggestion hydration
- Schema/database migrations unrelated to commit protocol

## Current References

- `apps/mobile/components/training-plan/create/TrainingPlanComposerScreen.tsx`
- `packages/trpc/src/routers/training-plans.base.ts`
- `packages/core/plan/projectionCalculations.ts`
- `packages/core/plan/projection/engine.ts`
- `packages/core/plan/deriveCreationSuggestions.ts`

## Phase 0 - Baseline and Contracts

1. Capture current API-preview latency and request frequency baseline.
2. Define hybrid contract as a single active payload shape with no legacy alias fields.
3. Define commit recompute failure semantics (stale/invalid/conflict states).

Deliverables:

- Baseline metrics note in spec folder.
- Contract table with request/response examples.
- Error taxonomy for stale/invalid/conflict handling.

## Phase 1 - Shared Core Compute Surface Validation

1. Confirm mobile build can consume required `@repo/core` projection entrypoint(s) from `projection/engine.ts`.
2. Ensure normalized input shaping used by preview and commit shares identical canonicalization rules.
3. Add/extend fixture harness for deterministic parity snapshots.

Deliverables:

- Core compute compatibility checklist.
- Canonical input shaping helper(s) documented.
- Parity fixture set (low/sparse/rich/no-history).

## Phase 2 - Mobile Composer Local Preview Integration

1. Refactor `TrainingPlanComposerScreen.tsx` preview scheduling to local compute pipeline.
2. Keep debounce/race protections, but remove network dependency for normal preview edits.
3. Preserve existing UX for suggestions/context bootstrap and commit submit flow.
4. Add local compute error fallback state (recoverable UX message + retry).

Deliverables:

- Local preview compute path in composer.
- Removal/reduction of live preview tRPC calls on slider/form edits.
- Mobile tests for preview rendering + recompute behavior.

## Phase 3 - Server Authoritative Commit Enforcement

1. Update `training-plans.base.ts` create/update commit path to always recompute projection server-side.
2. Accept client preview metadata only for validation/diagnostics.
3. Enforce hard-cutover payload validation (no legacy fields accepted).
4. Return actionable stale/invalid/conflict responses after server recompute.

Deliverables:

- Commit-time authoritative recompute guardrails.
- Hard-cutover payload validation branch coverage.
- Router/use-case tests for stale/invalid/conflict failures and success path.

## Phase 4 - Suggestions/Context Synchronization Rules

1. Keep `deriveCreationSuggestions` server-owned and context-driven.
2. Define refresh triggers when context likely changed before commit.
3. Ensure client local preview input uses latest available suggestion/context snapshot.

Deliverables:

- Context freshness policy.
- Tests for stale suggestion/context commit handling.
- Updated client UX copy for refresh-required states.

## Phase 5 - Parity and Integrity Hardening

1. Add client/server parity tests using shared fixture suite.
2. Add integration tests for:
   - local preview vs commit recompute equivalence
   - expected bounded diffs when context changes
3. Add integrity assertions: persisted artifacts always originate from server recompute.

Deliverables:

- Automated parity test suite.
- Integrity invariants in router tests.
- Regression snapshots for deterministic outputs.

## Phase 6 - Rollout

1. Roll out behind feature flag (hybrid preview).
2. Monitor:
   - local preview latency
   - commit stale/conflict rate
   - legacy payload rejection rate
3. Remove old API-preview hot path after stability window.

Deliverables:

- Rollout checklist.
- Telemetry dashboard/query notes.
- Legacy path removal PR checklist.

## Exit Criteria

1. Hybrid model is active: client preview + server-authoritative commit.
2. Commit persistence is blocked on server recompute and hard-cutover payload validation.
3. Parity suite passes across representative fixtures.
4. Composer UX is measurably more responsive with reduced preview API chatter.
5. Stale/invalid/conflict failures are recoverable and observable.
