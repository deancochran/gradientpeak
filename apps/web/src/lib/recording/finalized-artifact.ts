import {
  type CompiledActivityPlanOccurrence,
  compileActivityPlan,
  PORTABLE_WEB_RECORDING_SCHEMA_VERSION,
  type PortableWebRecordingArtifact,
  type PortableWebRecordingReview,
  portableWebRecordingArtifactSchema,
} from "@repo/core";

import type { TimerOnlyRecordingState } from "./timer-runtime";

type Digest = (value: string) => Promise<string>;

export async function finalizeTimerRecordingArtifact({
  digest = sha256Text,
  ownerId,
  review,
  segmentId,
  sessionRpeOperationId = null,
  state,
}: {
  digest?: Digest;
  ownerId: string;
  review: PortableWebRecordingReview;
  segmentId: string;
  sessionRpeOperationId?: string | null;
  state: TimerOnlyRecordingState;
}): Promise<PortableWebRecordingArtifact> {
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
  const fileText = buildTimerTcx({
    activity_category: snapshot.activity.activity_category,
    distanceMeters: review.distanceMeters,
    distanceEnteredManually: review.distanceEnteredManually === true,
    elapsedSeconds: elapsedMs / 1_000,
    execution: state.planExecution,
    laps: state.planExecution?.laps ?? [],
    name: review.name,
    startedAt: snapshot.identity.startedAt,
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
  const occurrences = buildExecutionManifestOccurrences(artifact);
  return {
    profileId: artifact.ownerId,
    recordingSessionId: artifact.recordingSessionId,
    name: artifact.review.name,
    notes: artifact.review.notes,
    startedAt: artifact.startedAt,
    finishedAt: artifact.finishedAt,
    activityPlanId: artifact.snapshot.activity.activityPlanId,
    routeId: artifact.snapshot.activity.routeId,
    executionManifest: {
      version: 1 as const,
      compilerVersion: artifact.snapshot.planExecution?.compilerVersion ?? 1,
      planHash:
        artifact.snapshot.planExecution?.structureHash.replace("v1:sha256:", "") ?? artifact.sha256,
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
}: {
  activity_category: string;
  distanceMeters: number;
  distanceEnteredManually?: boolean;
  elapsedSeconds: number;
  execution: TimerOnlyRecordingState["planExecution"];
  laps: NonNullable<PortableWebRecordingArtifact["planExecution"]>["laps"];
  name: string;
  startedAt: string;
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
  });
  const executionExtension = execution
    ? `<Extensions><GradientPeakExecution xmlns="https://gradientpeak.app/xmlschemas/recording/v1">${escapeXml(
        JSON.stringify({
          version: 1,
          transitions: execution.transitions,
          laps: execution.laps,
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
}: {
  distanceEnteredManually: boolean;
  distanceMeters: number;
  elapsedSeconds: number;
  laps: NonNullable<PortableWebRecordingArtifact["planExecution"]>["laps"];
  name: string;
  startedAt: string;
}): string {
  if (laps.length === 0) {
    const manualDistance = distanceEnteredManually
      ? `<DistanceMeters>${distanceMeters}</DistanceMeters>`
      : "";
    return `<Lap StartTime="${startedAt}"><TotalTimeSeconds>${elapsedSeconds}</TotalTimeSeconds>${manualDistance}<Intensity>Active</Intensity><TriggerMethod>Stop</TriggerMethod>${timerTcxTrack(startedAt)}<Notes>${escapeXml(name)}</Notes></Lap>`;
  }

  let previousElapsedMs = 0;
  let previousTimestamp = startedAt;
  const values = laps.map((lap) => {
    const durationSeconds = Math.max(0, lap.elapsedMs - previousElapsedMs) / 1_000;
    const value = `<Lap StartTime="${previousTimestamp}"><TotalTimeSeconds>${durationSeconds}</TotalTimeSeconds><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod>${timerTcxTrack(previousTimestamp)}<Notes>${escapeXml(`${name} · Lap ${lap.lapNumber}`)}</Notes></Lap>`;
    previousElapsedMs = lap.elapsedMs;
    previousTimestamp = lap.timestamp;
    return value;
  });
  if (previousElapsedMs < elapsedSeconds * 1_000) {
    values.push(
      `<Lap StartTime="${previousTimestamp}"><TotalTimeSeconds>${Math.max(0, elapsedSeconds - previousElapsedMs / 1_000)}</TotalTimeSeconds><Intensity>Active</Intensity><TriggerMethod>Stop</TriggerMethod>${timerTcxTrack(previousTimestamp)}<Notes>${escapeXml(`${name} · Finish`)}</Notes></Lap>`,
    );
  }
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

function buildExecutionManifestOccurrences(artifact: PortableWebRecordingArtifact) {
  const plan = artifact.snapshot.planExecution;
  const execution = artifact.planExecution;
  if (!plan || !execution) {
    return [
      {
        occurrenceId: `${artifact.recordingSessionId}:activity`,
        globalOrdinal: 0,
        segmentId: artifact.segmentId,
        role: "activity" as const,
        activity_category: artifact.snapshot.activity.activity_category,
        startedAt: artifact.startedAt,
        completedAt: artifact.finishedAt,
        activeSeconds: artifact.movingMs / 1_000,
        movingSeconds: 0,
        distanceMeters: isManualDistance(artifact.review) ? artifact.review.distanceMeters : 0,
        completion: { status: "completed" as const, method: "manual" as const },
        timingEvidence: manualTimerEvidence(0, artifact.elapsedMs),
        timerEvents: [],
        laps: executionManifestLaps(artifact),
      },
    ];
  }
  const compiled = compilePlanForManifest(plan.structure);
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
  let previousMovingMs = 0;
  let previousElapsedMs = 0;
  let previousTimestamp = artifact.startedAt;
  const entries: ReturnType<typeof manifestOccurrence>[] = [];
  for (const transition of execution.transitions) {
    const occurrence = compiled.find(
      (candidate) => candidate.occurrenceId === transition.fromOccurrenceId,
    );
    const activeSeconds = Math.max(0, transition.movingMs - previousMovingMs) / 1_000;
    const startOffsetMs = previousElapsedMs;
    const startedAt = previousTimestamp;
    previousMovingMs = transition.movingMs;
    previousElapsedMs = transition.elapsedMs;
    previousTimestamp = transition.timestamp;
    if (
      !occurrence ||
      (transition.type !== "complete" &&
        transition.type !== "auto" &&
        transition.type !== "skip") ||
      finalTerminalTransitions.get(occurrence.occurrenceId) !== transition
    ) {
      continue;
    }
    entries.push(
      manifestOccurrence({
        artifact,
        occurrence,
        globalOrdinal: entries.length,
        startedAt,
        completedAt: transition.timestamp,
        activeSeconds,
        completion: {
          status: transition.type === "skip" ? "skipped" : "completed",
          method: transition.type === "auto" ? "automatic" : "manual",
        },
        startOffsetMs,
        endOffsetMs: transition.elapsedMs,
      }),
    );
  }
  return entries.length > 0
    ? entries
    : [
        {
          occurrenceId: `${artifact.recordingSessionId}:activity`,
          globalOrdinal: 0,
          segmentId: artifact.segmentId,
          role: "activity" as const,
          activity_category: artifact.snapshot.activity.activity_category,
          startedAt: artifact.startedAt,
          completedAt: artifact.finishedAt,
          activeSeconds: artifact.movingMs / 1_000,
          movingSeconds: 0,
          distanceMeters: isManualDistance(artifact.review) ? artifact.review.distanceMeters : 0,
          completion: { status: "completed" as const, method: "manual" as const },
          timingEvidence: manualTimerEvidence(0, artifact.elapsedMs),
          timerEvents: [],
          laps: executionManifestLaps(artifact),
        },
      ];
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
  occurrence: CompiledActivityPlanOccurrence;
  globalOrdinal: number;
  startedAt: string;
  completedAt: string;
  activeSeconds: number;
  completion: { status: "completed" | "skipped"; method: "automatic" | "manual" };
  startOffsetMs: number;
  endOffsetMs: number;
}) {
  return {
    occurrenceId: occurrence.occurrenceId,
    globalOrdinal,
    segmentId: occurrence.segmentId,
    role: occurrence.role,
    activity_category: occurrence.activity_category,
    startedAt,
    completedAt,
    activeSeconds,
    movingSeconds: 0,
    distanceMeters: 0,
    completion,
    timingEvidence: manualTimerEvidence(startOffsetMs, endOffsetMs),
    timerEvents: [],
    laps: executionManifestLaps(artifact, occurrence.occurrenceId),
  };
}

function executionManifestLaps(artifact: PortableWebRecordingArtifact, occurrenceId?: string) {
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
    return !occurrenceId || lap.occurrenceId === occurrenceId ? [value] : [];
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
