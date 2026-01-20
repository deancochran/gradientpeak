/**
 * Heart Rate Test Effort Detection
 *
 * Analyzes HR streams to detect test efforts and estimate LTHR/max HR.
 */

export interface HRTestSuggestion {
  type: 'lthr' | 'max_hr';
  value: number; // bpm
  duration: number; // seconds
  detectionMethod: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detects HR test efforts and estimates LTHR/max HR.
 *
 * Detects:
 * - Max HR: Highest sustained HR for 1-2 minutes
 * - LTHR: Sustained HR for 20-30 minutes
 * - Ramp test: Progressive HR increase with deflection point
 *
 * @param hrStream - Array of HR values
 * @param timestamps - Array of timestamps
 * @returns Array of suggested HR metrics
 */
export function detectHRTestEfforts(
  hrStream: number[],
  timestamps: number[]
): HRTestSuggestion[] {
  if (hrStream.length === 0 || timestamps.length === 0) {
    return [];
  }

  const suggestions: HRTestSuggestion[] = [];

  // Detect max HR (highest sustained HR for 1-2 minutes)
  const maxHR1min = findMaxAverageHR(hrStream, timestamps, 60);
  const maxHR2min = findMaxAverageHR(hrStream, timestamps, 120);

  if (maxHR1min && maxHR1min.avgHR > 160) {
    suggestions.push({
      type: 'max_hr',
      value: Math.round(maxHR1min.avgHR),
      duration: 60,
      detectionMethod: '1min max effort',
      confidence: 'high',
    });
  }

  if (maxHR2min && maxHR2min.avgHR > 160) {
    suggestions.push({
      type: 'max_hr',
      value: Math.round(maxHR2min.avgHR),
      duration: 120,
      detectionMethod: '2min max effort',
      confidence: 'high',
    });
  }

  // Detect LTHR (sustained HR for 20-30 minutes)
  const lthr20min = findMaxAverageHR(hrStream, timestamps, 1200);
  const lthr30min = findMaxAverageHR(hrStream, timestamps, 1800);

  if (lthr20min && lthr20min.avgHR > 140) {
    suggestions.push({
      type: 'lthr',
      value: Math.round(lthr20min.avgHR),
      duration: 1200,
      detectionMethod: '20min threshold test',
      confidence: 'high',
    });
  }

  if (lthr30min && lthr30min.avgHR > 140) {
    suggestions.push({
      type: 'lthr',
      value: Math.round(lthr30min.avgHR),
      duration: 1800,
      detectionMethod: '30min threshold test',
      confidence: 'high',
    });
  }

  // Detect ramp tests (progressive HR increase)
  const rampTest = detectHRRampTest(hrStream, timestamps);
  if (rampTest) {
    suggestions.push({
      type: 'lthr',
      value: rampTest.lthr,
      duration: rampTest.duration,
      detectionMethod: 'Ramp test (deflection point)',
      confidence: 'medium',
    });

    suggestions.push({
      type: 'max_hr',
      value: rampTest.maxHR,
      duration: rampTest.duration,
      detectionMethod: 'Ramp test (peak HR)',
      confidence: 'medium',
    });
  }

  return suggestions;
}

/**
 * Detects ramp test - progressive effort to exhaustion.
 *
 * Ramp tests show a progressive HR increase with a deflection point
 * where HR response changes (near LTHR).
 *
 * @param hrStream - Array of HR values
 * @param timestamps - Array of timestamps
 * @returns Ramp test result or null if not detected
 */
export function detectHRRampTest(
  hrStream: number[],
  timestamps: number[]
): { lthr: number; maxHR: number; duration: number } | null {
  if (hrStream.length < 100) return null; // Need sufficient data

  const MIN_DURATION = 600; // At least 10 minutes
  const MAX_DURATION = 1800; // At most 30 minutes

  // Look for progressive HR increase over 10-30 minutes
  for (let i = 0; i < hrStream.length; i++) {
    const startHR = hrStream[i];
    const startTime = timestamps[i];
    if (startTime === undefined) continue;

    let endIdx = i;
    while (endIdx < hrStream.length) {
      const currentTime = timestamps[endIdx];
      if (currentTime === undefined) break;
      if (currentTime - startTime >= MAX_DURATION) break;
      endIdx++;
    }

    if (endIdx - i < 100) continue; // Need enough data points

    const window = hrStream.slice(i, endIdx);
    if (window.length === 0) continue;

    const endTime = timestamps[endIdx - 1];
    if (endTime === undefined) continue;

    const duration = endTime - startTime;

    if (duration < MIN_DURATION) continue;

    // Check for progressive increase
    const firstHR = window[0];
    const lastHR = window[window.length - 1];
    if (firstHR === undefined || lastHR === undefined) continue;

    const hrIncrease = lastHR - firstHR;
    const avgIncreaseRate = hrIncrease / duration; // bpm per second

    // Ramp tests typically increase 0.1-0.3 bpm per second
    if (avgIncreaseRate > 0.1 && avgIncreaseRate < 0.3) {
      // Looks like a ramp test
      const maxHR = Math.max(...window);

      // Find deflection point (where HR increase rate changes)
      const deflectionIdx = findDeflectionPoint(window);
      const deflectionHR = deflectionIdx > 0 ? window[deflectionIdx] : undefined;
      const lthr = deflectionHR !== undefined ? Math.round(deflectionHR) : Math.round(maxHR * 0.85);

      return { lthr, maxHR: Math.round(maxHR), duration };
    }
  }

  return null;
}

/**
 * Finds the deflection point in a progressive HR test.
 *
 * The deflection point is where the HR response changes, typically
 * indicating the lactate threshold.
 *
 * @param hrWindow - Window of HR values
 * @returns Index of deflection point or -1 if not found
 */
function findDeflectionPoint(hrWindow: number[]): number {
  if (hrWindow.length < 20) return -1;

  // Calculate rolling derivatives (rate of change)
  const derivatives: number[] = [];
  const WINDOW_SIZE = 10;

  for (let i = WINDOW_SIZE; i < hrWindow.length; i++) {
    const recentWindow = hrWindow.slice(i - WINDOW_SIZE, i);
    if (recentWindow.length === 0) continue;

    const firstInWindow = recentWindow[0];
    const lastInWindow = recentWindow[recentWindow.length - 1];
    if (firstInWindow === undefined || lastInWindow === undefined) continue;

    const derivative = (lastInWindow - firstInWindow) / WINDOW_SIZE;
    derivatives.push(derivative);
  }

  // Find where derivative changes significantly (deflection point)
  let maxDerivativeChange = 0;
  let deflectionIdx = -1;

  for (let i = WINDOW_SIZE; i < derivatives.length; i++) {
    const beforeWindow = derivatives.slice(i - WINDOW_SIZE, i);
    const afterWindow = derivatives.slice(i, i + WINDOW_SIZE);

    const beforeAvg = beforeWindow.reduce((sum, d) => sum + d, 0) / beforeWindow.length;
    const afterAvg = afterWindow.reduce((sum, d) => sum + d, 0) / afterWindow.length;

    const change = Math.abs(afterAvg - beforeAvg);

    if (change > maxDerivativeChange) {
      maxDerivativeChange = change;
      deflectionIdx = i + WINDOW_SIZE; // Adjust for offset
    }
  }

  return deflectionIdx;
}

/**
 * Detects sustained threshold efforts.
 *
 * Identifies periods where HR is maintained near threshold (85-95% of max)
 * for extended periods (10+ minutes).
 *
 * @param hrStream - Array of HR values
 * @param timestamps - Array of timestamps
 * @param maxHR - Known maximum heart rate
 * @returns Array of threshold efforts
 */
export function detectThresholdEfforts(
  hrStream: number[],
  timestamps: number[],
  maxHR: number
): Array<{ avgHR: number; duration: number; startIndex: number; endIndex: number }> {
  const thresholdMin = maxHR * 0.85;
  const thresholdMax = maxHR * 0.95;
  const MIN_DURATION = 600; // 10 minutes

  const efforts: Array<{ avgHR: number; duration: number; startIndex: number; endIndex: number }> =
    [];

  let inThreshold = false;
  let thresholdStart = 0;

  for (let i = 0; i < hrStream.length; i++) {
    const hr = hrStream[i];
    if (hr === undefined) continue;

    if (!inThreshold && hr >= thresholdMin && hr <= thresholdMax) {
      // Start of threshold effort
      inThreshold = true;
      thresholdStart = i;
    } else if (inThreshold && (hr < thresholdMin || hr > thresholdMax)) {
      // End of threshold effort
      inThreshold = false;

      const currentTimestamp = timestamps[i];
      const startTimestamp = timestamps[thresholdStart];
      if (currentTimestamp === undefined || startTimestamp === undefined) continue;

      const duration = currentTimestamp - startTimestamp;

      if (duration >= MIN_DURATION) {
        const hrWindow = hrStream.slice(thresholdStart, i);
        const avgHR = hrWindow.reduce((sum, h) => sum + h, 0) / hrWindow.length;

        efforts.push({
          avgHR: Math.round(avgHR),
          duration,
          startIndex: thresholdStart,
          endIndex: i,
        });
      }
    }
  }

  return efforts;
}

/**
 * Detects interval workout pattern based on HR.
 *
 * Identifies repeated high-HR efforts with recovery periods.
 *
 * @param hrStream - Array of HR values
 * @param timestamps - Array of timestamps
 * @param maxHR - Known maximum heart rate
 * @returns Interval workout metadata or null
 */
export function detectHRIntervals(
  hrStream: number[],
  timestamps: number[],
  maxHR: number
): {
  intervals: Array<{ avgHR: number; duration: number; startIndex: number; endIndex: number }>;
  avgIntervalHR: number;
  avgIntervalDuration: number;
  totalIntervals: number;
} | null {
  if (hrStream.length < 100) return null;

  // Find sustained high-HR efforts (> 90% of max HR)
  const threshold = maxHR * 0.9;

  const intervals: Array<{
    avgHR: number;
    duration: number;
    startIndex: number;
    endIndex: number;
  }> = [];

  let inInterval = false;
  let intervalStart = 0;

  for (let i = 0; i < hrStream.length; i++) {
    const currentHR = hrStream[i];
    if (currentHR === undefined) continue;

    if (!inInterval && currentHR >= threshold) {
      // Start of interval
      inInterval = true;
      intervalStart = i;
    } else if (inInterval && currentHR < threshold * 0.8) {
      // End of interval (recovery)
      inInterval = false;

      const currentTimestamp = timestamps[i];
      const startTimestamp = timestamps[intervalStart];
      if (currentTimestamp === undefined || startTimestamp === undefined) continue;

      const duration = currentTimestamp - startTimestamp;

      // Only count intervals > 60 seconds
      if (duration > 60) {
        const intervalHRs = hrStream.slice(intervalStart, i);
        const avgHR = intervalHRs.reduce((sum, h) => sum + h, 0) / intervalHRs.length;

        intervals.push({
          avgHR: Math.round(avgHR),
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

  const avgIntervalHR = intervals.reduce((sum, int) => sum + int.avgHR, 0) / intervals.length;
  const avgIntervalDuration =
    intervals.reduce((sum, int) => sum + int.duration, 0) / intervals.length;

  return {
    intervals,
    avgIntervalHR: Math.round(avgIntervalHR),
    avgIntervalDuration: Math.round(avgIntervalDuration),
    totalIntervals: intervals.length,
  };
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Finds the maximum average heart rate for a given duration.
 *
 * @param hrStream - Array of HR values
 * @param timestamps - Array of timestamps
 * @param durationSeconds - Target duration in seconds
 * @returns Max average HR or null
 */
function findMaxAverageHR(
  hrStream: number[],
  timestamps: number[],
  durationSeconds: number
): { avgHR: number } | null {
  if (hrStream.length < 2) return null;

  let maxAvg = 0;

  for (let i = 0; i < hrStream.length; i++) {
    const startTime = timestamps[i];
    if (startTime === undefined) continue;

    const targetEndTime = startTime + durationSeconds;

    let endIdx = i;
    while (endIdx < timestamps.length) {
      const currentTime = timestamps[endIdx];
      if (currentTime === undefined || currentTime >= targetEndTime) break;
      endIdx++;
    }

    if (endIdx - i < 10) continue; // Need at least 10 data points

    const sum = hrStream.slice(i, endIdx).reduce((s, hr) => s + hr, 0);
    const avg = sum / (endIdx - i);

    if (avg > maxAvg) {
      maxAvg = avg;
    }
  }

  return maxAvg > 0 ? { avgHR: maxAvg } : null;
}
