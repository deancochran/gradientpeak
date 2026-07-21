import { describe, expect, it } from "vitest";

import type { RecordingSessionSnapshot } from "../schemas/recording-session";
import {
  PORTABLE_WEB_RECORDING_SCHEMA_VERSION,
  portableWebRecordingArtifactSchema,
  portableWebRecordingSubmissionJobSchema,
} from "./portable-web-recording";

const snapshot: RecordingSessionSnapshot = {
  identity: {
    sessionId: "11111111-1111-4111-8111-111111111111",
    revision: 0,
    startedAt: "2026-07-20T10:00:00.000Z",
  },
  activity: {
    category: "bike",
    mode: "planned",
    gpsMode: "off",
    eventId: "22222222-2222-4222-8222-222222222222",
    activityPlanId: "33333333-3333-4333-8333-333333333333",
    routeId: "44444444-4444-4444-8444-444444444444",
  },
  profileSnapshot: { defaultsApplied: [] },
  devices: { connected: [], controllableTrainer: null, selectedSources: [] },
  capabilities: {
    canTrackLocation: false,
    canTrackPower: false,
    canTrackHeartRate: false,
    canTrackCadence: false,
    shouldShowMap: false,
    shouldShowSteps: false,
    shouldShowRouteOverlay: false,
    shouldShowTurnByTurn: false,
    shouldShowFollowAlong: false,
    shouldShowTrainerControl: false,
    canAutoAdvanceSteps: false,
    shouldAutoFollowTargets: false,
    autoFollowPriority: "none",
    autoFollowConflict: false,
    autoFollowConflictReason: null,
    primaryMetric: "time",
    isValid: true,
    errors: [],
    warnings: [],
  },
  policies: {
    sourcePolicy: {
      preferUserSelection: true,
      allowDerivedSpeed: false,
      allowDerivedDistance: false,
    },
    controlPolicy: { trainerMode: "manual", autoAdvanceSteps: false },
    degradedModePolicy: {
      allowWithoutGps: true,
      allowWithoutSensors: true,
      exposeSourceWarnings: true,
    },
  },
};

const artifact = {
  schemaVersion: PORTABLE_WEB_RECORDING_SCHEMA_VERSION,
  ownerId: "profile-1",
  recordingSessionId: snapshot.identity.sessionId,
  segmentId: "55555555-5555-4555-8555-555555555555",
  snapshot,
  startedAt: "2026-07-20T10:00:00.000Z",
  finishedAt: "2026-07-20T10:30:00.000Z",
  elapsedMs: 1_800_000,
  movingMs: 1_500_000,
  fileName: "gradientpeak-recording.tcx",
  fileText: "<TrainingCenterDatabase />",
  sha256: "a".repeat(64),
  review: {
    name: "Morning ride",
    notes: null,
    perceivedEffort: 6,
    distanceMeters: 0,
    calories: null,
  },
} as const;

describe("portable web recording contracts", () => {
  it("locks artifact identity and validates bounded review metadata", () => {
    expect(portableWebRecordingArtifactSchema.parse(artifact)).toEqual(artifact);
    expect(
      portableWebRecordingArtifactSchema.safeParse({
        ...artifact,
        recordingSessionId: "different-session",
      }).success,
    ).toBe(false);
    expect(
      portableWebRecordingArtifactSchema.safeParse({
        ...artifact,
        movingMs: artifact.elapsedMs + 1,
      }).success,
    ).toBe(false);
  });

  it("keeps durable retry state idempotently keyed by recording session", () => {
    const job = portableWebRecordingSubmissionJobSchema.parse({
      schemaVersion: PORTABLE_WEB_RECORDING_SCHEMA_VERSION,
      id: artifact.recordingSessionId,
      artifact,
      status: "retry_wait",
      attempts: 2,
      nextAttemptAt: "2026-07-20T10:35:00.000Z",
      lastError: "network_unavailable",
      activityId: null,
      updatedAt: "2026-07-20T10:31:00.000Z",
    });

    expect(job.id).toBe(job.artifact.recordingSessionId);
    expect(
      portableWebRecordingSubmissionJobSchema.safeParse({ ...job, id: "another-id" }).success,
    ).toBe(false);
  });
});
