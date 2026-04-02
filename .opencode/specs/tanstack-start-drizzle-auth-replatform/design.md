# TanStack Start, Drizzle, And Better Auth Replatform

## Objective

Move GradientPeak to the intended T3 Turbo-style architecture while preserving repo-specific choices:

- `apps/web` moves toward TanStack Start ownership and away from long-term Next.js runtime coupling.
- `packages/api` remains the shared tRPC API boundary.
- `packages/db` becomes the single relational source of truth via Drizzle.
- `packages/auth` owns Better Auth.
- `packages/core` stays pure and DB-independent.
- `packages/ui` stays shared and framework-agnostic.
- Supabase is reduced to platform and infra concerns only.
- Biome remains the only repo-wide lint/format tool.

## Target End State

- `apps/web`
  - owns framework-specific web runtime code only
  - mounts shared auth and API endpoints
  - does not carry shared relational contract ownership
- `apps/mobile`
  - remains first-class Expo
  - consumes `@repo/api`, `@repo/auth`, `@repo/core`, and `@repo/ui`
  - keeps Supabase usage isolated to explicit platform adapters if still needed
- `packages/api`
  - owns routers, context, API clients, and server helpers
  - depends on `packages/auth` for session/auth resolution
  - depends on `packages/db` or narrow repositories for persistence
  - does not own auth runtime behavior
- `packages/auth`
  - owns Better Auth runtime, clients, callback/session contracts, and mailer behavior
- `packages/db`
  - owns Drizzle schema, relations, migrations, seeds, and DB-facing validation helpers
- `packages/core`
  - owns pure domain logic, schemas, and calculations
- `packages/ui`
  - owns shared UI primitives/components for mobile and web
- `packages/supabase`
  - owns only infra/platform concerns such as CLI config, policies, functions, storage, and local stack support

## Current State Summary

What is already materially aligned:

- Better Auth now owns most live auth flows for web and mobile.
- `packages/db` is already the relational owner for many domains.
- `packages/api` has active Drizzle repository seams for integrations, Wahoo, iCal, activity-analysis, training plans, and much of `events.ts`.
- `packages/core` and `packages/ui` are already close to final ownership.
- Web and mobile are no longer broadly dependent on shared Supabase-generated relational contracts.

What still materially diverges:

- `packages/api` still carries the largest remaining `ctx.supabase` / `SupabaseClient` bridge surface.
- `packages/db` is not yet the sole migration/schema authority.
- `packages/supabase` still retains some historical relational ownership shape even though runtime ownership has narrowed.
- `apps/web` still has a thinner-but-real server-side Supabase bridge and significant Next runtime coupling.
- `apps/mobile` is much closer, but still needs final auth/session and cleanup verification.

## Architecture Review Checkpoint

The repo is closer to the desired package ownership model than to requiring a full rewrite.

- The heaviest remaining migration effort is in `packages/api`.
- The next most important effort is promoting `packages/db` to sole relational authority.
- The web bridge cleanup is meaningful, but smaller than the backend seam cleanup.
- Mobile is mostly cleanup/verification work rather than deep architectural rework.
- A full TanStack Start cutover is optional after the backend/package cleanup; it is not the highest-ROI next move unless the framework change itself is strategic.

## Remaining Scope By Area

- `packages/api`: large
- `packages/db`: medium-large
- `packages/supabase`: medium
- `apps/web`: medium-large
- `apps/mobile`: medium
- `packages/auth`: medium
- `packages/core`: small
- `packages/ui`: small

## Recommended Implementation Phases

### Phase A - Foundation Hardening

Goal: stabilize schema and package seams before final cutover work.

Includes:

- finish Drizzle schema/default/unique parity
- keep `packages/db`, `packages/auth`, and `packages/api` green
- lock `ctx.db` as the default API seam and prevent new `ctx.supabase` growth

Effort: 3-5 engineering days
Risk: medium

