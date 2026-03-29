# TanStack Start, Drizzle, And Better Auth Replatform

## Objective

Define the target architecture for moving GradientPeak toward the `t3-oss/create-t3-turbo` model while keeping the repo's own preferences and constraints.

Target steady state:

- `apps/web` uses TanStack Start, not Next.js.
- the shared API remains tRPC-first and converges on `packages/api` as its only long-term package home.
- `packages/db` owns Drizzle ORM, relational schema, and migrations.
- Supabase remains the backing Postgres and platform provider.
- `packages/auth` owns Better Auth.
- `packages/core` remains the home for pure domain logic.
- `packages/ui` remains the shared UI package.
- shared config and theme tokens live in `tooling/typescript` and `tooling/tailwind`.
- Biome remains the only repo-wide lint/format toolchain.
- package manifests stay lean by preferring Turbo tasks and tool-native defaults over wrapper scripts wherever possible.

## Explicit Target Choices

- Web framework: TanStack Start in `apps/web`
- API framework: tRPC in a dedicated API package
- DB ORM: Drizzle ORM in `packages/db`
- DB platform: Supabase Postgres
- Auth framework: Better Auth in `packages/auth`
- Shared domain: keep `packages/core`
- Shared UI: keep `packages/ui`
- Shared tooling: `tooling/typescript` and `tooling/tailwind` for config plus shared Tailwind themes/tokens
- Lint/format: Biome only

## Explicit Non-Goals

- no long-term Next.js target
- no shared ESLint package
- no shared Prettier package
- no long-term Supabase Auth primary role
- no long-term Supabase-generated relational types as the main app data contract
- no long-term split where both `packages/api` and `packages/trpc` act as real API homes
- no wholesale copy of the upstream T3 Turbo template

## Why This Spec Exists

- the current repo already has a strong monorepo split, but web, auth, and database ownership still reflect Next.js and Supabase Auth decisions
- `create-t3-turbo` shows a cleaner split between app, API, auth, DB, and tooling
- the repo should adopt the parts that fit: TanStack Start, Better Auth, Drizzle, shared Tailwind/TS tooling
- the repo should reject the parts that do not fit: ESLint and Prettier tooling packages

## Current State Summary

### Web

- `apps/web` is a Next.js 15 app
- it uses Next SSR helpers and Next route handlers
- web auth state is driven by `trpc.auth.*` procedures plus Supabase session behavior

### API

- the typed API lives in `packages/trpc`
- auth context is created from Supabase client session lookup
- `packages/trpc/src/routers/auth.ts` wraps Supabase Auth operations directly

### Database

- `packages/supabase` owns Supabase CLI config, SQL migrations, generated DB types, generated schemas, and some seed scripts
- Drizzle is not the current source of truth

### Tooling

- shared TS config lives in `packages/typescript-config`
- shared Tailwind tooling is not yet centralized in `tooling/`
- Biome is already the formatter/linter
- package manifests still include convenience scripts and shell wrappers that should shrink during the replatform

### Shared Packages

- `packages/core` is already a valuable DB-independent package and must stay that way
- `packages/ui` is already shared across web and mobile and should remain framework-agnostic

## Target Repository Shape

```text
apps/
  mobile/
  web/                  # TanStack Start app
packages/
  api/                  # tRPC routers, context, procedures
  auth/                 # Better Auth runtime and helpers
  core/                 # pure business logic, DB-independent
  db/                   # Drizzle schema, client, migrations, seeds
  ui/                   # shared UI package
tooling/
  tailwind/
  typescript/
infra/ or packages/
  supabase/             # optional: Supabase CLI config, storage, functions, local stack
```

## Architecture Differences To Resolve

### Repo hygiene and manifests

- Current: generated test/build/runtime outputs are handled inconsistently across tools and future TanStack Start outputs are not yet part of the target architecture definition.
- Current: root and package `package.json` files still carry convenience scripts that can hide the real task graph.
- Target: generated test/build/runtime outputs stay out of git by default, including framework caches, reports, and machine-local artifacts.
- Target: `package.json` files stay minimal, with scripts kept only where a tool requires an explicit entrypoint or a repo-wide alias is materially useful.
- Target: Turbo task names and shared tooling packages carry the routine workflow instead of bespoke shell wrappers where possible.
- Must migrate: repo-wide ignore coverage for TanStack Start and other generated outputs, a script inventory for root/app/package manifests, and wrapper-script removal where direct Turbo/tool commands are sufficient.

### Auth

