# Plan

## Phase 1 - Target Architecture Alignment

Goal: define the intended steady-state package boundaries before code migration begins.

1. Confirm the canonical target package map for web, API, auth, DB, UI, core, Supabase infra, and tooling.
2. Decide whether `packages/trpc` will be renamed to `packages/api` immediately or via compatibility phase.
3. Decide whether `packages/supabase` stays as an infra package or moves to a clearer infra location.
4. Define the exact responsibilities of `packages/auth`, `packages/db`, `packages/core`, and `packages/ui`.
5. Define the package-manifest philosophy: keep scripts minimal, prefer Turbo task inference and tool-native defaults, and use wrappers only where they add real value.
6. Record explicit exclusions from the upstream template: no ESLint tooling package, no Prettier tooling package, no long-term Next.js web target.
7. Define the steady-state package ownership table and temporary bridge packages, if any.
8. Create the package-by-package migration matrix artifact.
9. Create the web route/surface map, auth behavior matrix, and DB ownership matrix artifacts.
10. Create dependency order, risk/blocker, and decision log artifacts.

Exit criteria:

- target package layout is explicit
- ownership boundaries are documented
- temporary vs steady-state names are clear

## Phase 2 - Inventory Current State To Be Migrated

Goal: produce a full migration inventory before changing package ownership.

1. Inventory all Next.js-specific files, routes, providers, middleware, SSR helpers, and API handlers in `apps/web`.
2. Inventory all current `trpc.auth` procedures and the auth/session code paths they depend on.
3. Inventory all current `@repo/supabase` type imports, schema imports, and query helpers used across apps and packages.
4. Inventory all `packages/typescript-config` consumers.
5. Inventory all Tailwind config, theme tokens, and styling config duplication across apps and packages.
6. Inventory all `packages/ui` exports or assumptions tied specifically to the Next.js runtime.
7. Inventory custom scripts, shell wrappers, and duplicated task entrypoints that can disappear once the new tooling/package boundaries are in place.
8. Inventory generated build/test/runtime folders and reports that should be ignored repo-wide before and after TanStack Start lands.
9. Inventory all DB write/query paths in the API layer that must move from Supabase client semantics to Drizzle.
10. Record the results in the migration matrix artifact.
11. Record route, auth, and DB findings in their dedicated artifacts.
12. Update the dependency, risk, and decision artifacts as findings narrow the solution space.

Exit criteria:

- every major migration surface has a source inventory
- no package is left with unknown dependency scope
- the migration can be sequenced without hidden framework coupling

## Phase 3 - Database Replatform Design

Goal: move relational schema ownership to Drizzle without losing Supabase platform capabilities.

1. Introduce `packages/db` with client, schema, relations, and migration configuration.
2. Define how existing SQL migrations map into Drizzle-managed migration history.
3. Define whether any generated Supabase types remain necessary for non-relational surfaces.
4. Establish DB-facing validation strategy with Drizzle-derived schemas where useful.
5. Inventory the current Supabase query and mutation surfaces that must move behind Drizzle.
6. Define where seeds, fixtures, and DB utilities belong after the move.
7. Define the cut line between relational data ownership in `packages/db` and platform ownership in retained Supabase infra.
8. Update the migration matrix with final DB ownership decisions.
9. Update the DB ownership matrix with final DB boundary decisions.
10. Update the decision log with the chosen DB ownership and migration strategy.

Exit criteria:

- Drizzle is the planned relational source of truth
- migration ownership is unambiguous
- Supabase's remaining platform role is explicit

## Phase 4 - Authentication Replatform Design

Goal: establish Better Auth as a dedicated shared auth package.

1. Introduce `packages/auth` and define Better Auth runtime ownership.
2. Define provider/plugin requirements for web and Expo.
3. Define session resolution flow for tRPC context.
4. Audit current auth flows that must be preserved or intentionally changed.
5. Inventory the current `trpc.auth` procedures and map each one to its Better Auth era owner.
6. Define the future home for sign-in, sign-up, sign-out, email verification, password reset, session refresh, and account deletion flows.
7. Define the Better Auth cookie/session model for TanStack Start web and Expo mobile.
8. Define callback and deep-link rules for email/OAuth/mobile flows.
9. Update the migration matrix with final auth ownership decisions.
10. Update the auth behavior matrix with final ownership decisions.
11. Update the risk/blocker matrix and decision log with the chosen auth model.

