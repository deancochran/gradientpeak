# GradientPeak

GradientPeak is a product monorepo for the web app, mobile app, shared UI, backend APIs, and core training logic.

## What lives here

- `apps/web` contains the active web product.
- `apps/mobile` contains the mobile product.
- `packages/api` contains backend procedures and server-side application logic.
- `packages/core` contains shared domain logic and calculations.
- `packages/ui` contains reusable UI components.
- `packages/db` contains database-related code and local data tooling.

## Getting started

Install dependencies:

```bash
pnpm install
```

Start local development:

```bash
pnpm dev
```

Use package-specific entrypoints when you only need one surface:

```bash
pnpm --filter web dev
pnpm --filter mobile dev
pnpm self-host:up
```

Run the main validation commands before opening a PR:

```bash
pnpm check-types
pnpm lint
pnpm test
```

## Development workflow

1. Create a focused branch for one change.
2. Make the smallest change that solves the problem.
3. Run the relevant checks locally.
4. Open a PR with a short summary of the user-facing outcome.

## Multi-Agent Workflow

- Keep orchestration and review in the root checkout.
- For medium and large efforts, use one Worktrunk worktree per bounded lane under `~/GradientPeak/.worktrees/<branch>`.
- Keep all GradientPeak worktrees inside the repo-local `.worktrees/` directory.
- Use branch names shaped like `spec/<spec-slug>/<lane>` for multi-lane efforts.
- Require merge packets and a fan-in owner before integrating parallel lane outputs.

## Where to go next

- `apps/web/README.md` covers web-specific setup and commands.
- `apps/mobile/README.md` covers mobile-specific setup, testing, and E2E entrypoints.
- `packages/db/README.md` covers database ownership and local DB tooling.
- `provider-onboarding.md` documents the recommended flow for onboarding a new third-party provider starting from the current Wahoo-first setup.

Environment files should live with the owning app or package, not at the repo root.

## Important notes

- Keep shared business logic in `packages/core` when it should work across apps.
- Keep backend and data access changes aligned with `packages/api` and `packages/db`.
- Prefer small, reviewable changes over broad refactors.
- Treat the README as a high-level guide, not a full internal handbook.
- Production web deployment now targets the TanStack Start app in `apps/web`.
