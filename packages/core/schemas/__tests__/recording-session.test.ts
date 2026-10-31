import { describe, expect, it } from "vitest";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "../../activity-plan";
import { stringifyCanonicalJson } from "../../athlete-intelligence/canonical-json";
import { createUnavailableAthletePerformanceTargetFacts } from "../../performance-model";
import { sha256Hex } from "../../utils/sha256";
import {
  recordingExecutionManifestSchema,
  recordingLaunchIntentSchema,
  recordingOccurrenceResultSchema,
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
  it.each([
    undefined,
    null,
    { status: "completed", method: "automatic" },
    { status: "skipped", method: "manual" },
  ])("round-trips legacy, unfinished, and terminal occurrence evidence: %j", (completion) => {
    const occurrence = {
      occurrenceId: "prescribed-occurrence",
      globalOrdinal: 0,
      stepId: "550e8400-e29b-41d4-a716-446655440003",
      repeatIteration: 0,
      role: "activity",
      activity_category: "run",
      startedAt: "2026-03-20T10:00:00.000Z",
      completedAt: "2026-03-20T10:00:10.000Z",
      activeSeconds: 10,
      movingSeconds: 10,
      distanceMeters: 0,
      ...(completion !== undefined ? { completion } : {}),
    };
    const checkpointResult = recordingOccurrenceResultSchema.parse(
      JSON.parse(JSON.stringify(occurrence)),
    );
    expect(checkpointResult).toEqual(occurrence);
    const manifest = recordingExecutionManifestSchema.parse({
      version: 1,
      compilerVersion: 3,
      planHash: "a".repeat(64),
      occurrences: [{ ...checkpointResult, timerEvents: [], laps: [] }],
    });
    expect(manifest.occurrences[0]?.completion).toEqual(completion);
    if (completion === undefined) expect(manifest.occurrences[0]).not.toHaveProperty("completion");
  });
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
    const prescribedStructure = activityPlanStructureSchema.parse({
      version: 5 as const,
      activity_category: "bike" as const,
      items: [
        {
          type: "step",
          id: "550e8400-e29b-41d4-a716-446655440005",
          name: "Steady",
          duration: { type: "time" as const, seconds: 600 },
          targets: [{ type: "RPE" as const, intensity: 7 }],
        },
      ],
    });
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
        manifestVersion: 2 as const,
        compilerVersion: 3 as const,
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
              resolver_version: "prescription-resolver-v2",
              policy_version: "training-plan-policy-v2",
              training_plan_id: null,
              training_plan_revision: null,
              training_plan_hash: null,
              athlete_context_revision: null,
              activity_plan_id: "550e8400-e29b-41d4-a716-446655440001",
              activity_plan_revision: 2,
              activity_plan_semantic_hash: activityPlanSemanticHash({
                structure: prescribedStructure,
                trainingIntent: "aerobic_base",
              }),
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
        compilerVersion: 3,
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
