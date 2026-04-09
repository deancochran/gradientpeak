# GradientPeak Mobile

The mobile app is the Expo and React Native surface for recording, plans, messaging, notifications, and on-device workflows.

## Local setup

Install workspace dependencies from the repo root:

```bash
pnpm install
```

Keep mobile env files under `apps/mobile/`.

Use `apps/mobile/.env.example` for normal local development and `apps/mobile/.env.e2e.example` for Maestro/E2E setup. Common variables used by the app include:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_REDIRECT_URI`
- `EXPO_PUBLIC_GOOGLE_API_KEY`

For E2E runs, `pnpm --filter mobile dev:e2e` loads `apps/mobile/.env.e2e` automatically.

## Common commands

Run these from the repo root:

```bash
pnpm --filter mobile dev
pnpm --filter mobile storybook
pnpm --filter mobile check-types
pnpm --filter mobile lint
pnpm --filter mobile test
pnpm --filter mobile test:jest
pnpm --filter mobile test:e2e
```

## Android and E2E helpers

```bash
pnpm --filter mobile android:dev
pnpm --filter mobile android:e2e:build
pnpm --filter mobile generate:maestro
pnpm --filter mobile maestro:lane -- smoke
```

## Related docs

- `apps/mobile/.maestro/README.md` for Maestro flow execution.
- `README.md` for repo-level workflow and validation commands.
- `packages/db/README.md` for local DB tooling used by app-backed workflows.
