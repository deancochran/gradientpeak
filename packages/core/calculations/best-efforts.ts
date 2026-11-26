import { z } from "zod";

export const BEST_EFFORT_CALCULATION_VERSION = "best-effort-extraction-v1";

export const STANDARD_BEST_EFFORT_DURATIONS_SECONDS = [
  5, 10, 30, 60, 300, 600, 1_200, 1_800, 3_600, 5_400, 10_800,
] as const;

export const DEFAULT_BEST_EFFORT_MAX_GAP_SECONDS = 2;

const MAX_BEST_EFFORT_SAMPLES = 1_000_000;
const MAX_BEST_EFFORT_DURATIONS = 64;
const MAX_BEST_EFFORT_DURATION_SECONDS = 14_400;
const MAX_BEST_EFFORT_VALUE = 1_000_000_000;
const MAX_TIMESTAMP_SECONDS = 8_640_000_000_000;

export const bestEffortMetricSchema = z.enum([
  "power",
  "speed",
  "grade_adjusted_speed",
  "heart_rate",
]);

export const bestEffortUnitSchema = z.enum(["watts", "meters_per_second", "bpm"]);

export const bestEffortSampleSchema = z
  .object({
    timestampSeconds: z.number().finite().min(-MAX_TIMESTAMP_SECONDS).max(MAX_TIMESTAMP_SECONDS),
    value: z.number().finite().nonnegative().max(MAX_BEST_EFFORT_VALUE).nullable(),
    included: z.boolean().optional(),
  })
  .strict();

export const bestEffortExtractionConfigSchema = z
  .object({
    durationsSeconds: z
      .array(z.number().int().positive().max(MAX_BEST_EFFORT_DURATION_SECONDS))
      .min(1)
      .max(MAX_BEST_EFFORT_DURATIONS)
      .default([...STANDARD_BEST_EFFORT_DURATIONS_SECONDS]),
    maxGapSeconds: z
      .number()
      .finite()
      .positive()
      .max(3_600)
      .default(DEFAULT_BEST_EFFORT_MAX_GAP_SECONDS),
    unpositionedValueCount: z.number().int().nonnegative().default(0),
  })
  .strict()
  .superRefine((config, context) => {
    const uniqueDurations = new Set(config.durationsSeconds);
    if (uniqueDurations.size !== config.durationsSeconds.length) {
      context.addIssue({
        code: "custom",
        path: ["durationsSeconds"],
        message: "Best-effort durations must be unique",
      });
    }
  });

export const bestEffortSourceDiagnosticsSchema = z
  .object({
    sampleCount: z.number().int().nonnegative(),
    acceptedSampleCount: z.number().int().nonnegative(),
    duplicateTimestampCount: z.number().int().nonnegative(),
    reversedTimestampCount: z.number().int().nonnegative(),
    missingValueSampleCount: z.number().int().nonnegative(),
    unpositionedValueCount: z.number().int().nonnegative(),
    segmentCount: z.number().int().nonnegative(),
    sourceSpanSeconds: z.number().finite().nonnegative(),
    contributingDurationSeconds: z.number().finite().nonnegative(),
    excludedGapDurationSeconds: z.number().finite().nonnegative(),
    excludedMissingDurationSeconds: z.number().finite().nonnegative(),
    excludedInactiveDurationSeconds: z.number().finite().nonnegative(),
    sourceTimeCoverage: z.number().finite().min(0).max(1),
    maximumContinuousDurationSeconds: z.number().finite().nonnegative(),
  })
  .strict();

const bestEffortWindowShape = {
  durationSeconds: z.number().int().positive(),
  value: z.number().finite().nonnegative(),
  startTimestampSeconds: z.number().finite(),
  endTimestampSeconds: z.number().finite(),
  contributingDurationSeconds: z.number().finite().positive(),
  windowCoverage: z.literal(1),
};

const availableBestEffortDurationResultSchema = z
  .object({
    status: z.literal("available"),
    ...bestEffortWindowShape,
  })
  .strict();

