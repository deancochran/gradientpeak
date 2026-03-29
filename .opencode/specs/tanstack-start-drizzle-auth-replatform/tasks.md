# Tasks

## Coordination Notes

- Keep this spec focused on architecture and migration sequencing, not on product-feature changes.
- Preserve Expo mobile as a first-class app throughout the migration.
- Keep `@repo/core` database-independent.
- Keep `@repo/core` as a first-class package in the target architecture.
- Avoid leaving both Supabase-first and Drizzle-first schema ownership active longer than necessary.
- Avoid leaving both Supabase Auth and Better Auth as co-equal long-term auth systems.
- Keep shared packages framework-agnostic wherever possible.
- Biome remains the repo-wide formatter/linter; do not add ESLint or Prettier tooling packages.

## Open

### Phase 1 - Target Package Layout

- [ ] Create the new package map for `apps/web`, `packages/api`, `packages/auth`, `packages/db`, `packages/core`, `packages/ui`, and `tooling/*`.
- [ ] Decide whether `packages/trpc` is renamed directly to `packages/api` or bridged temporarily.
- [ ] Decide whether `packages/supabase` remains under `packages/` as infra-only or moves to a clearer infra location.
- [ ] Document the desired steady-state import boundaries between app, API, auth, DB, UI, and core layers.
- [ ] Record the explicit template exclusions: no ESLint tooling package, no Prettier tooling package, no long-term Next.js target.
- [x] Create `migration-matrix.md` for package-by-package ownership mapping.
- [x] Create `web-route-map.md`, `auth-behavior-matrix.md`, and `db-ownership-matrix.md`.
- [x] Create `dependency-order-matrix.md`, `risk-blocker-matrix.md`, and `decision-log.md`.

### Phase 2 - Inventory Current Migration Surface

- [ ] Inventory all current Next.js route files, layouts, middleware, route handlers, and SSR helpers in `apps/web`.
- [ ] Inventory all current web auth providers, guards, and session bootstrap code.
- [ ] Inventory all current `trpc.auth` procedures and their callers.
- [ ] Inventory all current session lookup paths in `packages/trpc/src/context.ts` and web/mobile auth layers.
- [ ] Inventory all current `@repo/supabase` relational type imports across the repo.
- [ ] Inventory all current `@repo/supabase` schema/helper imports across the repo.
- [ ] Inventory all current Supabase client query and mutation paths inside the API layer.
- [ ] Inventory all current `packages/typescript-config` consumers.
- [ ] Inventory all current Tailwind config, theme token, and styling config locations.
- [ ] Inventory any `packages/ui` exports or web assumptions that depend on Next.js behavior.
- [ ] Record inventory results into `migration-matrix.md`.
- [ ] Record web findings into `web-route-map.md`.
- [ ] Record auth findings into `auth-behavior-matrix.md`.
- [ ] Record DB findings into `db-ownership-matrix.md`.
- [ ] Update dependency/risk/decision artifacts as the inventories reduce uncertainty.

### Phase 3 - Database Package

- [ ] Introduce `packages/db` for Drizzle schema, client, relations, seeds, and migrations.
- [ ] Decide how to translate existing Supabase SQL migration history into a Drizzle-owned migration workflow.
- [ ] Decide which generated Supabase artifacts remain necessary after Drizzle becomes the relational source of truth.
- [ ] Define DB-facing validation helpers derived from the Drizzle schema where they improve API contracts.
- [ ] Inventory current `@repo/supabase` relational type/schema imports that must move to `packages/db`.
- [ ] Inventory current Supabase client query paths in the API layer that must move to Drizzle queries.
- [ ] Define the final home for relational schema files.
- [ ] Define the final home for DB client creation.
- [ ] Define the final home for relations.
- [ ] Define the final home for seeds and DB utilities.
- [ ] Define the final home for migration config and migration commands.
- [ ] Define exactly what remains in Supabase infra after relational ownership leaves it.
- [ ] Update `migration-matrix.md` with final DB ownership decisions.
- [ ] Update `db-ownership-matrix.md` with final DB ownership decisions.
- [ ] Update `decision-log.md` with the chosen DB strategy.

### Phase 4 - Auth Package

- [ ] Introduce `packages/auth` built on Better Auth.
- [ ] Define web and Expo auth provider/plugin requirements.
- [ ] Replace router-owned auth mutations with package-owned auth primitives where appropriate.
- [ ] Refactor API context/session resolution to consume Better Auth session state.
- [ ] Audit account creation, sign-in, sign-out, password reset, email verification, account deletion, and deep-link flows before cutover.
- [ ] Inventory every current `trpc.auth` procedure and map it to Better Auth ownership, compatibility, or removal.
- [ ] Define the Better Auth session/cookie strategy for TanStack Start web.
- [ ] Define the Better Auth mobile session/bootstrap strategy for Expo.
- [ ] Define redirect and callback handling for verification and reset flows.
- [ ] Define whether any compatibility layer is needed while old auth callers are still being removed.
- [ ] Update `migration-matrix.md` with final auth ownership decisions.
- [ ] Update `auth-behavior-matrix.md` with final auth ownership decisions.
- [ ] Update `risk-blocker-matrix.md` and `decision-log.md` with the chosen auth model.

