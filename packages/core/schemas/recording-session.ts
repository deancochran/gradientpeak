import { z } from "zod";

import { activityPlanStructureSchema } from "../activity-plan";
import { athletePerformanceTargetFactsSchema } from "../performance-model";
import { recordingPlannedSessionLaunchSchema } from "./activity_payload";
import { canonicalActivityCategorySchema } from "./activity-category";
import { recordingCapabilitiesSchema } from "./recording_config";

const isoTimestampSchema = z.string().min(1);
const nullableUuidSchema = z.string().uuid().nullable();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const recordingActivityCategorySchema = canonicalActivityCategorySchema;

export const recordingGpsModeSchema = z.literal("off");

export const recordingSessionModeSchema = z.enum(["free", "planned"]);

export const recordingTrainerMachineTypeSchema = z.enum([
  "bike",
  "treadmill",
  "rower",
  "elliptical",
  "generic",
]);

export const recordingTrainerIntentSourceSchema = z.enum([
  "manual",
  "reconnect_recovery",
  "step_change",
  "periodic_refinement",
]);

export const metricFamilySchema = z.enum([
  "heart_rate",
  "power",
  "cadence",
  "speed",
  "distance",
  "position",
  "elevation",
]);

export const metricProvenanceSchema = z.enum(["actual", "derived", "defaulted", "unavailable"]);

export const metricSourceTypeSchema = z.enum([
  "manual",
  "chest_strap",
  "optical",
  "trainer_passthrough",
  "power_meter",
  "trainer_power",
  "cadence_sensor",
  "trainer_cadence",
  "speed_sensor",
  "trainer_speed",
  "gps",
  "derived",
]);

export const metricSourceSelectionMethodSchema = z.enum([
  "preferred",
  "automatic",
  "fallback",
  "defaulted",
  "unavailable",
]);

export const metricSourcePreferenceSchema = z
  .object({
    metricFamily: metricFamilySchema,
    sourceId: z.string().min(1),
  })
  .strict();

export const metricSourceCandidateSchema = z
  .object({
    metricFamily: metricFamilySchema,
    sourceId: z.string().min(1),
    sourceType: metricSourceTypeSchema,
    provenance: metricProvenanceSchema.default("actual"),
    isAvailable: z.boolean().default(true),
  })
  .strict();

export const metricSourceSelectionSchema = z
  .object({
    metricFamily: metricFamilySchema,
    sourceId: z.string().min(1).nullable(),
    sourceType: metricSourceTypeSchema.nullable(),
    provenance: metricProvenanceSchema,
    selectionMethod: metricSourceSelectionMethodSchema,
    selectedAt: isoTimestampSchema.nullable().optional(),
  })
  .strict();

export const currentMetricValueSchema = z
  .object({
    value: z.number().nullable(),
    sourceId: z.string().min(1).nullable(),
    provenance: metricProvenanceSchema,
    recordedAt: isoTimestampSchema.nullable(),
  })
  .strict();

export const recordingControlPolicySchema = z
  .object({
    trainerMode: z.enum(["auto", "manual"]),
    autoAdvanceSteps: z.boolean(),
  })
  .strict();

export const metricSourcePolicySchema = z
  .object({
    preferUserSelection: z.boolean().default(true),
    allowDerivedSpeed: z.boolean().default(true),
    allowDerivedDistance: z.boolean().default(true),
  })
  .strict();

export const degradedModePolicySchema = z
  .object({
    allowWithoutGps: z.boolean().default(true),
    allowWithoutSensors: z.boolean().default(true),
    exposeSourceWarnings: z.boolean().default(true),
  })
  .strict();

export const recordingProfileSnapshotSchema = z
  .object({
    weightKg: z.number().positive().optional(),
  })
  .strict();

export const recordingConnectedDeviceSchema = z
  .object({
    deviceId: z.string().min(1),
    deviceName: z.string().min(1).nullable().optional(),
    role: z.enum([
      "heart_rate_monitor",
      "power_meter",
      "cadence_sensor",
      "speed_sensor",
      "gps",
      "generic_sensor",
      "trainer",
    ]),
    sourceTypes: z.array(metricSourceTypeSchema).default([]),
    controllable: z.boolean().default(false),
  })
  .strict();

