# Design: Mobile Recording Architecture Simplification

## 1. Objective

Simplify the mobile recording feature so one recording session has one canonical runtime contract, one small set of runtime adjustments, and one reliable finish/submit pipeline.

This work should improve:

- user experience by reducing setup and mid-workout complexity,
- developer experience by collapsing overlapping recorder state and logic,
- data quality by making saved activities reproducible from a stable session snapshot.

## 2. Problem Statement

The current recording stack is capable, but too many concepts can change in too many places during a workout.

Current pain points:

- `apps/mobile/components/recording/footer/FooterExpandedContent.tsx` exposes activity, GPS, plan, route, sensors, trainer control, and intensity adjustments in one recording surface.
- `apps/mobile/lib/services/ActivityRecorder/index.ts` owns lifecycle, activity selection, plan loading, route handling, GPS toggling, trainer automation, FIT generation, and event fan-out.
- `apps/mobile/lib/hooks/useActivityRecorder.ts`, `apps/mobile/lib/hooks/useSimplifiedMetrics.ts`, and `apps/mobile/lib/hooks/useRecordingConfig.ts` reconstruct overlapping views of the same session.
- `apps/mobile/lib/hooks/useActivitySubmission.ts` rebuilds final activity data from stream files after finish instead of consuming one canonical final session contract.
- `packages/core/utils/recording-config-resolver.ts` already contains shared configuration logic, but mobile still derives capabilities in app code.

The result is UX drift, hidden fallback behavior, and increased implementation risk when Bluetooth devices, plans, GPS, and profile-derived metrics interact.

## 3. Current Repo Findings

### A. Key ownership today

- `apps/mobile/lib/services/ActivityRecorder/index.ts` - top-level recording orchestrator and current lifecycle authority.
- `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts` - second stateful engine for live readings, timing, and rolling stats.
- `apps/mobile/lib/services/ActivityRecorder/sensors.ts` - Bluetooth connection, reconnection, parsing, and FTMS bridge.
- `apps/mobile/lib/services/ActivityRecorder/location.ts` - foreground/background GPS and heading plumbing.
- `apps/mobile/lib/services/ActivityRecorder/plan.ts` - separate plan engine that overlaps with plan state still managed in the service.
- `apps/mobile/lib/services/ActivityRecorder/types.ts` - recorder metadata, current readings, and session stats contracts.
- `apps/mobile/app/(internal)/record/index.tsx` - record-screen orchestration and finish navigation.
- `apps/mobile/app/(internal)/record/ftms.tsx` and `apps/mobile/components/recording/ftms/*.tsx` - manual trainer control surfaces.
- `packages/core/utils/recording-config-resolver.ts` - shared capability and validation resolver.
- `packages/core/schemas/activity_payload.ts` - existing `ProfileSnapshotSchema` and `ActivityUploadSchema` that point toward snapshot-based persistence.

### B. Technical symptoms

- Multiple sources of truth exist for the same workout state.
- Session identity can drift after start because runtime config can change while saved metadata stays snapshotted from start.
- Sensor-source arbitration is incomplete, especially when multiple devices emit the same metric.
- Manual trainer control and automatic plan control are conceptually separate, but still coupled through the same service.
- Finish/save behavior depends on file finalization and later reprocessing rather than one finalized session artifact.

## 4. Design Decisions

### A. One immutable session snapshot at start

At start time, the recorder creates one canonical `RecordingSessionSnapshot` and persists it locally before active recording begins.

Example target shape:

```ts
type RecordingSessionSnapshot = {
  sessionId: string;
  revision: number;
  startedAt: string;
  activityCategory: PublicActivityCategory;
  gpsMode: "on" | "off";
  mode: "free" | "planned";
  profileSnapshot: ProfileSnapshot;
  planBinding: {
    eventId?: string;
    activityPlanId?: string;
    routeId?: string;
  } | null;
  sourceSelection: MetricSourceSelection[];
  controlPolicy: {
    trainerMode: "auto" | "manual";
    autoAdvanceSteps: boolean;
  };
  capabilitySnapshot: RecordingCapabilities;
};
```

