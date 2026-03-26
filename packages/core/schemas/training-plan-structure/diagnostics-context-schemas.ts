import { z } from "zod";

export const creationHistoryAvailabilityStateEnum = z.enum(["none", "sparse", "rich"]);

export type CreationHistoryAvailabilityState = z.infer<typeof creationHistoryAvailabilityStateEnum>;

export const creationSignalMarkerEnum = z.enum(["low", "moderate", "high"]);

export type CreationSignalMarker = z.infer<typeof creationSignalMarkerEnum>;

export const creationRangeSchema = z
  .object({
    min: z.number(),
    max: z.number(),
  })
  .refine((data) => data.max >= data.min, {
    message: "Range max must be greater than or equal to min",
    path: ["max"],
  });

export type CreationRange = z.infer<typeof creationRangeSchema>;

export const creationContextSummarySchema = z.object({
  history_availability_state: creationHistoryAvailabilityStateEnum,
  recent_consistency_marker: creationSignalMarkerEnum,
  effort_confidence_marker: creationSignalMarkerEnum,
  profile_metric_completeness_marker: creationSignalMarkerEnum,
  is_youth: z.boolean().optional(),
  signal_quality: z.number().min(0).max(1),
  recommended_baseline_tss_range: creationRangeSchema,
  recommended_recent_influence_range: creationRangeSchema,
  recommended_sessions_per_week_range: creationRangeSchema,
  user_age: z.number().int().min(0).max(120).optional(),
  user_gender: z.enum(["male", "female"]).nullable().optional(),
  max_sustainable_ctl: z.number().min(0).max(300).optional(),
  missing_required_onboarding_fields: z.array(z.string().min(1).max(120)).optional(),
  missing_optional_calibration_fields: z.array(z.string().min(1).max(120)).optional(),
  learned_ramp_rate: z
    .object({
      max_safe_ramp_rate: z.number().min(30).max(70),
      confidence: z.enum(["low", "medium", "high"]),
    })
    .optional(),
  training_quality: z
    .object({
      source: z.enum(["power", "hr", "neutral"]),
      low_intensity_ratio: z.number().min(0).max(1),
      moderate_intensity_ratio: z.number().min(0).max(1),
      high_intensity_ratio: z.number().min(0).max(1),
      load_factor: z.number().min(1).max(2),
      atl_extension_days: z.number().int().min(0).max(2),
    })
    .optional(),
  rationale_codes: z.array(z.string().min(1).max(120)).default([]),
});

export type CreationContextSummary = z.infer<typeof creationContextSummarySchema>;

export const creationFeasibilityBandEnum = z.enum(["under-reaching", "on-track", "over-reaching"]);

export type CreationFeasibilityBand = z.infer<typeof creationFeasibilityBandEnum>;

export const creationSafetyBandEnum = z.enum(["safe", "caution", "high-risk"]);

export type CreationSafetyBand = z.infer<typeof creationSafetyBandEnum>;

export const creationSummaryDriverSchema = z.object({
  code: z.string().min(1).max(120),
  message: z.string().min(1).max(300),
  impact: z.number().min(-1).max(1),
});

export type CreationSummaryDriver = z.infer<typeof creationSummaryDriverSchema>;

export const creationSummaryActionSchema = z.object({
  code: z.string().min(1).max(120),
  message: z.string().min(1).max(300),
  priority: z.number().int().min(1).max(3),
});

export type CreationSummaryAction = z.infer<typeof creationSummaryActionSchema>;

export const creationSummaryBlockerSchema = z.object({
  code: z.string().min(1).max(120),
  message: z.string().min(1).max(300),
  field_paths: z.array(z.string().min(1).max(200)).default([]),
});

export type CreationSummaryBlocker = z.infer<typeof creationSummaryBlockerSchema>;

export const creationFeasibilitySafetySummarySchema = z.object({
  feasibility_band: creationFeasibilityBandEnum,
  safety_band: creationSafetyBandEnum,
  feasibility_score: z.number().min(0).max(1),
  safety_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  top_drivers: z.array(creationSummaryDriverSchema).min(1),
  recommended_actions: z.array(creationSummaryActionSchema).default([]),
  blockers: z.array(creationSummaryBlockerSchema).default([]),
  computed_at: z.string().datetime(),
});

export type CreationFeasibilitySafetySummary = z.infer<
  typeof creationFeasibilitySafetySummarySchema
>;

export const inferredCurrentStateMeanSchema = z.object({
  ctl: z.number().min(0).finite(),
  atl: z.number().min(0).finite(),
  tsb: z.number().finite(),
  slb: z.number().min(0).finite(),
  durability: z.number().min(0).max(100).finite(),
  readiness: z.number().min(0).max(100).finite(),
});

export type InferredCurrentStateMean = z.infer<typeof inferredCurrentStateMeanSchema>;

export const inferredCurrentStateUncertaintySchema = z.object({
  state_variance: z.number().min(0).max(1).finite(),
  confidence: z.number().min(0).max(1).finite(),
});

export type InferredCurrentStateUncertainty = z.infer<typeof inferredCurrentStateUncertaintySchema>;

export const inferredCurrentStateEvidenceQualitySchema = z.object({
  score: z.number().min(0).max(1).finite(),
  missingness_ratio: z.number().min(0).max(1).finite(),
});

export type InferredCurrentStateEvidenceQuality = z.infer<
  typeof inferredCurrentStateEvidenceQualitySchema
>;

export const inferredStateSnapshotMetadataSchema = z.object({
  updated_at: z.string().datetime(),
  missingness_counter: z.number().int().min(0),
  evidence_counter: z.number().int().min(0),
});

export type InferredStateSnapshotMetadata = z.infer<typeof inferredStateSnapshotMetadataSchema>;

export const inferredCurrentStateSchema = z.object({
  mean: inferredCurrentStateMeanSchema,
  uncertainty: inferredCurrentStateUncertaintySchema,
  evidence_quality: inferredCurrentStateEvidenceQualitySchema,
  as_of: z.string().datetime(),
});

export type InferredCurrentState = z.infer<typeof inferredCurrentStateSchema>;

export const inferredStateSnapshotSchema = inferredCurrentStateSchema.extend({
  metadata: inferredStateSnapshotMetadataSchema,
});

export type InferredStateSnapshot = z.infer<typeof inferredStateSnapshotSchema>;
