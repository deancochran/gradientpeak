/**
 * Best Effort Calculation
 *
 * Calculates the best average value (power, speed, heart rate) for standard durations
 * (5s, 10s, 30s, 1m, 5m, 10m, 20m, 30m, 60m, 90m, 3h) using exact duration windows.
 */

export interface BestEffort {
  duration: number; // Duration in seconds
  value: number; // Best average value (e.g., watts, m/s, bpm)
  startIndex: number; // First sample contributing positive duration
  endIndex: number; // Last sample contributing positive duration
  startTimeSeconds: number; // Exact evaluated window boundary
  endTimeSeconds: number; // Exact evaluated window boundary
}

/**
 * Standard durations for best effort calculation (in seconds).
 */
export const STANDARD_DURATIONS = [
  5, // 5s
  10, // 10s
  30, // 30s
  60, // 1m
  300, // 5m
  600, // 10m
  1200, // 20m
  1800, // 30m
  3600, // 60m
  5400, // 90m
  10800, // 3h
];

/** Maximum interval that is treated as continuous coverage for 1 Hz-ish streams. */
export const MAX_BEST_EFFORT_SAMPLE_GAP_SECONDS = 2;

function numberAt(values: number[], index: number): number {
  return values[index] ?? Number.NaN;
}

function upperBound(values: number[], target: number, low: number, high: number): number {
  let left = low;
  let right = high + 1;

  while (left < right) {
    const middle = left + Math.floor((right - left) / 2);
    if (numberAt(values, middle) <= target) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }

  return left;
}

function lowerBound(values: number[], target: number, low: number, high: number): number {
  let left = low;
  let right = high + 1;

  while (left < right) {
    const middle = left + Math.floor((right - left) / 2);
    if (numberAt(values, middle) < target) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }

  return left;
}

/**
 * Calculates the best average value for a specific duration. Values are piecewise constant:
 * stream[i] applies over [timestamps[i], timestamps[i + 1]).
 *
 * @param stream - Array of values (e.g., power, speed, HR).
 * @param timestamps - Array of timestamps (seconds).
 * @param durationSeconds - Duration to calculate best effort for (seconds).
 * @returns BestEffort object or null if the input is invalid or has no continuously covered window.
 */
export function calculateBestEffort(
  stream: number[],
  timestamps: number[],
  durationSeconds: number,
): BestEffort | null {
  if (
    stream.length !== timestamps.length ||
    stream.length < 2 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return null;
  }

  const cumulativeArea = new Array<number>(stream.length).fill(0);
  for (let index = 0; index < stream.length; index++) {
    if (
      !Number.isFinite(numberAt(stream, index)) ||
      !Number.isFinite(numberAt(timestamps, index))
    ) {
      return null;
    }

    if (index > 0) {
      const interval = numberAt(timestamps, index) - numberAt(timestamps, index - 1);
      if (interval <= 0) {
        return null;
      }
      cumulativeArea[index] =
        numberAt(cumulativeArea, index - 1) + numberAt(stream, index - 1) * interval;
    }
  }

  let bestAvg = -Infinity;
  let bestStartIdx = -1;
  let bestEndIdx = -1;
  let bestStartTime = -1;
  let segmentStart = 0;

  const evaluateSegment = (segmentEnd: number) => {
    const firstTimestamp = numberAt(timestamps, segmentStart);
    const lastTimestamp = numberAt(timestamps, segmentEnd);
    const latestStart = lastTimestamp - durationSeconds;
    if (latestStart < firstTimestamp) {
      return;
    }

    const candidateStarts = new Set<number>([firstTimestamp, latestStart]);
    for (let index = segmentStart; index <= segmentEnd; index++) {
      const timestamp = numberAt(timestamps, index);
      if (timestamp <= latestStart) {
        candidateStarts.add(timestamp);
      }

      const endAlignedStart = timestamp - durationSeconds;
      if (endAlignedStart >= firstTimestamp && endAlignedStart <= latestStart) {
        candidateStarts.add(endAlignedStart);
      }
    }

    const areaAt = (timestamp: number) => {
      const sampleIndex = upperBound(timestamps, timestamp, segmentStart, segmentEnd) - 1;
      return (
        numberAt(cumulativeArea, sampleIndex) -
        numberAt(cumulativeArea, segmentStart) +
        numberAt(stream, sampleIndex) * (timestamp - numberAt(timestamps, sampleIndex))
      );
    };

    for (const startTimestamp of [...candidateStarts].sort((a, b) => a - b)) {
      const endTimestamp = startTimestamp + durationSeconds;
      const average = (areaAt(endTimestamp) - areaAt(startTimestamp)) / durationSeconds;

      if (average > bestAvg) {
        bestAvg = average;
        bestStartIdx = upperBound(timestamps, startTimestamp, segmentStart, segmentEnd) - 1;
        bestEndIdx = lowerBound(timestamps, endTimestamp, segmentStart, segmentEnd) - 1;
        bestStartTime = startTimestamp;
      }
    }
  };

  for (let index = 1; index < timestamps.length; index++) {
    if (
      numberAt(timestamps, index) - numberAt(timestamps, index - 1) >
      MAX_BEST_EFFORT_SAMPLE_GAP_SECONDS
    ) {
      evaluateSegment(index - 1);
      segmentStart = index;
    }
  }
  evaluateSegment(timestamps.length - 1);

  if (bestStartIdx === -1) {
    return null;
  }

  return {
    duration: durationSeconds,
    value: bestAvg,
    startIndex: bestStartIdx,
    endIndex: bestEndIdx,
    startTimeSeconds: bestStartTime,
    endTimeSeconds: bestStartTime + durationSeconds,
  };
}

/**
 * Calculates best efforts for all standard durations.
 *
 * @param stream - Array of values.
 * @param timestamps - Array of timestamps.
 * @returns Array of BestEffort objects.
 */
export function calculateBestEfforts(stream: number[], timestamps: number[]): BestEffort[] {
  const efforts: BestEffort[] = [];

  for (const duration of STANDARD_DURATIONS) {
    const effort = calculateBestEffort(stream, timestamps, duration);
    if (effort) {
      efforts.push(effort);
    }
  }

  return efforts;
}
