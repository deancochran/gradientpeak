# Mobile E2E Stable Build

## Goal

Replace flaky Expo Dev Client based local Maestro automation with a stable Android-focused E2E build path that keeps developer experience simple.

## Problem

Current local Maestro runs depend on Expo Dev Client launcher state. Even when Metro, `adb reverse`, and deep links work, the emulator can still surface Dev Launcher UI, developer menu onboarding, or overlays before app selectors are available. This makes app-open automation brittle and forces non-app bootstrap logic into test setup.

## Desired outcome

- Maestro runs against a dedicated installable Android E2E build instead of Expo Dev Client.
- Local developer workflow stays short and memorable.
- Manual remote-device development can continue to use the current Dev Client and Tailscale setup.
- Mobile E2E should reuse the normal `pnpm run dev` workflow instead of requiring a second dev-server mode.

## Principles

- Optimize for reliable automation first.
- Keep local commands few and obvious.
- Separate developer-debug runtime from automated-test runtime.
- Avoid pushing Expo launcher behavior into Maestro YAML.
- Prefer one reusable app-ready contract for all mobile flows.

## Recommended direction

### Runtime split

- Keep current Expo Dev Client workflow for normal development.
- Add a dedicated Android E2E build profile without `developmentClient: true`.
- Run Maestro against the installed E2E app binary.

### Local workflow target

Developer should only need a small number of commands:

```bash
pnpm run dev
pnpm --filter mobile android:e2e:install
pnpm --filter mobile test:e2e
```

Optional lower-level commands can exist, but they should not be the primary documented workflow.

### Environment model

- `apps/mobile/.env.local`: manual Dev Client and Tailscale workflow
- Dev Client local development config should remain the primary runtime contract for both manual development and local Maestro runs.

Local Maestro should consume the existing development runtime rather than introduce a second environment model unless CI or release automation later requires it.

## Build strategy options

### Option A: Dedicated E2E debug-style build without Dev Client

Pros:
- Removes Dev Launcher and dev menu from automated runs
- Retains easier local install/debug loop than a full release profile
- Aligns with Expo/EAS guidance seen in community examples

Cons:
- Requires new EAS or local build profile wiring
- Needs explicit install/build scripts

### Option B: Full release build for Maestro

Pros:
- Most production-like
- Lowest launcher/runtime ambiguity

Cons:
- Slower local iteration
- Heavier rebuild cost
- Worse developer experience for frequent local test-debug cycles

### Recommendation

Choose Option A first.

It is the best balance between reliability and developer simplicity. Release builds can remain a later CI hardening option if needed.

## Reusable test contract

Once the E2E build path exists, all mobile Maestro flows should assume:

- app is installable and directly launchable
- no Expo Dev Launcher shell appears
- bootstrap only launches the app and optionally waits for first app selector
- auth setup is handled by in-app selectors, not Dev Client UI

## What to remove over time

- Dev Client specific local bootstrap logic
- launcher shell tap recovery
- prepare steps that manipulate Expo dev menu overlays
- localhost server-row selection logic

## Risks

- E2E build could still accidentally inherit `.env.local` values unless the build path is explicit and isolated
- local build/install time could regress if scripts are not kept tight
- Android-only success may come before iOS parity; this is acceptable if scoped intentionally

## Success criteria

- `pnpm --filter mobile test:e2e` no longer depends on Expo Dev Client launcher UI
- the installed Android E2E app launches directly into app content under Maestro
- no Dev Launcher `Connect`, `Reload`, `Continue`, or dev menu overlay handling remains in common flows
- developer-facing docs fit on one short README page
