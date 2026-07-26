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
pnpm --filter web dev:local
pnpm --filter web dev:tunnel
```

Run the main checks:

```bash
pnpm --filter web check-types
pnpm --filter web build
pnpm --filter web test:e2e
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
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `WAHOO_CLIENT_ID`
- `WAHOO_CLIENT_SECRET`
- `WAHOO_WEBHOOK_TOKEN`
- `TRAININGPEAKS_CLIENT_ID`
- `TRAININGPEAKS_CLIENT_SECRET`
- `GARMIN_CLIENT_ID`
- `GARMIN_CLIENT_SECRET`
- `ZWIFT_CLIENT_ID`
- `ZWIFT_CLIENT_SECRET`

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
