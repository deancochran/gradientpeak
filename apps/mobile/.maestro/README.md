# Maestro flows

These flows cover real mobile user journeys and should focus on runtime confidence, not component-level behavior already owned by Jest.

## Current coverage model

- `flows/main/`: existing smoke and feature-entry flows
- `flows/reusable/`: shared boot/login helpers
- `flows/journeys/`: domain-specific mutation journeys
- `lanes.json`: named lane manifests for focused local and CI runs
- `matrix/examples/`: multi-actor orchestration examples for multi-device scenarios
- messaging, notifications, and resilience journeys can grow independently of full database seeding

## Required users / data

- `USER_EMAIL` / `USER_PASS`: verified, onboarded user with stable app access
- `ONBOARDING_EMAIL` / `ONBOARDING_PASS`: verified user who has not completed onboarding
- `TARGET_USERNAME`: searchable profile visible in Discover -> Profiles
- `SIGNUP_EMAIL`: optional fixed email when you intentionally want to reuse the same sign-up account

Preferred canonical env names for local runs:

- `STANDARD_USER_EMAIL` / `STANDARD_USER_PASS`
- `ONBOARDING_USER_EMAIL` / `ONBOARDING_USER_PASS`
- `SIGNUP_EMAIL` / `SIGNUP_PASSWORD`
- `TARGET_USERNAME`

The default repo scripts now generate a fresh `SIGNUP_EMAIL` automatically for sign-up flows when you do not provide one.

Multi-actor scenarios should use explicit per-actor env overrides instead of sharing one mutable account.

Use `apps/mobile/.maestro/fixtures.env.example` as the local template.

Repo Maestro wrappers auto-load `apps/mobile/.maestro/fixtures.env` when it exists, and matrix actors can layer additional `--env-file` overlays such as `apps/mobile/.maestro/actors/sender.env` and `apps/mobile/.maestro/actors/receiver.env`.

## Recommended fixture matrix

- `standard_user`
  - own editable training plan
  - own editable activity plan
  - at least one scheduled planned event
  - at least one custom event
  - at least one upcoming goal so Plan tab and charts are meaningful
- `shared_plan_owner`
  - one public training plan
  - one public activity plan
- `discover_profile_user`
  - searchable public profile such as `coachcasey`

## Priority user journeys

- auth navigation
- sign up -> verify
- onboarding happy path
- onboarding skip-heavy path
- messaging inbox open and direct-message creation
- notifications inbox open
- calendar custom event create/edit/delete
- activity plan duplicate and schedule
- training plan duplicate, schedule, and open calendar
- plan tab refresh after schedule changes
- detail-page open/edit/delete flows for events, activity plans, and training plans

## Notes

- Local Expo dev-client Maestro flows bootstrap through the dev shell before interacting with app UI.
- Unauthenticated flows (`auth_navigation`, `forgot_password`, `sign_up_to_verify`, `verify_resend`, `ui_preview`) do not require a pre-seeded session.
- Authenticated mutation flows should prefer shared seeded fixtures instead of creating ad hoc data inside the flow.
- Use stable `testID`s for detail-page actions and mutation CTAs whenever possible.
- Avoid relying on brittle copy when a `testID` exists or can be added safely.
- Use `pnpm --filter mobile test:e2e` or `pnpm --filter mobile test:e2e:flow <flow>` so sign-up flows get unique emails by default.
- Use `pnpm --filter mobile test:e2e:lane <lane>` to run scenario groups like `smoke`, `cold-start`, `messaging`, `notifications`, or `plans`.
- Use `pnpm --filter mobile test:e2e:matrix <matrix.json>` when multiple devices or actors must be coordinated.
- Repo Maestro wrappers now keep test outputs under `apps/mobile/.maestro/artifacts/` and redirect Maestro cache/log bundles into `apps/mobile/.maestro/cache/` instead of the user home directory.
- Set `SIGNUP_EMAIL=...` only when you intentionally want a fixed reusable account.
- Override `MAESTRO_SIGNUP_EMAIL_PREFIX`, `MAESTRO_SIGNUP_EMAIL_DOMAIN`, or pass `--device emulator-5554` through `test:e2e:flow` when coordinating multiple emulators/accounts.
- Prefer immutable rich-data users for browse flows and explicit actor-specific accounts for messaging, notifications, and social actions.

## Run all flows

```bash
pnpm --filter mobile test:e2e
```

## Run one lane

```bash
pnpm --filter mobile test:e2e:lane smoke
```

## Run one flow

```bash
pnpm --filter mobile test:e2e:flow .maestro/flows/main/tabs_smoke.yaml
```

## Reuse a fixed sign-up account

```bash
SIGNUP_EMAIL="gradientpeak.maestro+chat-a@example.com" pnpm --filter mobile test:e2e:flow .maestro/flows/main/sign_up_to_verify.yaml
```

## Run a multi-actor matrix

```bash
pnpm --filter mobile test:e2e:matrix .maestro/matrix/examples/two-actor-auth-smoke.json
```

Copy local env overlays before using reusable actor lanes:

```bash
cp apps/mobile/.maestro/fixtures.env.example apps/mobile/.maestro/fixtures.env
cp apps/mobile/.maestro/actors/sender.env.example apps/mobile/.maestro/actors/sender.env
cp apps/mobile/.maestro/actors/receiver.env.example apps/mobile/.maestro/actors/receiver.env
```

## Clean local Maestro artifacts

```bash
pnpm --filter mobile test:e2e:clean
pnpm --filter mobile test:e2e:clean -- --emulator-log
```

See `apps/mobile/.maestro/LANES.md` for lane ownership and `apps/mobile/.maestro/RESILIENCE.md` for harsh-condition strategy.