export const recordingTrainerDescriptorSchema = z
  .object({
    deviceId: z.string().min(1),
    deviceName: z.string().min(1).nullable().optional(),
    machineType: recordingTrainerMachineTypeSchema.optional(),
    sourceTypes: z.array(metricSourceTypeSchema).default([]),
    supportsAutoControl: z.boolean().default(false),
    supportsManualControl: z.boolean().default(true),
  })
  .strict();

export const recordingTrainerControlIntentSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("set_power"),
      source: recordingTrainerIntentSourceSchema,
      watts: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_resistance"),
      source: recordingTrainerIntentSourceSchema,
      resistance: z.number().min(0),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_simulation"),
      source: recordingTrainerIntentSourceSchema,
      gradePercent: z.number(),
      windSpeedMps: z.number().optional(),
      rollingResistanceCoefficient: z.number().optional(),
      aerodynamicDragCoefficient: z.number().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_speed"),
      source: recordingTrainerIntentSourceSchema,
      metersPerSecond: z.number().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_incline"),
      source: recordingTrainerIntentSourceSchema,
      inclinePercent: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_cadence"),
      source: recordingTrainerIntentSourceSchema,
      rpm: z.number().int().positive(),
    })
    .strict(),
]);

export const recordingLaunchIntentSchema = z
  .object({
    activityCategory: recordingActivityCategorySchema,
    mode: recordingSessionModeSchema,
    gpsMode: recordingGpsModeSchema,
    eventId: nullableUuidSchema.optional().default(null),
    activityPlanId: nullableUuidSchema.optional().default(null),
    routeId: nullableUuidSchema.optional().default(null),
    sourcePreferences: z.array(metricSourcePreferenceSchema).default([]),
    controlPolicy: recordingControlPolicySchema,
  })
  .strict();

export const recordingSessionIdentitySchema = z
  .object({
    sessionId: z.string().min(1),
    revision: z.number().int().nonnegative(),
    startedAt: isoTimestampSchema,
    appBuild: z.string().min(1).optional(),
  })
  .strict();

export const recordingSessionActivitySchema = z
  .object({
    activity_category: recordingActivityCategorySchema,
    mode: recordingSessionModeSchema,
    gpsMode: recordingGpsModeSchema,
    eventId: nullableUuidSchema,
    activityPlanId: nullableUuidSchema,
    routeId: nullableUuidSchema,
  })
  .strict();

export const recordingPlanTargetPresentationEvidenceSchema = z
  .object({
    occurrenceId: z.string().min(1),
    labels: z.array(z.string().trim().min(1).max(160)).max(3),
  })
  .strict();

/** Immutable, browser-portable plan input locked when a recording starts. */
export const recordingPlanExecutionSnapshotSchema = z
  .object({
    manifestVersion: z.literal(1),
    compilerVersion: z.literal(1),
    activityPlanId: z.string().uuid(),
    scheduledEventId: nullableUuidSchema,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).nullable(),
    activityPlanRevision: z.number().int().positive(),
    structureHash: z.string().regex(/^v1:sha256:[0-9a-f]{64}$/),
    structure: activityPlanStructureSchema,
    plannedSession: recordingPlannedSessionLaunchSchema.nullable().optional().default(null),
    personalizationEnabled: z.boolean(),
    targetPresentations: z.array(recordingPlanTargetPresentationEvidenceSchema).max(2_000),
  })
  .strict()
  .superRefine((execution, context) => {
    const prescription = execution.plannedSession?.prescription;
    if (!prescription) return;
    const checks = [
      [
        "activityPlanId",
        execution.activityPlanId === prescription.resolutionManifest.activity_plan_id,
      ],
      [
        "activityPlanRevision",
        execution.activityPlanRevision === prescription.resolutionManifest.activity_plan_revision,
      ],
      [
        "structureHash",
        execution.structureHash === prescription.resolutionManifest.resolved_structure_hash,
      ],
      [
        "structure",
        JSON.stringify(execution.structure) ===
          JSON.stringify(prescription.resolutionManifest.resolved_structure),
      ],
    ] as const;
    for (const [field, valid] of checks) {
      if (!valid) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Locked execution must match the planned-session prescription",
        });
      }
    }
  });

