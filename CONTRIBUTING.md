# Contributing to GradientPeak

## First contribution

The full development graph uses the Cloudflare Tunnel for public callbacks. The focused local web lane
does not require a public tunnel, provider credentials, a mobile device, or E2E tooling.

1. Install the pinned tools and dependencies:

   Activate mise first so `node` and `pnpm` resolve to the project versions. For Bash, add
   `eval "$(mise activate bash)"` to `~/.bashrc` once and open a new terminal.

   ```bash
   mise trust
   mise install
   node --version
   pnpm install
   ```

2. Create local app configuration without committing it:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   cp apps/mobile/.env.example apps/mobile/.env
   ```

3. Install and start Docker Desktop or Docker Engine, then confirm `docker info` succeeds before
   running the preflight. For local-only web development:

   ```bash
pnpm run doctor -- --lane web
   ```

   Doctor must report no required failures. It checks the pinned Node and pnpm versions, Docker,
   Supabase, and local environment files.

4. Start local-only web development:

   ```bash
pnpm dev:web:local
   ```

    This starts the web app and the Wahoo/Garmin provider drain worker. Open http://localhost:3000 for the web app. On the first
    local Supabase start, run `pnpm db:status` and copy the local API keys into both app environment
    files before restarting the graph.

   For provider OAuth or webhooks, copy `apps/web/.env.tunnel.example` to `apps/web/.env.tunnel`,
   configure the named Cloudflare Tunnel token, run `pnpm run doctor -- --lane dev`, then start
   `pnpm exec turbo run dev`.

5. Make a small scoped change and run its focused check. For example:

   ```bash
   pnpm --filter web check-types
   ```

6. Use the verification guidance below; do not run every command for every edit.

## Choose a lane

| Need | Start here |
| --- | --- |
| Full local development | `pnpm exec turbo run dev` |
| Web only | `pnpm exec turbo run dev --filter=web` |
| Mobile Metro only | `pnpm exec turbo run dev --filter=mobile` |
| Web without a public tunnel | `pnpm dev:web:local` |
| Public provider callback or webhook | Included in `pnpm exec turbo run dev`; configure Cloudflare Tunnel and provider credentials first |
| Web E2E | `apps/web/README.md` |
| Mobile device/E2E | `apps/mobile/README.md` |
| Database or schema work | `packages/db/README.md` |

`pnpm dev` is a convenience wrapper for `pnpm exec turbo run dev`. The normal web `dev` task includes
the Cloudflare Tunnel for `https://dev.gradientpeak.com`, so provider callbacks work. Use
`pnpm dev:web:local` to opt out.

## Environment rules

- Keep environment files with the owning app or package; never commit local `.env` files.
- Local Supabase supplies the local URL and keys. Use `pnpm db:status` after it starts.
- The full development lane requires the configured Cloudflare Tunnel for provider OAuth and webhooks.
  Use the focused local web lane when public callback support is intentionally unnecessary.
- Use `pnpm run doctor -- --lane web`, `mobile`, `db`, or `e2e` for a lane-specific preflight.

## Verification progression

- While iterating, run the owning package's test or type check, for example
  `pnpm --filter web check-types`. Add a regression test when behavior changes;
  do not duplicate the same assertion across every test layer.
- For cross-package changes, `pnpm verify` runs static checks and tests. Use
  `pnpm quality:agent` when changed-path-selected runtime verification is needed.
  These commands overlap: choose the appropriate one rather than running both.
- Database changes require the relevant verification in `packages/db/README.md`.
  Never reset a preserved/shared database to make a check pass.
- CI runs static checks, tests, and the production build once, with database and
  browser checks in their selected lanes. The required `Basic checks` status
  remains fail-closed. Security checks remain independent.

Lefthook installs during `pnpm install`. Pre-commit formats/lints staged files;
there is no pre-push suite. A successful push is not acceptance evidence.

## Code and documentation

- Keep routes and screens in apps, reusable domain logic in `packages/core`,
  API orchestration in `packages/api`, and reusable primitives in `packages/ui`.
- Prefer a small direct implementation over a new framework, wrapper, or script.
  Extract shared code when there are real callers, not hypothetical reuse.
- Keep setup here, package-specific details in the owning README, and durable
  contracts/runbooks in `docs`. Avoid copying the same instructions across files.
- Record notable changes in `CHANGELOG.md`. Keep task progress, raw test output,
  generated catalog PDFs, and review screenshots out of the repository. Previous
  reports remain recoverable through Git history.
- Do not remove migrations, the lockfile, generated contracts consumed by the app,
  or safety checks merely because they are generated or inconvenient.