const partialBestEffortDurationResultSchema = z
  .object({
    status: z.literal("partial"),
    reason: z.literal("source_incomplete"),
    ...bestEffortWindowShape,
  })
  .strict();

export const bestEffortNumericDurationResultSchema = z.discriminatedUnion("status", [
  availableBestEffortDurationResultSchema,
  partialBestEffortDurationResultSchema,
]);

const unavailableBestEffortDurationResultSchema = z
  .object({
    status: z.literal("unavailable"),
    reason: z.enum(["no_samples", "no_contributing_intervals", "insufficient_contiguous_coverage"]),
    durationSeconds: z.number().int().positive(),
    value: z.null(),
  })
  .strict();

export const bestEffortDurationResultSchema = z.discriminatedUnion("status", [
  availableBestEffortDurationResultSchema,
  partialBestEffortDurationResultSchema,
  unavailableBestEffortDurationResultSchema,
]);

export const bestEffortExtractionResultSchema = z
  .object({
    calculationVersion: z.literal(BEST_EFFORT_CALCULATION_VERSION),
    metric: bestEffortMetricSchema,
    unit: bestEffortUnitSchema,
    timestampConvention: z.literal("absolute_or_relative_seconds_on_one_monotonic_timeline"),
    intervalConvention: z.literal("current_sample_applies_to_preceding_interval"),
    gapBehavior: z.literal("exclude_entire_interval_and_reset_segment"),
    missingValueBehavior: z.literal("exclude_interval_and_reset_segment"),
    inactiveBehavior: z.literal("exclude_interval_and_reset_segment"),
    orderingBehavior: z.literal("ignore_duplicate_or_reversed_sample"),
    tieBehavior: z.literal("earliest_exact_window"),
    maxGapSeconds: z.number().finite().positive(),
    diagnostics: bestEffortSourceDiagnosticsSchema,
    results: z.array(bestEffortDurationResultSchema).min(1).max(MAX_BEST_EFFORT_DURATIONS),
  })
  .strict();

export type BestEffortMetric = z.infer<typeof bestEffortMetricSchema>;
export type BestEffortSample = z.infer<typeof bestEffortSampleSchema>;
export type BestEffortExtractionConfig = z.input<typeof bestEffortExtractionConfigSchema>;
export type BestEffortSourceDiagnostics = z.infer<typeof bestEffortSourceDiagnosticsSchema>;
export type BestEffortNumericDurationResult = z.infer<typeof bestEffortNumericDurationResultSchema>;
export type BestEffortDurationResult = z.infer<typeof bestEffortDurationResultSchema>;
export type BestEffortExtractionResult = z.infer<typeof bestEffortExtractionResultSchema>;

export type ExactBestEffortWindowSelection =
  | { status: "found"; result: BestEffortDurationResult }
  | { status: "missing" }
  | { status: "ambiguous" };

/**
 * Selects only the result for one exact configured duration. It never substitutes
 * a shorter, longer, or longest-continuous effort. Duplicate exact results are
 * reported as ambiguous rather than resolved by input order.
 */
export function selectExactBestEffortWindow(
  extraction: BestEffortExtractionResult,
  durationSeconds: number,
): ExactBestEffortWindowSelection {
  const parsedExtraction = bestEffortExtractionResultSchema.parse(extraction);
  const parsedDuration = z.number().int().positive().parse(durationSeconds);
  const matches = parsedExtraction.results.filter(
    (result) => result.durationSeconds === parsedDuration,
  );
  if (matches.length === 0) return { status: "missing" };
  if (matches.length > 1) return { status: "ambiguous" };
  const result = matches[0];
  if (result === undefined) return { status: "missing" };
  return { status: "found", result };
}

interface ContinuousSignalSegment {
  boundaries: number[];
  values: number[];
  prefixAreas: number[];
}

interface PreparedBestEffortSource {
  segments: ContinuousSignalSegment[];
  diagnostics: BestEffortSourceDiagnostics;
}

