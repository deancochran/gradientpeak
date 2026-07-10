# Maestro flows

Use Maestro against an already-running Expo dev-client server by default.

## Local loop

```bash
pnpm run dev:e2e
pnpm --filter mobile android:dev
pnpm --filter mobile android:launch
pnpm --filter mobile test:e2e
```

## Durable E2E evidence

All Playwright and Maestro artifacts are retained outside the worktree at
`~/GradientPeak/e2e-artifacts/<run-id>/`. This keeps screenshots, debug output,
HTML reports, and CI JUnit reports available after the worktree is cleaned.

Maestro needs an already-running Android emulator or iOS simulator with the
GradientPeak dev client installed and connected to Metro before any flow can run.
Use the local loop above to prepare that device; the wrapper does not start Expo.

Run an evidence flow with a stable run ID and a ticket (or `ad-hoc`) video scope:

```bash
E2E_RUN_ID=gp-123-tabs E2E_VIDEO_SCOPE=gp-123 \
  pnpm test:e2e:mobile:flow .maestro/flows/evidence/main_tabs_recording.yaml
```

The evidence flow reuses the authenticated-home setup, records the main-tab
journey, and writes named screenshots to the run artifacts. Its video is written
to `~/GradientPeak/videos/gp-123/gp-123-tabs-main-tabs.mp4`. It uses fixture
environment variables only; no credentials are stored in the flow.

The artifact root is fixed at `~/GradientPeak/e2e-artifacts`; `E2E_ARTIFACT_ROOT`
and legacy `MAESTRO_ARTIFACT_DIR`, `MAESTRO_DEBUG_OUTPUT`, and
`MAESTRO_TEST_OUTPUT_DIR` overrides are rejected. `E2E_RUN_ID` and
`E2E_VIDEO_SCOPE` accept letters, numbers, dots, underscores, and hyphens.
The wrapper checks real paths after directory creation and rejects symlink escapes.

Local Maestro runs generate `report.html`; CI runs generate `junit.xml`. Both
live in `~/GradientPeak/e2e-artifacts/<run-id>/maestro/` alongside debug and test
output. Maestro 2.3.0 supports the HTML report format used by the wrapper.

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
- `pnpm --filter mobile maestro -- <flow>` is the underlying local Maestro runner. It keeps output under `~/GradientPeak/e2e-artifacts/<run-id>/maestro/`.
- `flows/reusable/login.yaml` signs in only when the sign-in screen is actually visible.

## Clean artifacts

```bash
E2E_RUN_ID=gp-123-tabs pnpm --filter mobile test:e2e:clean
```

Cleanup removes only that Maestro run directory. Evidence directories under
`~/GradientPeak/e2e-artifacts/` and review videos under `~/GradientPeak/videos/`
are durable local evidence and must be removed deliberately; neither is written
to the repository or outside `~/GradientPeak`.

Run the path-safety checks without a device:

```bash
pnpm test:e2e:artifacts
```
