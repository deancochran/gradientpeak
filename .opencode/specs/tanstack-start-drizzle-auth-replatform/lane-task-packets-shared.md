# Lane Task Packets - Shared Boundaries

## Purpose

Provide ready-to-send task packets for the shared-boundary lanes in the TanStack Start, Drizzle, and Better Auth replatform.

## Root Packet Rules

- The root coordinator owns spec truth, merge order, and contract freezes.
- Each lane may run a coordinator agent locally, but only inside its owned files.
- If a lane needs a contract change outside its scope, it must stop and escalate rather than patching another lane's files.

## Foundation

Objective:
- Freeze Wave 0 architecture contracts, lane ownership, bridge policy, ignore policy, and validation rules.

Branch Or Worktree:
- `spec/tanstack-start-drizzle-auth-replatform/foundation`
- `~/worktrees/GradientPeak/spec-tanstack-start-drizzle-auth-replatform-foundation`

Scope:
- Spec-only coordination work for the replatform.

Allowed Files Or Areas:
- `.opencode/specs/tanstack-start-drizzle-auth-replatform/design.md`
- `.opencode/specs/tanstack-start-drizzle-auth-replatform/plan.md`
- `.opencode/specs/tanstack-start-drizzle-auth-replatform/tasks.md`
- `.opencode/specs/tanstack-start-drizzle-auth-replatform/decision-log.md`
- `.opencode/specs/tanstack-start-drizzle-auth-replatform/dependency-order-matrix.md`
- `.opencode/specs/tanstack-start-drizzle-auth-replatform/risk-blocker-matrix.md`
- `.opencode/specs/tanstack-start-drizzle-auth-replatform/migration-matrix.md`
- `.opencode/specs/tanstack-start-drizzle-auth-replatform/orchestration-plan.md`
- `.opencode/tasks/index.md`

Required Context:
- `design.md`, `plan.md`, `tasks.md`, `orchestration-plan.md`
- current locked decisions in `decision-log.md`
- dependency and risk artifacts

Excluded Context:
- no runtime implementation beyond tiny unblockers explicitly requested by root
- do not redesign the high-level target stack

Deliverable Shape:
- spec edits, lane release notes, and a checkpoint packet for root

Completion Criteria:
- Wave 0 contract surfaces are explicit
- lane ownership and no-touch rules are unambiguous
- Wave 1 packets for `db` and `auth` are ready to issue

Verification Expectation:
- spec consistency review only

Blocker Escalation Rule:
- escalate if any lane boundary requires changing a locked architecture decision

## DB

Objective:
- Define and implement the `packages/db` contract: Drizzle schema ownership, migration baseline strategy, validation exports, and retained `packages/supabase` infra boundary.

Branch Or Worktree:
- `spec/tanstack-start-drizzle-auth-replatform/db`
- `~/worktrees/GradientPeak/spec-tanstack-start-drizzle-auth-replatform-db`

Scope:
- `packages/db` and DB-related migration artifacts only.

Allowed Files Or Areas:
- `packages/db/**`
- `packages/supabase/**` only where needed to separate retained infra from retired relational ownership
- DB-related sections in non-canonical notes only if root explicitly asks

Required Context:
- locked package map and Wave 1 contract from `orchestration-plan.md`
- `db-ownership-matrix.md`, `migration-matrix.md`, `decision-log.md`
- current `packages/supabase` schema, migrations, generated types, and seeds

Excluded Context:
- no Better Auth runtime design
- no web/mobile framework integration
- no router migration outside DB seam notes requested by `api`

Deliverable Shape:
- code patch for `packages/db`, boundary notes, and return packet with retained-vs-retired `packages/supabase` map

Completion Criteria:
- `packages/db` has a clear schema/client/migration/validation shape
- Drizzle baseline strategy is explicit
- remaining `packages/supabase` scope is explicit

Verification Expectation:
- focused DB package typecheck/tests as applicable

Blocker Escalation Rule:
- escalate if auth tables, API context shape, or shared contracts must change outside the DB-owned boundary

## Auth

Objective:
- Define and implement the `packages/auth` contract: Better Auth runtime, session helpers, web and Expo client boundaries, and callback rules.

Branch Or Worktree:
- `spec/tanstack-start-drizzle-auth-replatform/auth`
- `~/worktrees/GradientPeak/spec-tanstack-start-drizzle-auth-replatform-auth`

Scope:
- `packages/auth` and auth-owned shared contracts only.

Allowed Files Or Areas:
- `packages/auth/**`
- auth contract notes requested by root
- limited shared schema touch only if required by Better Auth and coordinated with `db`

Required Context:
- locked decisions in `decision-log.md`
- `auth-behavior-matrix.md`, `migration-matrix.md`, `orchestration-plan.md`
- current web/mobile auth flow inventory

Excluded Context:
- no TanStack Start route migration
- no mobile screen rewrites beyond proving the shared contract
- no broad API router rewrites outside auth-owned seams

Deliverable Shape:
- code patch for `packages/auth`, session/client contract notes, and return packet

Completion Criteria:
- Better Auth runtime boundary is explicit
- session resolver and client contract are stable enough for `api`, `web`, and `mobile`
- callback and deep-link rules are recorded

Verification Expectation:
- focused `@repo/auth` typecheck/tests as applicable

Blocker Escalation Rule:
- escalate if DB ownership, API context shape, or app route behavior must change outside auth-owned files

## API

Objective:
- Converge the shared tRPC boundary on `packages/api`, define the final context shape, and reduce `packages/trpc` to a compatibility bridge.

Branch Or Worktree:
- `spec/tanstack-start-drizzle-auth-replatform/api`
- `~/worktrees/GradientPeak/spec-tanstack-start-drizzle-auth-replatform-api`

Scope:
- `packages/api`, `packages/trpc`, and API-owned migration notes only.

Allowed Files Or Areas:
- `packages/api/**`
- `packages/trpc/**`
- API contract notes requested by root

Required Context:
- merged `db` and `auth` contracts
- `migration-matrix.md`, `decision-log.md`, `web-route-map.md`, `auth-behavior-matrix.md`

Excluded Context:
- no Better Auth runtime internals
- no Drizzle schema authoring
- no web/mobile framework adapters beyond tiny API seam adapters requested by root

Deliverable Shape:
- code patch for `packages/api` and `packages/trpc`, bridge retirement notes, and return packet

Completion Criteria:
- final shared API context shape is explicit
- `packages/api` is the active long-term owner
- `packages/trpc` retirement steps are concrete

Verification Expectation:
- `pnpm --filter @repo/api check-types`
- `pnpm --filter @repo/trpc check-types`
- focused router/context tests as applicable

Blocker Escalation Rule:
- escalate if `db` or `auth` contracts are not stable enough to consume safely
