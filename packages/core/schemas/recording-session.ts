import { z } from "zod";

import { recordingCapabilitiesSchema } from "./recording_config";

const isoTimestampSchema = z.string().min(1);
const nullableUuidSchema = z.string().uuid().nullable();

export const recordingActivityCategorySchema = z.enum(["run", "bike", "swim", "strength", "other"]);

export const recordingGpsModeSchema = z.enum(["on", "off"]);

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
    ftp: z.number().positive().optional(),
    thresholdHr: z.number().positive().optional(),
    thresholdPaceSecondsPerKm: z.number().positive().optional(),
    weightKg: z.number().positive().optional(),
    defaultsApplied: z.array(z.string()).default([]),
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
    category: recordingActivityCategorySchema,
    mode: recordingSessionModeSchema,
    gpsMode: recordingGpsModeSchema,
    eventId: nullableUuidSchema,
    activityPlanId: nullableUuidSchema,
    routeId: nullableUuidSchema,
  })
  .strict();

export const recordingSessionSnapshotSchema = z
  .object({
    identity: recordingSessionIdentitySchema,
    activity: recordingSessionActivitySchema,
    profileSnapshot: recordingProfileSnapshotSchema,
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
  .strict();

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
  })
  .strict();

export const recordingSessionArtifactSchema = z
  .object({
    sessionId: z.string().min(1),
    snapshot: recordingSessionSnapshotSchema,
    overrides: z.array(recordingSessionOverrideSchema),
    finalStats: recordingSessionFinalStatsSchema,
    fitFilePath: z.string().min(1).nullable(),
    streamArtifactPaths: z.array(z.string().min(1)),
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
export type RecordingSessionOverride = z.infer<typeof recordingSessionOverrideSchema>;
export type RecordingSessionFinalStats = z.infer<typeof recordingSessionFinalStatsSchema>;
export type RecordingSessionArtifact = z.infer<typeof recordingSessionArtifactSchema>;