Identity fields do not mutate after start.

Locked after start:

- activity category,
- GPS mode,
- planned/free mode,
- event binding,
- activity plan binding,
- route binding.

Required snapshot sections:

- `identity` - session id, timestamps, app/build version, recorder revision.
- `activity` - category, mode, GPS mode, event/plan/route bindings.
- `profileSnapshot` - resolved thresholds, zones, defaults applied, profile version/hash if available.
- `devices` - connected devices, controllable trainer capabilities, selected canonical source per metric family.
- `capabilities` - resolved UI and automation capabilities from `@repo/core`.
- `policies` - source policy, control policy, and degraded-mode policy.

Example detailed shape:

```ts
type RecordingSessionSnapshot = {
  identity: {
    sessionId: string;
    revision: number;
    startedAt: string;
    appBuild: string;
  };
  activity: {
    category: PublicActivityCategory;
    mode: "free" | "planned";
    gpsMode: "on" | "off";
    eventId: string | null;
    activityPlanId: string | null;
    routeId: string | null;
  };
  profileSnapshot: {
    ftp?: number;
    thresholdHr?: number;
    thresholdPaceSecondsPerKm?: number;
    weightKg?: number;
    defaultsApplied: string[];
  };
  devices: {
    connected: DeviceDescriptor[];
    controllableTrainer: TrainerDescriptor | null;
    selectedSources: MetricSourceSelection[];
  };
  capabilities: RecordingCapabilities;
  policies: {
    sourcePolicy: MetricSourcePolicy;
    controlPolicy: TrainerControlPolicy;
    degradedModePolicy: DegradedModePolicy;
  };
};
```

### B. Runtime adjustments are explicit overlays

The active workout may expose a small `SessionOverrides` layer, but overrides must not mutate the immutable snapshot.

Allowed runtime adjustments:

- trainer auto/manual mode,
- session intensity scale,
- explicit preferred source when auto-selection fails,
- plan execution actions such as skip, pause progression, or return to plan.

Not allowed as silent runtime mutation:

- profile edits changing thresholds for the current session,
- plan replacement,
- category replacement,
- route replacement,
- GPS identity changes that would alter saved-session meaning.

Recommended override model:

```ts
type RecordingSessionOverride =
  | {
      type: "trainer_mode";
      value: "auto" | "manual";
      scope: "until_changed";
      recordedAt: string;
    }
  | {
      type: "intensity_scale";
      value: number;
      scope: "until_changed";
      recordedAt: string;
    }
  | {
      type: "preferred_source";
      metricFamily: MetricFamily;
      sourceId: string;
      scope: "until_changed";
      recordedAt: string;
    }
  | {
      type: "plan_execution";
      value: "skip_step" | "pause_progression" | "resume_progression";
      scope: "current_session";
      recordedAt: string;
    };
```

The UI should present overrides as session-scoped adjustments, never as profile edits.

### C. One source of truth per metric family

Each metric family must have exactly one canonical live source at a time.

Initial source policy should live in `@repo/core` and be reused by mobile runtime and submission logic.

Example priority rules:

```ts
const sourcePriority = {
  heartRate: ["manual", "chest_strap", "optical", "trainer_passthrough"],
  power: ["manual", "power_meter", "trainer_power"],
  cadence: ["manual", "cadence_sensor", "power_meter", "trainer_cadence"],
  speedOutdoor: ["speed_sensor", "gps"],
  speedIndoor: ["speed_sensor", "trainer_speed", "derived"],
};
```

Rules:

- direct measurement beats derived measurement,
- user pin beats automatic selection,
- source switching uses hysteresis,
- source changes are visible in UI and recorded in session history.

Metric families to standardize explicitly:

- `heart_rate`
- `power`
- `cadence`
- `speed`
- `distance`
- `position`
- `elevation`

Each live metric should carry provenance:

```ts
type MetricProvenance = "actual" | "derived" | "defaulted" | "unavailable";

type CurrentMetricValue = {
  value: number | null;
  sourceId: string | null;
  provenance: MetricProvenance;
  recordedAt: string | null;
};
```

