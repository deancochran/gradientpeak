# GPS-free live recording implementation plan

## Goal

New web and mobile recordings never capture GPS. Existing completed activities and provider-ingested activities keep their GPS tracks, maps, and location-derived data. Manual GPS-bearing FIT, GPX, and TCX uploads are unsupported on both apps.

The cutoff deliberately discards unfinished local GPS recordings from earlier app versions. They are not recovered, completed, uploaded, or migrated.

## Guardrails

- This is a hard cut, not a compatibility project.
- Completed server activities and provider-ingested activity data are not rewritten or deleted.
- Manual coordinate-bearing file uploads are rejected before they create an activity.
- The cutoff removes old local recording checkpoints, evidence journals, artifacts, upload queues, and recovery prompts.
- Android Bluetooth scanning must remain usable on supported devices. Older Android versions may still require fine-location permission for Bluetooth discovery, but never for activity tracking.
- Start only after the current uncommitted recording changes are isolated or intentionally incorporated.

## Slice 0: establish the hard-cut baseline

**Purpose:** ensure the GPS cutoff does not absorb unrelated pending work and has proof for what remains supported.

1. Isolate the current pending recording changes in the dev checkout.
2. Capture fixtures for:
   - a new timer/sensor recording with no coordinates;
   - a completed GPS activity with an existing FIT file;
   - a provider-ingested GPS activity;
   - manual GPS-bearing FIT, GPX, and TCX uploads.
3. Confirm current activity detail, provider ingestion, manual upload, and recording tests before changing behavior.

**Acceptance criteria**

- The implementation checkout has only intentional GPS-cutoff changes.
- Tests or repeatable local setups cover each fixture.
- The effect on unfinished old recordings is documented: their local data is intentionally deleted.
- No database migration is needed.

## Slice 1: hard-cut unfinished GPS recordings and manual GPS uploads

**Purpose:** make the data boundary unambiguous.

Use the mobile contract-epoch reset or an equivalent targeted purge to delete obsolete local recording state from the previous GPS-capable recorder. Remove recovery paths for those old drafts.

At the manual-upload boundary, parse FIT, GPX, and TCX files and reject any that contain coordinates. This applies to web and mobile manual uploads only. Provider-sync ingestion must remain unchanged.

**Primary code areas**

- `apps/mobile/lib/contract-epoch/contractEpoch.ts`
- `apps/mobile/lib/contract-epoch/contractEpochReset.ts`
- `apps/mobile/lib/services/mobileRecordingStartup.ts`
- `apps/mobile/lib/services/ActivityRecorder/checkpointStorage.ts`
- `apps/mobile/lib/services/ActivityRecorder/recordingEvidenceJournal.ts`
- `apps/mobile/lib/services/ActivityRecorder/locationBuffer.ts`
- `apps/mobile/lib/providers/ActivityRecorderProvider.tsx`
- `packages/api/src/routers/activity-files.ts`
- `packages/api/src/application/activity-file-ingestion/`
- manual-upload routes and screens in `apps/web` and `apps/mobile`

**Acceptance criteria**

- Updating to the cutoff build removes unfinished old local recording evidence and does not offer recovery.
- A coordinate-bearing manual FIT, GPX, or TCX upload is rejected before activity creation.
- Existing completed GPS activities still load their map and route.
- Provider-synced GPS activities still ingest and display normally.

## Slice 2: prevent GPS collection by new mobile recordings

**Purpose:** make GPS-free recording true at every runtime entry point.

Force GPS off for quick starts, activity-plan launches, route launches, and drafts. A new session must not start foreground location watching, background updates, heading tracking, or GPS buffering. It must not write GPS evidence or FIT coordinate fields.

Keep sensor and trainer support. Use sensor distance and speed when available; otherwise let the athlete add final values during review.

**Primary code areas**

- `apps/mobile/lib/recording/recordingObjectActions.ts`
- `apps/mobile/lib/recording/useRecordScreenController.ts`
- `apps/mobile/lib/stores/activitySelectionStore.ts`
- `apps/mobile/lib/hooks/useActivityRecorder.ts`
- `apps/mobile/lib/services/ActivityRecorder/index.ts`
- `apps/mobile/lib/services/ActivityRecorder/gpsRuntime.ts`
- `apps/mobile/lib/services/ActivityRecorder/location.ts`
- `apps/mobile/lib/services/ActivityRecorder/fitRecordWriter.ts`
- `apps/mobile/lib/services/ActivityRecorder/recordingEvidenceJournal.ts`

**Acceptance criteria**

- No new-session path invokes `watchPositionAsync`, `startLocationUpdatesAsync`, or heading tracking.
- New sessions write no location buffers, GPS envelopes, or FIT coordinates.
- New recordings request no activity-location permission.
- Sensor distance/speed and trainer controls work without GPS state.

## Slice 3: remove live GPS interface and runtime

**Purpose:** remove the visible and native complexity once the hard cutoff is enforced.

Remove the GPS setting, live map, route-following, heading, and turn-by-turn presentation from mobile recording. Keep timer, plans, laps, pause/resume, review, and submission. Keep the web recorder timer-first and use the same capability wording.

Then remove the live location runtime and native setup when no other feature uses it.

**Primary code areas**

- `apps/mobile/app/(internal)/record/index.tsx`
- `apps/mobile/app/(internal)/record/activity.tsx`
- `apps/mobile/components/recording/RecordingActivityQuickEdit.tsx`
- `apps/mobile/components/recording/cockpit/`
- `apps/mobile/app.config.ts`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/lib/services/permissions-check.ts`
- `apps/mobile/lib/services/ActivityRecorder/location.ts`
- `apps/mobile/lib/services/ActivityRecorder/gpsRuntime.ts`
- `apps/mobile/lib/services/ActivityRecorder/locationBuffer.ts`
- `apps/mobile/package.json`
- `pnpm-lock.yaml`
- `apps/web/src/lib/recording/`
- `apps/web/src/routes/_protected/record/`

**Acceptance criteria**

- Neither app offers a live GPS switch, activity-location explanation, live map, route following, or turn-by-turn controls.
- The mobile build has no activity-location or background-location capability.
- Location-only runtime code and dependencies are removed.
- Bluetooth scanning is verified on supported Android versions.

## Verification

Add or update automated coverage for:

1. Cutoff cleanup of old local recording evidence and recovery prompts.
2. Every new mobile launch source producing GPS-free sessions.
3. The absence of location effects, GPS evidence, and FIT coordinates in new recordings.
4. Rejection of manual coordinate-bearing FIT, GPX, and TCX uploads on web and mobile.
5. Route/map display for existing and provider-ingested GPS activities.
6. Web/mobile parity for timer, plans, laps, review, and completion.

Run at minimum:

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
pnpm --filter mobile check-types
pnpm --filter mobile test
pnpm --filter @repo/api check-types
pnpm --filter @repo/api test
pnpm quality:agent
```

Perform runtime checks on iOS and Android:

- Start a new recording and confirm no location prompt appears.
- Pair and scan a BLE sensor, including Android 11 or older if still supported.
- Update with an unfinished old recording and confirm its recovery prompt and local evidence are gone.
- View existing and provider-ingested GPS activities on web and mobile.
- Attempt a manual GPS-bearing upload on both apps and confirm rejection before activity creation.

## Completion criteria

The change is complete when GPS-free recording is enforced by construction, old unfinished recording state is removed, manual GPS uploads are blocked, completed and provider-ingested GPS activities remain viewable, and the mobile build has no live activity-location behavior.
