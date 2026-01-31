/**
 * Best Effort Calculation
 *
 * Calculates the best average value (power, speed, heart rate) for standard durations
 * (5s, 10s, 30s, 1m, 5m, 10m, 20m, 30m, 60m, 90m, 3h) using a sliding window algorithm.
 */

export interface BestEffort {
  duration: number; // Duration in seconds
  value: number; // Best average value (e.g., watts, m/s, bpm)
  startIndex: number; // Index where the effort starts
  endIndex: number; // Index where the effort ends
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

/**
 * Calculates the best average value for a specific duration using a sliding window.
 *
 * @param stream - Array of values (e.g., power, speed, HR).
 * @param timestamps - Array of timestamps (seconds).
 * @param durationSeconds - Duration to calculate best effort for (seconds).
 * @returns BestEffort object or null if duration exceeds stream length.
 */
export function calculateBestEffort(
  stream: number[],
  timestamps: number[],
  durationSeconds: number,
): BestEffort | null {
  if (!stream || !timestamps || stream.length === 0 || durationSeconds <= 0) {
    return null;
  }

  // If total duration is less than requested duration, return null
  const totalDuration = timestamps[timestamps.length - 1]! - timestamps[0]!;
  if (totalDuration < durationSeconds) {
    return null;
  }

  let bestAvg = -Infinity;
  let bestStartIdx = -1;
  let bestEndIdx = -1;

  let currentWindowSum = 0;
  let windowEnd = 0;

  for (let windowStart = 0; windowStart < stream.length; windowStart++) {
    // Expand window to the right until duration is met
    // We need a window [windowStart, windowEnd] such that
    // timestamps[windowEnd] - timestamps[windowStart] >= durationSeconds

    while (
      windowEnd < stream.length &&
      timestamps[windowEnd]! - timestamps[windowStart]! < durationSeconds
    ) {
      currentWindowSum += stream[windowEnd]!;
      windowEnd++;
    }

    // If we've reached the end and still haven't met the duration requirement, break
    if (windowEnd >= stream.length) {
      // Check if the last window [windowStart, stream.length-1] meets the duration
      // The while loop condition failed because windowEnd == stream.length
      // But we might have met the duration exactly at the end.
      // Let's check:
      // timestamps[stream.length-1] - timestamps[windowStart] < durationSeconds?
      // If so, we can't form a valid window starting at windowStart.
      break;
    }

    // At this point, [windowStart, windowEnd] is a valid window >= durationSeconds
    // currentWindowSum includes stream[windowStart] ... stream[windowEnd-1]
    // We need to include stream[windowEnd] for the calculation

    const fullWindowSum = currentWindowSum + stream[windowEnd]!;
    const count = windowEnd - windowStart + 1;
    const avg = fullWindowSum / count;

    if (avg > bestAvg) {
      bestAvg = avg;
      bestStartIdx = windowStart;
      bestEndIdx = windowEnd;
    }

    // Prepare for next iteration: remove stream[windowStart] from sum
    // Note: currentWindowSum does NOT include stream[windowEnd] yet, so we don't subtract it.
    // currentWindowSum includes [windowStart, windowEnd-1].
    // We subtract stream[windowStart].

    if (windowEnd > windowStart) {
      currentWindowSum -= stream[windowStart]!;
    } else {
      // Should not happen if duration > 0, but for safety
      windowEnd = windowStart + 1;
      currentWindowSum = 0;
    }
  }

  if (bestStartIdx === -1) {
    return null;
  }

  return {
    duration: durationSeconds,
    value: bestAvg,
    startIndex: bestStartIdx,
    endIndex: bestEndIdx,
  };
}

/**
 * Calculates best efforts for all standard durations.
 *
 * @param stream - Array of values.
 * @param timestamps - Array of timestamps.
 * @returns Array of BestEffort objects.
 */
export function calculateBestEfforts(
  stream: number[],
  timestamps: number[],
): BestEffort[] {
  const efforts: BestEffort[] = [];

  for (const duration of STANDARD_DURATIONS) {
    const effort = calculateBestEffort(stream, timestamps, duration);
    if (effort) {
      efforts.push(effort);
    }
  }

  return efforts;
}
