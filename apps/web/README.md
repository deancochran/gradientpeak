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
pnpm --filter web dev
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
- `NEXT_PUBLIC_APP_URL`
- `BETTER_AUTH_SECRET`

Database and Supabase:

- `DATABASE_URL`
- `POSTGRES_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PRIVATE_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PRIVATE_SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Supabase auth redirect configuration:

- `SUPABASE_AUTH_SITE_URL`
- `SUPABASE_AUTH_WEB_REDIRECT_URL`
- `SUPABASE_AUTH_WEB_REDIRECT_URL_SECURE`

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

- `NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI`
- `NEXT_PUBLIC_MOBILE_REDIRECT_URI`
- `NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK`
- `AUTH_ALLOWED_DEEP_LINK_PREFIXES`
- `EXPO_PUBLIC_APP_SCHEME` or `APP_SCHEME`

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
2. Set `APP_URL` and `NEXT_PUBLIC_APP_URL` to the final public web origin.
3. Set `OAUTH_CALLBACK_BASE_URL` to the same public origin unless a provider-specific callback host is required.
4. Update provider dashboards so OAuth callbacks target `/api/integrations/callback/<provider>` on the new origin.
5. Update Wahoo webhook delivery to `/api/webhooks/wahoo` on the new origin.
6. Update Better Auth email links and Supabase auth redirect settings to the new origin.
7. Run Playwright smoke tests with real service-role credentials before and after the DNS or ingress switch.

## Container Publishing

The production container workflow is defined in:

- `.github/workflows/publish-container.yml`

It now builds:

- `apps/web/Dockerfile`
