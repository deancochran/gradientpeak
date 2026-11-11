import { z } from "zod";

import {
  calculateIntervalWeightedNormalizedSeries,
  createIntervalWeightedNormalizedSeriesAccumulator,
  type IntervalWeightedNormalizedSeriesAccumulator,
  type NormalizedSeriesConfig,
  type NormalizedSeriesResult,
  type NormalizedSeriesSample,
  normalizedSeriesDiagnosticsSchema,
  normalizedSeriesUnavailableReasonSchema,
} from "./normalized-series";

export const RUNNING_NORMALIZED_GRADED_PACE_CALCULATION_VERSION =
  "running-normalized-graded-pace-v1";

const MAX_RUNNING_NGP_SAMPLES = 1_000_000;
const MAX_RUNNING_SPEED_METERS_PER_SECOND = 1_000_000;
const MAX_TIMESTAMP_SECONDS = 8_640_000_000_000;
const MIN_SUPPORTED_GRADE = -0.45;
const MAX_SUPPORTED_GRADE = 0.45;
const MIN_COST_RATIO = 0.5;
const MAX_COST_RATIO = 3;

/**
 * A timestamp-aligned running observation. The current speed and elevation
 * describe the preceding interval `(previous timestamp, current timestamp]`.
 */
export const runningNormalizedGradedPaceSampleSchema = z
  .object({
    timestampSeconds: z.number().finite().min(-MAX_TIMESTAMP_SECONDS).max(MAX_TIMESTAMP_SECONDS),
    speedMetersPerSecond: z
      .number()
      .finite()
      .nonnegative()
      .max(MAX_RUNNING_SPEED_METERS_PER_SECOND)
      .nullable(),
    elevationMeters: z.number().finite().nullable(),
    included: z.boolean().optional(),
  })
  .strict();

const runningNgpIdentityShape = {
  calculationVersion: z.literal(RUNNING_NORMALIZED_GRADED_PACE_CALCULATION_VERSION),
  unit: z.literal("meters_per_second"),
  diagnostics: normalizedSeriesDiagnosticsSchema,
};

export const runningNormalizedGradedPaceResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      valueMetersPerSecond: z.number().finite().nonnegative(),
      ...runningNgpIdentityShape,
    })
    .strict(),
  z
    .object({
      status: z.literal("partial"),
      valueMetersPerSecond: z.number().finite().nonnegative(),
      reason: z.literal("source_incomplete"),
      ...runningNgpIdentityShape,
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      valueMetersPerSecond: z.null(),
      reason: normalizedSeriesUnavailableReasonSchema,
      ...runningNgpIdentityShape,
    })
    .strict(),
]);

export type RunningNormalizedGradedPaceSample = z.infer<
  typeof runningNormalizedGradedPaceSampleSchema
>;
export type RunningNormalizedGradedPaceResult = z.infer<
  typeof runningNormalizedGradedPaceResultSchema
>;

/** Selects the numeric value without weakening unavailable evidence into zero. */
export function selectRunningNormalizedGradedSpeedMetersPerSecond(
  result: RunningNormalizedGradedPaceResult,
): number | null {
  return result.status === "unavailable" ? null : result.valueMetersPerSecond;
}

export interface RunningNormalizedGradedPaceAccumulator {
  addSample(sample: RunningNormalizedGradedPaceSample): void;
  getResult(): RunningNormalizedGradedPaceResult;
  reset(): void;
}

export interface RunningGradeAdjustedSpeedProjector {
  project(sample: RunningNormalizedGradedPaceSample): NormalizedSeriesSample;
  reset(): void;
}

/**
 * Deterministic grade-cost polynomial used by running NGP v1. Grade is a
 * decimal rise/run value; callers apply the declared v1 grade bounds.
 */
export function getCostFactor(grade: number): number {
  if (!Number.isFinite(grade)) throw new Error("Running grade must be finite");
  const g2 = grade * grade;
  const g3 = g2 * grade;
  const g4 = g3 * grade;
  const g5 = g4 * grade;
  return 155.4 * g5 - 30.4 * g4 - 43.3 * g3 + 46.3 * g2 + 19.5 * grade + 3.6;
}

