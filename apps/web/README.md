# Web App

This is the active web product for GradientPeak.

- Workspace package name: `web`
- Framework: TanStack Start
- Default local port: `3000`
- Production container entrypoint: `.output/server/index.mjs`

## Local Development

Install dependencies from the workspace root:

```bash
pnpm install
```

Run the web app:

```bash
pnpm exec turbo run dev --filter=web
pnpm --filter web dev:tunnel
pnpm --filter web dev:e2e
```

The default `dev` command runs the app, Wahoo worker, and the named Cloudflare Tunnel for
`https://dev.gradientpeak.com`, so provider callbacks and webhooks work under `pnpm exec turbo run dev`.
Use `dev:local` when you intentionally need the app and worker without public access. The tunneled lane
requires `cloudflared` and the named tunnel token file at
`~/.config/gradientpeak/gradientpeak-dev.tunnel-token` (or the `CLOUDFLARE_TUNNEL_TOKEN_FILE` override).
Create `apps/web/.env.tunnel` from `.env.tunnel.example` before using the tunneled lane. The local-only
lane uses the `localhost` values from `.env.local` and never loads `.env.tunnel`.

The named tunnel must route `dev.gradientpeak.com` to `http://localhost:3000`. Restrict the local token
file to its owner (`chmod 600 ~/.config/gradientpeak/gradientpeak-dev.tunnel-token`). Apply the same
restriction to any path supplied through `CLOUDFLARE_TUNNEL_TOKEN_FILE`.

The E2E server verifies the local database migration ledger before binding to `PORT` (default
`3000`). It fails rather than moving to another port when that port is occupied.

## Local E2E

Playwright runs against the local Supabase database and starts the E2E Vite server on port `3000`.
Local Supabase prerequisites must be available; the harness invokes `@repo/db dev:setup` to ensure
the local service is started and its migration ledger is current. Keep port `3000` available. The
harness provisions and resets only local E2E actors; it refuses remote databases.

Run the full suite from the workspace root:

```bash
pnpm --filter web test:e2e
```

Target one spec or one project through the harness. Do not insert a literal `--` before the
Playwright arguments:

```bash
pnpm --filter web test:e2e e2e/specs/smoke.spec.ts --project="Desktop Chrome" --workers=1
```

On Linux hosts that expose NVIDIA device nodes and have `bwrap` available, the harness runs
Playwright with a private `/dev` and `/dev/shm`. This avoids new browser processes contending for
the host GPU devices; it cannot recover GPU processes already stuck in the kernel. All other hosts
run ordinary Playwright. `PLAYWRIGHT_E2E_DEVICE_ISOLATION=off` disables isolation; `auto` (the
default) requires NVIDIA device exposure; `on` enables isolation on a Linux host whenever `bwrap`
is runnable.

Run the main non-E2E checks:

```bash
pnpm --filter web check-types
pnpm --filter web build
```

## Required Environment

Core web origin and auth:

- `APP_URL`
- `BETTER_AUTH_SECRET`

Database and Supabase:

- `DATABASE_URL`
- `POSTGRES_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PRIVATE_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PRIVATE_SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

OAuth and webhook providers:

- `OAUTH_CALLBACK_BASE_URL`
- `WAHOO_CLIENT_ID`
- `WAHOO_CLIENT_SECRET`
- `WAHOO_WEBHOOK_TOKEN`

### Wahoo OAuth configuration and recovery

The current server-side Wahoo exchange is a confidential OAuth client. Configure the Wahoo
developer application with **Confidential = true**, and register the exact
`https://dev.gradientpeak.com/api/integrations/callback/wahoo` URL for development. Configure
`OAUTH_CALLBACK_BASE_URL=https://dev.gradientpeak.com` without a trailing slash. The public-PKCE flow
requires a separate provider-app configuration and is not interchangeable with this confidential flow.

Configure Wahoo webhook delivery for development at
`https://dev.gradientpeak.com/api/webhooks/wahoo`. Keep `WAHOO_WEBHOOK_TOKEN` in the local environment
file; it is not part of the tunnel configuration.

Wahoo limits each application to 10 unrevoked access tokens per user. Refresh only immediately
before provider API work; after persisting a refreshed token, GradientPeak calls Wahoo's user API
so Wahoo can retire the previous token. CDN file downloads do not retire it. If the cap is reached,
the user must revoke GradientPeak in their Wahoo account (or complete the app's confirmed remote
disconnect) before reconnecting. Wahoo automatically deletes unrevoked tokens after 60 days, but
waiting is not the operational recovery path. See the
[Wahoo authentication documentation](https://cloud-api.wahooligan.com/#authentication).

Never log or paste the client secret, webhook token, authorization code, access token, refresh
token, or raw provider response. Rotate the client secret and webhook token after any disclosure.

Mobile callback and deep-link bridging:

- `AUTH_MOBILE_CALLBACK_URL`
- `AUTH_MOBILE_SCHEME`
- `OAUTH_MOBILE_CALLBACK_URL`
- `AUTH_ALLOWED_DEEP_LINK_PREFIXES`

Email delivery for Better Auth:

- `AUTH_EMAIL_MODE`
- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_REPLY_TO`
- `AUTH_SMTP_HOST`
- `AUTH_SMTP_PORT`
- `AUTH_SMTP_USER`
- `AUTH_SMTP_PASS`
- `AUTH_SMTP_SECURE`

For local Supabase Inbucket delivery, set `AUTH_EMAIL_MODE=smtp` and point SMTP to the local
Inbucket listener. `AUTH_SMTP_USER` and `AUTH_SMTP_PASS` are optional for unauthenticated local
SMTP sinks.

## Production Cutover Checklist

1. Point the public web hostname at the TanStack Start container built from `apps/web/Dockerfile`.
2. Set `APP_URL` to the final public web origin.
3. Set `OAUTH_CALLBACK_BASE_URL` to the same public origin unless a provider-specific callback host is required.
4. Update provider dashboards so OAuth callbacks target `/api/integrations/callback/<provider>` on the new origin.
5. Update Wahoo webhook delivery to `/api/webhooks/wahoo` on the new origin.
6. Update Better Auth email links to the new origin.
7. Run Playwright smoke tests with real service-role credentials before and after the DNS or ingress switch.
