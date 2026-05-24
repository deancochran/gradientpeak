# Maestro flows

Use Maestro against an already-running Expo dev-client server by default.

## Local loop

```bash
pnpm run dev:e2e
pnpm --filter mobile android:dev
pnpm --filter mobile android:launch
pnpm --filter mobile test:e2e
```

To reuse your normal development server instead, leave that server running and set the label Maestro should tap in Expo Dev Client when it differs from the Android emulator default:

```bash
EXPO_DEV_SERVER_LABEL="http://192.168.1.20:8081" pnpm --filter mobile test:e2e
```

Run one flow:

```bash
pnpm --filter mobile test:e2e:flow -- .maestro/flows/main/auth_navigation.yaml
```

Run performance budgets:

```bash
pnpm --filter mobile dev:e2e:perf
pnpm --filter mobile test:e2e:perf
```

Performance flows read app-side `perf-metric-*` beacons that are enabled only when `EXPO_PUBLIC_MAESTRO_E2E=1` or `EXPO_PUBLIC_PERF_TEST=1`. Prefer a preview/release-style build for final performance gates because React Native development mode adds runtime overhead.

## Expected runtime

- Metro/dev client should already be running. `pnpm --filter mobile test:e2e` does not start Expo.
- `pnpm --filter mobile dev:e2e` remains available for pipeline-style runs and loads `apps/mobile/.env.e2e` when that file exists.
- Maestro prepares the emulator, reverses local ports, and then runs against the existing dev client session.
- The default server row is `http://10.0.2.2:8081` on Android emulators. Override it with `EXPO_DEV_SERVER_LABEL` or `MAESTRO_EXPO_DEV_SERVER_LABEL` when reusing a LAN dev server.

## Fixtures

Set the vars your flow needs before running Maestro:

- `STANDARD_USER_EMAIL` / `STANDARD_USER_PASS`
- `ONBOARDING_USER_EMAIL` / `ONBOARDING_USER_PASS`
- `SIGNUP_EMAIL` / `SIGNUP_PASSWORD`
- `TARGET_USERNAME`

Use `apps/mobile/.maestro/fixtures.env.example` as the template.

## Flow catalog

- `apps/mobile/.maestro/FLOW_CATALOG.md` maps `apps/mobile/docs/INTERACTION_INVENTORY.md` to Maestro flow files.
- `apps/mobile/.maestro/COVERAGE_MATRIX.md` tracks inventory area -> flow ownership -> validation status.
- Some newer journey files are intentionally unvalidated scaffolds so coverage can be expanded before running the full suite.

## Notes

- `pnpm --filter mobile maestro:prepare` preps the emulator, opens the Expo dev client into the running dev server, and handles the Android-side port reverses before Maestro starts.
- Pipeline runners can set `MAESTRO_SKIP_PREPARE=1`, `MAESTRO_DEVICE_ID`, `MAESTRO_PLATFORM`, `EXPO_DEV_SERVER_LABEL`, and `MAESTRO_APP_ID` as needed.
- `apps/mobile/.maestro/flows/reusable/expo_dev_client_setup.yaml` is the single Expo-specific setup flow; it dismisses transient Dev Client UI before app assertions run.
- `apps/mobile/.maestro/flows/reusable/reset_to_home.yaml` gives flows a neutral authenticated start by returning the app to `Home` before tab-specific navigation.
- `pnpm --filter mobile maestro -- <flow>` is the underlying local Maestro runner. It keeps output under `apps/mobile/.maestro/`.
- `flows/reusable/login.yaml` signs in only when the sign-in screen is actually visible.

## Clean artifacts

```bash
pnpm --filter mobile test:e2e:clean
```
