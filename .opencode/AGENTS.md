# AGENTS.md

This file defines the always-on instructions for OpenCode in this repository.

## Core Workflow (Always Follow)

1. Read the active spec in `.opencode/specs/<spec-name>/` before implementation.
2. Start with `design.md`, then `plan.md`, then `tasks.md`.
3. Update `tasks.md` as subtasks complete.
4. Run verification after code changes.
5. If blocked by security rules, permissions, or capability limits, delegate to an appropriate subagent.

## Minimal Global Rules

- Prefer small, focused diffs that follow existing project patterns.
- Never duplicate business logic that belongs in `@repo/core`.
- Keep `@repo/core` database-independent (no ORM/database imports).
- For complex tasks, delegate research first, then implementation.
- If a task requires creative design or behavior changes, load `brainstorming` first.

## Skills-First Context Strategy

Use skills as the primary source of task-specific context to avoid overloading always-on instructions.

- `mobile-frontend`: React Native, NativeWind, Reusables patterns.
- `web-frontend`: Next.js App Router and web UI patterns.
- `backend`: tRPC/Supabase API patterns and error handling.
- `core-package`: pure calculations, schemas, validation logic.
- `testing`: test structure, mocks, coverage expectations.
- `documentation`: JSDoc/README/documentation conventions.

Load only the skill(s) needed for the current task.

## Testing and Validation

After implementation, run the narrowest relevant checks first, then broader checks when needed.

Preferred full validation before handoff/commit:

```bash
pnpm check-types && pnpm lint && pnpm test
```

Coverage expectations:

- `@repo/core`: 100%
- `@repo/trpc`: 80%
- `apps/mobile`: 60%
- `apps/web`: 60%

## Multi-Agent Delegation

Use specialized agents when complexity is medium/high or cross-package:

- Research: architecture, technology, QA, integration, performance, documentation.
- Implementation: mobile/web generation, tRPC routers, migrations, optimization, accessibility.

Coordinator should synthesize findings and keep execution aligned with spec tasks.

## Session Protocol

At session start:

1. Read `.opencode/tasks/index.md`.
2. Read active spec `tasks.md`.
3. Continue from the next unchecked subtask.

During session:

1. Mark progress in spec tasks.
2. Record blockers immediately.
3. Validate after each meaningful implementation step.

End of session:

1. Confirm what is complete vs pending.
2. Leave next actionable step in `tasks.md` when work is incomplete.

## Project Reference (Lazy Load)

For detailed architecture, commands, stack versions, file locations, and domain gotchas, read:

- `.opencode/instructions/project-reference.md`

This reference is intentionally not always loaded to keep context focused.