This contract lets the UI explain degraded mode without inventing app-specific heuristics.

### D. Recording UI becomes minimal and state-driven

The recording UI should communicate one compact session summary and one small adjustment surface.

Recommended active-workout controls:

- pause/resume,
- lap if relevant,
- finish,
- `Adjust Workout` sheet.

The `Adjust Workout` sheet should own only:

- trainer auto/manual,
- intensity scale,
- source preference or reconnect action when degraded.

The current tile-heavy configuration grid in `apps/mobile/components/recording/footer/FooterExpandedContent.tsx` should be simplified so recording is not also acting as a setup wizard.

### E. Setup and recording are separate phases

The session lifecycle should be explicit and small:

```ts
type RecordingLifecycleState =
  | "idle"
  | "preparing"
  | "ready"
  | "recording"
  | "paused"
  | "finishing"
  | "finished"
  | "discarded";
```

Guidelines:

- `preparing` warms permissions, device readiness, and snapshot inputs,
- `ready` means the user can start with a validated draft,
- `finishing` finalizes local artifacts before submit navigation,
- network upload is not part of active recording lifecycle.

Parallel substate model:

```ts
type RecordingSessionView = {
  lifecycle: RecordingLifecycleState;
  sensorConnectivity: "stable" | "degraded" | "recovering";
  locationAvailability: "unused" | "searching" | "active" | "lost";
  trainerControl: "unavailable" | "auto" | "manual" | "recovering";
  uploadState: "not_started" | "queued" | "uploading" | "uploaded" | "failed";
};
```

The spec should avoid turning every substate into a user-facing screen. These are implementation and status concepts, not navigation concepts.

### F. `@repo/core` owns decision logic

Move reusable recording logic into `@repo/core`.

Core-owned responsibilities:

- snapshot schemas,
- capability resolution,
- plan requirement validation,
- source arbitration,
- target resolution and display formatting,
- route progress math and fallback behavior,
- invariant validation for session contract integrity.

Mobile-owned responsibilities:

- Bluetooth scanning and connection APIs,
- location APIs and permissions,
- foreground/background services and notifications,
- screen navigation and UI rendering,
- local file IO and upload invocation.

### G. Finish is local finalization first, upload second

The record screen must not navigate to submit until local finalization completes.

Finish phases:

1. stop capture,
2. finalize local FIT and stream artifacts,
3. produce final session artifact,
4. move to submit state,
5. upload asynchronously with retry support.

`apps/mobile/lib/hooks/useActivitySubmission.ts` should consume a finalized session artifact instead of rebuilding core session meaning from stream chunks.

Example finalized artifact:

```ts
type RecordingSessionArtifact = {
  sessionId: string;
  snapshot: RecordingSessionSnapshot;
  overrides: RecordingSessionOverride[];
  finalStats: SessionStats;
  fitFilePath: string | null;
  streamArtifactPaths: string[];
  completedAt: string;
};
```

This artifact should be the only input to submit-time processing.

## 5. Event Model

The recorder should expose a small typed event model that mirrors state ownership rather than leaking subsystem detail into the UI.

Recommended event categories:

- `snapshotUpdated`
- `overrideApplied`
- `sourceChanged`
- `degradedStateChanged`
- `lifecycleChanged`
- `artifactReady`
- `error`

Example:

```ts
type RecordingEventMap = {
  snapshotUpdated: RecordingSessionViewModel;
  overrideApplied: RecordingSessionOverride;
  sourceChanged: MetricSourceSelection;
  artifactReady: RecordingSessionArtifact;
  error: { code: string; message: string; recoverable: boolean };
};
```

The UI should not subscribe directly to `locationManager`, `LiveMetricsManager`, or sensor internals when the session view model can provide the same information.

## 6. Invariants

