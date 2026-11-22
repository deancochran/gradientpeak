import {
  type CompiledActivityPlanOccurrence,
  compileActivityPlan,
  PORTABLE_WEB_RECORDING_SCHEMA_VERSION,
  type PortableWebRecordingArtifact,
  type PortableWebRecordingReview,
  portableWebRecordingArtifactSchema,
  type RecordingExecutionManifest,
} from "@repo/core";
import { assertRealRecordingExecution } from "@repo/core/recording/execution-evidence";
import {
  primaryRecordingGuidancePlan,
  primaryRecordingGuidanceRoute,
  type RecordingGuidanceTimeline,
} from "@repo/core/recording/guidance";
import {
  type MeasuredRecordingJournal,
  measuredJournalWithinBounds,
  measuredRecordingJournalSchema,
  measuredRecordingPoints,
} from "@repo/core/recording/measured-journal";
import type { TimerOnlyRecordingState } from "./timer-runtime";

type Digest = (value: string) => Promise<string>;

export async function finalizeTimerRecordingArtifact({
  digest = sha256Text,
  ownerId,
  review,
  segmentId,
  sessionRpeOperationId = null,
  state,
  measuredJournal,
  execution,
}: {
  digest?: Digest;
  ownerId: string;
  review: PortableWebRecordingReview;
  segmentId: string;
  sessionRpeOperationId?: string | null;
  state: TimerOnlyRecordingState;
  measuredJournal?: unknown;
  execution?: unknown;
}): Promise<PortableWebRecordingArtifact> {
  assertRealRecordingExecution(state);
  assertRealRecordingExecution({ execution });
  const snapshot = state.reducer.snapshot;
  const startedAtMs = state.timer.startedAtMs;
  const finishedAtMs = state.timer.endedAtMs;
  if (state.reducer.lifecycle !== "finished" || !snapshot || startedAtMs === null) {
    throw new Error("Only a finished recording with a locked snapshot can be finalized.");
  }
  if (finishedAtMs === null || finishedAtMs <= startedAtMs) {
    throw new Error("A finalized recording requires a valid finish timestamp.");
  }

  const elapsedMs = finishedAtMs - startedAtMs - state.timer.excludedElapsedMs;
  const movingMs = Math.min(elapsedMs, state.timer.accumulatedMovingMs);
  const finishedAt = new Date(finishedAtMs).toISOString();
  const measured =
    measuredJournal === undefined
      ? undefined
      : measuredRecordingJournalSchema.parse(measuredJournal);
  if (
    measured &&
    !measuredJournalWithinBounds(measured, snapshot.identity.startedAt, finishedAt, true)
  )
    throw new Error("Measured samples are outside the finalized recording boundary.");
  const fileText = buildTimerTcx({
    activity_category: snapshot.activity.activity_category,
    distanceMeters: review.distanceMeters,
    distanceEnteredManually: review.distanceEnteredManually === true,
    elapsedSeconds: elapsedMs / 1_000,
    execution: state.planExecution,
    ...(state.guidance ? { guidance: state.guidance } : {}),
    laps: state.planExecution?.laps ?? [],
    name: review.name,
    startedAt: snapshot.identity.startedAt,
    finishedAt,
    ...(measured ? { measuredJournal: measured } : {}),
  });

  return portableWebRecordingArtifactSchema.parse({
    schemaVersion: PORTABLE_WEB_RECORDING_SCHEMA_VERSION,
    ownerId,
    recordingSessionId: snapshot.identity.sessionId,
    segmentId,
    snapshot,
    startedAt: snapshot.identity.startedAt,
    finishedAt,
    elapsedMs,
    movingMs,
    excludedElapsedMs: state.timer.excludedElapsedMs,
    ...(state.planExecution ? { planExecution: state.planExecution } : {}),
    ...(state.guidance ? { guidance: state.guidance } : {}),
    ...(measured ? { measuredJournal: measured } : {}),
    fileName: `gradientpeak-${snapshot.identity.sessionId}.tcx`,
    fileText,
    sha256: await digest(fileText),
    review,
    sessionRpeOperationId,
  });
}

