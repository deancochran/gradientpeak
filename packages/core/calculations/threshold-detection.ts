import { z } from "zod";
import {
  type BestEffortExtractionResult,
  bestEffortNumericDurationResultSchema,
} from "./best-efforts";

export const ACTIVITY_FILE_LTHR_CALCULATION_VERSION = "activity-file-lthr-v1";
export const LTHR_SOURCE_EFFORT_DURATION_SECONDS = 1_200;

export const detectedLactateThresholdHeartRateSchema = z
  .object({
    valueBpm: z.number().int().positive(),
    calculationVersion: z.literal(ACTIVITY_FILE_LTHR_CALCULATION_VERSION),
    sourceEffortCalculationVersion: z.string().trim().min(1),
    sourceEffort: bestEffortNumericDurationResultSchema.refine(
      (effort) => effort.durationSeconds === LTHR_SOURCE_EFFORT_DURATION_SECONDS,
      { message: "LTHR requires an available or partial 20-minute best effort" },
    ),
  })
  .strict();

export type DetectedLactateThresholdHeartRate = z.infer<
  typeof detectedLactateThresholdHeartRateSchema
>;

/** Derives the automatic LTHR observation from the canonical HR extraction. */
export function detectLactateThresholdHeartRateFromBestEfforts(
  extraction: BestEffortExtractionResult,
): DetectedLactateThresholdHeartRate | null {
  if (extraction.metric !== "heart_rate" || extraction.unit !== "bpm") return null;
  const sourceEffort = extraction.results.find(
    (effort) => effort.durationSeconds === LTHR_SOURCE_EFFORT_DURATION_SECONDS,
  );
  if (sourceEffort === undefined || sourceEffort.status === "unavailable") return null;
  return detectedLactateThresholdHeartRateSchema.parse({
    valueBpm: Math.round(sourceEffort.value * 0.95),
    calculationVersion: ACTIVITY_FILE_LTHR_CALCULATION_VERSION,
    sourceEffortCalculationVersion: extraction.calculationVersion,
    sourceEffort,
  });
}