Current:

- Supabase Auth is primary
- auth behavior lives in `trpc.auth`
- tRPC context resolves session from Supabase client behavior

Target:

- Better Auth is primary and lives in `packages/auth`
- tRPC consumes auth session state instead of owning auth runtime behavior
- auth tables are persisted through Better Auth's Drizzle adapter into Supabase Postgres

What must migrate:

- sign-up, sign-in, sign-out
- session lookup and refresh
- password reset
- email verification
- account deletion
- web cookies and mobile bootstrap/deep-link behavior

### DB and types

Current:

- relational typing is Supabase-generated-first
- SQL migrations live under `packages/supabase`
- API queries lean on Supabase client semantics

Target:

- Drizzle is the relational source of truth in `packages/db`
- Drizzle owns schema, relations, client, seeds, and migrations
- Supabase remains the backing platform only
- app contracts become Drizzle-first and tRPC-first, with `superjson` preserving richer value types like `Date`

What must migrate:

- relational schema ownership
- migration ownership
- DB client creation
- DB seeds and DB utilities
- app-facing DB types and validation helpers
- query/mutation paths in the API layer

### Web framework

Current:

- web uses Next.js App Router and route handlers
- web runtime depends on `next/*` APIs

Target:

- web uses TanStack Start routes, loaders/actions, and server endpoints
- web hosts `/api/trpc` and `/api/auth`
- framework-specific runtime code stays inside `apps/web`

What must migrate:

- routes and layouts
- SSR and request helpers
- auth/bootstrap providers
- tRPC web integration
- any Next-only UI assumptions

### Tooling and shared packages

Current:

- shared TS config lives in `packages/typescript-config`
- shared Tailwind config is not centralized

Target:

- shared TS config moves to `tooling/typescript`
- shared Tailwind config moves to `tooling/tailwind`
- `packages/core` stays DB-independent
- `packages/ui` stays shared and web-framework-agnostic

What must migrate:

- TS config consumers
- Tailwind/theme consumers
- `packages/ui` web assumptions tied to Next.js

## Package Responsibilities

- `apps/web`: TanStack Start routes, providers, and mounted `/api/trpc` + `/api/auth`
- `packages/api`: tRPC router composition, procedures, error formatting, and auth-aware context
- `packages/auth`: Better Auth runtime config, providers/plugins, session helpers, and Drizzle adapter wiring
- `packages/db`: Drizzle schema, relations, client, migrations, seeds, and DB-facing validation helpers
- `packages/core`: domain logic, calculations, contracts, and DB-independent schemas
- `packages/ui`: shared UI primitives and components for mobile and web
- retained Supabase infra: CLI config, storage, functions, and local stack concerns only

## Information That Must Be Audited

- all current imports of `@repo/supabase` types, schemas, and helpers
- all current imports of Next-only APIs in `apps/web` and any shared packages
- all current auth procedures in `packages/trpc/src/routers/auth.ts`
- all current session creation and lookup paths in `packages/trpc/src/context.ts` and web/mobile auth code
- all current API DB write/query paths that rely on Supabase client semantics
- all package consumers of `packages/typescript-config`
- all Tailwind/theme config locations that should converge into `tooling/tailwind`
- all `packages/ui` exports or assumptions tied to the current web runtime

## Completion Definition

This objective is complete only when:

- `apps/web` runs on TanStack Start and no longer depends on Next.js runtime APIs
- the shared API is served through a dedicated tRPC package boundary
- Better Auth is the single long-term auth system and is owned by `packages/auth`
- Drizzle is the single long-term relational schema/query owner and is owned by `packages/db`
- Supabase is reduced to the backing database/platform role
- `packages/core` remains intact and DB-independent
- `packages/ui` works with Expo and TanStack Start without Next-specific assumptions
- shared TS config lives in `tooling/typescript`
- shared Tailwind config lives in `tooling/tailwind`
- Biome remains the only repo-wide lint/format toolchain
- the old Next.js path, the old Supabase-Auth-first path, and the old Supabase-generated-relational-types-first path are all removed or reduced to temporary shims with a defined retirement step

## Final Cutover Requirements

- retire Next.js-only web runtime code after TanStack Start fully owns the web app
- retire Supabase-Auth-first router logic after Better Auth fully owns auth behavior
- retire relational schema ownership from `packages/supabase` after `packages/db` is authoritative
- update imports so apps/packages consume final package names rather than temporary bridges
- verify mobile still authenticates and talks to the shared API without importing web-only runtime code