export const recordingSessionSnapshotSchema = z
  .object({
    identity: recordingSessionIdentitySchema,
    activity: recordingSessionActivitySchema,
    profileSnapshot: recordingProfileSnapshotSchema,
    performanceTargets: athletePerformanceTargetFactsSchema,
    planExecution: recordingPlanExecutionSnapshotSchema.optional(),
    devices: z
      .object({
        connected: z.array(recordingConnectedDeviceSchema).default([]),
        controllableTrainer: recordingTrainerDescriptorSchema.nullable(),
        selectedSources: z.array(metricSourceSelectionSchema).default([]),
      })
      .strict(),
    capabilities: recordingCapabilitiesSchema,
    policies: z
      .object({
        sourcePolicy: metricSourcePolicySchema,
        controlPolicy: recordingControlPolicySchema,
        degradedModePolicy: degradedModePolicySchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (Date.parse(snapshot.performanceTargets.asOf) > Date.parse(snapshot.identity.startedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recording performance targets cannot be observed after session start",
        path: ["performanceTargets", "asOf"],
      });
    }
    const plan = snapshot.planExecution;
    if (plan) {
      if (
        snapshot.activity.activityPlanId !== plan.activityPlanId ||
        snapshot.activity.eventId !== plan.scheduledEventId ||
        snapshot.activity.activity_category !== plan.structure.activity_category
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Locked plan identity and category must match the recording activity",
          path: ["planExecution"],
        });
      }
    }
  });

export const recordingSessionOverrideSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("trainer_mode"),
      value: z.enum(["auto", "manual"]),
      scope: z.literal("until_changed"),
      recordedAt: isoTimestampSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("intensity_scale"),
      value: z.number().positive(),
      scope: z.literal("until_changed"),
      recordedAt: isoTimestampSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("preferred_source"),
      metricFamily: metricFamilySchema,
      sourceId: z.string().min(1),
      scope: z.literal("until_changed"),
      recordedAt: isoTimestampSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("plan_execution"),
      value: z.enum(["skip_step", "pause_progression", "resume_progression"]),
      scope: z.literal("current_session"),
      recordedAt: isoTimestampSchema,
    })
    .strict(),
]);

export const recordingSessionFinalStatsSchema = z
  .object({
    durationSeconds: z.number().int().min(0),
    movingSeconds: z.number().int().min(0),
    distanceMeters: z.number().min(0),
    calories: z.number().min(0).optional(),
    // Individual manual laps are moving-time durations in milliseconds.
    // A default keeps older finalized recordings readable during review/retry.
    manualLapsMs: z.array(z.number().int().min(0)).max(10_000).default([]),
  })
  .strict();

export const recordingOccurrenceResultSchema = z
  .object({
    occurrenceId: z.string().min(1),
    globalOrdinal: z.number().int().nonnegative(),
    segmentId: z.string().uuid(),
    role: z.enum(["activity", "transition", "rest"]),
    activity_category: recordingActivityCategorySchema.nullable(),
    startedAt: isoTimestampSchema,
    completedAt: isoTimestampSchema,
    activeSeconds: z.number().nonnegative(),
    movingSeconds: z.number().nonnegative(),
    distanceMeters: z.number().nonnegative(),
  })
  .strict();

export const recordingBoundaryJournalEntrySchema = z
  .object({
    revision: z.number().int().positive(),
    completedOccurrenceId: z.string().min(1).nullable(),
    nextOccurrenceId: z.string().min(1).nullable(),
    committedAt: isoTimestampSchema,
  })
  .strict();

export const recordingTimerEventSchema = z
  .object({
    type: z.enum(["pause", "resume"]),
    timestamp: isoTimestampSchema,
  })
  .strict();

