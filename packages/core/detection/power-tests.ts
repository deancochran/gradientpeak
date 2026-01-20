/**
 * Power Test Effort Detection
 *
 * Analyzes power streams to detect test efforts and suggest performance metrics.
 */

import { findMaxAveragePower } from '../calculations/curves';

export interface TestEffortSuggestion {
  type: 'ftp' | 'vo2max_power' | 'anaerobic_power' | 'sprint_power';
  value: number;
  duration: number;
  detectionMethod: string;
  confidence: 'high' | 'medium' | 'low';
  startTime?: number;
  endTime?: number;
}

/**
 * Analyzes activity power stream to detect test efforts.
 *
 * Detects:
 * - FTP: 20-minute max effort (× 0.95)
 * - VO2max Power: 5-minute max effort
 * - Anaerobic Power: 1-minute max effort
 * - Sprint Power: 5-second max effort
 *
 * @param powerStream - Array of power values
 * @param timestamps - Array of timestamps
 * @returns Array of suggested performance metrics
 */
export function detectPowerTestEfforts(
  powerStream: number[],
  timestamps: number[]
): TestEffortSuggestion[] {
  if (powerStream.length === 0 || timestamps.length === 0) {
    return [];
  }

  const suggestions: TestEffortSuggestion[] = [];

  // Detect 20-minute max effort (FTP test)
  const twentyMinMax = findMaxAveragePower(powerStream, timestamps, 1200);
  if (twentyMinMax && twentyMinMax.avgPower > 150) {
    suggestions.push({
      type: 'ftp',
      value: Math.round(twentyMinMax.avgPower * 0.95),
      duration: 1200,
      detectionMethod: '20min test × 0.95',
      confidence: 'high',
      startTime: timestamps[twentyMinMax.startIndex],
      endTime: timestamps[twentyMinMax.endIndex],
    });
  }

  // Detect 5-minute max effort (VO2max power)
  const fiveMinMax = findMaxAveragePower(powerStream, timestamps, 300);
  if (fiveMinMax && fiveMinMax.avgPower > 200) {
    suggestions.push({
      type: 'vo2max_power',
      value: Math.round(fiveMinMax.avgPower),
      duration: 300,
      detectionMethod: '5min max effort',
      confidence: 'medium',
      startTime: timestamps[fiveMinMax.startIndex],
      endTime: timestamps[fiveMinMax.endIndex],
    });
  }

  // Detect 1-minute max effort (Anaerobic power)
  const oneMinMax = findMaxAveragePower(powerStream, timestamps, 60);
  if (oneMinMax && oneMinMax.avgPower > 300) {
    suggestions.push({
      type: 'anaerobic_power',
      value: Math.round(oneMinMax.avgPower),
      duration: 60,
      detectionMethod: '1min max effort',
      confidence: 'medium',
      startTime: timestamps[oneMinMax.startIndex],
      endTime: timestamps[oneMinMax.endIndex],
    });
  }

  // Detect 5-second max effort (Sprint power)
  const fiveSecMax = findMaxAveragePower(powerStream, timestamps, 5);
  if (fiveSecMax && fiveSecMax.avgPower > 500) {
    suggestions.push({
      type: 'sprint_power',
      value: Math.round(fiveSecMax.avgPower),
      duration: 5,
      detectionMethod: '5sec max effort',
      confidence: 'low',
      startTime: timestamps[fiveSecMax.startIndex],
      endTime: timestamps[fiveSecMax.endIndex],
    });
  }

  return suggestions;
}

/**
 * Detects ramp test (progressive effort to exhaustion).
 *
 * Ramp tests progressively increase power until exhaustion, allowing
 * estimation of FTP and VO2max power.
 *
 * @param powerStream - Array of power values
 * @param timestamps - Array of timestamps
 * @returns Ramp test result or null if not detected
 */
