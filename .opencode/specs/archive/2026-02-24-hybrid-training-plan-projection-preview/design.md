# Design: Hybrid Projection Preview With Server-Authoritative Commit

Date: 2026-02-24
Owner: Mobile + tRPC + Core Planning
Status: Proposed
Type: Architecture Shift + Integrity Hardening

## Executive Summary

Training-plan projection preview is currently API-driven from mobile composer via tRPC. This adds avoidable round-trip latency and couples slider interactions to network quality.

We will move preview computation to a hybrid model:

1. Client-side preview compute for fast, interactive feedback.
2. Server-authoritative create/update commit for final persistence and integrity.
3. Shared deterministic projection math in `@repo/core` for parity across client and server.

This preserves server responsibilities for auth, DB-backed context hydration, and authoritative writes while making the composer preview responsive and resilient.

## Problem

Current API-driven preview flow creates three issues:

- Interaction latency and jitter during tuning (network-bound loop).
- Higher preview request volume and race-handling complexity in composer.
- Tight coupling between UX responsiveness and backend availability.

At the same time, full client-authoritative persistence is not acceptable because commit integrity requires:

- authenticated server context
- latest profile/activity-derived inputs
- authoritative validation and conflict policy
- canonical persisted artifacts

## Goals

1. Deliver sub-200ms local preview interaction for typical slider/form edits.
2. Keep create/update writes strictly server-authoritative.
3. Enforce deterministic parity between client preview and server recompute.
4. Keep contracts simple with a single active payload shape (no version handshake).
5. Preserve security/integrity guarantees (no trust in client-computed projection output).

## Non-Goals

- No migration to client-authoritative DB writes.
- No rewrite of projection math outside `@repo/core`.
- No relaxation of server conflict/validation/safety enforcement.
- No permanent dual behavior fork for preview compute.
- No backward compatibility layer for legacy preview/commit payloads.

## Current References

Likely impacted modules:

- `apps/mobile/components/training-plan/create/TrainingPlanComposerScreen.tsx`
- `packages/trpc/src/routers/training-plans.base.ts`
- `packages/core/plan/projectionCalculations.ts`
- `packages/core/plan/projection/engine.ts`
- `packages/core/plan/deriveCreationSuggestions.ts`

## Architecture Options Considered

### Option A - Keep API-driven preview (status quo)

Pros:

- Single compute location.
- Existing behavior unchanged.

Cons:

- Retains latency and network dependence.
- Retains request-thrash/race complexity in composer.
- Does not use portability of `@repo/core`.

Decision: rejected.

### Option B - Fully client-authoritative (preview + commit)

Pros:

- Lowest server load and latency.
- Works offline for full lifecycle.

Cons:

- Breaks server authority and integrity model.
- Hard to trust/verify client artifacts.
- Increases tamper and stale-context risk.

Decision: rejected.

### Option C - Hybrid: client preview + server-authoritative commit (recommended)

Pros:

- Fast UX from local compute.
- Preserves auth/context/validation/write authority on server.
- Reuses shared deterministic `@repo/core` engine on both sides.

Cons:

- Requires strict parity discipline.
- Needs clear commit-time recompute conflict handling.

Decision: accepted.

## Recommended Architecture

### 1) Client Preview Compute Path

Mobile composer computes preview locally using `@repo/core` projection entrypoints:

- Use `buildDeterministicProjectionPayload` from `packages/core/plan/projection/engine.ts`
- Inputs derived from composer form state and normalized creation config
- Continue using context/suggestion bootstrap from server where needed

Primary integration surface:

- `apps/mobile/components/training-plan/create/TrainingPlanComposerScreen.tsx`

### 2) Server Commit Path (Authoritative)

Create/update endpoints remain authoritative in:

- `packages/trpc/src/routers/training-plans.base.ts`

On commit (`createFromCreationConfig` / `updateFromCreationConfig`), server MUST:

1. Rehydrate latest context from DB/auth scope.
2. Recompute projection using server-side `@repo/core`.
3. Validate feasibility/conflicts/safety with existing policy.
4. Persist only server-computed canonical artifacts.

Server MUST NOT trust client-submitted projection outputs for persistence decisions.

### 3) Suggestions and Context Ownership

`deriveCreationSuggestions` remains server-owned because it depends on profile/history context:

- `packages/core/plan/deriveCreationSuggestions.ts` logic reused by server
- client consumes suggestion payload, then performs local preview recompute as user edits

### 4) Parity Contract

Single-source projection math remains in:

- `packages/core/plan/projectionCalculations.ts`
- `packages/core/plan/projection/engine.ts`

Hard constraints:

- No duplicated math implementation in mobile app outside `@repo/core`.
- Deterministic fixtures must produce same outputs client/server within epsilon.
- Canonical numeric rounding policy shared and tested.

### 5) Contract Simplicity and Hard Cutover

Use one active contract shape for hybrid preview and commit:

- No protocol or engine version fields in create/edit payloads.
- No legacy-key parsing path for old preview contracts.
- Server recompute remains authoritative at commit and may reject stale/invalid inputs using existing validation/conflict responses.

## Integrity Model

- Client preview is advisory UX output only.
- Server recompute is source of truth for write-time decisions and persisted plan artifacts.
- Commit request may include client preview metadata for diagnostics/parity checks, but never as authoritative projection result.
- Existing auth/ownership checks remain unchanged.

## Risks and Mitigations

- Risk: Client/server parity drift.
  - Mitigation: shared `@repo/core` and fixture parity tests.
- Risk: Commit mismatch confusion for users.
  - Mitigation: clear stale-context messaging and one-tap recompute-and-review loop.
- Risk: Increased mobile CPU usage during local preview.
  - Mitigation: debounce, memoized inputs, optional low-priority scheduling for high-cost recomputes.
- Risk: Hard cutover can break outdated clients.
  - Mitigation: synchronized mobile + server release in one deployment window.

## Acceptance Criteria

1. Composer preview no longer depends on per-change tRPC preview calls for normal edit interactions.
2. `TrainingPlanComposerScreen` computes projection preview locally using `@repo/core`.
3. `createFromCreationConfig` and `updateFromCreationConfig` remain server-authoritative and recompute projection at commit time.
4. Parity tests validate client/server projection output consistency on representative fixtures.
5. Hybrid create/edit uses one active payload shape with no legacy fallback parsing.
6. Server never persists client-submitted projection artifacts without authoritative recompute.
7. Mismatch/stale handling is explicit, recoverable, and covered by tests.
