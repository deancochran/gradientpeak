import { z } from "zod";

export const calibrationMetricKeySchema = z.enum([
  "threshold_power",
  "threshold_speed",
  "threshold_heart_rate",
]);
export const calibrationActivityCategorySchema = z.enum(["bike", "run", "swim"]);
export const calibrationStateSchema = z.enum(["provisional", "confirmed", "stale", "unavailable"]);
export const calibrationEvidenceStateSchema = z.enum(["candidate", "rejected", "invalidated"]);
export const calibrationEvidenceRejectionReasonSchema = z.enum([
  "metric_not_enabled",
  "source_not_accepted",
  "stream_coverage_insufficient",
  "stream_gap_exceeded",
  "output_variability_exceeded",
  "supporting_threshold_unavailable",
  "supporting_output_not_threshold_like",
  "duration_insufficient",
  "grade_coverage_insufficient",
  "protocol_incomplete",
  "model_history_insufficient",
  "model_quality_insufficient",
  "value_out_of_range",
]);

export const calibrationIdentitySchema = z
  .object({
    metricKey: calibrationMetricKeySchema,
    activityCategory: calibrationActivityCategorySchema,
  })
  .strict();

export const calibrationEvidenceDiagnosticsSchema = z
  .object({
    version: z.literal(1),
    streamCoverage: z.number().finite().min(0).max(1).nullable(),
    supportingOutputCoverage: z.number().finite().min(0).max(1).nullable(),
    maximumGapSeconds: z.number().finite().nonnegative().nullable(),
    selectedWindowSeconds: z.number().int().positive().max(14_400).nullable(),
    outputCoefficientOfVariation: z.number().finite().nonnegative().nullable(),
    supportingThresholdIdentity: calibrationIdentitySchema.nullable(),
    supportingThresholdValue: z.number().finite().positive().nullable(),
    model: z
      .object({
        calculationFingerprint: z.string().trim().min(1).max(128),
        status: z.enum(["available", "partial", "unavailable"]),
        reasons: z.array(z.string().trim().min(1).max(128)).max(32),
        sourceEvidenceIds: z.array(z.string().trim().min(1).max(256)).max(2_000),
        sourceActivityIds: z.array(z.string().trim().min(1).max(256)).max(2_000),
        evidenceCount: z.number().int().nonnegative().max(2_000),
        activityCount: z.number().int().nonnegative().max(2_000),
      })
      .strict()
      .nullable(),
    policyReason: z.string().trim().min(1).max(256),
  })
  .strict();

export const calibrationCandidateSchema = z
  .object({
    id: z.string().trim().min(1).max(256),
    activityId: z.string().trim().min(1).max(256),
    observedAt: z.string().datetime({ offset: true }),
    value: z.number().finite().positive(),
    state: z.literal("candidate"),
    invalidatedAt: z.null(),
  })
  .strict();

export const calibrationTrendSchema = z.enum([
  "initial",
  "stable",
  "increasing",
  "decreasing",
  "expired",
]);

export const calibrationSelectionDiagnosticsSchema = z
  .object({
    selectedEvidenceIds: z.array(z.string().trim().min(1).max(256)).max(64),
    selectedActivityIds: z.array(z.string().trim().min(1).max(256)).max(64),
    evidenceCount: z.number().int().nonnegative().max(64),
    selectionReason: z.enum([
      "first_qualifying_evidence",
      "complete_protocol",
      "independent_confirmation",
      "supported_increase",
      "supported_decrease",
      "unchanged",
      "expired",
    ]),
    trend: calibrationTrendSchema,
    tolerance: z.number().finite().nonnegative(),
    policyVersion: z.string().trim().min(1).max(128),
  })
  .strict()
  .superRefine((diagnostics, context) => {
    if (
      diagnostics.selectedEvidenceIds.length !== diagnostics.selectedActivityIds.length ||
      diagnostics.evidenceCount !== diagnostics.selectedEvidenceIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidenceCount"],
        message: "Calibration selection provenance arrays and evidence count must align",
      });
    }
  });

export const calibrationRecordSchema = z
  .object({
    id: z.string().trim().min(1).max(256),
    identity: calibrationIdentitySchema,
    value: z.number().finite().positive(),
    unit: z.enum(["watts", "meters_per_second", "beats_per_minute"]),
    effectiveAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    policyVersion: z.string().trim().min(1).max(128),
    selectionDiagnostics: calibrationSelectionDiagnosticsSchema,
  })
  .strict();

export type CalibrationMetricKey = z.infer<typeof calibrationMetricKeySchema>;
export type CalibrationActivityCategory = z.infer<typeof calibrationActivityCategorySchema>;
export type CalibrationState = z.infer<typeof calibrationStateSchema>;
export type CalibrationIdentity = z.infer<typeof calibrationIdentitySchema>;
export type CalibrationCandidate = z.infer<typeof calibrationCandidateSchema>;
export type CalibrationRecord = z.infer<typeof calibrationRecordSchema>;
export type CalibrationTrend = z.infer<typeof calibrationTrendSchema>;
export type CalibrationEvidenceRejectionReason = z.infer<
  typeof calibrationEvidenceRejectionReasonSchema
>;
export type CalibrationEvidenceDiagnostics = z.infer<typeof calibrationEvidenceDiagnosticsSchema>;

/**
 * Selection history intentionally does not persist a calibration lifecycle state.
 * The lifecycle is deterministically projected into the published target fact from
 * immutable selection audit plus expiry.
 */
export function calibrationStateForSelection(
  record: CalibrationRecord,
  asOf: string,
): Exclude<CalibrationState, "unavailable"> {
  const parsed = calibrationRecordSchema.parse(record);
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs)) throw new Error("Calibration lifecycle asOf is invalid");
  if (asOfMs >= Date.parse(parsed.expiresAt)) return "stale";
  return parsed.selectionDiagnostics.selectionReason === "first_qualifying_evidence"
    ? "provisional"
    : "confirmed";
}
