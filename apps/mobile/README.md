# GradientPeak Mobile

The mobile app is the Expo and React Native surface for recording, plans, messaging, notifications, and on-device workflows.

## Local setup

Install workspace dependencies from the repo root:

```bash
pnpm install
```

Keep mobile env files under `apps/mobile/`.

Use `apps/mobile/.env.example` to create `apps/mobile/.env.local`. Common variables used by the app include:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_REDIRECT_URI`
- `EXPO_PUBLIC_GOOGLE_API_KEY`

## Common commands

Run these from the repo root:

```bash
pnpm exec turbo run dev --filter=mobile
pnpm --filter mobile storybook:start
pnpm --filter mobile check-types
pnpm --filter mobile lint
pnpm --filter mobile test
pnpm --filter mobile test:jest
pnpm --filter mobile test:e2e
```

## Android and optional mobile smoke

```bash
pnpm --filter mobile android:dev
pnpm --filter mobile test:e2e
```

`test:e2e` runs one optional app-launch smoke against an already installed development build. It is
not a CI requirement and uses no fixtures.

## Related docs

- `apps/mobile/.maestro/flows/smoke/app-launch.yaml` is the optional smoke flow.
- `README.md` for repo-level workflow and validation commands.
- `packages/db/README.md` for local DB tooling used by app-backed workflows.
