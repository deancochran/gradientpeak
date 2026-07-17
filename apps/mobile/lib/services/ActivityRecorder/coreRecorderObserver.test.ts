import type { RecordingSessionSnapshot } from "@repo/core";
import { describe, expect, it } from "vitest";

import { CoreRecorderReducerObserver } from "./coreRecorderObserver";

const snapshot: RecordingSessionSnapshot = {
  identity: {
    sessionId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    startedAt: "2026-07-17T12:00:00.000Z",
    appBuild: "mobile-test",
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
    degradedModePolicy: {
      allowWithoutGps: true,
      allowWithoutSensors: true,
      exposeSourceWarnings: true,
    },
    controlPolicy: {
      trainerMode: "auto",
      autoAdvanceSteps: true,
    },
  },
};

describe("CoreRecorderReducerObserver", () => {
  it("mirrors mobile start, pause, resume, and finish lifecycle", () => {
    const observer = new CoreRecorderReducerObserver();

    expect(observer.observeRecordingStarted(snapshot)).toEqual(["prepare_session", "start_timer"]);
    expect(observer.getState().lifecycle).toBe("recording");
    expect(observer.getLifecycleState()).toEqual({
      lifecycle: "recording",
      finalizationError: null,
    });

    expect(observer.observePaused()).toEqual(["stop_timer", "pause_streams"]);
    expect(observer.getState().lifecycle).toBe("paused");

    expect(observer.observeResumed()).toEqual(["start_timer", "resume_streams"]);
    expect(observer.getState().lifecycle).toBe("recording");

    expect(observer.observeFinalizationStarted({ retry: false })).toEqual([
      "stop_timer",
      "finalize_artifacts",
    ]);
    expect(observer.getState().lifecycle).toBe("finishing");
    expect(observer.observeFinished()).toEqual([]);
    expect(observer.getState().lifecycle).toBe("finished");
  });

  it("keeps failed finalization retryable", () => {
    const observer = new CoreRecorderReducerObserver();

    observer.observeRecordingStarted(snapshot);
    observer.observeFinalizationStarted({ retry: false });
    observer.observeFinalizationFailed("storage unavailable");

    expect(observer.getState().lifecycle).toBe("finishing");
    expect(observer.getState().finalizationError).toBe("storage unavailable");

    observer.observeFinalizationStarted({ retry: true });
    expect(observer.getState().finalizationError).toBeNull();
    observer.observeFinished();
    expect(observer.getState().lifecycle).toBe("finished");
  });

  it("records rejected decisions without mutating observed state", () => {
    const observer = new CoreRecorderReducerObserver();

    observer.observePaused();

    expect(observer.getState().lifecycle).toBe("pending");
    expect(observer.getDecisions().at(-1)?.decision.rejected?.reason).toContain("Cannot pause");
  });

  it("returns defensive state snapshots", () => {
    const observer = new CoreRecorderReducerObserver();
    observer.observeRecordingStarted(snapshot);

    const state = observer.getState();
    state.lifecycle = "finished";
    if (!state.snapshot) {
      throw new Error("Expected snapshot.");
    }
    state.snapshot.identity.sessionId = "mutated";

    expect(observer.getState().lifecycle).toBe("recording");
    expect(observer.getState().snapshot?.identity.sessionId).toBe(snapshot.identity.sessionId);
  });
});
