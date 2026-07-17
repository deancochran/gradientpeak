import { describe, expect, it } from "vitest";

import type { RecordingSessionSnapshot } from "../schemas/recording-session";
import {
  PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION,
  portableTimerRecordingDraftSchema,
} from "./portable-timer-draft";

const sessionSnapshot: RecordingSessionSnapshot = {
  identity: {
    sessionId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    startedAt: "2026-07-17T12:00:00.000Z",
  },
  activity: {
    category: "bike",
    mode: "free",
    gpsMode: "off",
    eventId: null,
    activityPlanId: null,
    routeId: null,
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
      allowDerivedSpeed: true,
      allowDerivedDistance: true,
    },
    controlPolicy: { trainerMode: "auto", autoAdvanceSteps: true },
    degradedModePolicy: {
      allowWithoutGps: true,
      allowWithoutSensors: true,
      exposeSourceWarnings: true,
    },
  },
};

const validDraft = {
  schemaVersion: PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION,
  ownerId: "profile-1",
  sessionSnapshot,
  lifecycle: "recording",
  timing: {
    startedAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-17T12:05:00.000Z",
    elapsedMs: 300_000,
    movingMs: 240_000,
  },
  revision: 1,
} as const;

describe("portable timer recording draft schema", () => {
  it("accepts a complete portable recording draft", () => {
    expect(portableTimerRecordingDraftSchema.parse(validDraft)).toEqual(validDraft);
  });

  it("rejects unknown fields and unsupported lifecycles", () => {
    expect(
      portableTimerRecordingDraftSchema.safeParse({ ...validDraft, unexpected: true }).success,
    ).toBe(false);
    expect(
      portableTimerRecordingDraftSchema.safeParse({ ...validDraft, lifecycle: "finished" }).success,
    ).toBe(false);
  });

  it("rejects timing that cannot be recovered safely", () => {
    expect(
      portableTimerRecordingDraftSchema.safeParse({
        ...validDraft,
        timing: { ...validDraft.timing, movingMs: validDraft.timing.elapsedMs + 1 },
      }).success,
    ).toBe(false);
    expect(
      portableTimerRecordingDraftSchema.safeParse({
        ...validDraft,
        timing: { ...validDraft.timing, updatedAt: "2026-07-17T11:59:59.000Z" },
      }).success,
    ).toBe(false);
    expect(
      portableTimerRecordingDraftSchema.safeParse({
        ...validDraft,
        timing: { ...validDraft.timing, elapsedMs: validDraft.timing.elapsedMs - 1 },
      }).success,
    ).toBe(false);
    expect(
      portableTimerRecordingDraftSchema.safeParse({
        ...validDraft,
        revision: validDraft.revision + 1,
      }).success,
    ).toBe(false);
  });
});
