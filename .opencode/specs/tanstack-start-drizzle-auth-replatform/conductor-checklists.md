# Conductor Checklists

## Purpose

Give the root coordinator a concrete command set and wave-by-wave checklist for provisioning worktrees and conducting the first two waves.

## Worktree Create Commands

Run from the primary repo checkout:

```bash
wt switch --create spec/tanstack-start-drizzle-auth-replatform/foundation
wt switch --create spec/tanstack-start-drizzle-auth-replatform/db
wt switch --create spec/tanstack-start-drizzle-auth-replatform/auth
wt switch --create spec/tanstack-start-drizzle-auth-replatform/api
wt switch --create spec/tanstack-start-drizzle-auth-replatform/web
wt switch --create spec/tanstack-start-drizzle-auth-replatform/mobile
wt switch --create spec/tanstack-start-drizzle-auth-replatform/tooling
wt switch --create spec/tanstack-start-drizzle-auth-replatform/fan-in
```

Recommended initial subset if you want to stage branch creation by wave:

```bash
wt switch --create spec/tanstack-start-drizzle-auth-replatform/foundation
wt switch --create spec/tanstack-start-drizzle-auth-replatform/db
wt switch --create spec/tanstack-start-drizzle-auth-replatform/auth
```

Useful monitoring commands:

```bash
wt list
wt config show --full
wt hook approvals add
```

## Wave 0 Checklist - Foundation Freeze

### Preflight

1. Confirm the root chat is staying in the primary checkout.
2. Run `wt config show --full` and verify the worktree path template resolves under `~/worktrees/GradientPeak/`.
3. Run `wt list` and confirm there are no stale worktrees that would conflict with the planned branch names.
4. Approve shared hooks if needed with `wt hook approvals add`.

### Provision

1. Create the `foundation` worktree.
2. Optionally create `db` and `auth` now so they are ready for Wave 1.
3. Record the created worktree paths in the root checkpoint.

### Root release packet

1. Freeze the current architecture target and lane map from `orchestration-plan.md`.
2. Send the `foundation` packet from `lane-task-packets-shared.md`.
3. State the Wave 0 completion criteria explicitly:
   - package map frozen
   - lane ownership frozen
   - bridge policy frozen
   - Wave 1 `db` and `auth` packets ready

### Mid-wave checkpoint

1. Ask only for status, blockers, touched files, and contract changes.
2. Reject any attempt to let `foundation` absorb runtime implementation work beyond tiny unblockers.
3. If `foundation` discovers a contract conflict, resolve it in root before releasing any downstream lane.

### Fan-in

1. Review the returned `foundation` checkpoint packet.
2. Merge or manually fan in the accepted spec changes.
3. Update `tasks.md` and `.opencode/tasks/index.md` if the release order or blockers changed.
4. Re-sync the merged spec truth into the `db` and `auth` worktrees.

### Exit gate

Wave 0 ends only when:

- `foundation` has locked Wave 1 contracts
- `db` and `auth` have exact packets and owned file boundaries
- the root chat can name what `api` is waiting on

## Wave 1 Checklist - Core Package Contracts

### Pre-release

1. Confirm Wave 0 spec truth is merged into root.
2. Confirm `db` and `auth` worktrees are cleanly synced to the merged contract state.
3. Re-state the no-touch rule: `db` owns `packages/db`; `auth` owns `packages/auth`; neither lane edits canonical spec docs.

### Release

1. Send the `db` packet from `lane-task-packets-shared.md`.
2. Send the `auth` packet from `lane-task-packets-shared.md`.
3. State the Wave 1 completion criteria explicitly:
   - `packages/db` contract is stable enough for `api`
   - `packages/auth` contract is stable enough for `api`, `web`, and `mobile`
   - retained `packages/supabase` scope is explicit
   - session/client contract is explicit

### Parallel execution guardrails

1. Allow `db` and `auth` to spawn subagents inside their own boundaries.
2. Do not let `db` and `auth` both redefine shared auth table ownership without a root decision.
3. If either lane needs a contract change that affects the other, pause both lanes and resolve it in root.

### Mid-wave checkpoint

1. Collect status, blockers, files touched, validation run, and any proposed contract changes.
2. Confirm neither lane is drifting into `packages/api`, `apps/web`, or `apps/mobile` implementation work.
3. If one lane is blocked on the other, resolve the contract issue before more code lands.

### Fan-in

1. Review `db` first for schema/migration/validation stability.
2. Review `auth` second for session/client/callback stability.
3. Merge accepted `db` and `auth` outputs into root.
4. Update spec truth only from root if the contracts changed.
5. Re-sync merged `db` and `auth` outputs into the `api` worktree before releasing Wave 2.

### Exit gate

Wave 1 ends only when:

- `api` can consume a frozen DB contract
- `api` can consume a frozen auth/session contract
- root can name the exact `packages/trpc` to `packages/api` convergence task without waiting on more upstream design

## Root Checkpoint Template

Use this at the end of each wave:

```text
Lifecycle State:
- handoff

Completed Work:
- <what was merged>

Active Decisions:
- <contracts now frozen>

Open Questions Or Blockers:
- <only unresolved items>

Verification Status:
- <what was checked>

Next Recommended Action:
- <next wave release>
```
