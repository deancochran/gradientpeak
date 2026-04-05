# Orchestration Plan

## Purpose

Define the concrete multi-worktree execution model for this replatform so the root chat can act as conductor while worker worktrees run bounded implementation lanes in parallel.

Companion execution docs:

- `lane-task-packets-shared.md`
- `lane-task-packets-apps.md`
- `conductor-checklists.md`

## Operating Model

- Keep the root coordinator in the primary checkout.
- Create one Worktrunk worktree per lane under `~/worktrees/GradientPeak/spec-tanstack-start-drizzle-auth-replatform-<lane>` via the branch name pattern `spec/tanstack-start-drizzle-auth-replatform/<lane>`.
- Let each worker worktree run its own coordinator agent, but only inside its owned files and contracts.
- Keep spec truth, merge order, and cross-lane arbitration in the root coordinator only.
- Do not let two lanes edit the same package or spec file at the same time.

## Lane Map

| Lane | Branch | Owns | Must not touch | Depends on | Can spawn subagents |
| --- | --- | --- | --- | --- | --- |
| foundation | `spec/tanstack-start-drizzle-auth-replatform/foundation` | spec truth, package map, bridge policy, repo hygiene policy, cut lines | runtime app/package implementation beyond tiny unblockers | none | yes |
| db | `spec/tanstack-start-drizzle-auth-replatform/db` | `packages/db`, Drizzle schema, migrations, validation, `packages/supabase` retained-vs-retired boundary | auth runtime, app route code, web/mobile request handling | foundation contracts | yes |
| auth | `spec/tanstack-start-drizzle-auth-replatform/auth` | `packages/auth`, Better Auth runtime, session helpers, web/Expo auth clients, callback rules | domain router rewrites, Drizzle internals, non-auth app UI | foundation contracts | yes |
| api | `spec/tanstack-start-drizzle-auth-replatform/api` | `packages/api`, `packages/trpc` bridge, context shape, router migration, import guidance | Better Auth internals, Drizzle authoring, web/mobile framework code | db + auth contracts | yes |
| web | `spec/tanstack-start-drizzle-auth-replatform/web` | `apps/web` TanStack Start runtime, `/api/trpc`, `/api/auth`, providers, route migration | shared package internals except approved adapter seams | api + auth contracts | yes |
| mobile | `spec/tanstack-start-drizzle-auth-replatform/mobile` | `apps/mobile` auth/bootstrap migration, Better Auth Expo usage, request transport, caller updates | shared package internals except approved adapter seams | api + auth contracts | yes |
| tooling | `spec/tanstack-start-drizzle-auth-replatform/tooling` | `tooling/typescript`, `tooling/tailwind`, manifest slimming, ignore rules | runtime logic in apps and shared packages | foundation contracts, preferably after web/api surfaces stabilize | yes |
| fan-in | `spec/tanstack-start-drizzle-auth-replatform/fan-in` | merge prep, lockfile/export conflict resolution, downstream sync, final validation | new product/runtime behavior | completed wave outputs | no |

## Wave Sequence

### Wave 0 - Foundation freeze

- Lock the package map, bridge policy, lane ownership, ignore policy, and validation expectations.
- Deliverables: updated spec artifacts, explicit lane packets, and the first release order.
- Release next: `db`, `auth`, and optional read-only `tooling` inventory.

### Wave 1 - Core package contracts

- Run `db` and `auth` in parallel.
- `db` delivers `packages/db` shape, Drizzle baseline strategy, retained `packages/supabase` scope, and DB-facing validation exports.
- `auth` delivers `packages/auth` shape, Better Auth runtime/session contract, and web/mobile client contract.
- Fan-in requirement: root merges the locked `db` and `auth` contracts before `api` starts real integration.

### Wave 2 - API convergence

- Run `api` after the `db` and `auth` contracts are frozen.
- Deliverables: final shared context shape, router migration plan, `packages/api` ownership, and `packages/trpc` retirement path.
- Fan-in requirement: root syncs the merged API boundary downstream before app lanes change real callers.

### Wave 3 - App integration

