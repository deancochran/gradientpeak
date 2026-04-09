# GradientPeak Web

The web app is the Next.js surface for dashboard, auth callbacks, settings, and browser-based product flows.

## Local setup

Install workspace dependencies from the repo root:

```bash
pnpm install
```

Use `apps/web/.env.example` as the starting point for local web environment values, then copy it to `apps/web/.env.local`.

For the full environment, database, and auth setup flow, see `apps/web/SETUP.md`.

## Common commands

Run these from the repo root:

```bash
pnpm --filter web dev
pnpm --filter web dev:next
pnpm --filter web build
pnpm --filter web check-types
pnpm --filter web lint
pnpm --filter web test:e2e
```

Command notes:

- `pnpm --filter web dev` runs the web app plus the ngrok helper.
- `pnpm --filter web dev:next` runs only Next.js locally.
- `pnpm --filter web test:e2e` runs the Playwright suite.

## Related docs

- `apps/web/SETUP.md` for environment, database, and auth setup.
- `README.md` for repo-level workflow and validation commands.
- `packages/db/README.md` for database ownership and local DB tooling.
