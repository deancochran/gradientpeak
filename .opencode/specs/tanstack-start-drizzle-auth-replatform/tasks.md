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
  - Progress:
    - Drizzle package alignment is now back on the stable line after internet-backed verification: `packages/db` uses `drizzle-orm@^0.45.2` + `drizzle-kit@^0.31.10`, `packages/auth` and `packages/api` now depend on the same stable ORM version, relation imports are back on the public stable syntax (`import { relations } from "drizzle-orm"`), and DB validation generation uses the stable companion package `drizzle-zod@^0.8.3`.
    - Focused validation passed for `@repo/db`, `@repo/auth`, and `@repo/api` typechecks after the stable Drizzle alignment.
    - Better Auth DB URL resolution now matches `packages/db`: runtime and CLI config use the shared `resolveDatabaseUrl(...)` helper instead of a hidden `127.0.0.1:54322` fallback, and web env examples now document `DATABASE_URL` plus the accepted compatibility aliases.
    - Local Better Auth bootstrap is now migration-backed: a Supabase migration creates `public.users` / `public.accounts` / `public.sessions` / `public.verifications`, backfills existing `auth.users` rows plus credential hashes into the Better Auth tables, and auth runtime now verifies passwords with bcrypt compatibility so migrated Supabase users can sign in locally without forced resets.
    - Web/API DB access no longer depends on `@vercel/postgres` pooled-URL semantics for local development. `packages/db/src/client.ts` now uses Drizzle's stable `node-postgres` driver with a `pg` pool and the shared DB URL resolver, which matches the local direct connection string used by Supabase and Better Auth.
    - Better Auth signup/profile provisioning is now aligned to the active auth owner: auth runtime generates UUID ids for Better Auth records, auth schema now models `public.users.id` / `accounts.user_id` / `sessions.user_id` as UUID, and local Supabase migrations now (a) rewire `public.profiles.id` to reference `public.users(id)` and (b) install `public.users` insert/update triggers that upsert `public.profiles` (`email`, `full_name`, `avatar_url`, generated username) for new and updated Better Auth users.

- [~] Phase B - Mid-scope API domain cutovers
  - finish backend-owned storage cleanup for file routers
  - finish activity-analysis cutover cleanup
  - Progress:
    - `events.ts` core CRUD/read/validation paths are repository-backed, while `events.ts`, `integrations.ts`, `fit-files.ts`, and `storage.ts` now keep file handling as explicit backend-owned storage work instead of relational bridge work
    - router-by-router relational cutovers are complete for `analytics`, `activities`, `activity-plans`, `coaching`, `feed`, `goals`, `home`, `messaging`, `notifications`, `onboarding`, `profile-settings`, `profiles`, `routes`, `social`, `trends`, and `account/profile-access`
    - `@repo/api` typecheck is green after the latest router wave