/** Returns grade-adjusted speed in metres per second without rounding. */
export function calculateGradedSpeed(speed: number, grade: number): number {
  if (!Number.isFinite(speed) || speed < 0) {
    throw new Error("Running speed must be finite and nonnegative");
  }
  if (!Number.isFinite(grade)) throw new Error("Running grade must be finite");
  const boundedGrade = Math.max(MIN_SUPPORTED_GRADE, Math.min(grade, MAX_SUPPORTED_GRADE));
  const ratio = Math.max(
    MIN_COST_RATIO,
    Math.min(getCostFactor(boundedGrade) / getCostFactor(0), MAX_COST_RATIO),
  );
  return speed * ratio;
}

class GradeAdjustedSpeedProjector {
  private previousTimestampSeconds: number | null = null;
  private previousElevationMeters: number | null = null;

  project(input: RunningNormalizedGradedPaceSample): NormalizedSeriesSample {
    const sample = runningNormalizedGradedPaceSampleSchema.parse(input);
    const previousTimestampSeconds = this.previousTimestampSeconds;
    let value: number | null = null;

    // The first accepted observation only anchors the interval timeline. Its
    // speed is retained for transparent projection but does not contribute.
    if (previousTimestampSeconds === null) {
      value = sample.speedMetersPerSecond;
    } else if (
      sample.timestampSeconds > previousTimestampSeconds &&
      sample.speedMetersPerSecond !== null &&
      sample.elevationMeters !== null &&
      this.previousElevationMeters !== null
    ) {
      const intervalSeconds = sample.timestampSeconds - previousTimestampSeconds;
      const distanceMeters = sample.speedMetersPerSecond * intervalSeconds;
      const grade =
        distanceMeters > 0
          ? (sample.elevationMeters - this.previousElevationMeters) / distanceMeters
          : 0;
      value = calculateGradedSpeed(sample.speedMetersPerSecond, grade);
    }

    // Duplicate and reversed observations must reach the normalized-series
    // primitive so its evidence diagnostics remain authoritative. They never
    // replace the last accepted elevation anchor.
    if (previousTimestampSeconds === null || sample.timestampSeconds > previousTimestampSeconds) {
      this.previousTimestampSeconds = sample.timestampSeconds;
      this.previousElevationMeters = sample.elevationMeters;
    }

    return {
      timestampSeconds: sample.timestampSeconds,
      value,
      ...(sample.included === undefined ? {} : { included: sample.included }),
    };
  }

  reset(): void {
    this.previousTimestampSeconds = null;
    this.previousElevationMeters = null;
  }
}

export function createRunningGradeAdjustedSpeedProjector(): RunningGradeAdjustedSpeedProjector {
  return new GradeAdjustedSpeedProjector();
}

function mapNormalizedSeriesResult(
  result: NormalizedSeriesResult,
): RunningNormalizedGradedPaceResult {
  const identity = {
    calculationVersion: RUNNING_NORMALIZED_GRADED_PACE_CALCULATION_VERSION,
    unit: "meters_per_second",
    diagnostics: result.diagnostics,
  } as const;
  if (result.status === "unavailable") {
    return runningNormalizedGradedPaceResultSchema.parse({
      status: "unavailable",
      valueMetersPerSecond: null,
      reason: result.reason,
      ...identity,
    });
  }

  const sourceIncomplete =
    result.diagnostics.excludedGapDurationSeconds > 0 ||
    result.diagnostics.excludedMissingDurationSeconds > 0 ||
    result.diagnostics.duplicateTimestampCount > 0 ||
    result.diagnostics.reversedTimestampCount > 0;
  return runningNormalizedGradedPaceResultSchema.parse(
    sourceIncomplete
      ? {
          status: "partial",
          valueMetersPerSecond: result.value,
          reason: "source_incomplete",
          ...identity,
        }
      : {
          status: "available",
          valueMetersPerSecond: result.value,
          ...identity,
        },
  );
}

class DefaultRunningNormalizedGradedPaceAccumulator
  implements RunningNormalizedGradedPaceAccumulator
{
  private readonly projector = new GradeAdjustedSpeedProjector();
  private readonly normalizedSeries: IntervalWeightedNormalizedSeriesAccumulator;

  constructor(config?: NormalizedSeriesConfig) {
    this.normalizedSeries = createIntervalWeightedNormalizedSeriesAccumulator(config);
  }

  addSample(sample: RunningNormalizedGradedPaceSample): void {
    this.normalizedSeries.addSample(this.projector.project(sample));
  }

  getResult(): RunningNormalizedGradedPaceResult {
    return mapNormalizedSeriesResult(this.normalizedSeries.getResult());
  }

  reset(): void {
    this.projector.reset();
    this.normalizedSeries.reset();
  }
}

