export interface IntervalMetricSample {
  timestampSeconds: number;
  value: number | null | undefined;
}

export interface ActiveInterval {
  startSeconds: number;
  endSeconds: number;
}

export interface IntervalWeightedMetricResult {
  average: number | null;
  maximum: number | null;
  coverageSeconds: number;
}

export interface ClippedIntervalMetricEvidence {
  startSeconds: number;
  endSeconds: number;
  value: number;
}

export function deriveClippedIntervalMetricEvidence(input: {
  samples: readonly IntervalMetricSample[];
  activeIntervals: readonly ActiveInterval[];
  maxGapSeconds?: number;
}): ClippedIntervalMetricEvidence[] {
  const maxGapSeconds = input.maxGapSeconds ?? 5;
  if (!Number.isFinite(maxGapSeconds) || maxGapSeconds <= 0) {
    throw new Error("Interval metric maximum gap must be a positive finite number");
  }
  // Windows are normalized before the sweep: adjacent windows retain their
  // continuous coverage without making an interval count twice.
  const sortedWindows = [...input.activeIntervals]
    .filter(
      (window) =>
        Number.isFinite(window.startSeconds) &&
        Number.isFinite(window.endSeconds) &&
        window.endSeconds > window.startSeconds,
    )
    .sort((left, right) => left.startSeconds - right.startSeconds);
  const windows: ActiveInterval[] = [];
  for (const window of sortedWindows) {
    const previous = windows.at(-1);
    if (previous && window.startSeconds <= previous.endSeconds) {
      previous.endSeconds = Math.max(previous.endSeconds, window.endSeconds);
    } else {
      windows.push({ ...window });
    }
  }
  const samples = [...input.samples]
    .filter(
      (sample): sample is { timestampSeconds: number; value: number } =>
        Number.isFinite(sample.timestampSeconds) &&
        typeof sample.value === "number" &&
        Number.isFinite(sample.value),
    )
    .sort((left, right) => left.timestampSeconds - right.timestampSeconds);
  const evidence: ClippedIntervalMetricEvidence[] = [];
  let previousTimestamp: number | null = null;
  let windowIndex = 0;
  for (const sample of samples) {
    const previous = previousTimestamp;
    previousTimestamp = sample.timestampSeconds;
    if (previous === null) continue;
    const intervalSeconds = sample.timestampSeconds - previous;
    if (intervalSeconds <= 0 || intervalSeconds > maxGapSeconds) continue;
    while (true) {
      const window = windows[windowIndex];
      if (window === undefined || window.endSeconds > previous) break;
      windowIndex += 1;
    }
    for (let index = windowIndex; index < windows.length; index += 1) {
      const window = windows[index];
      if (!window || window.startSeconds >= sample.timestampSeconds) break;
      const startSeconds = Math.max(previous, window.startSeconds);
      const endSeconds = Math.min(sample.timestampSeconds, window.endSeconds);
      if (endSeconds > startSeconds)
        evidence.push({ startSeconds, endSeconds, value: sample.value });
    }
  }
  return evidence;
}

/**
 * Aggregates a sampled metric using the recording stream convention: a value
 * at T represents only the preceding same-metric interval (previous T, T].
 * Long absent intervals are unknown, not held values; active windows clip
 * represented intervals, including either edge around a pause.
 */
export function calculateIntervalWeightedMetric(input: {
  samples: readonly IntervalMetricSample[];
  activeIntervals: readonly ActiveInterval[];
  maxGapSeconds?: number;
}): IntervalWeightedMetricResult {
  const evidence = deriveClippedIntervalMetricEvidence(input);
  let weightedSum = 0;
  let coverageSeconds = 0;
  let maximum: number | null = null;
  for (const interval of evidence) {
    const intervalSeconds = interval.endSeconds - interval.startSeconds;
    coverageSeconds += intervalSeconds;
    weightedSum += interval.value * intervalSeconds;
    maximum = maximum === null ? interval.value : Math.max(maximum, interval.value);
  }
  return {
    average: coverageSeconds > 0 ? weightedSum / coverageSeconds : null,
    maximum,
    coverageSeconds,
  };
}