### Phase 5 - API Package

- [ ] Refactor the tRPC package so it depends on `packages/auth` and `packages/db` rather than direct Supabase Auth patterns.
- [ ] Keep framework-specific request handling out of shared API package code.
- [ ] Preserve shared input/output typing for both web and mobile clients.
- [ ] Re-check any procedures that currently depend on Supabase client semantics.
- [ ] Decide whether the steady-state package name is `packages/api` while keeping `packages/trpc` as a temporary bridge only.
- [ ] Define the final tRPC context shape.
- [ ] Define the final router ownership for auth-adjacent behavior.
- [ ] Define the import migration plan for web and mobile clients if package naming changes.
- [ ] Update `migration-matrix.md` with final API package and bridge decisions.

### Phase 6 - Web App Migration

- [ ] Stand up TanStack Start in `apps/web`.
- [ ] Mount `/api/trpc` and `/api/auth` in TanStack Start.
- [ ] Port auth, provider, routing, and data-loading patterns from Next.js to TanStack Start.
- [ ] Replace Next-specific helpers and SSR utilities with TanStack Start equivalents.
- [ ] Audit `packages/ui` for any web exports that assume Next.js behavior.
- [ ] Inventory all current Next-only files and patterns that cannot survive in the long-term target architecture.
- [ ] Define the route-by-route migration plan from Next.js to TanStack Start.
- [ ] Define the provider/bootstrap migration plan for auth, tRPC, and query hydration.
- [ ] Define the retirement plan for old `/api/trpc` and auth routes in Next.js.
- [ ] Update `migration-matrix.md` with final web migration and retirement decisions.
- [ ] Update `web-route-map.md` with final web route and endpoint decisions.
- [ ] Update `decision-log.md` with final web cutover decisions.

### Phase 7 - Tooling Realignment

- [ ] Move shared TS config from `packages/typescript-config` to `tooling/typescript`.
- [ ] Add `tooling/tailwind` as the shared web styling configuration home.
- [ ] Update consuming packages/apps to extend tooling configs from `tooling/`.
- [ ] Keep Biome as the only shared lint/format workflow.
- [ ] Inventory all current TypeScript config consumers and all current Tailwind/theme config locations.
- [ ] Define the migration plan for each TS config consumer.
- [ ] Define the migration plan for each Tailwind/theme config consumer.
- [ ] Define any `packages/ui` updates needed to consume the new tooling layout cleanly.
- [ ] Update `migration-matrix.md` with final tooling and shared-package ownership decisions.
- [ ] Reconcile all artifacts so package boundaries match across the spec set.
- [ ] Reconcile `dependency-order-matrix.md` with the final plan.

### Phase 8 - Core And Shared Package Protection

- [ ] Confirm `packages/core` stays free of Drizzle, Better Auth, Supabase runtime, TanStack Start, and Next.js imports.
- [ ] Confirm shared UI code remains framework-agnostic except where platform-specific entrypoints are already intentional.
- [ ] Confirm web-only runtime details stay in `apps/web` rather than leaking into shared packages.

### Phase 9 - Final Cutover And Cleanup

- [ ] Define the final removal criteria for Next.js web code.
- [ ] Define the final removal criteria for Supabase-Auth-first router logic.
- [ ] Define the final removal criteria for Supabase-generated relational type ownership.
- [ ] Define the final import-path cleanup required after package renames or bridges are removed.
- [ ] Define the final validation gate for declaring the replatform complete.
- [ ] Create and complete `cutover-checklist.md`.
- [ ] Resolve or explicitly defer every item in `decision-log.md`.

## Pending Validation

- [ ] Validate the architecture decisions against the current repo import graph before implementation starts.
- [ ] Validate that Expo mobile can consume the new auth and API boundaries without requiring web-framework imports.
- [ ] Validate that the proposed DB migration path does not leave schema ownership ambiguous.
- [ ] Validate that the final web runtime no longer depends on Next.js-only APIs.
- [ ] Validate that `packages/core` remains DB-independent and framework-independent after the design is executed.
- [ ] Validate that `packages/ui` works with Expo and TanStack Start without relying on Next-only behavior.

## Completed Summary

- [x] Analyzed `t3-oss/create-t3-turbo` as the reference architecture for Expo + TanStack Start + tRPC + Better Auth + Drizzle + Supabase.
- [x] Audited the current repo's Next.js web app, `packages/trpc`, `packages/supabase`, `packages/typescript-config`, and `packages/ui` against that target model.
- [x] Captured the desired architecture direction: TanStack Start web, dedicated Better Auth package, dedicated Drizzle DB package, retained tRPC API layer, preserved `packages/core`, and root-level `tooling/` for TypeScript and Tailwind.
- [x] Added the supporting planning artifacts: package migration matrix, web route map, auth behavior matrix, DB ownership matrix, dependency order matrix, risk/blocker matrix, decision log, and cutover checklist.
