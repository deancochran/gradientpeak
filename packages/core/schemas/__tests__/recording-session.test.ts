import { describe, expect, it } from "vitest";
import { stringifyCanonicalJson } from "../../athlete-intelligence/canonical-json";
import { createUnavailableAthletePerformanceTargetFacts } from "../../performance-model";
import { sha256Hex } from "../../utils/sha256";

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
  autoFollowPriority: "plan_targets" as const,
  autoFollowConflict: false,
  autoFollowConflictReason: null,
  primaryMetric: "power" as const,
  isValid: true,
  errors: [],
  warnings: [],
};

describe("recording session schemas", () => {
  it("accepts event/session-owned route linkage in a launch intent", () => {
    const result = recordingLaunchIntentSchema.safeParse({
      activityCategory: "bike",
      mode: "planned",
      gpsMode: "off",
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
    const prescribedStructure = {
      version: 3 as const,
      activity_category: "bike" as const,
      segments: [
        {
          id: "550e8400-e29b-41d4-a716-446655440003",
          role: "activity" as const,
          name: "Bike",
          intervals: [
            {
              id: "550e8400-e29b-41d4-a716-446655440004",
              name: "Work",
              repetitions: 1,
              steps: [
                {
                  id: "550e8400-e29b-41d4-a716-446655440005",
                  name: "Steady",
                  duration: { type: "time" as const, seconds: 600 },
                  targets: [{ type: "RPE" as const, intensity: 7 }],
                },
              ],
            },
          ],
        },
      ],
    };
    const snapshot = {
      identity: {
        sessionId: "session-1",
        revision: 1,
        startedAt: "2026-03-20T10:00:00Z",
        appBuild: "1.2.3",
      },
      activity: {
        activity_category: "bike",
        mode: "planned",
        gpsMode: "off",
        eventId: "550e8400-e29b-41d4-a716-446655440000",
        activityPlanId: "550e8400-e29b-41d4-a716-446655440001",
        routeId: "550e8400-e29b-41d4-a716-446655440002",
      },
      profileSnapshot: {
        weightKg: 72,
      },
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(
        "2026-03-20T10:00:00.000Z",
      ),
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
      planExecution: {
        manifestVersion: 1 as const,
        compilerVersion: 1 as const,
        activityPlanId: "550e8400-e29b-41d4-a716-446655440001",
        scheduledEventId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Hard",
        description: null,
        activityPlanRevision: 2,
        structureHash: `v1:sha256:${sha256Hex(stringifyCanonicalJson(prescribedStructure))}`,
        structure: prescribedStructure,
        plannedSession: {
          id: "550e8400-e29b-41d4-a716-446655440006",
          sessionRevision: 5,
          source: { kind: "direct", operationId: "core-recording-session-test-operation" },
          prescription: {
            resolutionManifest: {
              resolver_version: "prescription-resolver-v1",
              policy_version: "training-plan-policy-v1",
              training_plan_id: null,
              training_plan_revision: null,
              training_plan_hash: null,
              athlete_context_revision: null,
              activity_plan_id: "550e8400-e29b-41d4-a716-446655440001",
              activity_plan_revision: 2,
              activity_plan_semantic_hash: `v1:sha256:${"a".repeat(64)}`,
              effective_target_duration_minutes: null,
              effective_target_common_load: null,
              evidence_facts: [],
              session_demand: {
                activity_category: "bike",
                training_intent: "aerobic_base",
                target_duration_minutes: 30,
                target_common_load: null,
                importance: "normal",
              },
              adaptation_values: {},
              fallback_level: "system_default_no_context",
              reason_codes: [],
              resolved_structure: prescribedStructure,
              resolved_structure_hash: `v1:sha256:${sha256Hex(stringifyCanonicalJson(prescribedStructure))}`,
              prescription_estimate: {
                duration: { status: "exact", value_seconds: 1800 },
                common_load: { status: "unavailable", value: null },
                rest_seconds: 0,
                has_open_completion: false,
                warnings: [],
                factors: ["canonical prescription quantification"],
              },
              fingerprint: `v1:sha256:${"b".repeat(64)}`,
            },
            capturedAt: "2026-03-19T10:00:00.000Z",
          },
        },
        personalizationEnabled: false,
        targetPresentations: [],
      },
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

    const parsedSnapshot = recordingSessionSnapshotSchema.parse(snapshot);
    expect(parsedSnapshot.performanceTargets.asOf).toBe("2026-03-20T10:00:00.000Z");
    expect(
      recordingSessionSnapshotSchema.safeParse({
        ...snapshot,
        performanceTargets: createUnavailableAthletePerformanceTargetFacts(
          "2026-03-20T10:00:01.000Z",
        ),
      }).success,
    ).toBe(false);

    const artifact = recordingSessionArtifactSchema.safeParse({
      schemaVersion: 2,
      sessionId: "session-1",
      profileId: "profile-1",
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
      activityFilePath: "/tmp/session.fit",
      streamArtifactPaths: ["/tmp/power.jsonl"],
      executionManifest: {
        version: 1,
        compilerVersion: 1,
        planHash: "0".repeat(64),
        occurrences: [],
      },
      runtimeSourceState: {
        selectedSources: [],
        currentMetrics: {},
        degradedState: { isDegraded: false, metrics: [] },
        sourceChanges: [],
      },
      completedAt: "2026-03-20T11:00:00Z",
    });

    expect(artifact.success).toBe(true);
    expect(artifact.data?.finalStats.manualLapsMs).toEqual([]);
    expect(artifact.data?.snapshot.planExecution?.plannedSession).toEqual(
      snapshot.planExecution.plannedSession,
    );
  });

  it("rejects obsolete recording threshold and default markers", () => {
    const result = recordingSessionSnapshotSchema.safeParse({
      identity: { sessionId: "session-1", revision: 1, startedAt: "2026-03-20T10:00:00Z" },
      activity: {
        activity_category: "bike",
        mode: "free",
        gpsMode: "off",
        eventId: null,
        activityPlanId: null,
        routeId: null,
      },
      profileSnapshot: {
        ftp: 250,
        thresholdHr: 170,
        thresholdPaceSecondsPerKm: 300,
        defaultsApplied: [],
      },
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(
        "2026-03-20T10:00:00.000Z",
      ),
      devices: { connected: [], controllableTrainer: null, selectedSources: [] },
      capabilities: validCapabilities,
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
    });

    expect(result.success).toBe(false);
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
