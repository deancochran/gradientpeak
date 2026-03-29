# Lane Task Packets - Apps, Tooling, And Fan-In

## Purpose

Provide ready-to-send task packets for the app, tooling, and integration lanes in the TanStack Start, Drizzle, and Better Auth replatform.

## Root Packet Rules

- The root coordinator owns spec truth, merge order, and contract freezes.
- Each lane may run a coordinator agent locally, but only inside its owned files.
- If a lane needs a contract change outside its scope, it must stop and escalate rather than patching another lane's files.

## Web

Objective:
- Migrate `apps/web` toward TanStack Start, including `/api/trpc`, `/api/auth`, provider/bootstrap wiring, and route-by-route cutover.

Branch Or Worktree:
- `spec/tanstack-start-drizzle-auth-replatform/web`
- `~/worktrees/GradientPeak/spec-tanstack-start-drizzle-auth-replatform-web`

Scope:
- `apps/web` only, except for approved adapter seams from owning lanes.

Allowed Files Or Areas:
- `apps/web/**`
- app-local config required for TanStack Start migration
- no shared package edits unless root explicitly reassigns ownership

Required Context:
- merged `api` and `auth` contracts
- `web-route-map.md`, `migration-matrix.md`, `orchestration-plan.md`
- current `apps/web` route and provider inventory

Excluded Context:
- no package-internal rewrites in `packages/api`, `packages/auth`, `packages/db`, or `packages/ui`
- no repo-wide tooling cleanup

Deliverable Shape:
- code patch for `apps/web`, route migration notes, and return packet

Completion Criteria:
- TanStack Start runtime path is established or advanced for the assigned slice
- `/api/trpc` and `/api/auth` mounting path is aligned with shared contracts
- Next-only assumptions touched by the slice are removed or documented for retirement

Verification Expectation:
- `pnpm --filter web check-types`
- focused web tests/build checks relevant to the slice

Blocker Escalation Rule:
- escalate if shared package contract gaps block app migration

## Mobile

Objective:
- Finish the Better Auth Expo migration in `apps/mobile`, including auth bootstrap, request transport, and caller updates to the final shared API/auth contracts.

Branch Or Worktree:
- `spec/tanstack-start-drizzle-auth-replatform/mobile`
- `~/worktrees/GradientPeak/spec-tanstack-start-drizzle-auth-replatform-mobile`

Scope:
- `apps/mobile` only, except for approved adapter seams from owning lanes.

Allowed Files Or Areas:
- `apps/mobile/**`
- mobile-local config and tests needed for auth/API migration
- no shared package edits unless root explicitly reassigns ownership

Required Context:
- merged `api` and `auth` contracts
- mobile auth behavior notes already captured in the spec
- `orchestration-plan.md` and `migration-matrix.md`

Excluded Context:
- no Better Auth runtime internals
- no shared API context rewrites
- no repo-wide tooling cleanup

Deliverable Shape:
- code patch for `apps/mobile`, migration notes, and return packet

Completion Criteria:
- mobile uses the final shared auth/API contracts for the assigned slice
- cookie-first request transport and Expo callback behavior stay coherent
- stale Supabase-auth-first assumptions touched by the slice are removed or isolated behind dated bridges

Verification Expectation:
- `pnpm --filter mobile check-types`
- focused mobile auth/API tests relevant to the slice

Blocker Escalation Rule:
- escalate if app migration is blocked by unstable shared package contracts

## Tooling

Objective:
- Move shared config into `tooling/typescript` and `tooling/tailwind`, slim package manifests, and lock repo-wide ignore rules for generated artifacts.

Branch Or Worktree:
- `spec/tanstack-start-drizzle-auth-replatform/tooling`
- `~/worktrees/GradientPeak/spec-tanstack-start-drizzle-auth-replatform-tooling`

Scope:
- tooling, config, manifest, and ignore-rule work only.

Allowed Files Or Areas:
- `tooling/**`
- root `package.json`
- package/app `package.json` files only for script/dependency cleanup approved by root
- tsconfig and tailwind config files across the repo
- `.gitignore`

Required Context:
- locked tooling direction from `design.md` and `decision-log.md`
- `migration-matrix.md`, `orchestration-plan.md`
- current config consumer inventory

Excluded Context:
- no runtime feature work in apps or shared packages
- no mid-wave global churn before `web` and `api` entrypoints are stable unless root explicitly starts the tooling wave early

Deliverable Shape:
- config/code patch, manifest cleanup notes, ignore-rule matrix, and return packet

Completion Criteria:
- `tooling/typescript` and `tooling/tailwind` own the intended shared config
- obsolete wrapper scripts are removed or explicitly justified
- generated build/test/runtime artifacts have clear ignore coverage

Verification Expectation:
- focused config validation plus affected package/app typechecks

Blocker Escalation Rule:
- escalate if tooling cleanup would create cross-lane conflicts before upstream runtime boundaries stabilize

## Fan-In

Objective:
- Prepare integrated merge-ready output by reconciling lockfiles, exports, manifests, validation, and downstream sync.

Branch Or Worktree:
- `spec/tanstack-start-drizzle-auth-replatform/fan-in`
- `~/worktrees/GradientPeak/spec-tanstack-start-drizzle-auth-replatform-fan-in`

Scope:
- integration, cleanup, validation, and merge prep only.

Allowed Files Or Areas:
- any files required to reconcile already-approved lane outputs
- no new product/runtime behavior beyond conflict resolution or final cleanup

Required Context:
- merged outputs from completed lanes
- `cutover-checklist.md`, `tasks.md`, `orchestration-plan.md`
- validation expectations from root

Excluded Context:
- no net-new architecture redesign
- no speculative feature work

Deliverable Shape:
- integrated cleanup patch, validation report, and merge-readiness return packet

Completion Criteria:
- shared exports, lockfile state, manifests, and imports are coherent
- final validation status is explicit
- unresolved risks are isolated and named for root

Verification Expectation:
- `pnpm check-types && pnpm lint && pnpm test` when feasible, otherwise document exact blockers

Blocker Escalation Rule:
- escalate if conflict resolution would change a frozen contract instead of merely integrating it
