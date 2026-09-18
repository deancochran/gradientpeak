import { z } from "zod";
import {
  type BestEffortExtractionResult,
  type BestEffortSample,
  bestEffortExtractionResultSchema,
  bestEffortNumericDurationResultSchema,
  bestEffortSampleSchema,
  selectExactBestEffortWindow,
} from "./best-efforts";

export const ACTIVITY_FILE_LTHR_CALCULATION_VERSION = "activity-file-lthr-30m-final-20m-v1";
export const ACTIVITY_FILE_LTHR_EFFORT_METHOD = "activity_file_lthr_detection";
export const LTHR_FIELD_TEST_DURATION_SECONDS = 1_800;
export const LTHR_FINAL_WINDOW_DURATION_SECONDS = 1_200;

export const detectedLactateThresholdHeartRateSchema = z
  .object({
    valueBpm: z.number().int().positive(),
    calculationVersion: z.literal(ACTIVITY_FILE_LTHR_CALCULATION_VERSION),
    sourceEffortCalculationVersion: z.string().trim().min(1),
    sourceEffort: bestEffortNumericDurationResultSchema.refine(
      (effort) => effort.durationSeconds === LTHR_FIELD_TEST_DURATION_SECONDS,
      { message: "LTHR requires an available or partial 30-minute heart-rate effort" },
    ),
    thresholdWindow: bestEffortNumericDurationResultSchema.refine(
      (effort) => effort.durationSeconds === LTHR_FINAL_WINDOW_DURATION_SECONDS,
      { message: "LTHR requires the final 20-minute heart-rate window" },
    ),
  })
  .strict();

export type DetectedLactateThresholdHeartRate = z.infer<
  typeof detectedLactateThresholdHeartRateSchema
>;

function calculateFinalTimeWeightedWindow(input: {
  samples: readonly BestEffortSample[];
  startTimestampSeconds: number;
  endTimestampSeconds: number;
  maxGapSeconds: number;
}): number | null {
  let previousTimestampSeconds: number | null = null;
  let coveredSeconds = 0;
  let weightedSum = 0;

  for (const unknownSample of input.samples) {
    const sample = bestEffortSampleSchema.parse(unknownSample);
    if (previousTimestampSeconds !== null) {
      if (sample.timestampSeconds <= previousTimestampSeconds) continue;
      const intervalStart = Math.max(previousTimestampSeconds, input.startTimestampSeconds);
      const intervalEnd = Math.min(sample.timestampSeconds, input.endTimestampSeconds);
      if (intervalEnd > intervalStart) {
        if (
          sample.included === false ||
          sample.value === null ||
          sample.timestampSeconds - previousTimestampSeconds > input.maxGapSeconds
        ) {
          return null;
        }
        const durationSeconds = intervalEnd - intervalStart;
        coveredSeconds += durationSeconds;
        weightedSum += sample.value * durationSeconds;
      }
    }
    previousTimestampSeconds = sample.timestampSeconds;
  }

  return Math.abs(coveredSeconds - LTHR_FINAL_WINDOW_DURATION_SECONDS) <= 0.000_001
    ? weightedSum / LTHR_FINAL_WINDOW_DURATION_SECONDS
    : null;
}

/**
 * Canonical 30-minute field-test detector. It selects the exact 30-minute
 * heart-rate effort, then derives LTHR from that effort's final 20 minutes.
 */
export function detectLactateThresholdHeartRate(input: {
  extraction: BestEffortExtractionResult;
  samples: readonly BestEffortSample[];
}): DetectedLactateThresholdHeartRate | null {
  const extraction = bestEffortExtractionResultSchema.parse(input.extraction);
  if (extraction.metric !== "heart_rate" || extraction.unit !== "bpm") return null;
  const selected = selectExactBestEffortWindow(extraction, LTHR_FIELD_TEST_DURATION_SECONDS);
  if (selected.status !== "found" || selected.result.status === "unavailable") return null;
  const sourceEffort = selected.result;
  const thresholdStartTimestampSeconds =
    sourceEffort.endTimestampSeconds - LTHR_FINAL_WINDOW_DURATION_SECONDS;
  const valueBpm = calculateFinalTimeWeightedWindow({
    samples: input.samples,
    startTimestampSeconds: thresholdStartTimestampSeconds,
    endTimestampSeconds: sourceEffort.endTimestampSeconds,
    maxGapSeconds: extraction.maxGapSeconds,
  });
  if (valueBpm === null) return null;
  return detectedLactateThresholdHeartRateSchema.parse({
    valueBpm: Math.round(valueBpm),
    calculationVersion: ACTIVITY_FILE_LTHR_CALCULATION_VERSION,
    sourceEffortCalculationVersion: extraction.calculationVersion,
    sourceEffort,
    thresholdWindow: {
      status: sourceEffort.status,
      ...(sourceEffort.status === "partial" ? { reason: sourceEffort.reason } : {}),
      durationSeconds: LTHR_FINAL_WINDOW_DURATION_SECONDS,
      value: valueBpm,
      startTimestampSeconds: thresholdStartTimestampSeconds,
      endTimestampSeconds: sourceEffort.endTimestampSeconds,
      contributingDurationSeconds: LTHR_FINAL_WINDOW_DURATION_SECONDS,
      windowCoverage: 1,
    },
  });
}