function unitForMetric(metric: BestEffortMetric): z.infer<typeof bestEffortUnitSchema> {
  switch (metric) {
    case "power":
      return "watts";
    case "speed":
    case "grade_adjusted_speed":
      return "meters_per_second";
    case "heart_rate":
      return "bpm";
  }
}

function appendInterval(
  segment: ContinuousSignalSegment,
  startTimestampSeconds: number,
  endTimestampSeconds: number,
  value: number,
): void {
  const currentEnd = segment.boundaries.at(-1);
  const currentArea = segment.prefixAreas.at(-1);
  if (
    currentEnd === undefined ||
    currentArea === undefined ||
    currentEnd !== startTimestampSeconds
  ) {
    throw new Error("Best-effort segment intervals must be contiguous");
  }
  segment.values.push(value);
  segment.boundaries.push(endTimestampSeconds);
  segment.prefixAreas.push(currentArea + value * (endTimestampSeconds - startTimestampSeconds));
}

function prepareSource(
  samples: readonly BestEffortSample[],
  maxGapSeconds: number,
  unpositionedValueCount: number,
): PreparedBestEffortSource {
  const segments: ContinuousSignalSegment[] = [];
  let currentSegment: ContinuousSignalSegment | null = null;
  let previousTimestampSeconds: number | null = null;
  let firstAcceptedTimestampSeconds: number | null = null;
  let latestAcceptedTimestampSeconds: number | null = null;
  let acceptedSampleCount = 0;
  let duplicateTimestampCount = 0;
  let reversedTimestampCount = 0;
  let missingValueSampleCount = 0;
  let contributingDurationSeconds = 0;
  let excludedGapDurationSeconds = 0;
  let excludedMissingDurationSeconds = 0;
  let excludedInactiveDurationSeconds = 0;
  let maximumContinuousDurationSeconds = 0;

  const finishSegment = (): void => {
    if (currentSegment === null || currentSegment.values.length === 0) {
      currentSegment = null;
      return;
    }
    const start = currentSegment.boundaries[0];
    const end = currentSegment.boundaries.at(-1);
    if (start === undefined || end === undefined) {
      throw new Error("Best-effort segment boundaries are incomplete");
    }
    maximumContinuousDurationSeconds = Math.max(maximumContinuousDurationSeconds, end - start);
    segments.push(currentSegment);
    currentSegment = null;
  };

  for (const input of samples) {
    const sample = bestEffortSampleSchema.parse(input);
    if (sample.value === null) missingValueSampleCount += 1;

    if (previousTimestampSeconds !== null) {
      if (sample.timestampSeconds === previousTimestampSeconds) {
        duplicateTimestampCount += 1;
        continue;
      }
      if (sample.timestampSeconds < previousTimestampSeconds) {
        reversedTimestampCount += 1;
        continue;
      }
    }

    acceptedSampleCount += 1;
    if (firstAcceptedTimestampSeconds === null) {
      firstAcceptedTimestampSeconds = sample.timestampSeconds;
    }
    latestAcceptedTimestampSeconds = sample.timestampSeconds;
    if (previousTimestampSeconds === null) {
      previousTimestampSeconds = sample.timestampSeconds;
      continue;
    }

    const intervalSeconds = sample.timestampSeconds - previousTimestampSeconds;
    const intervalStartSeconds = previousTimestampSeconds;
    previousTimestampSeconds = sample.timestampSeconds;

    if (sample.included === false) {
      excludedInactiveDurationSeconds += intervalSeconds;
      finishSegment();
      continue;
    }
    if (sample.value === null) {
      excludedMissingDurationSeconds += intervalSeconds;
      finishSegment();
      continue;
    }
    if (intervalSeconds > maxGapSeconds) {
      excludedGapDurationSeconds += intervalSeconds;
      finishSegment();
      continue;
    }

    if (currentSegment === null) {
      currentSegment = {
        boundaries: [intervalStartSeconds],
        values: [],
        prefixAreas: [0],
      };
    }
    appendInterval(currentSegment, intervalStartSeconds, sample.timestampSeconds, sample.value);
    contributingDurationSeconds += intervalSeconds;
  }
  finishSegment();

  const sourceSpanSeconds =
    firstAcceptedTimestampSeconds === null || latestAcceptedTimestampSeconds === null
      ? 0
      : latestAcceptedTimestampSeconds - firstAcceptedTimestampSeconds;
  const coverageEligibleDurationSeconds =
    contributingDurationSeconds + excludedGapDurationSeconds + excludedMissingDurationSeconds;
  return {
    segments,
    diagnostics: bestEffortSourceDiagnosticsSchema.parse({
      sampleCount: samples.length,
      acceptedSampleCount,
      duplicateTimestampCount,
      reversedTimestampCount,
      missingValueSampleCount,
      unpositionedValueCount,
      segmentCount: segments.length,
      sourceSpanSeconds,
      contributingDurationSeconds,
      excludedGapDurationSeconds,
      excludedMissingDurationSeconds,
      excludedInactiveDurationSeconds,
      sourceTimeCoverage:
        coverageEligibleDurationSeconds > 0
          ? contributingDurationSeconds / coverageEligibleDurationSeconds
          : 0,
      maximumContinuousDurationSeconds,
    }),
  };
}

