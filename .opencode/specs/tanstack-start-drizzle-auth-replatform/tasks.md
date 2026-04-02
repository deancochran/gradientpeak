# Tasks

## Coordination Notes

- Keep this spec focused on architecture and migration sequencing, not product-feature work.
- Preserve Expo mobile as a first-class app.
- Keep shared packages framework-agnostic where possible.
- Keep `@repo/core` database-independent.
- Avoid long-lived dual ownership between Drizzle and Supabase or Better Auth and Supabase Auth.
- Prefer small, bounded repository-first migrations over giant router rewrites.
- Use subagents for bounded planning/research slices; apply final fan-in in the primary session.
- Validate proportionally after meaningful changes.

## Active Phases

- [ ] Phase A - Foundation hardening
  - finish DB schema/default/unique parity
  - keep `packages/db`, `packages/auth`, and `packages/api` green
  - prevent new `ctx.supabase` growth

- [~] Phase B - Mid-scope API domain cutovers
  - finish remaining `events.ts` read/list cleanup
  - finish provider service migration for Wahoo/iCal
  - finish activity-analysis cutover cleanup
  - Progress:
    - `events.ts` mutation-heavy CRUD is now largely repository-backed
    - `events.ts` read surfaces now also use a dedicated `EventReadRepository` for `getById`, `getToday`, `getWeekCount`, `list`, `listByWeek`, and lifecycle-status activity lookups
    - `events.ts` `validateConstraints` is now fully off direct event/planning/profile/metrics Supabase reads via the event read seam, leaving estimation helpers as the next notable events-domain Supabase dependency
    - events-domain estimation enrichment now accepts a repository-backed read seam too, and `events.ts` estimation callsites no longer require `ctx.supabase` for plan/profile/route enrichment
    - the same estimation seam is now reused in `activity-plans.ts` and `home.ts` for plan enrichment, shrinking another cluster of helper-driven Supabase reads without broad router rewrites
    - Wahoo DB/runtime seams are partially migrated, with storage narrowed to local adapters
    - the training-plan activity-analysis blocker was repaired enough to continue safely

- [ ] Phase C - Planning domain migration
  - migrate `packages/api/src/routers/planning/training-plans/base.ts`
  - migrate related use cases, repositories, and helpers
  - remove lingering `SupabaseClient` planning dependencies

- [ ] Phase D - Final API sweep
  - migrate remaining routers/helpers such as `feed`, `profiles`, and residual utility seams
  - remove `ctx.supabase` from API context
  - remove `@supabase/supabase-js` from `packages/api` if no longer needed

- [ ] Phase E - Web bridge and infra cleanup
  - remove the `/api/trpc` service-role Supabase bridge
  - keep only explicit storage/webhook adapters if justified
  - finish `packages/supabase` as infra-only ownership

- [ ] Optional Phase F - Full TanStack Start web cutover
  - only after Phases A-E are stable
  - move the final web runtime from Next.js ownership to TanStack Start ownership

## Current Progress Snapshot

### Completed Or Mostly Completed

- Shared `@repo/supabase` runtime/contract ownership was removed from app/package boundaries.
- Better Auth now owns most web and mobile auth flows.
- `packages/api/src/routers/auth.ts` has been deleted.
- `integrations.ts` OAuth state and integration CRUD are repository-backed.
- iCal sync is off `ctx.supabase`.
- Wahoo repository seams exist and live service construction is partially migrated.
- `events.ts` now uses repository-backed paths for:
  - `create`
  - `update`
  - `delete`
  - `linkCompletion`
  - `unlinkCompletion`
  - `reconcileHistoricalCompletions`
- Mobile auth/bootstrap and several mobile contract boundaries have already moved away from old Supabase-auth-era ownership.

### Remaining High-Value Work

- `packages/api/src/routers/events.ts`
  - finish any remaining direct Supabase reads outside the now-migrated event CRUD/read/validation/enrichment paths
- `packages/api/src/routers/planning/training-plans/base.ts`
  - continue the highest-risk planning-domain cutover now that estimation seam reuse has propagated into adjacent routers
- `packages/api/src/routers/planning/training-plans/base.ts`
  - complete the planning-domain cutover in bounded slices
- `packages/api/src/lib/activity-analysis/*`
  - finish DB-first seam cleanup and remove lingering Supabase-era contracts
- `packages/api/src/routers/feed.ts`
- `packages/api/src/routers/profiles.ts`
- `packages/api/src/context.ts`
- `packages/db/index.ts`
- `apps/web/src/app/api/trpc/[trpc]/route.ts`
- `apps/web/src/lib/supabase/server.ts`
- `packages/supabase/`

## Execution Order

1. finish remaining API domain cutovers
2. complete planning/training-plan migration
3. remove the final API Supabase bridge
4. promote `packages/db` to sole relational authority
5. reduce `packages/supabase` to infra-only in practice
6. remove the web service-role bridge
7. optionally perform a full TanStack Start runtime cutover

## Risks And Blockers

- incomplete DB schema parity can block router conversion
- long-lived dual ownership between `ctx.db` and `ctx.supabase`
- auth/session regressions while removing temporary bridges
- planning domain complexity is still the largest single migration hotspot
- web framework cutover should not start until backend/package seams stabilize

## Validation Gates

- Foundation:
  - `pnpm --filter @repo/db check-types && pnpm --filter @repo/auth check-types`
- API work:
  - `pnpm --filter @repo/api check-types`
- web bridge work:
  - `pnpm --filter web check-types`
- mobile/auth cleanup:
  - `pnpm --filter mobile check-types`

## Pending Validation

- [ ] Validate that the final API context no longer needs `ctx.supabase`.
- [ ] Validate that `packages/db` can become the sole migration/schema owner without ambiguous overlap.
- [ ] Validate that Expo mobile consumes the final auth/API boundaries without web-runtime leakage.
- [ ] Validate that the final web runtime no longer depends on Next-only APIs if Phase F is chosen.
- [ ] Validate that `packages/core` remains DB-independent.
- [ ] Validate that `packages/ui` remains cross-platform and framework-agnostic.
