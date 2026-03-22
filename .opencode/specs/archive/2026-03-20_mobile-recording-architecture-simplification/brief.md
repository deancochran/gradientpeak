# Brief: Mobile Recording Architecture Simplification

## Why now

The mobile recorder currently mixes setup, live control, device policy, and save logic across too many mutable surfaces.

Most important drift points:

- `apps/mobile/components/recording/footer/FooterExpandedContent.tsx` exposes too many live configuration entry points.
- `apps/mobile/lib/services/ActivityRecorder/index.ts` owns too many responsibilities.
- `apps/mobile/lib/hooks/useActivitySubmission.ts` rebuilds session meaning after finish instead of consuming one finalized artifact.

The result is a recorder that feels flexible but behaves unpredictably when Bluetooth devices, GPS, plans, and profile data change around an active session.

## Decision

Adopt a snapshot-first recording architecture.

- Create one immutable `RecordingSessionSnapshot` at start.
- Keep runtime changes in a small `RecordingSessionOverride` stream.
- Resolve one canonical source per metric family.
- Finalize one `RecordingSessionArtifact` before submit.
- Move shared decision logic into `@repo/core`.

## What changes

### 1. The source of truth changes

- Before: UI hooks, service state, stream files, and live managers all participate in defining session meaning.
- After: `snapshot + overrides + final artifact` define the session.

### 2. The runtime interaction model shrinks

- Before: activity, GPS, plan, route, sensors, trainer control, and intensity all appear as live configuration surfaces.
- After: the workout exposes one compact summary and one `Adjust Workout` surface.

Allowed runtime adjustments:

- trainer auto/manual,
- intensity scale,
- source recovery/preference,
- plan execution controls like skip or pause progression.

### 3. Submission becomes simpler

- Before: submit-time code rebuilds activity meaning from stream chunks.
- After: submit-time code consumes a finalized artifact produced by the recorder.

## Core invariants

- one active session has one immutable snapshot,
- locked identity fields do not change after start,
- each metric family has one canonical source at a time,
- manual trainer mode overrides automation until explicitly disabled,
- degraded/defaulted data is visible and recorded,
- every submit attempt references the same artifact bundle.

## Key paths

- `apps/mobile/lib/services/ActivityRecorder/index.ts` - main runtime cutover point
- `apps/mobile/lib/services/ActivityRecorder/LiveMetricsManager.ts` - convert to ingestion engine
- `apps/mobile/lib/hooks/useActivitySubmission.ts` - convert to artifact consumer
- `apps/mobile/components/recording/footer/FooterExpandedContent.tsx` - simplify live controls
- `packages/core/utils/recording-config-resolver.ts` - expand shared capability logic
- `packages/core/schemas/activity_payload.ts` - reuse existing profile snapshot direction

## Proposed contract snippets

```ts
type RecordingSessionSnapshot = {
  identity: { sessionId: string; revision: number; startedAt: string };
  activity: {
    category: PublicActivityCategory;
    mode: "free" | "planned";
    gpsMode: "on" | "off";
    eventId: string | null;
    activityPlanId: string | null;
    routeId: string | null;
  };
  profileSnapshot: ProfileSnapshot;
  devices: { selectedSources: MetricSourceSelection[] };
  capabilities: RecordingCapabilities;
};
```

```ts
type RecordingSessionArtifact = {
  sessionId: string;
  snapshot: RecordingSessionSnapshot;
  overrides: RecordingSessionOverride[];
  finalStats: SessionStats;
  fitFilePath: string | null;
  completedAt: string;
};
```

## Delivery plan

1. Define shared recorder contracts in `@repo/core`.
2. Publish canonical snapshots from the mobile recorder service.
3. Centralize source arbitration and fallback policy.
4. Simplify runtime UI to one adjustment surface.
5. Refactor finish/submit around finalized artifacts.
6. Remove duplicate hooks and obsolete event/config paths.

## PR communication standard

Every PR in this workstream should include:

- `Change:` one-sentence summary
- `Paths:` exact files touched
- `Invariant:` what rule this protects
- `Verify:` one focused command or smoke flow

Example:

```md
Change: Freeze plan/event/category identity into a start-time session snapshot.
Paths: `packages/core/schemas/recording-session.ts`, `apps/mobile/lib/services/ActivityRecorder/index.ts`.
Invariant: locked identity fields do not change after start.
Verify: `pnpm --filter mobile test`.
```