### Phase B - Mid-Scope API Domain Cutovers

Goal: finish the highest-value backend seam migrations outside the planning domain.

Includes:

- finish remaining `events.ts` read/list cleanup
- finish provider service migration for Wahoo/iCal
- finish activity-analysis cutover cleanup

Effort: 4-6 engineering days
Risk: medium-high

### Phase C - Planning Domain Migration

Goal: migrate the planning/training-plan domain off Supabase-era query semantics.

Includes:

- `packages/api/src/routers/planning/training-plans/base.ts`
- related use cases, repositories, and utilities
- removal of lingering `SupabaseClient` planning helpers

Effort: 6-9 engineering days
Risk: high

### Phase D - Final API Sweep

Goal: remove the remaining API bridge and retire Supabase as a normal API runtime dependency.

Includes:

- migrate remaining routers/helpers such as `feed`, `profiles`, and residual utility seams
- remove `ctx.supabase` from API context
- remove `@supabase/supabase-js` from `packages/api` if no longer needed

Effort: 3-5 engineering days
Risk: medium-high

### Phase E - Web Bridge And Infra Cleanup

Goal: finish the app-local bridge cleanup after the API no longer depends on it.

Includes:

- remove the `/api/trpc` service-role Supabase bridge
- keep only narrow storage/webhook adapters where explicitly justified
- finish `packages/supabase` as infra-only ownership

Effort: 2-4 engineering days
Risk: medium

### Optional Phase F - Full Web Framework Cutover

Goal: move the web runtime fully from Next.js ownership to TanStack Start ownership.

Includes:

- new runtime entrypoints and route shell
- hosting `/api/trpc`, `/api/auth`, callbacks, and webhooks in the final runtime
- replacing the long tail of Next-specific runtime usage

Effort:

- additional 7-10 web-only engineering days for a focused cutover
- practical total often lands at 14-20 days including adjacent runtime/auth cleanup

Risk: high

## Effort Summary

### Architecture Completion Without Full Web Framework Rewrite

Includes Phases A-E.

- Total estimate: 18-29 engineering days

### Architecture Completion Plus Full TanStack Start Web Cutover

Includes Phases A-F.

- Total estimate: 28-45 engineering days

## Pricing Guidance

Use senior implementation pricing, because this is migration, integration, and risk-heavy work rather than isolated feature delivery.

Illustrative day-rate bands:

- $800/day
- $1,000/day
- $1,250/day
- $1,500/day

Estimated implementation pricing:

### Option 1 - Architecture Completion Only

- 18-29 days
- at $800/day: about $14.4k-$23.2k
- at $1,000/day: about $18k-$29k
- at $1,250/day: about $22.5k-$36.25k
- at $1,500/day: about $27k-$43.5k

### Option 2 - Architecture Completion Plus Full Web Framework Cutover

- 28-45 days
- at $800/day: about $22.4k-$36k
- at $1,000/day: about $28k-$45k
- at $1,250/day: about $35k-$56.25k
- at $1,500/day: about $42k-$67.5k

## Recommendation

Recommended delivery order:

1. finish API seam cleanup
2. make `packages/db` the sole relational authority
3. reduce `packages/supabase` to infra-only in practice
4. remove the web `/api/trpc` Supabase bridge
5. reassess whether a full TanStack Start cutover still offers enough value

Recommended commercial approach:

- treat Phases A-E as the primary implementation contract
- treat Phase F as a follow-on option after backend and bridge cleanup stabilize

## Completion Definition

This replatform is complete when:

- `packages/api` no longer depends on `ctx.supabase` as a normal runtime seam
- `packages/db` is the sole relational schema/migration authority
- `packages/auth` is the sole long-term auth owner
- `packages/supabase` is infra-only
- web and mobile consume shared packages without shared Supabase relational contract leakage
- `packages/core` remains DB-independent
- `packages/ui` remains shared and framework-agnostic