export function buildUploadedRecordingSummaryInput(
  artifact: PortableWebRecordingArtifact,
  upload: { ingestionId: string },
) {
  assertRealRecordingExecution(artifact);
  const occurrences = buildExecutionManifestOccurrences(artifact);
  const primaryPlan = artifact.guidance
    ? primaryRecordingGuidancePlan(artifact.guidance)
    : artifact.snapshot.planExecution;
  return {
    profileId: artifact.ownerId,
    recordingSessionId: artifact.recordingSessionId,
    name: artifact.review.name,
    notes: artifact.review.notes,
    startedAt: artifact.startedAt,
    finishedAt: artifact.finishedAt,
    activityPlanId: primaryPlan?.activityPlanId ?? artifact.snapshot.activity.activityPlanId,
    ...(primaryPlan ? { planExecution: primaryPlan } : {}),
    ...(artifact.guidance ? { guidance: artifact.guidance } : {}),
    routeId: artifact.guidance
      ? primaryRecordingGuidanceRoute(artifact.guidance)
      : artifact.snapshot.activity.routeId,
    executionManifest: {
      version: 1 as const,
      compilerVersion: 3 as const,
      planHash: primaryPlan?.structureHash.replace("v1:sha256:", "") ?? artifact.sha256,
      occurrences,
    },
    laps: buildPersistedManualLaps(artifact),
    sessionTiming: {
      source: "manual_timer" as const,
      coverage: "partial" as const,
      elapsedMs: artifact.elapsedMs,
      activeMs: artifact.movingMs,
    },
    uploadedArtifact: { ingestionId: upload.ingestionId },
    summary: {
      distanceMeters: Math.round(artifact.review.distanceMeters),
      calories: artifact.review.calories,
    },
    source: "mobile_recording" as const,
  };
}

/** Keeps the append-only RPE operation stable until the review value changes. */
export function sessionRpeOperationIdForReview({
  previous,
  perceivedEffort,
  createOperationId,
}: {
  previous: PortableWebRecordingArtifact;
  perceivedEffort: PortableWebRecordingReview["perceivedEffort"];
  createOperationId: () => string;
}): string | null {
  if (perceivedEffort === null) return null;
  if (previous.review.perceivedEffort === perceivedEffort && previous.sessionRpeOperationId) {
    return previous.sessionRpeOperationId;
  }
  return createOperationId();
}

