# Tasks: Repository-Level OpenCode Workflow Lifecycle

## Coordination Rules

- [ ] The coordinator remains the only authority for lifecycle state, task sequencing, and finish handoff.
- [ ] A task is complete only when the relevant spec docs are updated and validation or review expectations are satisfied.
- [ ] Do not introduce a parallel workflow path that bypasses `.opencode/specs/*` as canonical memory.
- [ ] Keep the workflow additive to existing `AGENTS.md` and `.opencode/tasks/index.md` patterns.

## Phase 1: Lifecycle Contract

- [x] Task A - Define the coordinator lifecycle states. Success: `design.md` names the full state model with entry and exit semantics.
- [x] Task B - Define coordinator-only responsibilities. Success: delegation, fan-in, verification, and handoff ownership are explicit.

## Phase 2: Delegation Contract

- [x] Task C - Define the delegated task packet. Success: objective, scope, context, deliverable, and completion criteria are required fields.
- [x] Task D - Define the delegated return packet. Success: status, outcome, touched files, verification, blockers, and next step are required fields.
- [x] Task E - Define blocker escalation. Success: delegated workers know when to stop and return control.

## Phase 3: Context Routing And Checkpoint Memory

- [x] Task F - Define context tiers and routing rules. Success: global, spec, and task-local context boundaries are documented.
- [x] Task G - Define checkpoint triggers and ownership. Success: the spec states when updates belong in `design.md`, `plan.md`, `tasks.md`, or `.opencode/tasks/index.md`.
- [x] Task H - Define resume semantics. Success: a new session can recover current state from repo memory without relying on chat history.

## Phase 4: Parallel Fan-Out

- [x] Task I - Define safe parallelization criteria. Success: parallel work requires bounded scope, low-conflict boundaries, and a named fan-in owner.
- [x] Task J - Define fan-in review. Success: the coordinator must reconcile outputs and update the canonical plan before further delegation.

## Phase 5: Verification And Review

- [x] Task K - Define verification layers. Success: task, phase, and final verification expectations are explicit.
- [x] Task L - Define review criteria. Success: the workflow checks implementation and spec alignment before handoff.

## Phase 6: Finish Handoff

- [x] Task M - Define finish modes and handoff contents. Success: `completed`, `in_progress`, `blocked`, and `cancelled` are used consistently.
- [x] Task N - Define next-session readiness requirements. Success: handoff leaves an exact next action and truthful status in repo memory.

## Validation Gate

- [x] Validation 1 - `design.md`, `plan.md`, and `tasks.md` use consistent lifecycle terminology.
- [x] Validation 2 - checkpoint ownership is unambiguous across the three docs.
- [x] Validation 3 - delegation, parallel fan-out, verification, and handoff rules form one end-to-end workflow.

## Phase 7: Registry And Asset Cleanup

- [x] Task O - Consolidate workflow commands under one directory. Success: `.opencode/commands/` is the only command asset directory in active use.
- [x] Task P - Remove redundant markdown agent stubs. Success: lifecycle-managed specialist definitions live in `opencode.json` without a competing `.opencode/agents/` registry.
- [x] Validation 4 - Asset references stay consistent after cleanup. Success: repo instructions and task tracking reflect the consolidated layout.

## Phase 8: Boundary Hardening

- [x] Task Q - Tighten review and research agent boundaries. Success: read-only or advisory specialists do not keep broader edit or shell permissions than their role requires.
- [x] Task R - Add a dedicated parallel fan-out command. Success: the coordinator has an explicit command for planning safe parallel workstreams.
- [x] Validation 5 - Workflow command set covers delegation, fan-out, checkpointing, and finish handoff. Success: `.opencode/commands/` exposes the full coordinator lifecycle support surface.
