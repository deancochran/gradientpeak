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

For the supported full development environment, install dependencies and start the Turbo task graph:

```bash
mise trust
mise install
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
pnpm run doctor -- --lane dev
pnpm exec turbo run dev
```

`pnpm exec turbo run dev` is the primary development command. It starts the web app, mobile Metro
server, local Supabase setup, Wahoo worker, and the ngrok tunnel required for provider callbacks.
Configure ngrok and the reserved development domain before starting the full development lane.

The first time local Supabase starts, copy its local API keys from `pnpm db:status` into
`apps/web/.env.local` and `apps/mobile/.env`. Re-run `pnpm run doctor -- --lane dev`, then restart
`pnpm exec turbo run dev`. A successful onboarding session has the web app at http://localhost:3000
and no required Doctor failures.

Use a focused Turbo command when you only need one surface:

```bash
pnpm exec turbo run dev --filter=web
pnpm exec turbo run dev --filter=mobile
```

`pnpm dev` remains a convenience wrapper for `pnpm exec turbo run dev`. Use `pnpm dev:web:local` when
you intentionally want the web app and Wahoo worker without ngrok. `pnpm dev:web:tunnel` remains an
explicit web-only alias for the default tunneled web development task.
`pnpm dev:web:scan` is a web-only performance-inspection command.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the first-contribution checklist, environment setup,
verification progression, and specialist lanes.

Run the narrowest relevant check while iterating. Before integration, run the repository gate:

```bash
pnpm --filter web check-types # example focused check
pnpm quality:agent
```

## Development workflow

1. Work from the shared `dev` checkout for normal focused changes.
2. Make the smallest change that solves the problem.
3. Run the relevant checks locally.
4. Commit to `dev` after checks pass; open a PR only for explicit review, release, or hotfix flows.

## Multi-Agent Workflow

- Keep orchestration and review in the root checkout.
- For medium and large efforts, use one worktree per bounded lane under `~/GradientPeak/.worktrees/<branch>`.
- Keep all GradientPeak worktrees inside the repo-local `.worktrees/` directory.
- Use branch names shaped like `spec/<spec-slug>/<lane>` for multi-lane efforts.
- Require merge packets and a fan-in owner before integrating parallel lane outputs.

## Where to go next

- `apps/web/README.md` covers web-specific setup and commands.
- `apps/mobile/README.md` covers mobile-specific setup, testing, and E2E entrypoints.
- `packages/db/README.md` covers database ownership and local DB tooling.

Environment files should live with the owning app or package, not at the repo root. Start from the checked-in `.env.example` files and keep secret-bearing `.env` files untracked.

Git hooks are managed with `lefthook` and install automatically from `pnpm install`.

## Important notes

- Keep shared business logic in `packages/core` when it should work across apps.
- Keep backend and data access changes aligned with `packages/api` and `packages/db`.
- Prefer small, reviewable changes over broad refactors.
- Treat the README as a high-level guide, not a full internal handbook.
- Production web deployment now targets the TanStack Start app in `apps/web`.
