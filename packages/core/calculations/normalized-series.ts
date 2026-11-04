import { z } from "zod";

export const NORMALIZED_SERIES_CALCULATION_VERSION = "fixed-one-second-normalized-series-v2";

const MAX_NORMALIZED_SERIES_VALUE = 1_000_000_000;
const MAX_NORMALIZED_SERIES_SAMPLES = 1_000_000;
const MAX_NORMALIZED_SERIES_RESAMPLED_SECONDS = 10_000_000;
const MAX_TIMESTAMP_SECONDS = 8_640_000_000_000;
const FLOATING_POINT_EPSILON = 1e-9;
const RESAMPLE_INTERVAL_SECONDS = 1;

/**
 * A sample is an observation at an instant measured in Unix or relative seconds.
 * The value at the current sample describes the preceding interval
 * `(previous timestamp, current timestamp]`.
 */
export const normalizedSeriesSampleSchema = z
  .object({
    timestampSeconds: z.number().finite().min(-MAX_TIMESTAMP_SECONDS).max(MAX_TIMESTAMP_SECONDS),
    value: z.number().finite().nonnegative().max(MAX_NORMALIZED_SERIES_VALUE).nullable(),
    included: z.boolean().optional(),
  })
  .strict();

export const normalizedSeriesConfigSchema = z
  .object({
    windowSeconds: z.number().finite().positive().max(3_600).default(30),
    maxGapSeconds: z.number().finite().positive().max(3_600).default(5),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.maxGapSeconds > config.windowSeconds) {
      context.addIssue({
        code: "custom",
        path: ["maxGapSeconds"],
        message: "maxGapSeconds cannot exceed windowSeconds",
      });
    }
  });

export const normalizedSeriesUnavailableReasonSchema = z.enum([
  "no_samples",
  "no_contributing_intervals",
  "insufficient_window",
]);

export const normalizedSeriesDiagnosticsSchema = z
  .object({
    calculationVersion: z.literal(NORMALIZED_SERIES_CALCULATION_VERSION),
    intervalConvention: z.literal("current_sample_applies_to_preceding_interval"),
    firstWindowBehavior: z.literal("full_window_required"),
    resamplingBehavior: z.literal("one_second_segment_aligned"),
    finalMeanBehavior: z.literal("one_vote_per_complete_resampled_second"),
    gapBehavior: z.literal("exclude_entire_interval_and_reset_window"),
    missingValueBehavior: z.literal("exclude_interval_and_reset_window"),
    inactiveBehavior: z.literal("exclude_interval_and_reset_window"),
    orderingBehavior: z.literal("ignore_duplicate_or_reversed_sample"),
    roundingBehavior: z.literal("full_precision"),
    windowSeconds: z.number().finite().positive(),
    maxGapSeconds: z.number().finite().positive(),
    resampleIntervalSeconds: z.literal(RESAMPLE_INTERVAL_SECONDS),
    sampleCount: z.number().int().nonnegative(),
    acceptedSampleCount: z.number().int().nonnegative(),
    duplicateTimestampCount: z.number().int().nonnegative(),
    reversedTimestampCount: z.number().int().nonnegative(),
    missingValueSampleCount: z.number().int().nonnegative(),
    segmentCount: z.number().int().nonnegative(),
    resampledSecondCount: z.number().int().nonnegative(),
    sourceSpanSeconds: z.number().finite().nonnegative(),
    eligibleDurationSeconds: z.number().finite().nonnegative(),
    sourceTimeCoverage: z.number().finite().min(0).max(1),
    contributingDurationSeconds: z.number().finite().nonnegative(),
    normalizedDurationSeconds: z.number().finite().nonnegative(),
    excludedGapDurationSeconds: z.number().finite().nonnegative(),
    excludedInactiveDurationSeconds: z.number().finite().nonnegative(),
    excludedMissingDurationSeconds: z.number().finite().nonnegative(),
  })
  .strict();

export const normalizedSeriesResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      value: z.number().finite().nonnegative(),
      diagnostics: normalizedSeriesDiagnosticsSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      value: z.null(),
      reason: normalizedSeriesUnavailableReasonSchema,
      diagnostics: normalizedSeriesDiagnosticsSchema,
    })
    .strict(),
]);

export type NormalizedSeriesSample = z.infer<typeof normalizedSeriesSampleSchema>;
export type NormalizedSeriesConfig = z.input<typeof normalizedSeriesConfigSchema>;
export type NormalizedSeriesResult = z.infer<typeof normalizedSeriesResultSchema>;

