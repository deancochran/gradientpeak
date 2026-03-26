# AGENTS.md

This file defines the always-on OpenCode instructions for this repository.

## Config Layout

- `opencode.json` at the repository root is the canonical runtime config.
- `.opencode/` stores supporting assets such as `skills/`, `commands/`, `instructions/`, `specs/`, and `tasks/`.
- Keep repo-wide instructions here; keep detailed reference material in `.opencode/instructions/` and load it only when needed.

## Core Workflow

1. Read `.opencode/tasks/index.md` at session start, but measure its current size first and compact it if it drifted past the active-memory budget.
2. Read the active spec in `.opencode/specs/<spec-name>/` before implementation.
3. Start with `design.md`, then `plan.md`, then `tasks.md`.
4. Continue from the next unchecked task.
5. Update `tasks.md` as subtasks complete or blockers appear.
6. Run the narrowest relevant verification after meaningful code changes.

## Coordinator Lifecycle

For medium or high complexity work, treat the primary agent as a coordinator that moves through these states:

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

Lifecycle rules:

- The coordinator owns task selection, delegation decisions, fan-in synthesis, verification sufficiency, and final handoff.
- Delegation is the default for medium or high complexity work when research, validation, or implementation slices can be bounded clearly.
- Parallel fan-out is allowed only when work units have low-conflict boundaries, a clear integration surface, and an explicit fan-in owner.
- Do not finish a session without writing truthful progress, blockers, validation status, and the next action into repo memory.

## Delegation Contract

Every delegated task should include:

- objective,
- exact scope,
- allowed files or file areas,
- required context,
- excluded context,
- deliverable shape,
- completion criteria,
- verification expectation,
- blocker escalation rule.

Every delegated result should return:

- status,
- concise outcome,
- decisions taken,
- files touched or proposed,
- verification run,
- unresolved risks,
- exact next step if incomplete.

## Context Routing And Memory

Use three context tiers:

- `global` for always-on rules in `AGENTS.md`,
- `spec` for the active `design.md`, `plan.md`, and `tasks.md`,
- `task_local` for only the files and notes required by one work unit.

Routing rules:

- Never send full session history by default.
- Send only the minimum spec slice needed for the task.
- Keep durable state in `.opencode/specs/*` and `.opencode/tasks/index.md`, not only in chat history.
- Update `plan.md` when sequencing changes, `design.md` when contract or architecture changes, and `tasks.md` when execution truth changes.

## Document Size Discipline

Treat OpenCode-managed markdown as bounded working memory, not an append-only log.

- On every read, append, or write touching `.opencode/tasks/*.md`, `.opencode/specs/**/*.md`, or `.opencode/instructions/*.md`, check the current line count first and decide whether the file still fits its purpose.
- If a file is already too large, or the next update would push it over budget, compact it before adding more content.
- Remove completed sections from active working docs instead of leaving long fully checked blocks behind.
- Move durable history out of active working docs and into a focused archive only when that history is still useful.

Active-memory budgets:

- `.opencode/tasks/index.md`: keep it focused on active or blocked work and under about 120 lines; remove completed task sections once they are closed.
- Active spec `tasks.md`: keep only coordination rules, open work, active blockers, pending validation, and one short completed summary; remove completed phase sections after they are no longer needed for execution.
- `design.md`, `plan.md`, and instruction references: prefer splitting or tightening once they drift past about 250 lines.

Compaction rules:

- Do not keep completed checklist sections in `.opencode/tasks/index.md`.
- When a phase in `tasks.md` is fully complete, replace that section with a short completion note or remove it if the plan and handoff already preserve the outcome.
- Archive summaries should stay terse and should not become default startup context.

## Global Rules

- Prefer small, focused diffs that match existing patterns.
- Never duplicate business logic that belongs in `@repo/core`.
- Keep `@repo/core` database-independent.
- For shared UI work in `packages/ui`, prefer a TDD flow of `fixtures.ts` -> story -> `play` interaction -> package test as needed -> preview scenario/manifests -> runtime E2E only for app integration boundaries.
- Treat generated selector and preview manifests as the source of truth for cross-runtime preview smoke assertions; avoid hand-maintained app-local selector copies.
- Use the smallest relevant skill set instead of expanding always-on instructions.
- Load `brainstorming` before creative feature design or behavior changes.
- For medium or high complexity work, delegate research first when it materially reduces risk.

## Skill Strategy

Load only the skills needed for the current task:

- `mobile-frontend` for Expo/React Native UI and interaction work.
- `mobile-recording` for recorder, BLE, FTMS, GPS, and FIT handoff work.
- `web-frontend` for Next.js App Router and web UI work.
- `ui-package` for shared `@repo/ui` components, Storybook ownership, and cross-platform component contracts.
- `backend` for tRPC, Supabase, and server-side mutation/query patterns.
- `core-package` for pure logic, calculations, and schemas in `@repo/core`.
- `provider-integrations` for OAuth callbacks, token sync, webhooks, and external provider mapping.
- `testing` for test ownership, runner choice, and coverage patterns.
- `documentation` for JSDoc, README, and maintenance docs.

## Validation

- Start with focused package checks.
- Preferred full validation before handoff or commit:

```bash
pnpm check-types && pnpm lint && pnpm test
```

Coverage targets:

- `@repo/core`: 100%
- `@repo/trpc`: 80%
- `apps/mobile`: 60%
- `apps/web`: 60%

## Session Protocol

During a session:

1. Mark progress in the active spec task list.
2. Record blockers immediately.
3. Keep validation proportional to the change.

When work is incomplete:

1. Confirm what is done vs pending.
2. Leave the next actionable step in the active `tasks.md`.

## Lazy Reference

Read `.opencode/instructions/project-reference.md` only when you need detailed architecture, commands, stack versions, file locations, or domain-specific gotchas.
Read `.opencode/instructions/workflow-lifecycle.md` when coordinating complex multi-step work.
Read `.opencode/instructions/delegation-contract.md` when you need the standard task packet, return packet, or checkpoint template.
