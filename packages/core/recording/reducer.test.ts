import { describe, expect, it } from "vitest";

import type { RecordingSessionSnapshot } from "../schemas/recording-session";
import { PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION } from "./portable-timer-draft";
import {
  createInitialRecordingReducerState,
  decideRecordingCommand,
  reduceRecordingEvents,
} from "./reducer";

const snapshot: RecordingSessionSnapshot = {
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

describe("recording reducer", () => {
  it("requires a session snapshot before ready/start", () => {
    const initial = createInitialRecordingReducerState();

    expect(decideRecordingCommand(initial, { type: "mark_ready" }).rejected?.reason).toContain(
      "session snapshot",
    );
  });

  it("mirrors lifecycle and retryable finalization", () => {
    let state = createInitialRecordingReducerState();
    state = reduceRecordingEvents(
      state,
      decideRecordingCommand(state, { type: "create_session", snapshot }).events,
    );
    state = reduceRecordingEvents(
      state,
      decideRecordingCommand(state, { type: "mark_ready" }).events,
    );
    state = reduceRecordingEvents(state, decideRecordingCommand(state, { type: "start" }).events);
    state = reduceRecordingEvents(
      state,
      decideRecordingCommand(state, { type: "begin_finalization" }).events,
    );
    state = reduceRecordingEvents(
      state,
      decideRecordingCommand(state, { type: "fail_finalization", message: "storage unavailable" })
        .events,
    );

    expect(decideRecordingCommand(state, { type: "finish" }).rejected?.reason).toContain(
      "finalization is failed",
    );

    state = reduceRecordingEvents(
      state,
      decideRecordingCommand(state, { type: "retry_finalization" }).events,
    );
    state = reduceRecordingEvents(state, decideRecordingCommand(state, { type: "finish" }).events);

    expect(state.lifecycle).toBe("finished");
    expect(state.finalizationError).toBeNull();
  });

  it("recovers a portable draft directly into paused state without effects", () => {
    const initial = createInitialRecordingReducerState();
    const draft = {
      schemaVersion: PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION,
      ownerId: "profile-1",
      sessionSnapshot: snapshot,
      lifecycle: "recording",
      timing: {
        startedAt: "2026-07-17T12:00:00.000Z",
        updatedAt: "2026-07-17T12:05:00.000Z",
        elapsedMs: 300_000,
        movingMs: 240_000,
      },
      revision: snapshot.identity.revision,
    } as const;

    const decision = decideRecordingCommand(initial, { type: "recover_session", draft });

    expect(decision).toEqual({
      events: [{ type: "session_recovered", draft }],
      effects: [],
    });
    expect(reduceRecordingEvents(initial, decision.events)).toMatchObject({
      lifecycle: "paused",
      snapshot,
      finalizationError: null,
    });
  });

  it("rejects invalid recovery drafts without events or effects", () => {
    const initial = createInitialRecordingReducerState();
    const invalidDraft = {
      schemaVersion: PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION,
      ownerId: "profile-1",
      sessionSnapshot: snapshot,
      lifecycle: "recording",
      timing: {
        startedAt: "2026-07-17T12:00:00.000Z",
        updatedAt: "2026-07-17T12:05:00.000Z",
        elapsedMs: 1,
        movingMs: 2,
      },
      revision: 2,
    } as const;

    expect(
      decideRecordingCommand(initial, {
        type: "recover_session",
        draft: invalidDraft,
      }),
    ).toEqual({
      events: [],
      effects: [],
      rejected: { reason: "Cannot recover an invalid recording draft." },
    });
  });
});