export async function sha256Text(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure artifact hashing is unavailable in this runtime.");
  }
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildTimerTcx({
  activity_category,
  distanceMeters,
  distanceEnteredManually,
  elapsedSeconds,
  execution,
  laps,
  name,
  startedAt,
  finishedAt,
  measuredJournal,
  guidance,
}: {
  activity_category: string;
  distanceMeters: number;
  distanceEnteredManually?: boolean;
  elapsedSeconds: number;
  execution: TimerOnlyRecordingState["planExecution"];
  laps: NonNullable<PortableWebRecordingArtifact["planExecution"]>["laps"];
  name: string;
  startedAt: string;
  finishedAt: string;
  measuredJournal?: MeasuredRecordingJournal | undefined;
  guidance?: RecordingGuidanceTimeline;
}): string {
  const tcxSport =
    activity_category === "run" ? "Running" : activity_category === "bike" ? "Biking" : "Other";
  const tcxLaps = buildTimerTcxLaps({
    distanceEnteredManually: distanceEnteredManually === true,
    distanceMeters,
    elapsedSeconds,
    laps,
    name,
    startedAt,
    finishedAt,
    ...(measuredJournal ? { measuredJournal } : {}),
  });
  const executionExtension =
    execution || measuredJournal
      ? `<Extensions><GradientPeakExecution xmlns="https://gradientpeak.app/xmlschemas/recording/v1">${escapeXml(
          JSON.stringify({
            version: 1,
            ...(guidance ? { guidance } : {}),
            transitions: execution?.transitions ?? [],
            laps: execution?.laps ?? [],
            ...(measuredJournal
              ? { measuredCapture: { provenance: "measured", windows: measuredJournal.windows } }
              : {}),
          }),
        )}</GradientPeakExecution></Extensions>`
      : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="${tcxSport}"><Id>${startedAt}</Id>${tcxLaps}${executionExtension}</Activity></Activities></TrainingCenterDatabase>`;
}

function buildTimerTcxLaps({
  distanceEnteredManually,
  distanceMeters,
  elapsedSeconds,
  laps,
  name,
  startedAt,
  finishedAt,
  measuredJournal,
}: {
  distanceEnteredManually: boolean;
  distanceMeters: number;
  elapsedSeconds: number;
  laps: NonNullable<PortableWebRecordingArtifact["planExecution"]>["laps"];
  name: string;
  startedAt: string;
  finishedAt: string;
  measuredJournal?: MeasuredRecordingJournal | undefined;
}): string {
  const points = measuredJournal
    ? measuredRecordingPoints(measuredJournal).points.map((point) => ({
        ...point,
        timeMs: Date.parse(point.recordedAt),
      }))
    : [];
  let pointIndex = 0;
  const track = (from: string, to: string, includeEnd: boolean) => {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (fromMs > toMs) throw new Error("Recording lap timestamps must be ordered.");
    const selected: typeof points = [];
    while (pointIndex < points.length) {
      const point = points[pointIndex];
      if (!point) break;
      if (point.timeMs < fromMs)
        throw new Error("Measured evidence falls outside the recorded lap boundaries.");
      if (includeEnd ? point.timeMs > toMs : point.timeMs >= toMs) break;
      selected.push(point);
      pointIndex += 1;
    }
    if (!selected.length) return timerTcxTrack(from);
    return `<Track>${selected
      .map((point) => {
        const value = point.values;
        const counters = `${point.rawDistanceMeters === undefined ? "" : ` rawDistanceMeters="${point.rawDistanceMeters}"`}${point.caloriesCounterKcal === undefined ? "" : ` caloriesCounterKcal="${point.caloriesCounterKcal}"`}`;
        return `<Trackpoint><Time>${point.recordedAt}</Time>${value.distance === undefined ? "" : `<DistanceMeters>${value.distance}</DistanceMeters>`}${value.heart_rate === undefined ? "" : `<HeartRateBpm><Value>${value.heart_rate}</Value></HeartRateBpm>`}${value.cadence === undefined ? "" : `<Cadence>${value.cadence}</Cadence>`}<Extensions><TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">${value.power === undefined ? "" : `<Watts>${value.power}</Watts>`}${value.speed === undefined ? "" : `<Speed>${value.speed}</Speed>`}</TPX><MeasuredSource xmlns="https://gradientpeak.app/xmlschemas/recording/v1" provenance="measured" adapter="web-bluetooth" sourceId="${escapeXml(point.sourceId)}" sequence="${point.sequenceNumber}" window="${point.windowIndex}"${counters}/></Extensions></Trackpoint>`;
      })
      .join("")}</Track>`;
  };
  if (laps.length === 0) {
    const manualDistance = distanceEnteredManually
      ? `<DistanceMeters>${distanceMeters}</DistanceMeters>`
      : "";
    return `<Lap StartTime="${startedAt}"><TotalTimeSeconds>${elapsedSeconds}</TotalTimeSeconds>${manualDistance}<Intensity>Active</Intensity><TriggerMethod>Stop</TriggerMethod>${track(startedAt, finishedAt, true)}<Notes>${escapeXml(name)}</Notes></Lap>`;
  }

  let previousElapsedMs = 0;
  let previousTimestamp = startedAt;
  const values = laps.map((lap, index) => {
    const durationSeconds = Math.max(0, lap.elapsedMs - previousElapsedMs) / 1_000;
    const value = `<Lap StartTime="${previousTimestamp}"><TotalTimeSeconds>${durationSeconds}</TotalTimeSeconds><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod>${track(previousTimestamp, lap.timestamp, index === laps.length - 1 && lap.elapsedMs >= elapsedSeconds * 1000)}<Notes>${escapeXml(`${name} · Lap ${lap.lapNumber}`)}</Notes></Lap>`;
    previousElapsedMs = lap.elapsedMs;
    previousTimestamp = lap.timestamp;
    return value;
  });
  if (previousElapsedMs < elapsedSeconds * 1_000) {
    values.push(
      `<Lap StartTime="${previousTimestamp}"><TotalTimeSeconds>${Math.max(0, elapsedSeconds - previousElapsedMs / 1_000)}</TotalTimeSeconds><Intensity>Active</Intensity><TriggerMethod>Stop</TriggerMethod>${track(previousTimestamp, finishedAt, true)}<Notes>${escapeXml(`${name} · Finish`)}</Notes></Lap>`,
    );
  }
  if (pointIndex !== points.length)
    throw new Error("Measured evidence extends beyond the recorded lap boundaries.");
  return values.join("");
}

/** TCX import requires at least one timestamped record; this deliberately contains no position. */
function timerTcxTrack(timestamp: string): string {
  return `<Track><Trackpoint><Time>${timestamp}</Time></Trackpoint></Track>`;
}

function buildPersistedManualLaps(artifact: PortableWebRecordingArtifact) {
  let previousElapsedMs = 0;
  let previousActiveMs = 0;
  let previousTimestamp = artifact.startedAt;
  return (artifact.planExecution?.laps ?? []).map((lap) => {
    const value = {
      lapNumber: lap.lapNumber,
      startedAt: previousTimestamp,
      endedAt: lap.timestamp,
      durationSeconds: Math.max(0, lap.elapsedMs - previousElapsedMs) / 1_000,
      totalElapsedTime: Math.max(0, lap.elapsedMs - previousElapsedMs) / 1_000,
      totalTimerTime: Math.max(0, lap.movingMs - previousActiveMs) / 1_000,
      triggerMethod: "manual",
      timingSource: "manual_timer",
      occurrenceId: lap.occurrenceId,
      occurrenceIndex: lap.occurrenceIndex,
    };
    previousElapsedMs = lap.elapsedMs;
    previousActiveMs = lap.movingMs;
    previousTimestamp = lap.timestamp;
    return value;
  });
}

function manualTimerEvidence(startOffsetMs: number, endOffsetMs: number) {
  return {
    source: "manual_timer" as const,
    coverage: "partial" as const,
    startOffsetMs,
    endOffsetMs,
  };
}

function buildExecutionManifestOccurrences(
  artifact: PortableWebRecordingArtifact,
): RecordingExecutionManifest["occurrences"] {
  if (!artifact.guidance) return buildEpochOccurrences(artifact);
  const epochs = artifact.guidance.revisions.filter(
    (revision) => revision.kind === "initial" || revision.kind === "plan",
  );
  return epochs
    .flatMap((epoch, index) => {
      const next = epochs[index + 1];
      return buildEpochOccurrences(artifact, {
        plan: epoch.plan,
        execution: next?.closedExecution ?? artifact.planExecution,
        startElapsedMs: epoch.elapsedMs,
        startActiveMs: epoch.activeMs,
        startedAt: epoch.timestamp,
        endElapsedMs: next?.elapsedMs ?? artifact.elapsedMs,
        endActiveMs: next?.activeMs ?? artifact.movingMs,
        finishedAt: next?.timestamp ?? artifact.finishedAt,
      }).map((entry) => ({
        ...entry,
        occurrenceId:
          epoch.revision === 0
            ? entry.occurrenceId
            : `guidance-${epoch.revision}:${entry.occurrenceId}`,
      }));
    })
    .map((entry, globalOrdinal) => ({ ...entry, globalOrdinal, distanceMeters: 0 }));
}

function buildEpochOccurrences(
  artifact: PortableWebRecordingArtifact,
  epoch?: {
    plan: PortableWebRecordingArtifact["snapshot"]["planExecution"] | null;
    execution: PortableWebRecordingArtifact["planExecution"];
    startElapsedMs: number;
    startActiveMs: number;
    startedAt: string;
    endElapsedMs: number;
    endActiveMs: number;
    finishedAt: string;
  },
): RecordingExecutionManifest["occurrences"] {
  const plan = epoch ? epoch.plan : artifact.snapshot.planExecution;
  const execution = epoch ? epoch.execution : artifact.planExecution;
  const startElapsedMs = epoch?.startElapsedMs ?? 0;
  const endElapsedMs = epoch?.endElapsedMs ?? artifact.elapsedMs;
  const startActiveMs = epoch?.startActiveMs ?? 0;
  const endActiveMs = epoch?.endActiveMs ?? artifact.movingMs;
  const startedAt = epoch?.startedAt ?? artifact.startedAt;
  const finishedAt = epoch?.finishedAt ?? artifact.finishedAt;
  if (!plan || !execution) {
    if (endElapsedMs === startElapsedMs) return [];
    return [
      manifestOccurrence({
        artifact,
        occurrence: undefined,
        globalOrdinal: 0,
        startedAt,
        completedAt: finishedAt,
        activeSeconds: (endActiveMs - startActiveMs) / 1_000,
        completion: plan ? undefined : { status: "completed", method: "manual" },
        startOffsetMs: startElapsedMs,
        endOffsetMs: endElapsedMs,
      }),
    ];
  }
  const compiled = compilePlanForManifest(plan.structure);
  const byId = new Map(compiled.map((occurrence) => [occurrence.occurrenceId, occurrence]));
  const completed = new Set(execution.completedOccurrenceIds);
  const skipped = new Set(execution.skippedOccurrenceIds);
  const finalTerminalTransitions = new Map<string, (typeof execution.transitions)[number]>();
  for (const transition of execution.transitions) {
    if (
      transition.fromOccurrenceId &&
      ((transition.type === "skip" && skipped.has(transition.fromOccurrenceId)) ||
        ((transition.type === "complete" || transition.type === "auto") &&
          completed.has(transition.fromOccurrenceId)))
    ) {
      finalTerminalTransitions.set(transition.fromOccurrenceId, transition);
    }
  }
  let previousMovingMs = startActiveMs;
  let previousElapsedMs = startElapsedMs;
  let previousTimestamp = startedAt;
  const entries: ReturnType<typeof manifestOccurrence>[] = [];
  for (const transition of execution.transitions) {
    const occurrence = transition.fromOccurrenceId
      ? byId.get(transition.fromOccurrenceId)
      : undefined;
    if (transition.fromOccurrenceId && !occurrence) {
      throw new Error("Recording transition does not match the locked prescription.");
    }
    const activeSeconds = Math.max(0, transition.movingMs - previousMovingMs) / 1_000;
    const startOffsetMs = previousElapsedMs;
    const startedAt = previousTimestamp;
    previousMovingMs = transition.movingMs;
    previousElapsedMs = transition.elapsedMs;
    previousTimestamp = transition.timestamp;
    const terminal =
      occurrence && finalTerminalTransitions.get(occurrence.occurrenceId) === transition;
    // Rewinding changes completion evidence, not time already spent. Retain
    // superseded visits as unclassified observations of the real occurrence.
    if (transition.elapsedMs === startOffsetMs && !terminal) continue;
    entries.push(
      manifestOccurrence({
        artifact,
        occurrence,
        globalOrdinal: entries.length,
        startedAt,
        completedAt: transition.timestamp,
        activeSeconds,
        completion: terminal
          ? {
              status: transition.type === "skip" ? "skipped" : "completed",
              method: transition.type === "auto" ? "automatic" : "manual",
            }
          : undefined,
        startOffsetMs,
        endOffsetMs: transition.elapsedMs,
      }),
    );
  }
  if (previousElapsedMs < endElapsedMs) {
    const occurrence =
      execution.currentOccurrenceIndex === null
        ? undefined
        : compiled[execution.currentOccurrenceIndex];
    if (execution.currentOccurrenceIndex !== null && !occurrence) {
      throw new Error("Current recording step does not match the locked prescription.");
    }
    entries.push(
      manifestOccurrence({
        artifact,
        occurrence,
        globalOrdinal: entries.length,
        startedAt: previousTimestamp,
        completedAt: finishedAt,
        activeSeconds: Math.max(0, endActiveMs - previousMovingMs) / 1_000,
        completion: undefined,
        startOffsetMs: previousElapsedMs,
        endOffsetMs: endElapsedMs,
      }),
    );
  }
  return entries;
}

function manifestOccurrence({
  artifact,
  occurrence,
  globalOrdinal,
  startedAt,
  completedAt,
  activeSeconds,
  completion,
  startOffsetMs,
  endOffsetMs,
}: {
  artifact: PortableWebRecordingArtifact;
  occurrence: CompiledActivityPlanOccurrence | undefined;
  globalOrdinal: number;
  startedAt: string;
  completedAt: string;
  activeSeconds: number;
  completion: { status: "completed" | "skipped"; method: "automatic" | "manual" } | undefined;
  startOffsetMs: number;
  endOffsetMs: number;
}) {
  return {
    occurrenceId:
      occurrence?.occurrenceId ??
      `${artifact.recordingSessionId}:${artifact.snapshot.planExecution ? "continuation" : "activity"}`,
    globalOrdinal,
    stepId: occurrence?.stepId ?? null,
    repeatIteration: occurrence?.repeatIteration ?? 0,
    ...(occurrence?.repeatId ? { repeatId: occurrence.repeatId } : {}),
    role: occurrence?.role ?? "activity",
    activity_category: occurrence
      ? occurrence.activity_category
      : artifact.snapshot.activity.activity_category,
    startedAt,
    completedAt,
    activeSeconds,
    movingSeconds: 0,
    distanceMeters:
      !artifact.snapshot.planExecution && isManualDistance(artifact.review)
        ? artifact.review.distanceMeters
        : 0,
    ...(completion ? { completion } : {}),
    timingEvidence: manualTimerEvidence(startOffsetMs, endOffsetMs),
    timerEvents: [],
    laps: executionManifestLaps(artifact, occurrence?.occurrenceId, startOffsetMs, endOffsetMs),
  };
}

function executionManifestLaps(
  artifact: PortableWebRecordingArtifact,
  occurrenceId: string | undefined,
  startOffsetMs: number,
  endOffsetMs: number,
) {
  let previousMovingMs = 0;
  let previousTimestamp = artifact.startedAt;
  return (artifact.planExecution?.laps ?? []).flatMap((lap) => {
    const value = {
      lapNumber: lap.lapNumber,
      startedAt: previousTimestamp,
      endedAt: lap.timestamp,
      activeSeconds: Math.max(0, lap.movingMs - previousMovingMs) / 1_000,
      distanceMeters: 0,
    };
    previousMovingMs = lap.movingMs;
    previousTimestamp = lap.timestamp;
    return (!occurrenceId || lap.occurrenceId === occurrenceId) &&
      (lap.elapsedMs > startOffsetMs || startOffsetMs === 0) &&
      lap.elapsedMs <= endOffsetMs
      ? [value]
      : [];
  });
}

function compilePlanForManifest(structure: unknown) {
  // Imported lazily through the public Core entrypoint keeps this app helper deterministic.
  return compileActivityPlan(structure).occurrences;
}

function isManualDistance(review: PortableWebRecordingReview): boolean {
  return review.distanceEnteredManually ?? review.distanceMeters > 0;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
