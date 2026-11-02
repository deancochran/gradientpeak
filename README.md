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

Activate mise in your shell first so every command uses the versions in `mise.toml`. For Bash, add
`eval "$(mise activate bash)"` to `~/.bashrc` once and open a new terminal.

```bash
mise trust
mise install
node --version # must satisfy the version in package.json
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
pnpm run doctor -- --lane dev
pnpm exec turbo run dev
```

`pnpm exec turbo run dev` is the primary development command. It starts the web app, mobile Metro
server, local Supabase setup, the Wahoo and Garmin training drain worker, and the Cloudflare Tunnel required for provider callbacks.
The tunnel serves `https://dev.gradientpeak.com`; configure `cloudflared` and its named-tunnel token
before starting the full development lane. Copy `apps/web/.env.tunnel.example` to
`apps/web/.env.tunnel` to load the public callback origin only in that lane.

The first time local Supabase starts, copy its local API keys from `pnpm db:status` into
`apps/web/.env.local` and `apps/mobile/.env`. Re-run `pnpm run doctor -- --lane dev`, then restart
`pnpm exec turbo run dev`. A successful onboarding session has the web app at http://localhost:3000
and no required Doctor failures. The persistent manual lane is available over Tailscale at
`http://100.119.109.24:3000` (web/API) and `http://100.119.109.24:8081` (Metro).

Use a focused Turbo command when you only need one surface:

```bash
pnpm exec turbo run dev --filter=web
pnpm exec turbo run dev --filter=mobile
```

`pnpm dev` remains a convenience wrapper for `pnpm exec turbo run dev`. Use `pnpm dev:web:local` when
you intentionally want the web app and provider drain worker without a public tunnel. `pnpm dev:web:tunnel` remains an
explicit web-only alias for the default tunneled web development task.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the first-contribution checklist, environment setup,
verification progression, and specialist lanes.

See [docs/local-environments.md](./docs/local-environments.md) for the isolated manual and E2E
ports, database lifecycle, emulator routing, cache namespaces, and targeted shutdown command.

See [docs/development-errors.md](./docs/development-errors.md) for sanitized local API error diagnostics and the agent-friendly `pnpm dev:errors` command.

Run the narrowest relevant check while iterating. Before integration, run the repository gate:

```bash
pnpm --filter web check-types # example focused check
pnpm quality:agent
```

## Development workflow

1. Fetch `origin/main` and create a dedicated feature branch/worktree from its current commit.
2. Make and verify the smallest coherent change in that feature worktree; never edit the main preview checkout.
3. Push the feature branch and open a pull request targeting `main` within the user's authorized task.
4. After local verification and independent review, enable GitHub auto-merge for that PR. Required CI/security checks and resolved review conversations remain mandatory; never bypass them.
5. Refresh the local main preview only from remotely merged `origin/main`, using the coordination workspace's `refresh-main-preview` command. No local feature merges, automatic stashes, resets, or database migrations.

The former shared `dev` branch and old worktrees are recovery sources, not the integration lane. During the one-time baseline transition, new work must not assume the reconciliation candidate is already merged.

## Multi-Agent Workflow

- Keep orchestration and review in the coordination workspace.
- Use one worktree per feature under the coordination workspace's `.worktrees/` directory, based on current `origin/main`.
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
