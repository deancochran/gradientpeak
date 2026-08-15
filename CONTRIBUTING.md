# Contributing to GradientPeak

## First contribution

The full development graph uses the Cloudflare Tunnel for public callbacks. The focused local web lane
does not require a public tunnel, provider credentials, a mobile device, or E2E tooling.

1. Install the pinned tools and dependencies:

   ```bash
   mise trust
   mise install
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

    This starts the web app and Wahoo worker. Open http://localhost:3000 for the web app. On the first
    local Supabase start, run `pnpm db:status` and copy the local API keys into both app environment
    files before restarting the graph.

   For provider OAuth or webhooks, copy `apps/web/.env.tunnel.example` to `apps/web/.env.tunnel`,
   configure the named Cloudflare Tunnel token, run `pnpm run doctor -- --lane dev`, then start
   `pnpm exec turbo run dev`.

5. Make a small scoped change and run its focused check. For example:

   ```bash
   pnpm --filter web check-types
   ```

6. Before integrating a cross-workspace change, run:

   ```bash
   pnpm quality:agent
   ```

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

1. Run the smallest package test, type check, or lint command for the changed area.
2. Run `pnpm verify` when the change spans normal static and test checks.
3. Run `pnpm quality:agent` before integration. Database ownership changes also require the
   relevant database verification from `packages/db/README.md`.

CI additionally verifies generated artifacts, Maestro syntax, live database behavior, and the
production build. It is the final integration signal, not the first command a new contributor runs.