export interface IntervalWeightedNormalizedSeriesAccumulator {
  addSample(sample: NormalizedSeriesSample): void;
  getResult(): NormalizedSeriesResult;
  reset(): void;
}

interface TimedValue {
  value: number;
  seconds: number;
}

interface NormalizedSeriesState {
  queue: TimedValue[];
  queueSeconds: number;
  queueWeightedSum: number;
  fourthPowerSum: number;
  fourthPowerCompensation: number;
  fourthPowerSampleCount: number;
  previousTimestampSeconds: number | null;
  firstAcceptedTimestampSeconds: number | null;
  latestAcceptedTimestampSeconds: number | null;
  sampleCount: number;
  acceptedSampleCount: number;
  duplicateTimestampCount: number;
  reversedTimestampCount: number;
  missingValueSampleCount: number;
  segmentCount: number;
  resampledSecondCount: number;
  inContributingSegment: boolean;
  nextEvaluationTimestampSeconds: number | null;
  contributingDurationSeconds: number;
  excludedGapDurationSeconds: number;
  excludedInactiveDurationSeconds: number;
  excludedMissingDurationSeconds: number;
}

function createState(): NormalizedSeriesState {
  return {
    queue: [],
    queueSeconds: 0,
    queueWeightedSum: 0,
    fourthPowerSum: 0,
    fourthPowerCompensation: 0,
    fourthPowerSampleCount: 0,
    previousTimestampSeconds: null,
    firstAcceptedTimestampSeconds: null,
    latestAcceptedTimestampSeconds: null,
    sampleCount: 0,
    acceptedSampleCount: 0,
    duplicateTimestampCount: 0,
    reversedTimestampCount: 0,
    missingValueSampleCount: 0,
    segmentCount: 0,
    resampledSecondCount: 0,
    inContributingSegment: false,
    nextEvaluationTimestampSeconds: null,
    contributingDurationSeconds: 0,
    excludedGapDurationSeconds: 0,
    excludedInactiveDurationSeconds: 0,
    excludedMissingDurationSeconds: 0,
  };
}

function resetRollingWindow(state: NormalizedSeriesState): void {
  state.queue = [];
  state.queueSeconds = 0;
  state.queueWeightedSum = 0;
  state.inContributingSegment = false;
  state.nextEvaluationTimestampSeconds = null;
}

function appendTimedValue(state: NormalizedSeriesState, value: number, seconds: number): void {
  const last = state.queue.at(-1);
  if (last?.value === value) {
    last.seconds += seconds;
  } else {
    state.queue.push({ value, seconds });
  }
  state.queueSeconds += seconds;
  state.queueWeightedSum += value * seconds;
}

function removeOldestSeconds(state: NormalizedSeriesState, seconds: number): void {
  let remainingSeconds = seconds;
  while (remainingSeconds > FLOATING_POINT_EPSILON) {
    const first = state.queue[0];
    if (first === undefined) break;
    const removedSeconds = Math.min(remainingSeconds, first.seconds);
    first.seconds -= removedSeconds;
    state.queueSeconds -= removedSeconds;
    state.queueWeightedSum -= first.value * removedSeconds;
    remainingSeconds -= removedSeconds;
    if (first.seconds <= FLOATING_POINT_EPSILON) state.queue.shift();
  }
  if (Math.abs(state.queueSeconds) <= FLOATING_POINT_EPSILON) state.queueSeconds = 0;
  if (Math.abs(state.queueWeightedSum) <= FLOATING_POINT_EPSILON) {
    state.queueWeightedSum = 0;
  }
}

/**
 * Adds one timestamp-backed interval to a segment-aligned one-second grid.
 * Every completed grid second receives one trailing-window value, so adding
 * equivalent source samples does not change the final weighting.
 */
