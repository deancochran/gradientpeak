# GradientPeak Agent Contract

This file is the repo-wide always-on instruction layer for OpenCode agents.

## Core Operating Model

- Treat the repository root checkout as the coordination and review surface.
- Treat implementation fan-out as worktree-based by default for medium and large tasks.
- Use one branch and one worktree per bounded lane.
- Keep the coordinator as the single fan-in authority unless the user explicitly changes ownership.
- Do not let multiple workers edit the same files without an explicit merge owner.

## Worktree Defaults

- Preferred local worktree root: `~/GradientPeak/.worktrees/<branch>`.
- Keep all GradientPeak worktrees inside the repo-local `.worktrees/` directory.
- Prefer `wt switch`, `wt list`, `wt merge`, and `wt remove` over raw `git worktree` commands.
- Use branch names shaped like `spec/<spec-slug>/<lane>` for larger engagements.

## Delegation Rules

- Every delegated task must include objective, scope, allowed files, required context, excluded context, completion criteria, verification expectation, and blocker escalation rules.
- Every worker result must include status, outcome, decisions taken, files touched, verification run, unresolved risks, and exact next step.
- Keep context narrow. Do not forward full session history by default.
- Parallel fan-out is allowed only when file ownership is low-conflict, the integration contract is known, and a fan-in owner is named up front.

## Merge And Consultation Rules

- Use a dedicated fan-in branch or worktree for large engagements with multiple active lanes.
- When two lanes collide on the same files or contract, pause additional implementation and route the conflict through merge mediation before more fan-out.
- Require a merge packet for each lane before integration: branch/worktree, owned files, contract changed, verification run, expected conflicts, merge order, and rollback note.
- Keep one active decision log for large engagements so consultation outcomes do not live only in chat history.

## Validation Gates

- Run the narrowest relevant checks during lane work.
- Require shared merge gates before integration: `pnpm check-types`, `pnpm lint`, and `pnpm test`, unless a task explicitly defines a narrower gate.
- Treat hook failures as blockers to resolve, not warnings to bypass.

## Repo Memory

- Keep `.opencode/tasks/index.md` truthful, lean, and limited to active or blocked work.
- Do not leave references to missing spec folders, stale branches, or completed work in startup context.
- Archive durable history outside startup files.
