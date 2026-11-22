import { z } from "zod";

import {
  calculateIntervalWeightedNormalizedSeries,
  createIntervalWeightedNormalizedSeriesAccumulator,
  type IntervalWeightedNormalizedSeriesAccumulator,
  type NormalizedSeriesConfig,
  type NormalizedSeriesResult,
  normalizedSeriesDiagnosticsSchema,
  normalizedSeriesUnavailableReasonSchema,
} from "./normalized-series";

export const CYCLING_NORMALIZED_POWER_CALCULATION_VERSION = "cycling-normalized-power-v1";
const MAX_CYCLING_NORMALIZED_POWER_SAMPLES = 1_000_000;

export const cyclingNormalizedPowerSampleSchema = z
  .object({
    timestampSeconds: z.number().finite(),
    powerWatts: z.number().finite().nonnegative().nullable(),
    included: z.boolean().optional(),
  })
  .strict();

const cyclingNormalizedPowerIdentityShape = {
  calculationVersion: z.literal(CYCLING_NORMALIZED_POWER_CALCULATION_VERSION),
  unit: z.literal("watts"),
  diagnostics: normalizedSeriesDiagnosticsSchema,
};

export const cyclingNormalizedPowerResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      valueWatts: z.number().finite().nonnegative(),
      ...cyclingNormalizedPowerIdentityShape,
    })
    .strict(),
  z
    .object({
      status: z.literal("partial"),
      valueWatts: z.number().finite().nonnegative(),
      reason: z.literal("source_incomplete"),
      ...cyclingNormalizedPowerIdentityShape,
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      valueWatts: z.null(),
      reason: normalizedSeriesUnavailableReasonSchema,
      ...cyclingNormalizedPowerIdentityShape,
    })
    .strict(),
]);

export type CyclingNormalizedPowerSample = z.infer<typeof cyclingNormalizedPowerSampleSchema>;
export type CyclingNormalizedPowerResult = z.infer<typeof cyclingNormalizedPowerResultSchema>;

/** Selects the numeric value without weakening unavailable evidence into zero. */
export function selectCyclingNormalizedPowerWatts(
  result: CyclingNormalizedPowerResult,
): number | null {
  return result.status === "unavailable" ? null : result.valueWatts;
}

export interface CyclingNormalizedPowerAccumulator {
  addSample(sample: CyclingNormalizedPowerSample): void;
  getResult(): CyclingNormalizedPowerResult;
  reset(): void;
}

function mapNormalizedSeriesResult(result: NormalizedSeriesResult): CyclingNormalizedPowerResult {
  const identity = {
    calculationVersion: CYCLING_NORMALIZED_POWER_CALCULATION_VERSION,
    unit: "watts",
    diagnostics: result.diagnostics,
  } as const;
  if (result.status === "unavailable") {
    return cyclingNormalizedPowerResultSchema.parse({
      status: "unavailable",
      valueWatts: null,
      reason: result.reason,
      ...identity,
    });
  }

  const sourceIncomplete =
    result.diagnostics.excludedGapDurationSeconds > 0 ||
    result.diagnostics.excludedMissingDurationSeconds > 0 ||
    result.diagnostics.duplicateTimestampCount > 0 ||
    result.diagnostics.reversedTimestampCount > 0;
  return cyclingNormalizedPowerResultSchema.parse(
    sourceIncomplete
      ? {
          status: "partial",
          valueWatts: result.value,
          reason: "source_incomplete",
          ...identity,
        }
      : { status: "available", valueWatts: result.value, ...identity },
  );
}

function toNormalizedSeriesSample(sample: CyclingNormalizedPowerSample) {
  const parsed = cyclingNormalizedPowerSampleSchema.parse(sample);
  return {
    timestampSeconds: parsed.timestampSeconds,
    value: parsed.powerWatts,
    ...(parsed.included === undefined ? {} : { included: parsed.included }),
  };
}

class DefaultCyclingNormalizedPowerAccumulator implements CyclingNormalizedPowerAccumulator {
  private readonly normalizedSeries: IntervalWeightedNormalizedSeriesAccumulator;

  constructor(config?: NormalizedSeriesConfig) {
    this.normalizedSeries = createIntervalWeightedNormalizedSeriesAccumulator(config);
  }

  addSample(sample: CyclingNormalizedPowerSample): void {
    this.normalizedSeries.addSample(toNormalizedSeriesSample(sample));
  }

  getResult(): CyclingNormalizedPowerResult {
    return mapNormalizedSeriesResult(this.normalizedSeries.getResult());
  }

  reset(): void {
    this.normalizedSeries.reset();
  }
}

export function createCyclingNormalizedPowerAccumulator(
  config?: NormalizedSeriesConfig,
): CyclingNormalizedPowerAccumulator {
  return new DefaultCyclingNormalizedPowerAccumulator(config);
}

/**
 * Calculates timestamped cycling Normalized Power with a complete evidence
 * status. Values are full-precision watts; presentation rounding is external.
 */
export function calculateCyclingNormalizedPower(input: {
  samples: readonly CyclingNormalizedPowerSample[];
  config?: NormalizedSeriesConfig;
}): CyclingNormalizedPowerResult {
  if (input.samples.length > MAX_CYCLING_NORMALIZED_POWER_SAMPLES) {
    throw new Error(
      `Cycling Normalized Power cannot exceed ${MAX_CYCLING_NORMALIZED_POWER_SAMPLES} samples`,
    );
  }
  const result = calculateIntervalWeightedNormalizedSeries({
    samples: input.samples.map(toNormalizedSeriesSample),
    ...(input.config === undefined ? {} : { config: input.config }),
  });
  return mapNormalizedSeriesResult(result);
}

/**
 * Array compatibility boundary. Missing values remain `null`; invalid numeric
 * values are rejected, and unavailable evidence is never converted to zero.
 */
export function calculateNormalizedPower(
  powerStream: readonly (number | null)[],
  timestampsSeconds: readonly number[],
  config?: NormalizedSeriesConfig,
  includedStream?: readonly boolean[],
): CyclingNormalizedPowerResult {
  if (powerStream.length !== timestampsSeconds.length) {
    throw new Error("Normalized Power values and timestamps must have equal lengths");
  }
  if (includedStream !== undefined && includedStream.length !== powerStream.length) {
    throw new Error("Normalized Power inclusion flags must align with values");
  }

  const samples: CyclingNormalizedPowerSample[] = [];
  for (let index = 0; index < powerStream.length; index += 1) {
    const powerWatts = powerStream[index];
    const timestampSeconds = timestampsSeconds[index];
    const included = includedStream?.[index];
    if (powerWatts === undefined || timestampSeconds === undefined) {
      throw new Error("Normalized Power arrays must not contain sparse entries");
    }
    samples.push({
      timestampSeconds,
      powerWatts,
      ...(included === undefined ? {} : { included }),
    });
  }
  return calculateCyclingNormalizedPower({
    samples,
    ...(config === undefined ? {} : { config }),
  });
}

export function calculateNormalizedPowerResult(
  powerStream: readonly (number | null)[],
  timestampsSeconds: readonly number[],
  config?: NormalizedSeriesConfig,
  includedStream?: readonly boolean[],
): CyclingNormalizedPowerResult {
  return calculateNormalizedPower(powerStream, timestampsSeconds, config, includedStream);
}