function addContributingInterval(
  state: NormalizedSeriesState,
  value: number,
  intervalStartSeconds: number,
  intervalEndSeconds: number,
  seconds: number,
  windowSeconds: number,
): void {
  if (state.nextEvaluationTimestampSeconds === null) {
    state.nextEvaluationTimestampSeconds = intervalStartSeconds + RESAMPLE_INTERVAL_SECONDS;
  }

  let cursorSeconds = intervalStartSeconds;
  while (state.nextEvaluationTimestampSeconds <= intervalEndSeconds + FLOATING_POINT_EPSILON) {
    if (state.resampledSecondCount >= MAX_NORMALIZED_SERIES_RESAMPLED_SECONDS) {
      throw new Error(
        `Normalized series cannot exceed ${MAX_NORMALIZED_SERIES_RESAMPLED_SECONDS} resampled seconds`,
      );
    }
    state.resampledSecondCount += 1;
    const sliceSeconds = state.nextEvaluationTimestampSeconds - cursorSeconds;
    if (sliceSeconds > FLOATING_POINT_EPSILON) {
      appendTimedValue(state, value, sliceSeconds);
    }
    if (state.queueSeconds > windowSeconds) {
      removeOldestSeconds(state, state.queueSeconds - windowSeconds);
    }
    if (state.queueSeconds + FLOATING_POINT_EPSILON >= windowSeconds) {
      const rollingAverage = state.queueWeightedSum / windowSeconds;
      const fourthPower = rollingAverage ** 4;
      const compensatedValue = fourthPower - state.fourthPowerCompensation;
      const nextSum = state.fourthPowerSum + compensatedValue;
      state.fourthPowerCompensation = nextSum - state.fourthPowerSum - compensatedValue;
      state.fourthPowerSum = nextSum;
      state.fourthPowerSampleCount += 1;
    }
    cursorSeconds = state.nextEvaluationTimestampSeconds;
    state.nextEvaluationTimestampSeconds += RESAMPLE_INTERVAL_SECONDS;
  }

  const remainderSeconds = intervalEndSeconds - cursorSeconds;
  if (remainderSeconds > FLOATING_POINT_EPSILON) {
    appendTimedValue(state, value, remainderSeconds);
    if (state.queueSeconds > windowSeconds) {
      removeOldestSeconds(state, state.queueSeconds - windowSeconds);
    }
  }

  // The parsed timestamps define `seconds`; retaining this assertion close to
  // the resampling loop catches future interval-boundary drift without changing
  // runtime behavior for sub-second floating-point noise.
  if (Math.abs(intervalEndSeconds - intervalStartSeconds - seconds) > FLOATING_POINT_EPSILON) {
    throw new Error("Normalized series interval duration is inconsistent");
  }
}

