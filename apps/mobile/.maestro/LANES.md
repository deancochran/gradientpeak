# Maestro lanes

Use lanes to group plausible runtime scenarios instead of treating every flow as a one-off command.

## Current lanes

- `bootstrap`: dev-client launch and unauthenticated route entry
- `cold-start`: auth, verify-first sign-up, and onboarding startup flows
- `smoke`: fast default regression pass for core app access
- `messaging`: inbox entry and direct-message creation
- `notifications`: notification inbox entry and follow-on assertions
- `social`: profile-level social actions that can feed multi-actor tests
- `discover`: browse and profile-open coverage
- `calendar`: event mutation and calendar-sync coverage
- `plans`: training-plan and activity-plan mutations
- `resilience`: repeated interaction and runtime-entry probes
- `perf-sentinel`: timeout-based readiness checks for perceived responsiveness

## Why lanes help

- Keep local runs fast and intentional.
- Let CI shard by scenario type instead of one giant suite.
- Make it easier to add notifications, messaging, perf, and multiactor coverage without overloading one command.

## Run a lane

```bash
pnpm --filter mobile test:e2e:lane cold-start
pnpm --filter mobile test:e2e:lane plans -- --device emulator-5554
```

## Add a lane

Update `apps/mobile/.maestro/lanes.json` with:

- a stable lane name,
- a short description,
- one or more flow targets.

Prefer lanes that model user intent:

- `messaging`
- `notifications`
- `resilience`
- `perf-sentinel`
- `multiactor-social`

When a scenario needs special devices, accounts, or ordering, promote it into a matrix manifest instead of hiding that complexity inside one flow.