export function detectPowerRampTest(
  powerStream: number[],
  timestamps: number[]
): {
  ftpEstimate: number;
  vo2maxEstimate: number;
  duration: number;
  startIndex: number;
  endIndex: number;
} | null {
  if (powerStream.length < 100) return null; // Need sufficient data

  const MIN_DURATION = 600; // At least 10 minutes
  const MAX_DURATION = 1800; // At most 30 minutes

  // Look for progressive power increase
  for (let i = 0; i < powerStream.length; i++) {
    const startPower = powerStream[i];
    const startTime = timestamps[i];
    if (startTime === undefined) continue;

    let endIdx = i;
    while (endIdx < powerStream.length) {
      const currentTime = timestamps[endIdx];
      if (currentTime === undefined) break;
      if (currentTime - startTime >= MAX_DURATION) break;
      endIdx++;
    }

    if (endIdx - i < 100) continue; // Need enough data points

    const endTime = timestamps[endIdx - 1];
    if (endTime === undefined) continue;

    const duration = endTime - startTime;
    if (duration < MIN_DURATION) continue;

    const window = powerStream.slice(i, endIdx);
    if (window.length === 0) continue;

    // Check for progressive increase (power should increase steadily)
    const firstPower = window[0];
    const lastPower = window[window.length - 1];
    if (firstPower === undefined || lastPower === undefined) continue;

    const powerIncrease = lastPower - firstPower;
    const avgIncreaseRate = powerIncrease / duration; // watts per second

    // Ramp tests typically increase 10-25 watts per minute
    if (avgIncreaseRate > 0.15 && avgIncreaseRate < 0.5) {
      // Looks like a ramp test
      const maxPower = Math.max(...window);

      // FTP estimate: 75% of max power from ramp test
      const ftpEstimate = Math.round(maxPower * 0.75);

      // VO2max estimate: 5-minute power from ramp test
      const lastFiveMin = window.slice(-60); // Last 60 seconds (approximate 5min)
      const vo2maxEstimate = Math.round(
        lastFiveMin.reduce((sum, p) => sum + p, 0) / lastFiveMin.length
      );

      return {
        ftpEstimate,
        vo2maxEstimate,
        duration,
        startIndex: i,
        endIndex: endIdx,
      };
    }
  }

  return null;
}

/**
 * Detects interval workout pattern.
 *
 * Identifies repeated high-intensity efforts with recovery periods.
 *
 * @param powerStream - Array of power values
 * @param timestamps - Array of timestamps
 * @returns Interval workout metadata or null
 */
export function detectIntervalWorkout(
  powerStream: number[],
  timestamps: number[]
): {
  intervals: Array<{ power: number; duration: number; startIndex: number; endIndex: number }>;
  avgIntervalPower: number;
  avgIntervalDuration: number;
  totalIntervals: number;
} | null {
  if (powerStream.length < 100) return null;

  // Find sustained high-power efforts (> 80% of max power)
  const maxPower = Math.max(...powerStream);
  const threshold = maxPower * 0.8;

  const intervals: Array<{
    power: number;
    duration: number;
    startIndex: number;
    endIndex: number;
  }> = [];

  let inInterval = false;
  let intervalStart = 0;

  for (let i = 0; i < powerStream.length; i++) {
    const currentPower = powerStream[i];
    if (currentPower === undefined) continue;

    if (!inInterval && currentPower >= threshold) {
      // Start of interval
      inInterval = true;
      intervalStart = i;
    } else if (inInterval && currentPower < threshold * 0.7) {
      // End of interval
      inInterval = false;

      const currentTimestamp = timestamps[i];
      const startTimestamp = timestamps[intervalStart];
      if (currentTimestamp === undefined || startTimestamp === undefined) continue;

      const duration = currentTimestamp - startTimestamp;

      // Only count intervals > 30 seconds
      if (duration > 30) {
        const intervalPowers = powerStream.slice(intervalStart, i);
        const avgPower = intervalPowers.reduce((sum, p) => sum + p, 0) / intervalPowers.length;

        intervals.push({
          power: Math.round(avgPower),
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

  const avgIntervalPower =
    intervals.reduce((sum, int) => sum + int.power, 0) / intervals.length;
  const avgIntervalDuration =
    intervals.reduce((sum, int) => sum + int.duration, 0) / intervals.length;

  return {
    intervals,
    avgIntervalPower: Math.round(avgIntervalPower),
    avgIntervalDuration: Math.round(avgIntervalDuration),
    totalIntervals: intervals.length,
  };
}