function integratedAreaAt(segment: ContinuousSignalSegment, timestampSeconds: number): number {
  const boundaries = segment.boundaries;
  let left = 0;
  let right = segment.values.length;
  while (left < right) {
    const middle = left + Math.floor((right - left) / 2);
    const nextBoundary = boundaries[middle + 1];
    if (nextBoundary !== undefined && nextBoundary <= timestampSeconds) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }
  if (left >= segment.values.length) {
    const totalArea = segment.prefixAreas.at(-1);
    if (totalArea === undefined) throw new Error("Best-effort segment area is unavailable");
    return totalArea;
  }
  const boundary = boundaries[left];
  const prefixArea = segment.prefixAreas[left];
  const value = segment.values[left];
  if (boundary === undefined || prefixArea === undefined || value === undefined) {
    throw new Error("Best-effort segment integration evidence is incomplete");
  }
  return prefixArea + value * (timestampSeconds - boundary);
}

function candidateStarts(segment: ContinuousSignalSegment, durationSeconds: number): number[] {
  const firstTimestamp = segment.boundaries[0];
  const lastTimestamp = segment.boundaries.at(-1);
  if (firstTimestamp === undefined || lastTimestamp === undefined) return [];
  const latestStart = lastTimestamp - durationSeconds;
  if (latestStart < firstTimestamp) return [];

  const starts: number[] = [];
  let directIndex = 0;
  let endAlignedIndex = 0;
  let previousCandidate: number | null = null;
  while (directIndex < segment.boundaries.length || endAlignedIndex < segment.boundaries.length) {
    let directCandidate = Number.POSITIVE_INFINITY;
    while (directIndex < segment.boundaries.length) {
      const boundary = segment.boundaries[directIndex];
      if (boundary === undefined) break;
      if (boundary > latestStart) {
        directIndex = segment.boundaries.length;
        break;
      }
      directCandidate = boundary;
      break;
    }

    let endAlignedCandidate = Number.POSITIVE_INFINITY;
    while (endAlignedIndex < segment.boundaries.length) {
      const boundary = segment.boundaries[endAlignedIndex];
      if (boundary === undefined) break;
      const candidate = boundary - durationSeconds;
      if (candidate < firstTimestamp) {
        endAlignedIndex += 1;
        continue;
      }
      if (candidate > latestStart) {
        endAlignedIndex = segment.boundaries.length;
        break;
      }
      endAlignedCandidate = candidate;
      break;
    }

    const candidate = Math.min(directCandidate, endAlignedCandidate);
    if (!Number.isFinite(candidate)) break;
    if (candidate !== previousCandidate) {
      starts.push(candidate);
      previousCandidate = candidate;
    }
    if (directCandidate === candidate) directIndex += 1;
    if (endAlignedCandidate === candidate) endAlignedIndex += 1;
  }
  return starts;
}

