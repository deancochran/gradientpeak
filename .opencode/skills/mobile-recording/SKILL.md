---
name: mobile-recording
description: Recorder architecture, BLE and FTMS flows, GPS capture, and FIT handoffs for the mobile app
---

# Mobile Recording Skill

## When to Use

- Changing recorder services, controllers, providers, or recording hooks in `apps/mobile`
- Working on BLE, FTMS control, GPS capture, or session-state flow
- Connecting mobile recording output to shared core logic or FIT export

## Scope

This skill covers repo-specific recording architecture.

- Use `mobile-frontend` for screen/UI work.
- Use `garmin-fit-sdk-expert` for low-level FIT encoding details.
- Use `core-package` when logic should move into `@repo/core`.

## Rules

1. Preserve a single recorder ownership path; avoid parallel service state.
2. Keep device control and UI state boundaries explicit.
3. Treat BLE and FTMS commands as stateful integrations with clear failure handling.
4. Keep recording payloads and derived metrics consistent across mobile, core, and export layers.
5. Prefer extending established hooks/providers over adding one-off recorder access paths.

## Repo-Specific Guidance

- Recorder work lives primarily under `apps/mobile/lib/services/ActivityRecorder/` and related hooks/providers.
- GPS, sensor, and trainer-control changes should keep cleanup and reconnection behavior explicit.
- FIT export handoffs should stay aligned with shared activity schemas and core-derived data.

## Avoid

- creating multiple recorder instances for one session
- mixing UI concerns into low-level controller code
- hiding device errors that affect session integrity
- duplicating metric logic outside shared layers

## Quick Checklist

- [ ] recorder ownership stays singular
- [ ] BLE/FTMS failure paths handled
- [ ] cleanup and unsubscribe logic preserved
- [ ] shared schema/core boundaries respected