Exit criteria:

- Better Auth package boundary is clear
- tRPC auth context no longer depends on Supabase Auth primitives directly
- preserved and changed auth behaviors are documented
- the target owner of each current auth behavior is explicit

## Phase 5 - API Package Replatform Design

Goal: keep tRPC as the shared API contract while moving it off direct Supabase Auth and toward Better Auth + Drizzle.

1. Decide whether the final package name is `packages/api`, with `packages/trpc` as a temporary compatibility bridge if needed.
2. Define the final context shape for request headers, auth session, and DB access.
3. Identify procedures that can stay unchanged versus procedures that must be rewritten for Drizzle or Better Auth.
4. Define how web and mobile clients consume the package during and after the rename.
5. Define the retirement plan for router-owned auth behavior once Better Auth is live.
6. Define the retirement plan that fully empties and removes the temporary `@repo/trpc` bridge once `packages/api` owns all shared tRPC responsibilities.
7. Update the migration matrix with final API package ownership and bridge decisions.

Exit criteria:

- tRPC remains the shared API contract
- API package ownership and naming are clear
- procedure migration scope is explicit

## Phase 6 - Web Framework Migration Design

Goal: replace the Next.js web app with a TanStack Start app.

1. Define the TanStack Start route and server entry structure for `apps/web`.
2. Define how `/api/trpc` and `/api/auth` are hosted in TanStack Start.
3. Map core Next.js app surfaces to TanStack Start equivalents.
4. Identify shared UI changes needed to support the new web runtime cleanly.
5. Inventory all current Next-only helpers and provider patterns that must be removed from the long-term web path.
6. Define the migration order for routes, providers, and web auth bootstrap.
7. Define the retirement plan for old route handlers, middleware, and Next SSR helpers.
8. Update the migration matrix with final web migration and retirement decisions.
9. Update the web route/surface map with final route and endpoint decisions.
10. Update the decision log with the final web cutover assumptions.

Exit criteria:

- `apps/web` target structure is clear
- API/auth mounting strategy is documented
- major route and provider migrations are enumerated

## Phase 7 - UI And Tooling Realignment

Goal: align shared UI, Tailwind, and TypeScript config with the new architecture.

1. Move shared TS config to `tooling/typescript`.
2. Create `tooling/tailwind` for shared theme/config ownership.
3. Remove assumptions that web config must live under `packages/`.
4. Reduce package-level scripts to essential entrypoints only, with routine flows running through Turbo or direct tool commands.
5. Keep Biome as the only shared lint/format toolchain.
6. Keep `packages/core` intact and ensure no DB/auth runtime concerns leak into it.
7. Define the changes required for `packages/ui` to support TanStack Start web cleanly.
8. Define the migration steps for all packages/apps that currently consume `packages/typescript-config`.
9. Update the migration matrix with final tooling ownership decisions.
10. Verify the matrices still reflect final shared package boundaries.
11. Confirm dependency order still matches the final plan.

Exit criteria:

- tooling ownership matches the target layout
- no ESLint/Prettier tooling packages are introduced
- shared UI/theme wiring has a clear home

## Phase 8 - Cutover And Cleanup Design

Goal: define the final completion steps so the repo has one clear target architecture.

1. Define the order in which temporary compatibility bridges are removed.
2. Define the final package import path updates required across the repo.
3. Define the retirement criteria for Next.js web code.
4. Define the retirement criteria for Supabase-Auth-first router logic.
5. Define the retirement criteria for Supabase-generated relational type ownership.
6. Define the final repo-hygiene rules for generated outputs, reports, caches, and other machine-local artifacts.
7. Define the final validation gates required before the architecture is considered complete.
8. Create the final cutover checklist artifact.
9. Resolve or explicitly defer every remaining item in the decision log.

Exit criteria:

- the end-state cleanup path is explicit
- no long-term parallel architecture remains undefined
- completion can be measured against objective criteria

## Recommended Execution Order

1. Define package boundaries and exclusions.
2. Inventory every migration surface.
3. Define `packages/db` ownership and migration strategy.
4. Define `packages/auth` ownership and auth behavior mapping.
5. Define the final API package contract and naming.
6. Define the TanStack Start web migration path.
7. Define the shared UI/tooling migration path.
8. Define the final cutover and cleanup gates.