export const recordingCheckpointSchema = z
  .object({
    schemaVersion: z.literal(2),
    compilerVersion: z.number().int().positive(),
    sessionId: z.string().min(1),
    profileId: z.string().min(1),
    lifecycle: z.enum(["recording", "paused", "finishing"]),
    planSnapshot: activityPlanStructureSchema,
    planHash: sha256Schema,
    currentOccurrenceId: z.string().min(1).nullable(),
    occurrenceProgress: z
      .object({
        startedAt: isoTimestampSchema,
        startMovingSeconds: z.number().nonnegative(),
        startDistanceMeters: z.number().nonnegative(),
      })
      .strict(),
    completedOccurrences: z.array(recordingOccurrenceResultSchema),
    boundaryJournal: z.array(recordingBoundaryJournalEntrySchema),
    rewindJournal: z
      .array(
        z
          .object({
            attemptId: z.string().min(1),
            destinationOccurrenceId: z.string().min(1),
            sourceDistanceMeters: z.number().nonnegative().optional(),
            destinationDistanceMeters: z.number().nonnegative().optional(),
            supersededFrom: isoTimestampSchema,
            rewoundAt: isoTimestampSchema,
          })
          .strict(),
      )
      .optional(),
    eventJournal: z.array(recordingTimerEventSchema),
    manualLapsMs: z.array(z.number().int().min(0)).max(10_000).default([]),
    timing: z
      .object({
        startedAt: isoTimestampSchema,
        updatedAt: isoTimestampSchema,
        elapsedSeconds: z.number().nonnegative(),
        movingSeconds: z.number().nonnegative(),
        pausedAt: isoTimestampSchema.nullable(),
        accumulatedPauseSeconds: z.number().nonnegative(),
      })
      .strict(),
    policy: z
      .object({
        activity_category: recordingActivityCategorySchema.nullable(),
        gpsMode: recordingGpsModeSchema,
        activityGpsMode: recordingGpsModeSchema,
        selectedSources: z.array(metricSourceSelectionSchema),
        trainerMode: z.enum(["auto", "manual"]),
      })
      .strict(),
    performanceTargets: athletePerformanceTargetFactsSchema,
    streamArtifactPaths: z.array(z.string().min(1)),
    revision: z.number().int().positive(),
  })
  .strict()
  .superRefine((checkpoint, context) => {
    if (Date.parse(checkpoint.performanceTargets.asOf) > Date.parse(checkpoint.timing.startedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Checkpoint performance targets cannot be observed after session start",
        path: ["performanceTargets", "asOf"],
      });
    }
  });

export const recordingExecutionManifestEntrySchema = recordingOccurrenceResultSchema.extend({
  completion: z
    .object({
      status: z.enum(["completed", "skipped"]),
      method: z.enum(["automatic", "manual"]),
    })
    .strict()
    .optional(),
  timingEvidence: z
    .object({
      source: z.enum(["manual_timer", "sensor_samples"]),
      coverage: z.enum(["complete", "partial"]),
      startOffsetMs: z.number().int().nonnegative(),
      endOffsetMs: z.number().int().nonnegative(),
    })
    .strict()
    .refine((timing) => timing.endOffsetMs >= timing.startOffsetMs, {
      message: "Execution timing end must not precede its start.",
    })
    .optional(),
  timerEvents: z.array(recordingTimerEventSchema),
  laps: z.array(
    z
      .object({
        lapNumber: z.number().int().positive(),
        startedAt: isoTimestampSchema,
        endedAt: isoTimestampSchema,
        activeSeconds: z.number().nonnegative(),
        distanceMeters: z.number().nonnegative(),
      })
      .strict(),
  ),
});

