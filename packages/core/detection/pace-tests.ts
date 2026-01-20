/**
 * Running Test Effort Detection
 *
 * Analyzes pace streams to detect running test efforts and suggest performance metrics.
 */

export interface RunningTestSuggestion {
  type: 'threshold_pace' | '5k_pace' | '10k_pace' | 'tempo_pace';
  value: number; // seconds per km
  distance: number; // meters
  duration: number; // seconds
  detectionMethod: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detects running test efforts from pace stream.
 *
 * Detects:
 * - 5k time trial → 5k pace and threshold pace estimate
 * - 10k time trial → 10k pace and threshold pace
 * - Tempo runs → threshold pace
 * - Interval sessions → VO2max pace
 *
 * @param paceStream - Array of pace values (seconds per km)
 * @param timestamps - Array of timestamps
 * @param distanceStream - Cumulative distance in meters
 * @returns Array of suggested performance metrics
 */
export function detectRunningTestEfforts(
  paceStream: number[],
  timestamps: number[],
  distanceStream: number[]
): RunningTestSuggestion[] {
  if (
    paceStream.length === 0 ||
    timestamps.length === 0 ||
    distanceStream.length === 0
  ) {
    return [];
  }

  const suggestions: RunningTestSuggestion[] = [];

  // Detect 5k time trial (continuous effort, ~20-30 minutes)
  const fiveK = findBestPaceForDistance(paceStream, timestamps, distanceStream, 5000);
  if (fiveK && fiveK.time >= 1200 && fiveK.time <= 1800) {
    suggestions.push({
      type: '5k_pace',
      value: fiveK.pace,
      distance: 5000,
      duration: fiveK.time,
      detectionMethod: '5k time trial',
      confidence: 'high',
    });

    // Threshold pace ≈ 5k pace + 5%
    suggestions.push({
      type: 'threshold_pace',
      value: fiveK.pace * 1.05,
      distance: 5000,
      duration: fiveK.time,
      detectionMethod: 'Estimated from 5k pace',
      confidence: 'medium',
    });
  }

  // Detect 10k time trial
  const tenK = findBestPaceForDistance(paceStream, timestamps, distanceStream, 10000);
  if (tenK && tenK.time >= 2400 && tenK.time <= 3600) {
    suggestions.push({
      type: '10k_pace',
      value: tenK.pace,
      distance: 10000,
      duration: tenK.time,
      detectionMethod: '10k time trial',
      confidence: 'high',
    });

    // Threshold pace ≈ 10k pace
    suggestions.push({
      type: 'threshold_pace',
      value: tenK.pace,
      distance: 10000,
      duration: tenK.time,
      detectionMethod: '10k pace (lactate threshold)',
      confidence: 'high',
    });
  }

  // Detect tempo runs (sustained 20-40 min efforts)
  const tempoEfforts = detectTempoRuns(paceStream, timestamps);
  for (const tempo of tempoEfforts) {
    suggestions.push({
      type: 'tempo_pace',
      value: tempo.pace,
      distance: tempo.distance,
      duration: tempo.duration,
      detectionMethod: `${Math.round(tempo.duration / 60)}min tempo run`,
      confidence: 'medium',
    });
  }

  return suggestions;
}

/**
 * Detects tempo runs (sustained threshold efforts).
 *
 * Tempo runs are sustained efforts at or near lactate threshold,
 * typically 20-40 minutes in duration with consistent pace.
 *
 * @param paceStream - Array of pace values
 * @param timestamps - Array of timestamps
 * @returns Array of detected tempo efforts
 */
function detectTempoRuns(
  paceStream: number[],
  timestamps: number[]
): Array<{ pace: number; distance: number; duration: number }> {
  const tempos: Array<{ pace: number; distance: number; duration: number }> = [];
  const minDuration = 1200; // 20 minutes
  const maxDuration = 2400; // 40 minutes

  for (let duration = minDuration; duration <= maxDuration; duration += 300) {
    const result = findMaxAveragePace(paceStream, timestamps, duration);
    if (result) {
      // Check if pace is consistent (< 5% variation)
      const paceWindow = paceStream.slice(result.startIndex, result.endIndex);
      const paceStdDev = calculateStdDev(paceWindow);
      const paceCV = paceStdDev / result.avgPace;

      if (paceCV < 0.05) {
        // Consistent effort - likely a tempo run
        tempos.push({
          pace: result.avgPace,
          distance: duration * (1000 / result.avgPace), // rough estimate
          duration,
        });
      }
    }
  }

  return tempos;
}

/**
 * Detects interval workout pattern.
 *
 * Identifies repeated fast efforts with recovery periods.
 *
 * @param paceStream - Array of pace values
 * @param timestamps - Array of timestamps
 * @returns Interval workout metadata or null
 */
export function detectRunningIntervals(
  paceStream: number[],
  timestamps: number[]
): {
  intervals: Array<{ pace: number; duration: number; startIndex: number; endIndex: number }>;
  avgIntervalPace: number;
  avgIntervalDuration: number;
  totalIntervals: number;
} | null {
  if (paceStream.length < 100) return null;

  // Find sustained fast efforts (< 120% of average pace)
  const avgPace = paceStream.reduce((sum, p) => sum + p, 0) / paceStream.length;
  const threshold = avgPace * 0.9; // Faster than average pace

  const intervals: Array<{
    pace: number;
    duration: number;
    startIndex: number;
    endIndex: number;
  }> = [];

  let inInterval = false;
  let intervalStart = 0;

  for (let i = 0; i < paceStream.length; i++) {
    const currentPace = paceStream[i];
    if (currentPace === undefined) continue;

    if (!inInterval && currentPace <= threshold) {
      // Start of interval (faster pace)
      inInterval = true;
      intervalStart = i;
    } else if (inInterval && currentPace > threshold * 1.2) {
      // End of interval (recovery pace)
      inInterval = false;

      const currentTimestamp = timestamps[i];
      const startTimestamp = timestamps[intervalStart];
      if (currentTimestamp === undefined || startTimestamp === undefined) continue;

      const duration = currentTimestamp - startTimestamp;

      // Only count intervals > 60 seconds
      if (duration > 60) {
        const intervalPaces = paceStream.slice(intervalStart, i);
        const avgPace = intervalPaces.reduce((sum, p) => sum + p, 0) / intervalPaces.length;

        intervals.push({
          pace: Math.round(avgPace),
          duration,
          startIndex: intervalStart,
          endIndex: i,
        });
      }
    }
  }

  if (intervals.length < 3) {
    return null; // Not an interval workout
  }

  const avgIntervalPace =
    intervals.reduce((sum, int) => sum + int.pace, 0) / intervals.length;
  const avgIntervalDuration =
    intervals.reduce((sum, int) => sum + int.duration, 0) / intervals.length;

  return {
    intervals,
    avgIntervalPace: Math.round(avgIntervalPace),
    avgIntervalDuration: Math.round(avgIntervalDuration),
    totalIntervals: intervals.length,
  };
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Finds the best pace for a specific distance.
 *
 * @param paceStream - Array of pace values
 * @param timestamps - Array of timestamps
 * @param distanceStream - Cumulative distance stream
 * @param targetDistance - Target distance in meters
 * @returns Best pace and time or null
 */
function findBestPaceForDistance(
  paceStream: number[],
  timestamps: number[],
  distanceStream: number[],
  targetDistance: number
): { pace: number; time: number } | null {
  let bestPace = Infinity;
  let bestTime = 0;

  for (let i = 0; i < distanceStream.length; i++) {
    const startDistance = distanceStream[i];
    if (startDistance === undefined) continue;

    // Find end point
    let endIdx = i;
    while (endIdx < distanceStream.length) {
      const currentDistance = distanceStream[endIdx];
      if (currentDistance === undefined) break;
      if (currentDistance - startDistance >= targetDistance) break;
      endIdx++;
    }

    if (endIdx >= distanceStream.length) break;

    const endDistance = distanceStream[endIdx];
    if (endDistance === undefined) continue;

    const actualDistance = endDistance - startDistance;
    if (Math.abs(actualDistance - targetDistance) > targetDistance * 0.1) continue; // 10% tolerance

    const endTimestamp = timestamps[endIdx];
    const startTimestamp = timestamps[i];
    if (endTimestamp === undefined || startTimestamp === undefined) continue;

    const time = endTimestamp - startTimestamp;
    const avgPace = time / (actualDistance / 1000); // seconds per km

    if (avgPace < bestPace && avgPace > 0) {
      bestPace = avgPace;
      bestTime = time;
    }
  }

  return bestPace < Infinity ? { pace: bestPace, time: bestTime } : null;
}

/**
 * Finds the maximum average pace (fastest) for a given duration.
 *
 * @param paceStream - Array of pace values
 * @param timestamps - Array of timestamps
 * @param durationSeconds - Target duration in seconds
 * @returns Max average pace result or null
 */
function findMaxAveragePace(
  paceStream: number[],
  timestamps: number[],
  durationSeconds: number
): { avgPace: number; startIndex: number; endIndex: number } | null {
  if (paceStream.length < 2) return null;

  let minAvg = Infinity; // Lower pace = faster
  let minStartIdx = 0;
  let minEndIdx = 0;

  for (let i = 0; i < paceStream.length; i++) {
    const startTime = timestamps[i];
    if (startTime === undefined) continue;

    const targetEndTime = startTime + durationSeconds;

    // Find end index
    let endIdx = i;
    while (endIdx < timestamps.length) {
      const currentTime = timestamps[endIdx];
      if (currentTime === undefined || currentTime >= targetEndTime) break;
      endIdx++;
    }

    if (endIdx - i < 10) continue; // Need at least 10 data points

    // Calculate average pace for this window
    const sum = paceStream.slice(i, endIdx).reduce((s, p) => s + p, 0);
    const avg = sum / (endIdx - i);

    if (avg < minAvg && avg > 0) {
      minAvg = avg;
      minStartIdx = i;
      minEndIdx = endIdx;
    }
  }

  return minAvg < Infinity ? { avgPace: minAvg, startIndex: minStartIdx, endIndex: minEndIdx } : null;
}

/**
 * Calculates standard deviation of an array of numbers.
 *
 * @param values - Array of numbers
 * @returns Standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;

  return Math.sqrt(variance);
}