export function createRunningNormalizedGradedPaceAccumulator(
  config?: NormalizedSeriesConfig,
): RunningNormalizedGradedPaceAccumulator {
  return new DefaultRunningNormalizedGradedPaceAccumulator(config);
}

/**
 * Calculates running NGP v1 from timestamp-aligned speed/elevation evidence.
 * Missing values remain missing; invalid values are rejected.
 */
export function calculateRunningNormalizedGradedPace(input: {
  samples: readonly RunningNormalizedGradedPaceSample[];
  config?: NormalizedSeriesConfig;
}): RunningNormalizedGradedPaceResult {
  if (input.samples.length > MAX_RUNNING_NGP_SAMPLES) {
    throw new Error(`Running NGP cannot exceed ${MAX_RUNNING_NGP_SAMPLES} samples`);
  }
  const projector = new GradeAdjustedSpeedProjector();
  const result = calculateIntervalWeightedNormalizedSeries({
    samples: input.samples.map((sample) => projector.project(sample)),
    ...(input.config === undefined ? {} : { config: input.config }),
  });
  return mapNormalizedSeriesResult(result);
}

/**
 * Projects already aligned parallel arrays into timestamp-carrying adjusted
 * speed samples. This adapter never compacts missing alignment.
 */
export function calculateGradeAdjustedSpeedSeries(input: {
  speedMetersPerSecond: readonly (number | null)[];
  elevationMeters: readonly (number | null)[];
  timestampsSeconds: readonly number[];
  includedStream?: readonly boolean[];
}): NormalizedSeriesSample[] {
  if (
    input.speedMetersPerSecond.length !== input.elevationMeters.length ||
    input.speedMetersPerSecond.length !== input.timestampsSeconds.length
  ) {
    throw new Error("Grade-adjusted speed, elevation, and timestamps must have equal lengths");
  }
  if (
    input.includedStream !== undefined &&
    input.includedStream.length !== input.timestampsSeconds.length
  ) {
    throw new Error("Running inclusion flags must align with speed and elevation evidence");
  }
  const projector = new GradeAdjustedSpeedProjector();
  return input.timestampsSeconds.map((timestampSeconds, index) => {
    const speedMetersPerSecond = input.speedMetersPerSecond[index];
    const elevationMeters = input.elevationMeters[index];
    const included = input.includedStream?.[index];
    if (speedMetersPerSecond === undefined || elevationMeters === undefined) {
      throw new Error("Running NGP arrays must not contain sparse entries");
    }
    return projector.project({
      timestampSeconds,
      speedMetersPerSecond,
      elevationMeters,
      ...(included === undefined ? {} : { included }),
    });
  });
}

/** Calculates versioned NGP from an already grade-adjusted timestamped stream. */
export function calculateNGPResult(
  gradedSpeedStream: readonly (number | null)[],
  timestampsSeconds: readonly number[],
  config?: NormalizedSeriesConfig,
  includedStream?: readonly boolean[],
): RunningNormalizedGradedPaceResult {
  if (gradedSpeedStream.length !== timestampsSeconds.length) {
    throw new Error("NGP values and timestamps must have equal lengths");
  }
  if (includedStream !== undefined && includedStream.length !== gradedSpeedStream.length) {
    throw new Error("NGP inclusion flags must align with values");
  }
  const result = calculateIntervalWeightedNormalizedSeries({
    samples: gradedSpeedStream.map((value, index) => {
      const timestampSeconds = timestampsSeconds[index];
      const included = includedStream?.[index];
      if (value === undefined || timestampSeconds === undefined) {
        throw new Error("NGP arrays must not contain sparse entries");
      }
      return {
        timestampSeconds,
        value,
        ...(included === undefined ? {} : { included }),
      };
    }),
    ...(config === undefined ? {} : { config }),
  });
  return mapNormalizedSeriesResult(result);
}
