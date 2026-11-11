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

## Android smoke versus disposable full journey

```bash
pnpm --filter mobile android:dev
pnpm --filter mobile test:e2e
```

`test:e2e` runs one optional app-launch smoke against an already installed development build. It is
not a CI requirement and uses no fixtures; it is not the plan, calendar, recording, or recovery
acceptance journey.

Run the disposable full native journey from the repository root with the designated runner:

```bash
apps/web mise exec node@24.19.0 -- pnpm exec tsx scripts/run-disposable-acceptance.ts \
  e2e/native/current-candidate.spec.ts --project='Desktop Chrome'
```

The runner owns the disposable backend, `gradientpeak-e2e` emulator, Metro wiring, and the
offline-retry fault. Do not substitute the smoke result for this full UI journey.

## Related docs

- `apps/mobile/.maestro/flows/smoke/app-launch.yaml` is the optional smoke flow.
- `README.md` for repo-level workflow and validation commands.
- `packages/db/README.md` for local DB tooling used by app-backed workflows.