| Invariant | Why it exists |
| --- | --- |
| One active recording has one `sessionId` and one immutable snapshot | prevents runtime identity drift |
| Locked identity fields never change after start | keeps saved activity reproducible |
| Each metric family has one canonical source at a time | prevents flicker and conflicting analytics |
| Manual trainer mode always overrides automation until explicitly disabled | keeps user intent predictable |
| Defaults and degraded sources are visible and recorded | prevents hidden behavior changes |
| Submit reads one finalized session artifact | removes save-time recomputation drift |
| Core logic is reused across runtime and submission | keeps calculations consistent |
| Every submit attempt references the same `sessionId` artifact bundle | keeps retry behavior idempotent |

## 7. Non-Goals

- Do not redesign visual styling for the record screen in this phase.
- Do not replace BLE or location libraries in this phase.
- Do not introduce cloud-first recording semantics; local-first remains canonical.
- Do not expand runtime controls beyond the minimal adjustment surface.
- Do not preserve every legacy recorder hook if it conflicts with the new source-of-truth model.

## 8. Migration Map

### Current -> target ownership shifts

- `apps/mobile/lib/services/ActivityRecorder/index.ts`
  - before: mutable authority for nearly every recording concern
  - after: orchestrator that publishes canonical session snapshots and delegates to specialized engines
- `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts`
  - before: second stateful authority for readings and timing
  - after: metrics ingestion engine behind snapshot updates
- `apps/mobile/lib/hooks/useActivityRecorder.ts`
  - before: many narrow hooks reconstructing recorder state
  - after: snapshot selector hooks over one canonical session object
- `apps/mobile/lib/hooks/useRecordingConfig.ts`
  - before: recomputes capabilities in mobile
  - after: reads snapshot-derived capabilities from `@repo/core`
- `apps/mobile/lib/hooks/useActivitySubmission.ts`
  - before: recomputes final meaning from files after finish
  - after: submits a finalized session artifact plus file references
- `packages/core/utils/recording-config-resolver.ts`
  - before: partial shared resolver
  - after: primary decision engine for capabilities and fallback rules

### Current code references to anchor implementation

- `apps/mobile/lib/services/ActivityRecorder/index.ts:1191` - start currently requires all permissions, even when session mode may not need them.
- `apps/mobile/lib/services/ActivityRecorder/index.ts:1200` - current start-time metadata snapshot boundary.
- `apps/mobile/lib/services/ActivityRecorder/index.ts:1457` - activity/payload initialization boundary that currently allows config drift.
- `apps/mobile/lib/services/ActivityRecorder/index.ts:1521` - current manual-control override boundary.
- `apps/mobile/lib/services/ActivityRecorder/index.ts:1696` - sensor ingress boundary.
- `apps/mobile/lib/services/ActivityRecorder/index.ts:1723` - location ingress boundary.
- `apps/mobile/lib/hooks/useActivitySubmission.ts:367` - submit-time processing entry point.
- `apps/mobile/lib/hooks/useActivitySubmission.ts:401` - current stream aggregation path that should stop being the primary meaning builder.
- `packages/core/schemas/activity_payload.ts:127` - existing `ProfileSnapshotSchema` anchor.
- `packages/core/utils/recording-config-resolver.ts:26` - shared resolver entry point to expand rather than duplicate.

## 9. Risks

- Recorder refactor touches a broad set of mobile paths.
- Existing UI hooks may rely on current event fan-out and need a temporary adapter layer.
- Submission and FIT finalization are tightly coupled to current service metadata.
- Bluetooth/FTMS regressions are likely if source arbitration and trainer-control boundaries are not explicit.

Mitigation:

- phase the cutover,
- add adapter APIs temporarily,
- validate with focused manual recording smoke tests,
- keep runtime snapshot and upload artifact contracts small and explicit.

## 10. Success Criteria

- One canonical recording snapshot contract exists and is used end to end.
- The active workout exposes one minimal adjustments surface instead of many live configuration entry points.
- Runtime profile changes do not silently alter the active session.
- Source selection and fallback rules are centralized and deterministic.
- Finish creates a finalized local artifact before submit navigation.
- Core package owns shared recording calculations and validation logic used by mobile runtime and submission.
