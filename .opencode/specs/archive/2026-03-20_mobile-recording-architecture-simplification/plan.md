# Implementation Plan: Mobile Recording Architecture Simplification

## 1. Strategy

Implement the simplification in six phases:

1. define canonical recording contracts in `@repo/core`,
2. introduce snapshot-driven session state in the mobile recorder,
3. centralize source selection and runtime override policy,
4. simplify record-screen setup and active-workout controls,
5. align finish/submission with finalized local artifacts,
6. remove obsolete hooks, duplicate derivations, and dead interaction paths.

This plan keeps recording local-first, reduces mutable runtime state, and limits user-facing mid-workout interactions to explicit, high-value adjustments.

## 2. Target Architecture

### A. Core contracts

Add or extend shared contracts under `packages/core/` for:

- `RecordingLaunchIntent`
- `RecordingSessionSnapshot`
- `RecordingSessionOverride`
- `RecordingSessionArtifact`
- `MetricSourceSelection`
- `MetricProvenance`
- source-priority and fallback resolvers
- plan requirement validation

Recommended new package-local file shape:

```text
packages/core/
  schemas/
    recording-session.ts
    recording-session.test.ts
    recording_config.ts
  utils/
    recording-config-resolver.ts
    recording-source-resolver.ts
    recording-target-resolver.ts
    recording-route-progress.ts
```

### B. Mobile runtime layers

- `ActivityRecorderService` becomes the runtime coordinator and snapshot publisher.
- `LiveMetricsManager` becomes an input and rolling-stats engine only.
- `sensors.ts` and `location.ts` remain integration adapters, not policy owners.
- hooks become selectors over canonical session state.
- record-screen components become view-only or action-only consumers of session state.

### C. Finish and submission

- recorder finalizes one local artifact before navigation to submit,
- submit flow reads one finalized artifact and file references,
- upload is retryable and does not redefine activity meaning.

### D. Team-facing implementation rule

Every change in this refactor should include:

- a short summary of what changed,
- the owning path or paths,
- the invariant being protected,
- the narrowest verification step used.

## 3. Planned File Changes

### A. New or expanded core contracts

- `packages/core/schemas/activity_payload.ts`
- `packages/core/schemas/recording-session.ts`
- `packages/core/schemas/recording_config.ts`
- `packages/core/utils/recording-config-resolver.ts`
- `packages/core/utils/recording-source-resolver.ts`
- `packages/core/utils/recording-target-resolver.ts`
- `packages/core/utils/recording-route-progress.ts`

### B. Recorder runtime cut points

- `apps/mobile/lib/services/ActivityRecorder/index.ts`
- `apps/mobile/lib/services/ActivityRecorder/types.ts`
- `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts`
- `apps/mobile/lib/services/ActivityRecorder/sensors.ts`
- `apps/mobile/lib/services/ActivityRecorder/location.ts`
- `apps/mobile/lib/services/ActivityRecorder/plan.ts`
- `apps/mobile/lib/services/ActivityRecorder/StreamBuffer.ts`

### C. Hook and provider cutover

- `apps/mobile/lib/providers/ActivityRecorderProvider.tsx`
- `apps/mobile/lib/hooks/useActivityRecorder.ts`
- `apps/mobile/lib/hooks/useSimplifiedMetrics.ts`
- `apps/mobile/lib/hooks/useRecordingConfig.ts`
- `apps/mobile/lib/hooks/useActivitySubmission.ts`

### D. UI simplification touchpoints

- `apps/mobile/app/(internal)/record/index.tsx`
- `apps/mobile/app/(internal)/record/submit.tsx`
- `apps/mobile/app/(internal)/record/ftms.tsx`
- `apps/mobile/components/recording/footer/FooterExpandedContent.tsx`
- `apps/mobile/components/recording/footer/IntensityScaling.tsx`
- `apps/mobile/components/recording/zones/RecordingZones.tsx`
- `apps/mobile/components/recording/zones/ZoneA.tsx`
- `apps/mobile/components/recording/zones/ZoneB.tsx`
- `apps/mobile/components/recording/zones/ZoneC.tsx`
- `apps/mobile/components/recording/ftms/*.tsx`

## 4. Migration Phases

### Phase 1: Canonical session contract

Define the new shared types and invariants in `@repo/core`.

Deliverables:

- immutable start snapshot schema,
- runtime override schema,
- finalized artifact schema,
- source-provenance and source-selection contracts,
- validation helpers for start-time capability checks.

Target contract example:

```ts
export const recordingSessionArtifactSchema = z.object({
  sessionId: z.string().min(1),
  snapshot: recordingSessionSnapshotSchema,
  overrides: z.array(recordingSessionOverrideSchema),
  finalStats: sessionStatsSchema,
  fitFilePath: z.string().nullable(),
  streamArtifactPaths: z.array(z.string()),
  completedAt: z.string(),
});
```

Success condition:

- mobile and submission code can reference one shared session vocabulary.

### Phase 2: Service snapshot publication

Restructure `ActivityRecorderService` so it publishes a canonical session snapshot instead of requiring UI and hooks to rebuild session state.

