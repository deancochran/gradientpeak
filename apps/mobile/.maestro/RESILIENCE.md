# Maestro resilience guidance

Maestro can validate harsh runtime conditions, but it needs outer orchestration for device state changes.

## What Maestro should own

- spam taps on submit, send, duplicate, and schedule actions
- app relaunch and warm resume checks
- offline banners, retry affordances, and recovered UI state
- notification inbox and message inbox truth after the app becomes active again
- timeout-based readiness probes for auth, inbox, and relaunch scenarios

## What companion tooling should own

- toggling emulator network state
- killing and relaunching the app between steps
- coordinating multiple actors across multiple devices
- enforcing simple performance budgets

## Practical recipes

- `adb -s <serial> shell svc wifi disable`
- `adb -s <serial> shell svc data disable`
- `adb -s <serial> shell monkey -p com.deancochran.gradientpeak.dev 1`
- `adb -s <serial> shell am force-stop com.deancochran.gradientpeak.dev`

Run those from shell scripts or matrix steps before the relevant Maestro flow.

## Performance sentinel strategy

Use Maestro for budget-style checks, not low-level profiling:

- cold start reaches first actionable auth screen within a timeout
- tabs become visible within a timeout
- message send or plan mutation settles within a timeout

Treat deeper performance work as app instrumentation plus Jest/router tests.

Current repo examples:

- `flows/journeys/resilience/sign_in_invalid_spam_guard.yaml`
- `flows/journeys/resilience/warm_relaunch_authenticated.yaml`
