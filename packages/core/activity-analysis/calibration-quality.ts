import { z } from "zod";

export const activityCalibrationQualitySchema = z.object({
  source: z.enum([
    "manual",
    "validated_test",
    "observed_effort",
    "provider",
    "modeled",
    "estimated",
    "unknown",
  ]),
  observed_at: z.string().nullable(),
  valid_at: z.string().nullable().optional(),
  confidence: z.enum(["high", "medium", "low", "unknown"]),
  stale: z.boolean(),
  estimate: z.boolean(),
  calculation_version: z.string().nullable().optional(),
  evidence_fingerprint: z.string().trim().min(1).nullable().optional(),
});

export type ActivityCalibrationQuality = z.infer<typeof activityCalibrationQualitySchema>;
