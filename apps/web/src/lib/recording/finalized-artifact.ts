import {
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

  const elapsedMs = finishedAtMs - startedAtMs;
  const movingMs = Math.min(elapsedMs, state.timer.accumulatedMovingMs);
  const finishedAt = new Date(finishedAtMs).toISOString();
  const fileText = buildTimerTcx({
    category: snapshot.activity.category,
    distanceMeters: review.distanceMeters,
    elapsedSeconds: elapsedMs / 1_000,
    finishedAt,
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
    fileName: `gradientpeak-${snapshot.identity.sessionId}.tcx`,
    fileText,
    sha256: await digest(fileText),
    review,
    sessionRpeOperationId,
  });
}

export function buildCreateFromRecordingSummaryInput(
  artifact: PortableWebRecordingArtifact,
  upload: { bucket: string; path: string },
) {
  return {
    profileId: artifact.ownerId,
    recordingSessionId: artifact.recordingSessionId,
    name: artifact.review.name,
    notes: artifact.review.notes,
    startedAt: artifact.startedAt,
    finishedAt: artifact.finishedAt,
    activityPlanId: artifact.snapshot.activity.activityPlanId,
    executionManifest: {
      version: 1 as const,
      compilerVersion: 1,
      planHash: artifact.sha256,
      occurrences: [
        {
          occurrenceId: `${artifact.recordingSessionId}:activity`,
          globalOrdinal: 0,
          segmentId: artifact.segmentId,
          role: "activity" as const,
          category: artifact.snapshot.activity.category,
          startedAt: artifact.startedAt,
          completedAt: artifact.finishedAt,
          activeSeconds: artifact.movingMs / 1_000,
          movingSeconds: artifact.movingMs / 1_000,
          distanceMeters: artifact.review.distanceMeters,
          timerEvents: [],
          laps: [],
        },
      ],
    },
    acceptedArtifact: {
      sha256: artifact.sha256,
      byteSize: new TextEncoder().encode(artifact.fileText).byteLength,
      bucket: upload.bucket,
      path: upload.path,
      mediaType: "application/vnd.garmin.tcx+xml",
      format: "tcx" as const,
      originalName: artifact.fileName,
    },
    summary: {
      distanceMeters: artifact.review.distanceMeters,
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
  category,
  distanceMeters,
  elapsedSeconds,
  finishedAt,
  name,
  startedAt,
}: {
  category: string;
  distanceMeters: number;
  elapsedSeconds: number;
  finishedAt: string;
  name: string;
  startedAt: string;
}): string {
  const sport = category === "run" ? "Running" : category === "bike" ? "Biking" : "Other";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="${sport}"><Id>${startedAt}</Id><Lap StartTime="${startedAt}"><TotalTimeSeconds>${elapsedSeconds}</TotalTimeSeconds><DistanceMeters>${distanceMeters}</DistanceMeters><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track><Trackpoint><Time>${startedAt}</Time><DistanceMeters>0</DistanceMeters></Trackpoint><Trackpoint><Time>${finishedAt}</Time><DistanceMeters>${distanceMeters}</DistanceMeters></Trackpoint></Track><Notes>${escapeXml(name)}</Notes></Lap></Activity></Activities></TrainingCenterDatabase>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