- [ ] Phase C - Planning domain migration
  - finish schema-parity follow-up for planning tables/columns still using typed SQL
  - Progress:
    - `updateFromCreationConfig` and `createFromMinimalGoal` now write training plans through the Drizzle-backed training-plan repository, and the update use case can load/update owned plans via the repository seam instead of direct Supabase relational writes.
    - `training-plans/base.ts` now routes active-plan lookup, creation-context reads, profile goal/settings fallback reads, structured weekly-TSS estimation, current CTL estimation, and the plan-tab projection service through `ctx.db`/Drizzle-first paths (plus typed SQL for `profile_goals` and `profile_training_settings` schema gaps), leaving the remaining Supabase usage concentrated in untouched legacy mutations/listing paths.
    - The remaining legacy list/update/delete/template/apply/status/intensity/curve paths in `training-plans/base.ts` now use Drizzle or typed SQL as well, including raw-SQL `training_plans` access for schema-gap columns like `is_system_template` and Drizzle reads/writes for `likes`, `events`, `activities`, and `activity_plans`; the router no longer depends on the legacy Supabase bridge for relational work.
    - planning creation/preview/suggestion use cases plus `estimation-helpers.ts` now avoid `SupabaseClient`-typed helper seams, using generic creation-context readers and repository/store-backed contracts instead; the only router follow-up was a narrow `training-plans/base.ts` call-site/type-compat update.
    - Drizzle schema parity cleanup added canonical `training_plans` columns plus `profile_training_settings`, `profile_goals`, `notifications`, `follows`, `comments`, `coaching_invitations`, `coaches_athletes`, `conversations`, `conversation_participants`, and `messages` tables to `packages/db`, extended validation/type exports from `drizzle-zod`, removed root legacy compatibility aliases, and updated API/web/mobile call sites to use the stricter Drizzle-inferred types.

 - [~] Phase D - Final API sweep
  - keep relational API work fully DB-first
  - keep storage as an explicit backend-owned service
  - reduce `@supabase/supabase-js` to storage-provider usage only
  - Progress:
    - `ctx.supabase` is removed from API context, and the web `/api/trpc` route no longer injects Supabase into `createApiContext`.
    - planning helpers/router paths are now DB-first for relational work; remaining `@supabase/supabase-js` usage in `packages/api` is isolated to `packages/api/src/storage-service.ts` as the current file-storage provider.
    - `packages/api/src/routers/goals.ts`, `profile-settings.ts`, and `onboarding.ts` now use the new Drizzle schema tables directly instead of typed SQL fallback queries for those surfaces.
    - `profiles.ts`, `goals.ts`, `feed.ts`, `social.ts`, `notifications.ts`, `profile-settings.ts`, and `onboarding.ts` now use Drizzle-backed schema ownership for the formerly missing profile/social/planning tables and columns.
    - `routes.ts` now uses `ctx.db`/Drizzle for `activity_routes`, `activity_plans`, and `likes`; Supabase remains isolated there for route-file storage upload/download/delete only.
    - `trends.ts` now uses Drizzle-first `ctx.db` reads for profile/activity trend queries, preserving dynamic derived-analysis paths while removing relational Supabase access.
    - `messaging.ts` and `coaching.ts` now use Drizzle schema ownership for their base row contracts and query the new Drizzle tables directly, with only two intentionally narrow messaging summary queries still expressed as SQL for readability.
    - `account/profile-access.ts` now verifies coach-athlete access through `ctx.db` with the Drizzle-owned coaching tables.
    - `coaching.ts` is now Drizzle-first for invitations, coach-athlete writes, and roster/coach profile reads.
    - `social.ts`, `profiles.ts`, `feed.ts`, and `account/profile-access.ts` now reference `@repo/db` row schemas/types directly for remaining DB-shaped local contracts, dropping the stale `follows.id` assumption and keeping only join/computed-local shapes.
    - `notifications.ts`, `activity-plans.ts`, `routes.ts`, `trends.ts`, `activity-efforts.ts`, `activities.ts`, `analytics.ts`, and `integrations.ts` now reference `@repo/db` enum/schema exports instead of local DB-backed enum copies.
    - Remaining local row-ish shapes in `@repo/api` are now limited to computed/join/aggregate projections such as counts, summary rows, and lateral-query results rather than persisted table rows.
    - Core/API contract cleanup removed the unused DB-row wrappers from `packages/core/schemas/{notifications,coaching,messaging}.ts`; those files now expose only mutation/domain input contracts, while persisted row ownership stays in `@repo/db` and API consumers import DB enums directly where possible.
    - `packages/core/schemas/profile-metrics.ts` and `packages/core/schemas/activity_efforts.ts` no longer present DB rows as core-owned canonical schemas; core now keeps business validation/minimal calculation contracts, while API composes DB-owned enums/row schemas from `@repo/db` before mapping into core contracts.
    - Repository contract cleanup now pushes `@repo/db` ownership through `packages/api/src/repositories/*` for event, training-plan, iCal-feed, and integration persistence shapes; the remaining manual repository bags are primarily transformed service contracts (camelCase provider adapters, serialized dates, and aggregate/read-model outputs) rather than raw DB row ownership.
    - Follow-up cleanup sweep converted more API contracts to Drizzle-derived picks (`event-write` ownership refs, activity-analysis snapshots, and `home.ts` planned-activity base fields), leaving the remaining manual API contracts concentrated in intentionally transformed provider sync shapes, serialized projection bags, and aggregate/planning result models.
    - Policy/lint sweep removed the remaining direct DB-row alias noise in `training-plan-repository.ts`, `drizzle-training-plan-repository.ts`, `trends.ts`, `activity-efforts.ts`, `profile-metrics.ts`, and `planning/training-plans/base.ts`; `@repo/api` now typechecks and lints clean with local contracts concentrated in justified transformed or aggregate shapes.
    - Projection-contract standardization aligned `events.ts` and `planning/training-plans/base.ts` with the policy too: event view models now compose from `EventRow`/`ActivityRow` bases plus explicit serialized/joined fields, and active-plan lookups no longer hide `training_plans` behind `Record<string, any>`.