class DefaultIntervalWeightedNormalizedSeriesAccumulator
  implements IntervalWeightedNormalizedSeriesAccumulator
{
  private readonly config: z.output<typeof normalizedSeriesConfigSchema>;
  private state = createState();

  constructor(config?: NormalizedSeriesConfig) {
    this.config = normalizedSeriesConfigSchema.parse(config ?? {});
  }

  addSample(input: NormalizedSeriesSample): void {
    const sample = normalizedSeriesSampleSchema.parse(input);
    const state = this.state;
    state.sampleCount += 1;

    const previousTimestampSeconds = state.previousTimestampSeconds;
    if (previousTimestampSeconds !== null) {
      if (sample.timestampSeconds === previousTimestampSeconds) {
        state.duplicateTimestampCount += 1;
        return;
      }
      if (sample.timestampSeconds < previousTimestampSeconds) {
        state.reversedTimestampCount += 1;
        return;
      }
    }

    state.acceptedSampleCount += 1;
    state.previousTimestampSeconds = sample.timestampSeconds;
    state.latestAcceptedTimestampSeconds = sample.timestampSeconds;
    if (state.firstAcceptedTimestampSeconds === null) {
      state.firstAcceptedTimestampSeconds = sample.timestampSeconds;
    }
    if (sample.value === null) state.missingValueSampleCount += 1;
    if (previousTimestampSeconds === null) return;

    const intervalSeconds = sample.timestampSeconds - previousTimestampSeconds;
    if (sample.included === false) {
      state.excludedInactiveDurationSeconds += intervalSeconds;
      resetRollingWindow(state);
      return;
    }
    if (sample.value === null) {
      state.excludedMissingDurationSeconds += intervalSeconds;
      resetRollingWindow(state);
      return;
    }
    if (intervalSeconds > this.config.maxGapSeconds) {
      state.excludedGapDurationSeconds += intervalSeconds;
      resetRollingWindow(state);
      return;
    }

    if (!state.inContributingSegment) {
      state.inContributingSegment = true;
      state.segmentCount += 1;
    }
    state.contributingDurationSeconds += intervalSeconds;
    addContributingInterval(
      state,
      sample.value,
      previousTimestampSeconds,
      sample.timestampSeconds,
      intervalSeconds,
      this.config.windowSeconds,
    );
  }

  getResult(): NormalizedSeriesResult {
    const state = this.state;
    const firstTimestamp = state.firstAcceptedTimestampSeconds;
    const latestTimestamp = state.latestAcceptedTimestampSeconds;
    const eligibleDurationSeconds =
      state.contributingDurationSeconds +
      state.excludedGapDurationSeconds +
      state.excludedMissingDurationSeconds;
    const diagnostics = {
      calculationVersion: NORMALIZED_SERIES_CALCULATION_VERSION,
      intervalConvention: "current_sample_applies_to_preceding_interval",
      firstWindowBehavior: "full_window_required",
      resamplingBehavior: "one_second_segment_aligned",
      finalMeanBehavior: "one_vote_per_complete_resampled_second",
      gapBehavior: "exclude_entire_interval_and_reset_window",
      missingValueBehavior: "exclude_interval_and_reset_window",
      inactiveBehavior: "exclude_interval_and_reset_window",
      orderingBehavior: "ignore_duplicate_or_reversed_sample",
      roundingBehavior: "full_precision",
      windowSeconds: this.config.windowSeconds,
      maxGapSeconds: this.config.maxGapSeconds,
      resampleIntervalSeconds: RESAMPLE_INTERVAL_SECONDS,
      sampleCount: state.sampleCount,
      acceptedSampleCount: state.acceptedSampleCount,
      duplicateTimestampCount: state.duplicateTimestampCount,
      reversedTimestampCount: state.reversedTimestampCount,
      missingValueSampleCount: state.missingValueSampleCount,
      segmentCount: state.segmentCount,
      resampledSecondCount: state.resampledSecondCount,
      sourceSpanSeconds:
        firstTimestamp === null || latestTimestamp === null ? 0 : latestTimestamp - firstTimestamp,
      eligibleDurationSeconds,
      sourceTimeCoverage:
        eligibleDurationSeconds > 0
          ? state.contributingDurationSeconds / eligibleDurationSeconds
          : 0,
      contributingDurationSeconds: state.contributingDurationSeconds,
      normalizedDurationSeconds: state.fourthPowerSampleCount * RESAMPLE_INTERVAL_SECONDS,
      excludedGapDurationSeconds: state.excludedGapDurationSeconds,
      excludedInactiveDurationSeconds: state.excludedInactiveDurationSeconds,
      excludedMissingDurationSeconds: state.excludedMissingDurationSeconds,
    };

    if (state.sampleCount === 0 || state.acceptedSampleCount === 0) {
      return normalizedSeriesResultSchema.parse({
        status: "unavailable",
        value: null,
        reason: "no_samples",
        diagnostics,
      });
    }
    if (state.contributingDurationSeconds <= 0) {
      return normalizedSeriesResultSchema.parse({
        status: "unavailable",
        value: null,
        reason: "no_contributing_intervals",
        diagnostics,
      });
    }
    if (state.fourthPowerSampleCount <= 0) {
      return normalizedSeriesResultSchema.parse({
        status: "unavailable",
        value: null,
        reason: "insufficient_window",
        diagnostics,
      });
    }

    return normalizedSeriesResultSchema.parse({
      status: "available",
      value: (state.fourthPowerSum / state.fourthPowerSampleCount) ** 0.25,
      diagnostics,
    });
  }

  reset(): void {
    this.state = createState();
  }
}

export function createIntervalWeightedNormalizedSeriesAccumulator(
  config?: NormalizedSeriesConfig,
): IntervalWeightedNormalizedSeriesAccumulator {
  return new DefaultIntervalWeightedNormalizedSeriesAccumulator(config);
}

export function calculateIntervalWeightedNormalizedSeries(input: {
  samples: readonly NormalizedSeriesSample[];
  config?: NormalizedSeriesConfig;
}): NormalizedSeriesResult {
  if (input.samples.length > MAX_NORMALIZED_SERIES_SAMPLES) {
    throw new Error(`Normalized series cannot exceed ${MAX_NORMALIZED_SERIES_SAMPLES} samples`);
  }
  const accumulator = createIntervalWeightedNormalizedSeriesAccumulator(input.config);
  for (const sample of input.samples) accumulator.addSample(sample);
  return accumulator.getResult();
}
