# Maestro flows

Use Maestro against the localhost E2E dev-client server.

## Local loop

```bash
pnpm run dev:e2e
pnpm --filter mobile android:dev
pnpm --filter mobile android:launch
pnpm --filter mobile test:e2e
```

Run one flow:

```bash
pnpm --filter mobile test:e2e:flow -- .maestro/flows/main/auth_navigation.yaml
```

## Expected runtime

- Metro/dev client should already be running from `pnpm run dev:e2e`, which loads `apps/mobile/.env.e2e` before starting Expo.
- Maestro prepares the emulator and then runs against that existing dev client session.
- The visible local server row in Expo Dev Client should be `http://localhost:8081` on Android emulators.

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

- `pretest:e2e` and `pretest:e2e:flow` run `generate:maestro` automatically.
- `pnpm --filter mobile maestro:prepare` preps the emulator, opens the Expo dev client into the running dev server, and handles the Android-side port reverses before Maestro starts.
- `apps/mobile/.maestro/flows/reusable/expo_dev_client_setup.yaml` is the single Expo-specific setup flow; it dismisses transient Dev Client UI before app assertions run.
- `apps/mobile/.maestro/flows/reusable/reset_to_home.yaml` gives flows a neutral authenticated start by returning the app to `Home` before tab-specific navigation.
- `pnpm --filter mobile maestro -- <flow>` is the underlying local Maestro runner. It keeps output under `apps/mobile/.maestro/`.
- `flows/reusable/login.yaml` signs in only when the sign-in screen is actually visible.

## Clean artifacts

```bash
pnpm --filter mobile test:e2e:clean
```
