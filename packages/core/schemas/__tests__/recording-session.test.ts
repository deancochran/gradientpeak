import { describe, expect, it } from "vitest";

import {
  recordingLaunchIntentSchema,
  recordingSessionArtifactSchema,
  recordingSessionOverrideSchema,
  recordingSessionSnapshotSchema,
} from "../recording-session";

const validCapabilities = {
  canTrackLocation: true,
  canTrackPower: true,
  canTrackHeartRate: true,
  canTrackCadence: true,
  shouldShowMap: true,
  shouldShowSteps: true,
  shouldShowRouteOverlay: true,
  shouldShowTurnByTurn: true,
  shouldShowFollowAlong: false,
  shouldShowTrainerControl: true,
  canAutoAdvanceSteps: true,
  shouldAutoFollowTargets: true,
  primaryMetric: "power" as const,
  isValid: true,
  errors: [],
  warnings: [],
};

describe("recording session schemas", () => {
  it("accepts a launch intent with source preferences", () => {
    const result = recordingLaunchIntentSchema.safeParse({
      activityCategory: "bike",
      mode: "planned",
      gpsMode: "on",
      eventId: null,
      activityPlanId: "550e8400-e29b-41d4-a716-446655440000",
      routeId: "550e8400-e29b-41d4-a716-446655440001",
      sourcePreferences: [
        {
          metricFamily: "power",
          sourceId: "pm-1",
        },
      ],
      controlPolicy: {
        trainerMode: "auto",
        autoAdvanceSteps: true,
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a snapshot and artifact for a finalized session", () => {
    const snapshot = {
      identity: {
        sessionId: "session-1",
        revision: 1,
        startedAt: "2026-03-20T10:00:00Z",
        appBuild: "1.2.3",
      },
      activity: {
        category: "bike",
        mode: "planned",
        gpsMode: "on",
        eventId: "550e8400-e29b-41d4-a716-446655440000",
        activityPlanId: "550e8400-e29b-41d4-a716-446655440001",
        routeId: "550e8400-e29b-41d4-a716-446655440002",
      },
      profileSnapshot: {
        ftp: 250,
        thresholdHr: 170,
        weightKg: 72,
        defaultsApplied: [],
      },
      devices: {
        connected: [
          {
            deviceId: "trainer-1",
            deviceName: "Kickr",
            role: "trainer",
            sourceTypes: ["trainer_power", "trainer_cadence", "trainer_speed"],
            controllable: true,
          },
        ],
        controllableTrainer: {
          deviceId: "trainer-1",
          deviceName: "Kickr",
          sourceTypes: ["trainer_power", "trainer_cadence", "trainer_speed"],
          supportsAutoControl: true,
          supportsManualControl: true,
        },
        selectedSources: [
          {
            metricFamily: "power",
            sourceId: "trainer-1",
            sourceType: "trainer_power",
            provenance: "actual",
            selectionMethod: "automatic",
            selectedAt: "2026-03-20T10:00:00Z",
          },
        ],
      },
      capabilities: validCapabilities,
      policies: {
        sourcePolicy: {
          preferUserSelection: true,
          allowDerivedSpeed: true,
          allowDerivedDistance: true,
        },
        controlPolicy: {
          trainerMode: "auto",
          autoAdvanceSteps: true,
        },
        degradedModePolicy: {
          allowWithoutGps: true,
          allowWithoutSensors: true,
          exposeSourceWarnings: true,
        },
      },
    };

    expect(recordingSessionSnapshotSchema.safeParse(snapshot).success).toBe(true);

    const artifact = recordingSessionArtifactSchema.safeParse({
      sessionId: "session-1",
      snapshot,
      overrides: [
        {
          type: "trainer_mode",
          value: "manual",
          scope: "until_changed",
          recordedAt: "2026-03-20T10:30:00Z",
        },
      ],
      finalStats: {
        durationSeconds: 3600,
        movingSeconds: 3550,
        distanceMeters: 32100,
      },
      fitFilePath: "/tmp/session.fit",
      streamArtifactPaths: ["/tmp/power.jsonl"],
      completedAt: "2026-03-20T11:00:00Z",
    });

    expect(artifact.success).toBe(true);
  });

  it("rejects unsupported identity-changing overrides", () => {
    const result = recordingSessionOverrideSchema.safeParse({
      type: "gps_mode",
      value: "off",
      scope: "until_changed",
      recordedAt: "2026-03-20T10:30:00Z",
    });

    expect(result.success).toBe(false);
  });
});
