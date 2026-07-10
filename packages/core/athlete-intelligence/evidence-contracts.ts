import { z } from "zod";

import { lineageGroupIdSchema, sourceIdSchema } from "./lineage";

export const evidenceSourceTypeSchema = z.enum([
  "activity",
  "profile_metric",
  "activity_effort",
  "manual_observation",
  "goal",
]);

export const evidenceQualityStateSchema = z.enum(["known", "unknown", "insufficient"]);

export const evidenceValidityStateSchema = z.enum([
  "valid",
  "invalid",
  "unknown",
  "insufficient",
  "future_observation",
]);

export const evidenceCompatibilityStateSchema = z.enum([
  "compatible",
  "incompatible_unit",
  "incompatible_modality",
  "unsupported",
]);

/** The raw measurement is frozen and never contains freshness or influence. */
export const rawObservationSchema = z
  .object({
    value: z.number().finite().nullable(),
    unit: z.string().min(1).nullable(),
  })
  .strict()
  .readonly();

export const evidenceItemSchema = z
  .object({
    athleteId: z.string().min(1),
    sourceId: sourceIdSchema,
    lineageGroupId: lineageGroupIdSchema,
    observedAt: z.string().datetime(),
    rawObservation: rawObservationSchema,
    sport: z.string().min(1).nullable(),
    modality: z.string().min(1),
    sourceType: evidenceSourceTypeSchema,
    qualityState: evidenceQualityStateSchema,
    validityState: evidenceValidityStateSchema,
    compatibilityState: evidenceCompatibilityStateSchema,
  })
  .strict()
  .readonly();

export const calculationEligibleEvidenceSchema = evidenceItemSchema.and(
  z
    .object({
      rawObservation: z
        .object({ value: z.number().finite(), unit: z.string().min(1) })
        .strict()
        .readonly(),
      qualityState: z.literal("known"),
      validityState: z.literal("valid"),
      compatibilityState: z.literal("compatible"),
    })
    .passthrough(),
);

export const evidenceExclusionReasonCodeSchema = z.enum([
  "evidence_value_unknown",
  "evidence_unit_unknown",
  "evidence_invalid",
  "evidence_insufficient",
  "evidence_future_observation",
  "evidence_incompatible_unit",
  "evidence_incompatible_modality",
  "evidence_unsupported",
]);

export const evidenceEligibilitySchema = z.discriminatedUnion("eligible", [
  z.object({ eligible: z.literal(true), evidence: calculationEligibleEvidenceSchema }).strict(),
  z
    .object({
      eligible: z.literal(false),
      reasonCode: evidenceExclusionReasonCodeSchema,
    })
    .strict(),
]);

export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;
export type EvidenceQualityState = z.infer<typeof evidenceQualityStateSchema>;
export type EvidenceValidityState = z.infer<typeof evidenceValidityStateSchema>;
export type EvidenceCompatibilityState = z.infer<typeof evidenceCompatibilityStateSchema>;
export type RawObservation = z.infer<typeof rawObservationSchema>;
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type CalculationEligibleEvidence = z.infer<typeof calculationEligibleEvidenceSchema>;
export type EvidenceExclusionReasonCode = z.infer<typeof evidenceExclusionReasonCodeSchema>;
export type EvidenceEligibility = z.infer<typeof evidenceEligibilitySchema>;

function excluded(reasonCode: EvidenceExclusionReasonCode): EvidenceEligibility {
  return { eligible: false, reasonCode };
}

/** Determines numeric eligibility without transforming or replacing the raw observation. */
export function resolveEvidenceEligibility(input: {
  evidence: EvidenceItem;
  asOf: string;
}): EvidenceEligibility {
  const asOf = z.string().datetime().parse(input.asOf);
  const evidence = evidenceItemSchema.parse(input.evidence);

  if (Date.parse(evidence.observedAt) > Date.parse(asOf)) {
    return excluded("evidence_future_observation");
  }
  if (evidence.rawObservation.value === null || evidence.qualityState === "unknown") {
    return excluded("evidence_value_unknown");
  }
  if (evidence.rawObservation.unit === null) {
    return excluded("evidence_unit_unknown");
  }
  if (evidence.qualityState === "insufficient" || evidence.validityState === "insufficient") {
    return excluded("evidence_insufficient");
  }
  if (evidence.validityState === "invalid") {
    return excluded("evidence_invalid");
  }
  if (evidence.validityState === "unknown") {
    return excluded("evidence_value_unknown");
  }
  if (evidence.validityState === "future_observation") {
    return excluded("evidence_future_observation");
  }
  if (evidence.compatibilityState === "incompatible_unit") {
    return excluded("evidence_incompatible_unit");
  }
  if (evidence.compatibilityState === "incompatible_modality") {
    return excluded("evidence_incompatible_modality");
  }
  if (evidence.compatibilityState === "unsupported") {
    return excluded("evidence_unsupported");
  }

  return {
    eligible: true,
    evidence: calculationEligibleEvidenceSchema.parse(evidence),
  };
}

export const athleteMetricTypeSchema = z.enum([
  "ftp",
  "lthr",
  "max_hr",
  "resting_hr",
  "vo2_max",
  "weight_kg",
  "hrv_rmssd",
  "sleep_hours",
  "stress_score",
  "soreness_level",
  "wellness_score",
  "age_years",
]);

export const athleteMetricRoleSchema = z.enum([
  "direct_threshold_evidence",
  "threshold_intensity_context",
  "heart_rate_normalization",
  "recovery_baseline_context",
  "aerobic_high_intensity_context",
  "watts_per_kilogram_input",
  "readiness_context",
  "constraint_context",
  "adaptation_recovery_context",
]);

export type AthleteMetricType = z.infer<typeof athleteMetricTypeSchema>;
export type AthleteMetricRole = z.infer<typeof athleteMetricRoleSchema>;

/** Approved contextual roles only; this mapping defines no weights or generic score. */
export const athleteMetricRoleByType = {
  ftp: "direct_threshold_evidence",
  lthr: "threshold_intensity_context",
  max_hr: "heart_rate_normalization",
  resting_hr: "recovery_baseline_context",
  vo2_max: "aerobic_high_intensity_context",
  weight_kg: "watts_per_kilogram_input",
  hrv_rmssd: "readiness_context",
  sleep_hours: "readiness_context",
  stress_score: "constraint_context",
  soreness_level: "constraint_context",
  wellness_score: "constraint_context",
  age_years: "adaptation_recovery_context",
} as const satisfies Record<AthleteMetricType, AthleteMetricRole>;