export const recordingExecutionManifestSchema = z
  .object({
    version: z.literal(1),
    compilerVersion: z.number().int().positive(),
    planHash: sha256Schema,
    occurrences: z.array(recordingExecutionManifestEntrySchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    manifest.occurrences.forEach((occurrence, index) => {
      if (occurrence.globalOrdinal !== index) {
        ctx.addIssue({
          code: "custom",
          message: "Execution manifest occurrences must use contiguous global order.",
          path: ["occurrences", index, "globalOrdinal"],
        });
      }
    });
  });

export const recordingSessionArtifactSchema = z
  .object({
    schemaVersion: z.literal(2),
    sessionId: z.string().min(1),
    profileId: z.string().min(1),
    snapshot: recordingSessionSnapshotSchema,
    overrides: z.array(recordingSessionOverrideSchema),
    finalStats: recordingSessionFinalStatsSchema,
    activityFilePath: z.string().min(1).nullable(),
    streamArtifactPaths: z.array(z.string().min(1)),
    executionManifest: recordingExecutionManifestSchema.nullable(),
    runtimeSourceState: z
      .object({
        selectedSources: z.array(metricSourceSelectionSchema),
        currentMetrics: z.partialRecord(metricFamilySchema, currentMetricValueSchema),
        degradedState: z
          .object({ isDegraded: z.boolean(), metrics: z.array(metricFamilySchema) })
          .strict(),
        sourceChanges: z.array(
          z
            .object({
              metricFamily: metricFamilySchema,
              previousSourceId: z.string().min(1).nullable(),
              nextSourceId: z.string().min(1).nullable(),
              previousProvenance: metricProvenanceSchema,
              nextProvenance: metricProvenanceSchema,
              recordedAt: isoTimestampSchema,
            })
            .strict(),
        ),
      })
      .strict(),
    completedAt: isoTimestampSchema,
  })
  .strict();

export type RecordingActivityCategory = z.infer<typeof recordingActivityCategorySchema>;
export type RecordingGpsMode = z.infer<typeof recordingGpsModeSchema>;
export type RecordingSessionMode = z.infer<typeof recordingSessionModeSchema>;
export type RecordingTrainerMachineType = z.infer<typeof recordingTrainerMachineTypeSchema>;
export type RecordingTrainerIntentSource = z.infer<typeof recordingTrainerIntentSourceSchema>;
export type MetricFamily = z.infer<typeof metricFamilySchema>;
export type MetricProvenance = z.infer<typeof metricProvenanceSchema>;
export type MetricSourceType = z.infer<typeof metricSourceTypeSchema>;
export type MetricSourcePreference = z.infer<typeof metricSourcePreferenceSchema>;
export type MetricSourceCandidate = z.infer<typeof metricSourceCandidateSchema>;
export type MetricSourceSelection = z.infer<typeof metricSourceSelectionSchema>;
export type CurrentMetricValue = z.infer<typeof currentMetricValueSchema>;
export type RecordingControlPolicy = z.infer<typeof recordingControlPolicySchema>;
export type MetricSourcePolicy = z.infer<typeof metricSourcePolicySchema>;
export type DegradedModePolicy = z.infer<typeof degradedModePolicySchema>;
export type RecordingProfileSnapshot = z.infer<typeof recordingProfileSnapshotSchema>;
export type RecordingConnectedDevice = z.infer<typeof recordingConnectedDeviceSchema>;
export type RecordingTrainerDescriptor = z.infer<typeof recordingTrainerDescriptorSchema>;
export type RecordingTrainerControlIntent = z.infer<typeof recordingTrainerControlIntentSchema>;
export type RecordingLaunchIntent = z.infer<typeof recordingLaunchIntentSchema>;
export type RecordingSessionIdentity = z.infer<typeof recordingSessionIdentitySchema>;
export type RecordingSessionActivity = z.infer<typeof recordingSessionActivitySchema>;
export type RecordingSessionSnapshot = z.infer<typeof recordingSessionSnapshotSchema>;
export type RecordingPlanExecutionSnapshot = z.infer<typeof recordingPlanExecutionSnapshotSchema>;
export type RecordingSessionOverride = z.infer<typeof recordingSessionOverrideSchema>;
export type RecordingSessionFinalStats = z.infer<typeof recordingSessionFinalStatsSchema>;
export type RecordingOccurrenceResult = z.infer<typeof recordingOccurrenceResultSchema>;
export type RecordingBoundaryJournalEntry = z.infer<typeof recordingBoundaryJournalEntrySchema>;
export type RecordingTimerEvent = z.infer<typeof recordingTimerEventSchema>;
export type RecordingCheckpoint = z.infer<typeof recordingCheckpointSchema>;
export type RecordingExecutionManifestEntry = z.infer<typeof recordingExecutionManifestEntrySchema>;
export type RecordingExecutionManifest = z.infer<typeof recordingExecutionManifestSchema>;
export type RecordingSessionArtifact = z.infer<typeof recordingSessionArtifactSchema>;
