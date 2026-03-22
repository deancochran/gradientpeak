# Design: Repository-Level OpenCode Workflow Lifecycle

## 1. Objective

Make the repo-level `.opencode` workflow act like a disciplined coordinator system rather than a loose prompt chain.

Primary outcomes:

- one explicit coordinator owns lifecycle state for each work session,
- delegation uses a stable contract for scope, inputs, outputs, and return criteria,
- context is routed intentionally instead of flooding every worker with full session history,
- checkpoints preserve resumable memory between fan-out and fan-in stages,
- parallel work is first-class but bounded by merge and verification rules,
- finish handoff leaves the next agent with clear state in `.opencode/specs/*` and `.opencode/tasks/index.md`.

## 2. Problem Statement

Today the repo already has strong external memory primitives, but the workflow contract between coordinator, delegated workers, and spec artifacts is still implicit.

This creates common failure modes:

- repeated re-reading of large context,
- unclear delegation boundaries,
- weak progress snapshots between phases,
- ad hoc parallelization,
- verification happening too late or without ownership,
- incomplete finish handoff when sessions stop mid-stream.

## 3. Core Product Decisions

### A. Treat the primary agent as a session coordinator

The top-level OpenCode agent is the coordinator for the active spec. It should own:

- lifecycle state,
- task selection,
- delegation decisions,
- context packaging,
- checkpoint writes,
- fan-in synthesis,
- verification and finish handoff.

### B. Treat delegated work as contract-bound subroutines

Delegated agents do not discover scope on their own. They receive a bounded task packet and must return:

- result status,
- changed files or recommended file areas,
- decisions made,
- blockers,
- verification performed,
- follow-up recommendations.

### C. Keep durable memory in repo artifacts, not only chat state

The workflow should prefer durable state in:

- `.opencode/tasks/index.md` for session and spec registry,
- `.opencode/specs/<spec>/design.md` for intent and architecture,
- `.opencode/specs/<spec>/plan.md` for execution map,
- `.opencode/specs/<spec>/tasks.md` for live progress and blockers.

## 4. Lifecycle Model

### A. Coordinator states

Define an explicit lifecycle:

1. `intake`
2. `orient`
3. `plan`
4. `delegate`
5. `execute`
6. `fan_in`
7. `verify`
8. `review`
9. `handoff`
10. `closed`

### B. State entry and exit rules

- `intake` starts when a new request or active spec is identified.
- `orient` ends when relevant repo memory and active spec context are loaded.
- `plan` ends when the next bounded unit of work is selected.
- `delegate` ends when one or more task packets are issued.
- `execute` ends when direct work or delegated work returns.
- `fan_in` ends when outputs are reconciled into one canonical plan.
- `verify` ends when targeted checks complete.
- `review` confirms spec and task docs reflect reality.
- `handoff` writes the next actionable state.
- `closed` is only valid when no unresolved blocker or pending active task is omitted.

## 5. Delegation Contract

### A. Required task packet fields

Every delegated unit should include:

- objective,
- exact scope,
- allowed files or file areas,
- required context,
- excluded context,
- deliverable shape,
- completion criteria,
- verification expectation,
- escalation rule for blockers.

### B. Required return packet fields

Every delegated result should return:

- status: `completed`, `blocked`, `needs_review`, or `aborted`,
- concise outcome,
- decisions taken,
- files touched or proposed,
- verification run,
- unresolved risks,
- exact next step if incomplete.

### C. Coordinator-only responsibilities

Only the coordinator may:

- change active-spec status,
- merge conflicting delegated outputs,
- update canonical task sequencing,
- declare verification sufficient,
- write final handoff state.

## 6. Context Routing

### A. Context tiers

Use three routing tiers:

- `global`: always-on repo instructions like `AGENTS.md`,
- `spec`: active `design.md`, `plan.md`, and `tasks.md`,
- `task_local`: only files and notes required for one delegated unit.

### B. Routing rules

- never send full session history by default,
- send only the minimum spec slice needed for the task,
- include prior checkpoints when the task depends on earlier decisions,
- strip unrelated implementation detail from parallel workers,
- prefer references to repo files over repeated prose restatement.

## 7. Checkpoint Memory

### A. Checkpoint purpose

Checkpoints make work resumable across interruptions, fan-out, and handoff.

### B. Required checkpoint contents

At meaningful boundaries, record:

- current lifecycle state,
- completed work,
- active decisions,
- open questions or blockers,
- verification status,
- next recommended action.

### C. Storage model

- `tasks.md` holds execution truth and checkbox progress,
- `plan.md` absorbs plan-level changes when sequencing changes,
- `design.md` changes only when architecture or contract decisions change,
- `.opencode/tasks/index.md` reflects active, cancelled, or completed spec state.

## 8. Parallel Fan-Out

### A. When parallelism is allowed

Parallel fan-out is valid only when work units have:

- independent file ownership or low-conflict boundaries,
- clear integration surface,
- explicit fan-in owner,
- bounded return contracts.

### B. Parallel work classes

Good candidates:

- research vs implementation prep,
- backend contract vs frontend consumption,
- test creation vs implementation review,
- docs updates vs code updates in separate files.

### C. Fan-in rules

After parallel work returns, the coordinator must:

- reconcile conflicts before more delegation,
- update the canonical plan,
- re-check assumptions made by parallel workers,
- decide whether another fan-out round is still safe.

## 9. Verification And Review

### A. Verification policy

Verification should be proportional and attached to the unit of work, not deferred to the end by default.

Levels:

- task-level focused checks,
- phase-level integration checks,
- final pre-handoff validation.

### B. Review policy

Review asks:

- did implementation satisfy the delegated contract,
- did spec docs stay aligned with code reality,
- did any new architectural decision escape `design.md`,
- does `tasks.md` tell the truth about done vs pending work.

## 10. Finish Handoff

### A. Handoff requirements

A finish handoff is complete only when it leaves:

- active spec status,
- completed vs pending tasks,
- blockers if any,
- verification performed,
- exact next action.

### B. End states

Use clear finish modes:

- `completed`
- `in_progress`
- `blocked`
- `cancelled`

The coordinator should avoid ambiguous "mostly done" endings.

## 11. Success Criteria

- the coordinator lifecycle is explicit and repeatable,
- delegation packets are small, stable, and reviewable,
- context sent to workers is materially smaller and more relevant,
- interrupted work is resumable from repo memory,
- parallel fan-out increases throughput without hidden merge risk,
- verification and handoff happen as first-class phases rather than afterthoughts.