Key actions:

- add explicit lifecycle states including `preparing`, `ready`, and `finishing`,
- create the immutable snapshot before active recording starts,
- keep overrides in a separate mutable layer,
- make `LiveMetricsManager` feed snapshot updates instead of acting like a second authority.

Success condition:

- one service API can answer "what is the current session state?" without hook-level reconstruction.

Target service shape:

```ts
interface RecordingSessionController {
  getSnapshot(): RecordingSessionSnapshot | null;
  getView(): RecordingSessionViewModel;
  applyOverride(input: RecordingSessionOverrideInput): void;
  finalize(): Promise<RecordingSessionArtifact>;
}
```

### Phase 3: Source arbitration and runtime policy

Move source priority, fallback logic, and target resolution into shared core helpers and consume them from mobile runtime.

Key actions:

- resolve one canonical source per metric family,
- add hysteresis or equivalent anti-flapping rules,
- separate trainer control policy from metric-source policy,
- record degradation and source-switch events in the session model.

Success condition:

- duplicate sources no longer cause ad hoc or hidden selection behavior.

Concrete rule set to implement first:

- `heart_rate`: chest strap -> optical wearable -> trainer passthrough
- `power`: power meter -> trainer power -> unavailable
- `cadence`: cadence sensor -> power meter cadence -> trainer cadence
- `speed/distance outdoor`: speed sensor -> GPS
- `speed/distance indoor`: speed sensor -> trainer speed -> derived

### Phase 4: Setup and active-workout UX simplification

Reduce the record-screen interaction model.

Key actions:

- move setup concerns out of active recording where possible,
- replace tile-heavy runtime configuration with a compact summary plus one `Adjust Workout` surface,
- limit runtime adjustments to trainer mode, intensity scaling, and source recovery/preference,
- remove or hide incomplete flows that imply unsupported runtime reconfiguration.

Success condition:

- the user can understand the current workout state and available actions in one glance.

### Phase 5: Finish and submit alignment

Refactor finish so the record screen does not navigate forward until local finalization is complete.

Key actions:

- add a finalized session artifact handoff,
- reduce save-time recomputation in `useActivitySubmission`,
- keep retryable upload semantics and local artifact preservation until success or explicit discard.

Success condition:

- saved activities derive from the same session contract the user saw while recording.

Migration note:

- keep `StreamBuffer` and FIT generation as persistence mechanisms,
- stop using chunk aggregation as the primary source of session meaning.

### Phase 6: Cleanup and obsolete-path removal

Remove duplicate or transitional layers once the new model is stable.

Examples:

- duplicated capability derivation,
- overlapping simplified metrics facades,
- event escapes that bypass typed contracts,
- record-screen interactions that no longer fit the minimal model.

Success condition:

- the recorder has one clear set of contracts and fewer public surfaces.

## 5. Migration Notes

### Temporary compatibility layer

During rollout, it is acceptable to keep adapter selectors that map the new snapshot to older hook shapes, but:

- adapters must be marked temporary,
- tasks must include explicit cleanup,
- new UI work must consume the snapshot-first API.

### Session snapshot example

```ts
const snapshot = buildRecordingSessionSnapshot({
  intent,
  profileSnapshot,
  planBinding,
  sourceSelection,
  capabilitySnapshot,
});
```

### Example developer handoff note

```md
Change: Add canonical recording artifact schema.
Paths: `packages/core/schemas/recording-session.ts`, `apps/mobile/lib/hooks/useActivitySubmission.ts`.
Why: submit-time processing must consume finalized session meaning instead of rebuilding from stream chunks.
Verify: `pnpm --filter @repo/core test`.
```

### Runtime override example

```ts
applySessionOverride({
  type: "trainer_mode",
  value: "manual",
  scope: "until_changed",
});
```

## 6. Validation Plan

### Focused commands

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
pnpm --filter mobile check-types
pnpm --filter mobile test
```

### Manual smoke flows

- free workout with GPS on and no sensors,
- indoor workout with GPS off and no sensors,
- planned FTMS workout with auto control,
- manual trainer override then return to auto,
- redundant sensor setup with deterministic source selection,
- finish -> submit -> retry upload after a forced failure,
- interrupted session recovery from local artifacts.

### Review checklist for each implementation PR

- name the invariant being protected,
- name whether the change affects snapshot, overrides, source policy, or artifact finalization,
- link the exact file paths touched,
- include one focused test or smoke flow.

## 7. Rollback and Risk Notes

- prefer additive contract introduction before deleting old hook surfaces,
- do not mix snapshot cutover with unrelated visual redesign work,
- keep upload/retry behavior stable while replacing internal artifact contracts,
- validate BT/GPS edge cases before removing old fallbacks.

## 8. Completion Definition

- recording uses a canonical session snapshot and explicit override layer,
- active recording exposes a minimal interaction model,
- shared core logic owns source arbitration and capability decisions,
- finish and submit consume one finalized artifact pipeline,
- duplicate state reconstruction paths are removed or deprecated with explicit cleanup tasks.
