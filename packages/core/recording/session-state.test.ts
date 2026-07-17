import { describe, expect, it } from "vitest";

import type { RecordingSessionSnapshot } from "../schemas/recording-session";
import {
  createDefaultRecordingRuntimeSourceState,
  RecordingSessionStateController,
} from "./session-state";

const snapshot: RecordingSessionSnapshot = {
  identity: {
    sessionId: "11111111-1111-4111-8111-111111111111",
    revision: 1,
    startedAt: "2026-07-17T12:00:00.000Z",
    appBuild: "test",
  },
  activity: {
    category: "bike",
    mode: "free",
    gpsMode: "off",
    eventId: null,
    activityPlanId: null,
    routeId: null,
  },
  profileSnapshot: {
    defaultsApplied: [],
  },
  devices: {
    connected: [],
    controllableTrainer: null,
    selectedSources: [],
  },
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

describe("RecordingSessionStateController", () => {
  it("owns platform-neutral lifecycle, snapshot, overrides, and view state", () => {
    const controller = new RecordingSessionStateController<{ surface: "mobile" | "web" }>();

    controller.setLifecycle("recording");
    controller.resetForNewSession(snapshot);
    controller.applyOverride({
      type: "intensity_scale",
      value: 0.9,
      scope: "until_changed",
      recordedAt: "2026-07-17T12:05:00.000Z",
    });

    const view = controller.buildView({ surface: "web" });

    expect(view.lifecycle).toBe("recording");
    expect(view.snapshot?.identity.sessionId).toBe(snapshot.identity.sessionId);
    expect(view.overrideState.intensityScale).toBe(0.9);
    expect(view.overrides).toHaveLength(1);
    expect(view.surface).toBe("web");
  });

  it("defensively clones runtime state for platform adapters", () => {
    const controller = new RecordingSessionStateController();
    const runtimeState = createDefaultRecordingRuntimeSourceState();
    runtimeState.degradedState.metrics.push("speed");

    controller.setRuntimeSourceState(runtimeState);
    runtimeState.degradedState.metrics.push("power");

    const fromController = controller.getRuntimeSourceState();
    fromController.degradedState.metrics.push("heart_rate");

    expect(controller.getRuntimeSourceState().degradedState.metrics).toEqual(["speed"]);
  });
});