- [~] Phase E - Web bridge and infra cleanup
  - remove the `/api/trpc` service-role Supabase bridge
  - keep only explicit backend-owned storage/webhook adapters if justified
  - finish `packages/supabase` as infra-only ownership
  - Progress:
    - web auth forms now use `React Hook Form` + `useZodForm` + shared `@repo/ui` form wrappers, with schema-driven password confirmation and reset-token handling
    - the web settings page now uses the same canonical form stack and avoids clobbering dirty edits during profile refetches
    - web route hardening moved first-line `(internal)` / `(external)` auth enforcement into App Router layouts, made `refreshSession` truthful, replaced placeholder metadata, and added bounded `loading.tsx` / `error.tsx` / `not-found.tsx` route support
    - the integrations OAuth callback now validates providers explicitly and no longer logs raw query params or secret-bearing callback payloads
    - header/account chrome is more coherent, live unread counts back the web header buttons, followers/following pagination now appends correctly, and the stale `apps/web/src/lib/supabase/server.ts` bridge is removed
    - broken web route leftovers were cleaned up by rerouting coaching profile links to `/user/[userId]`, replacing the nonexistent web invite flow with a truthful disabled CTA, and gating `/dev/ui-preview` behind non-production-only access with `noindex,nofollow`
    - merge-readiness verification now passes at the repo root with `pnpm check-types`, `pnpm lint`, and `pnpm test`; the only repair needed in this sweep was excluding nested `.worktrees/**` from root `biome.json` so Biome stops treating worker checkouts as conflicting nested roots
    - mobile follow-up standardized external auth forms around shared auth schemas/helpers, removed dead mobile form-submission hooks, hardened callback/dev-only routes, cut the last owned `@repo/db` imports from mobile, simplified auth/bootstrap/query state so mobile depends less on duplicated persisted session state, converted `route-upload` and `ProfileSection` to the canonical RHF/shared-wrapper flow, simplified `ScheduleActivityModal` submission/error handling, fenced stale external onboarding back into the canonical guarded path, and added focused Jest ownership for external auth/runtime routes

- [ ] Optional Phase F - Full TanStack Start web cutover
  - only after Phases A-E are stable
  - move the final web runtime from Next.js ownership to TanStack Start ownership

### Remaining High-Value Work

- `packages/db` / `packages/core`
  - finish the last schema-parity and DB-independence cleanup where typed SQL or DB-looking compatibility contracts still linger
- `packages/api/src/repositories` / `packages/api/src/storage-service.ts` / `packages/supabase/`
  - keep manual contracts only for intentionally transformed outputs and continue reducing Supabase ownership to explicit infra/storage seams
- `apps/web`
  - manually verify the new auth/nav/pagination/coaching flows in-browser and then fix any remaining route-level polish discovered there

## Execution Order

1. promote `packages/db` to sole relational authority for remaining schema gaps
2. keep backend-owned storage explicit while reducing `packages/supabase` to infra-only in practice
3. manually verify the recent web cleanup, then address any remaining route/link polish
4. optionally perform a full TanStack Start runtime cutover

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

- [x] Validate that the final API context no longer needs `ctx.supabase`.
- [ ] Validate that `packages/db` can become the sole migration/schema owner without ambiguous overlap.
- [ ] Validate that Expo mobile consumes the final auth/API boundaries without web-runtime leakage.
- [ ] Validate that the final web runtime no longer depends on Next-only APIs if Phase F is chosen.
- [ ] Validate that `packages/core` remains DB-independent.
- [ ] Validate that `packages/ui` remains cross-platform and framework-agnostic.