- Run `web` and `mobile` in parallel only after `api` and `auth` contracts are stable.
- `web` owns TanStack Start setup, endpoint mounting, provider/bootstrap migration, and route-by-route cutover.
- `mobile` owns Better Auth Expo adoption, request transport, and caller migration.
- Fan-in requirement: root merges app lanes separately, resolving only contract-safe adapter gaps.

### Wave 4 - Tooling convergence

- Run `tooling` after the package and app entrypoint shapes are stable enough to avoid global churn.
- Deliverables: `tooling/typescript`, `tooling/tailwind`, script reduction, and final ignore coverage for generated outputs.

### Wave 5 - Fan-in and cleanup

- Run `fan-in` as the single merge-prep lane.
- Deliverables: lockfile/export cleanup, cross-lane validation, final import-path cleanup, and merge readiness notes.

## Lane Deliverables And Validation

| Lane | Minimum deliverable | Minimum validation |
| --- | --- | --- |
| foundation | updated spec artifacts and lane packets | spec consistency review |
| db | `packages/db` contract plus migration strategy | package typecheck/tests relevant to DB work |
| auth | `packages/auth` contract plus session/client rules | package typecheck/tests relevant to auth work |
| api | `packages/api` context/router changes plus bridge notes | `@repo/api` and `@repo/trpc` checks |
| web | TanStack Start scaffolding or route/provider migration slice | `pnpm --filter web check-types` plus focused app checks |
| mobile | Better Auth Expo migration slice | `pnpm --filter mobile check-types` plus focused auth tests |
| tooling | config/tooling changes plus migration notes | focused config validation or package/app typechecks impacted |
| fan-in | merge-ready integrated tree | `pnpm check-types && pnpm lint && pnpm test` when feasible |

## Nested Coordinator Rules

- `foundation` may split inventories into subagents for route audit, auth audit, DB audit, and script/generated-output audit.
- `db` may split into `schema`, `migrations`, and `validation` subagents.
- `auth` may split into `server-runtime`, `web-client`, `expo-client`, and `callback-rules` subagents.
- `api` may split by router family only after the context contract is frozen.
- `web` may split by route family only after `/api/auth`, `/api/trpc`, and provider contracts are frozen.
- `mobile` may split by auth surfaces, request transport, and account-management flows only after the Expo contract is frozen.
- `tooling` may split by TypeScript, Tailwind, and manifest/ignore cleanup.
- `fan-in` stays single-owner.

## Conflict Prevention Rules

- Only `foundation` edits `design.md`, `plan.md`, `tasks.md`, `decision-log.md`, `dependency-order-matrix.md`, `risk-blocker-matrix.md`, `migration-matrix.md`, and this file.
- Only the owning lane edits its package internals.
- `web` and `mobile` may request shared-package changes, but the owning lane applies them.
- Reserve broad `package.json` and lockfile churn for `tooling` and `fan-in` unless a lane needs a strictly local dependency to progress.
- If a contract changes mid-wave, pause dependent lanes, fan in the contract, and then reissue bounded packets.

## Conductor Cadence

### Start of wave

- publish the frozen contract for the wave
- name the owner, non-owner areas, and required validation for each lane
- state the merge order before agents begin

### Mid-wave checkpoint

- collect only status, blockers, changed assumptions, and touched files
- intervene only for contract drift, cross-lane conflicts, or blocked dependencies

### End of wave

- merge only the completed dependency tier
- sync merged outputs into downstream worktrees
- update active spec memory with truthful progress, blockers, validation, and one exact next action

## Recommended Initial Release

1. `foundation`
2. `db` + `auth`
3. `api`
4. `web` + `mobile`
5. `tooling`
6. `fan-in`

## Admin Escalation Triggers For The Root Chat

- two lanes need the same file or package ownership
- a lane wants to change a frozen contract mid-wave
- validation fails in a shared package that blocks downstream lanes
- dependency or lockfile churn spreads outside the owning lane
- generated artifacts or local runtime outputs appear in a branch diff

## Completion Condition

- every lane has a clear owner and merge point
- no dependent lane starts before its upstream contract is frozen
- the root coordinator remains the only authority for spec truth, merge order, and final fan-in
