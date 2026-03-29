# Project Reference (GradientPeak)

Detailed, task-relevant project context for lazy loading.

## OpenCode Repository Layout

- `opencode.json` at the repository root is the canonical OpenCode runtime configuration.
- `.opencode/` stores supporting instruction assets and repo-local content, not a second runtime config file.
- The root agent registry in `opencode.json` may reference assets under `.opencode/`, including `.opencode/instructions/` and `.opencode/skills/*/SKILL.md`, while repo-wide always-on rules live in the root `AGENTS.md`.
- Workflow coordination references live in `.opencode/instructions/workflow-lifecycle.md` and `.opencode/instructions/delegation-contract.md`.
- Worktrunk workflow reference lives in `.opencode/instructions/worktrunk-reference.md`, while shared hooks live in `.config/wt.toml`.

## Project Overview

GradientPeak is a local-first fitness platform with mobile + web clients and shared core logic.

Architectural principles:

- JSON as source of truth for activity payloads.
- Local-first recording on mobile, cloud sync when available.
- `@repo/core` is database-independent.
- End-to-end type safety via TypeScript + Zod.
- Monorepo with Turborepo + pnpm.

## Monorepo Structure

```text
gradientpeak/
├── apps/
│   ├── mobile/
│   └── web/
├── packages/
│   ├── core/
│   ├── ui/
│   ├── trpc/
│   ├── supabase/
│   └── typescript-config/
```

## Key Commands

Root:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm check-types
pnpm test
```

Worktrunk:

```bash
wt switch --create feature-name
wt list
wt merge main
wt remove
```

- Standard local worktree root: `~/worktrees/GradientPeak/<branch>`
- Shared Worktrunk hooks in `.config/wt.toml` run `pnpm install --frozen-lockfile` on `pre-start`, then `pnpm check-types`, `pnpm lint`, and `pnpm test` on `pre-merge`

Mobile:

```bash
pnpm --dir apps/mobile dev
pnpm --dir apps/mobile check-types
pnpm --dir apps/mobile test
```

Web:

```bash
pnpm --dir apps/web dev:next
pnpm --dir apps/web check-types
pnpm --dir apps/web test
```

Core:

```bash
pnpm --dir packages/core check-types
pnpm --dir packages/core lint
pnpm --dir packages/core test
```

## Testing Requirements

- `@repo/core`: 100%
- `@repo/trpc`: 80%
- `apps/mobile`: 60%
- `apps/web`: 60%

## Core Package Rules

- No database or ORM imports in `packages/core`.
- Prefer pure deterministic functions.
- Use Zod schemas for runtime validation.
- Keep shared business logic in `@repo/core` and reuse from apps/trpc.

## Mobile Architecture Notes

- Activity recorder service is lifecycle-scoped to recording screen.
- Use granular hooks for recorder state, readings, stats, sensors, plan, and actions.
- Optimize UI for 1-4Hz sensor updates.

Important paths:

- `apps/mobile/lib/services/ActivityRecorder/`
- `apps/mobile/lib/hooks/`
- `apps/mobile/components/`

### Mobile Styling Gotchas

- React Native text does not inherit styles; style each `Text` explicitly.
- Use semantic tokens (`bg-background`, `text-foreground`, etc.).
- Ensure modal/dialog infrastructure has required `PortalHost` setup.

## Web Architecture Notes

- Next.js App Router with Server Components by default.
- Add `"use client"` only where interactivity/hooks are required.
- Keep tRPC usage and schema typing aligned with core exports.

Important paths:

- `apps/web/src/app/`
- `apps/web/src/components/`
- `apps/web/src/lib/`

## tRPC Layer Notes

- Routers live in `packages/trpc/src/routers/`.
- Use core schemas/calculations for shared domain behavior.
- Keep auth and error handling explicit per procedure.

## Shared UI Package Notes

- `packages/ui` owns shared cross-platform component contracts and export mapping.
- Stories are package-owned, while Storybook hosting lives in `apps/web`.
- Keep app-specific business behavior out of shared UI primitives.

## Provider Integration Notes

- Keep OAuth callbacks, token refresh, webhooks, and provider sync flows isolated behind provider-specific boundaries.
- Normalize provider payloads into shared event, activity, or plan contracts before reuse.
- Preserve idempotency and explicit failure handling in sync paths.

## Data and Sync Notes

Mobile to cloud flow:

1. Record locally (SQLite/file storage).
2. Upload JSON to Supabase Storage.
3. Persist metadata records in database.
4. Generate streams/analytics from JSON.

Conflict handling is timestamp-based; JSON remains source of truth.

## Supabase and Auth Notes

- PostgreSQL with RLS.
- Storage for activity JSON payloads.
- Supabase Auth with JWT used by mobile/web.

## Common Implementation Guardrails

- Do not duplicate calculation logic outside `@repo/core`.
- Prefer existing patterns/components/hooks before introducing new abstractions.
- Keep type imports from core when possible.
- Run relevant tests before finalizing.

## Version Snapshot

- Node.js 18+
- Expo SDK 54
- React Native 0.81.5
- Next.js 15
- React 19
- TypeScript 5.9.2
