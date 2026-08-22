# GradientPeak Mobile

The mobile app is the Expo and React Native surface for recording, plans, messaging, notifications, and on-device workflows.

## Local setup

Install workspace dependencies from the repo root:

```bash
pnpm install
```

Keep mobile env files under `apps/mobile/`.

Use `apps/mobile/.env.example` to create `apps/mobile/.env.local` for both normal development and Maestro/E2E. Common variables used by the app include:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_REDIRECT_URI`
- `EXPO_PUBLIC_GOOGLE_API_KEY`

For E2E runs, `pnpm --filter mobile dev:e2e` uses the same `.env.local` values as normal development and adds only the E2E feature flag.

## Common commands

Run these from the repo root:

```bash
pnpm exec turbo run dev --filter=mobile
pnpm --filter mobile storybook:start
pnpm --filter mobile check-types
pnpm --filter mobile lint
pnpm --filter mobile test
pnpm --filter mobile test:jest
pnpm --filter mobile maestro:check
pnpm --filter mobile test:e2e
```

## Android and E2E helpers

```bash
pnpm --filter mobile android:dev
pnpm --filter mobile maestro:prepare
pnpm --filter mobile test:e2e
pnpm --filter mobile test:e2e:flow -- .maestro/flows/main
```

`maestro:check` syntax-checks the maintained smoke suite without a device. Runtime verification is
the separate `test:e2e` command and requires an E2E-enabled dev client plus a provisioned device.
The runner defaults to the development app ID and scheme; set both `MAESTRO_APP_ID` and
`MAESTRO_APP_SCHEME` when targeting preview or production builds.

The shared parity registry records whether a user outcome is tested, implemented but unverified,
missing, or intentionally platform-specific. A successful Maestro command is direct proof for that
run; the wrapper keeps its ordinary JUnit and debug artifacts without writing repository proof files.

## Related docs

- `apps/mobile/scripts/maestro.mjs` wraps Maestro setup, launch, cleanup, and flow execution.
- `README.md` for repo-level workflow and validation commands.
- `packages/db/README.md` for local DB tooling used by app-backed workflows.