function extractDuration(
  prepared: PreparedBestEffortSource,
  durationSeconds: number,
): BestEffortDurationResult {
  let bestValue = Number.NEGATIVE_INFINITY;
  let bestStartTimestampSeconds: number | null = null;

  for (const segment of prepared.segments) {
    for (const startTimestampSeconds of candidateStarts(segment, durationSeconds)) {
      const endTimestampSeconds = startTimestampSeconds + durationSeconds;
      const area =
        integratedAreaAt(segment, endTimestampSeconds) -
        integratedAreaAt(segment, startTimestampSeconds);
      const value = area / durationSeconds;
      if (value > bestValue) {
        bestValue = value;
        bestStartTimestampSeconds = startTimestampSeconds;
      }
    }
  }

  if (bestStartTimestampSeconds === null) {
    const reason =
      prepared.diagnostics.sampleCount === 0 || prepared.diagnostics.acceptedSampleCount === 0
        ? "no_samples"
        : prepared.diagnostics.contributingDurationSeconds <= 0
          ? "no_contributing_intervals"
          : "insufficient_contiguous_coverage";
    return bestEffortDurationResultSchema.parse({
      status: "unavailable",
      reason,
      durationSeconds,
      value: null,
    });
  }

  const sourceIncomplete =
    prepared.diagnostics.excludedGapDurationSeconds > 0 ||
    prepared.diagnostics.excludedMissingDurationSeconds > 0 ||
    prepared.diagnostics.duplicateTimestampCount > 0 ||
    prepared.diagnostics.reversedTimestampCount > 0 ||
    prepared.diagnostics.unpositionedValueCount > 0;
  const window = {
    durationSeconds,
    value: bestValue,
    startTimestampSeconds: bestStartTimestampSeconds,
    endTimestampSeconds: bestStartTimestampSeconds + durationSeconds,
    contributingDurationSeconds: durationSeconds,
    windowCoverage: 1,
  } as const;
  return bestEffortDurationResultSchema.parse(
    sourceIncomplete
      ? { status: "partial", reason: "source_incomplete", ...window }
      : { status: "available", ...window },
  );
}

/**
 * Extracts one metric's exact-duration best efforts from timestamped evidence.
 *
 * The current sample describes `(previous timestamp, current timestamp]`. A
 * numeric result is emitted only for a fully covered window inside one
 * uninterrupted segment; missing values, exclusions, and gaps are never
 * compacted or bridged.
 */
export function extractBestEfforts(input: {
  metric: BestEffortMetric;
  samples: readonly BestEffortSample[];
  config?: BestEffortExtractionConfig;
}): BestEffortExtractionResult {
  if (input.samples.length > MAX_BEST_EFFORT_SAMPLES) {
    throw new Error(`Best-effort extraction cannot exceed ${MAX_BEST_EFFORT_SAMPLES} samples`);
  }
  const config = bestEffortExtractionConfigSchema.parse(input.config ?? {});
  const durationsSeconds = [...config.durationsSeconds].sort((left, right) => left - right);
  const prepared = prepareSource(
    input.samples,
    config.maxGapSeconds,
    config.unpositionedValueCount,
  );
  return bestEffortExtractionResultSchema.parse({
    calculationVersion: BEST_EFFORT_CALCULATION_VERSION,
    metric: input.metric,
    unit: unitForMetric(input.metric),
    timestampConvention: "absolute_or_relative_seconds_on_one_monotonic_timeline",
    intervalConvention: "current_sample_applies_to_preceding_interval",
    gapBehavior: "exclude_entire_interval_and_reset_segment",
    missingValueBehavior: "exclude_interval_and_reset_segment",
    inactiveBehavior: "exclude_interval_and_reset_segment",
    orderingBehavior: "ignore_duplicate_or_reversed_sample",
    tieBehavior: "earliest_exact_window",
    maxGapSeconds: config.maxGapSeconds,
    diagnostics: prepared.diagnostics,
    results: durationsSeconds.map((durationSeconds) => extractDuration(prepared, durationSeconds)),
  });
}
