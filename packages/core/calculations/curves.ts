/**
 * Performance Curve Calculations
 *
 * Calculates and analyzes power curves, pace curves, and HR curves to identify
 * athlete phenotype and predict performance.
 */

// ==========================================
// Power Curve
// ==========================================

export interface PowerCurvePoint {
  duration: number; // seconds
  power: number; // watts
  timestamp?: number; // when this effort occurred
}

export interface PowerCurve {
  points: PowerCurvePoint[];
  criticalPower: number; // CP (power sustainable for ~1 hour)
  wPrime: number; // W' (anaerobic work capacity)
  phenotype: 'sprinter' | 'time-trialist' | 'all-rounder';
}

/**
 * Calculates power curve from activity power stream.
 *
 * Returns max average power for standard durations: 5s, 30s, 1min, 5min, 10min, 20min, 30min, 60min
 *
 * @param powerStream - Array of power values
 * @param timestamps - Array of timestamps
 * @returns Power curve points
 */
export function calculatePowerCurve(
  powerStream: number[],
  timestamps: number[]
): PowerCurvePoint[] {
  const durations = [5, 30, 60, 300, 600, 1200, 1800, 3600]; // seconds

  const curve: PowerCurvePoint[] = [];

  for (const duration of durations) {
    const result = findMaxAveragePower(powerStream, timestamps, duration);
    if (result) {
      curve.push({
        duration,
        power: result.avgPower,
        timestamp: timestamps[result.startIndex],
      });
    }
  }

  return curve;
}

/**
 * Analyzes power curve to identify athlete phenotype and critical power.
 *
 * @param curve - Power curve points
 * @returns Analyzed power curve with CP, W', and phenotype
 */
export function analyzePowerCurve(curve: PowerCurvePoint[]): PowerCurve {
  // Sort by duration
  const sortedCurve = [...curve].sort((a, b) => a.duration - b.duration);

  // Find critical power (CP) - approximately 60min power
  const cp60 = sortedCurve.find((p) => p.duration === 3600);
  const cp20 = sortedCurve.find((p) => p.duration === 1200);
  const criticalPower = cp60?.power || (cp20 ? cp20.power * 0.95 : 0);

  // Calculate W' (anaerobic capacity)
  // W' = (P5min - CP) × 300 seconds (simplified model)
  const p5min = sortedCurve.find((p) => p.duration === 300);
  const wPrime = p5min ? (p5min.power - criticalPower) * 300 : 0;

  // Identify phenotype based on power distribution
  const p5s = sortedCurve.find((p) => p.duration === 5)?.power || 0;
  const p5min_val = p5min?.power || 0;
  const p60min = cp60?.power || 0;

  // Ratios
  const sprintRatio = p60min > 0 ? p5s / p60min : 0; // High for sprinters
  const enduranceRatio = p5min_val > 0 ? p60min / p5min_val : 0; // High for time-trialists

  let phenotype: 'sprinter' | 'time-trialist' | 'all-rounder';
  if (sprintRatio > 3.0 && enduranceRatio < 0.85) {
    phenotype = 'sprinter';
  } else if (sprintRatio < 2.5 && enduranceRatio > 0.9) {
    phenotype = 'time-trialist';
  } else {
    phenotype = 'all-rounder';
  }

  return {
    points: sortedCurve,
    criticalPower: Math.round(criticalPower),
    wPrime: Math.round(wPrime),
    phenotype,
  };
}

// ==========================================
// Pace Curve (Running)
// ==========================================

export interface PaceCurvePoint {
  distance: number; // meters
  pace: number; // seconds per km
  time: number; // total time for this distance
}

export interface PaceCurve {
  points: PaceCurvePoint[];
  criticalVelocity: number; // m/s (velocity sustainable for ~1 hour)
  riegelExponent: number; // Performance decay rate
  runnerType: 'sprinter' | 'middle-distance' | 'endurance';
  predictedTimes: {
    '5k': number;
    '10k': number;
    'half-marathon': number;
    'marathon': number;
  };
}

/**
 * Calculates pace curve from running activity.
 *
 * @param paceStream - Array of pace values (seconds per km)
 * @param timestamps - Array of timestamps
 * @param distanceStream - Cumulative distance in meters
 * @returns Pace curve points
 */
export function calculatePaceCurve(
  paceStream: number[],
  timestamps: number[],
  distanceStream: number[]
): PaceCurvePoint[] {
  const targetDistances = [400, 800, 1609, 5000, 10000, 21097]; // meters

  const curve: PaceCurvePoint[] = [];

  for (const targetDistance of targetDistances) {
    const result = findBestPaceForDistance(paceStream, timestamps, distanceStream, targetDistance);
    if (result) {
      curve.push({
        distance: targetDistance,
        pace: result.pace,
        time: result.time,
      });
    }
  }

  return curve;
}

/**
 * Analyzes pace curve to identify runner type and predict race times.
 *
 * @param curve - Pace curve points
 * @returns Analyzed pace curve with predictions
 */
export function analyzePaceCurve(curve: PaceCurvePoint[]): PaceCurve {
  // Sort by distance
  const sortedCurve = [...curve].sort((a, b) => a.distance - b.distance);

  // Calculate Riegel exponent (performance decay)
  // T2 = T1 × (D2/D1)^n where n is the Riegel exponent
  // Typical values: 1.06-1.08 for endurance runners, 1.09-1.12 for sprinters
  const p5k = sortedCurve.find((p) => p.distance === 5000);
  const p10k = sortedCurve.find((p) => p.distance === 10000);

  let riegelExponent = 1.06; // default
  if (p5k && p10k) {
    riegelExponent = Math.log(p10k.time / p5k.time) / Math.log(10000 / 5000);
  }

  // Critical velocity (velocity sustainable for ~1 hour)
  const cv = p10k ? 10000 / p10k.time : 3.5; // m/s

  // Predict race times using Riegel formula
  const predictedTimes = {
    '5k': p5k?.time || predictTime(5000, cv, riegelExponent),
    '10k': p10k?.time || predictTime(10000, cv, riegelExponent),
    'half-marathon': predictTime(21097, cv, riegelExponent),
    'marathon': predictTime(42195, cv, riegelExponent),
  };

  // Identify runner type
  let runnerType: 'sprinter' | 'middle-distance' | 'endurance';
  if (riegelExponent > 1.1) {
    runnerType = 'sprinter';
  } else if (riegelExponent < 1.07) {
    runnerType = 'endurance';
  } else {
    runnerType = 'middle-distance';
  }

  return {
    points: sortedCurve,
    criticalVelocity: Math.round(cv * 100) / 100,
    riegelExponent: Math.round(riegelExponent * 1000) / 1000,
    runnerType,
    predictedTimes,
  };
}

/**
 * Predicts race time using Riegel formula.
 *
 * @param distance - Race distance in meters
 * @param criticalVelocity - Critical velocity in m/s
 * @param riegelExponent - Riegel exponent
 * @returns Predicted time in seconds
 */
function predictTime(
  distance: number,
  criticalVelocity: number,
  riegelExponent: number
): number {
  // Time = Distance / (CV × (Distance/Reference)^(n-1))
  const referenceDistance = 10000;
  return (
    distance / (criticalVelocity * Math.pow(distance / referenceDistance, riegelExponent - 1))
  );
}

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

    if (avgPace < bestPace) {
      bestPace = avgPace;
      bestTime = time;
    }
  }

  return bestPace < Infinity ? { pace: bestPace, time: bestTime } : null;
}

// ==========================================
// Heart Rate Curve
// ==========================================

export interface HRCurvePoint {
  duration: number; // seconds
  hr: number; // bpm
}

export interface HRCurve {
  points: HRCurvePoint[];
  zones: { zone: number; min: number; max: number }[];
  hrResponse: 'fast' | 'normal' | 'slow';
}

/**
 * Calculates HR curve - max sustainable HR for various durations.
 *
 * @param hrStream - Array of HR values
 * @param timestamps - Array of timestamps
 * @returns HR curve points
 */
export function calculateHRCurve(hrStream: number[], timestamps: number[]): HRCurvePoint[] {
  const durations = [60, 300, 1200, 3600]; // 1min, 5min, 20min, 60min

  const curve: HRCurvePoint[] = [];

  for (const duration of durations) {
    const result = findMaxAverageHR(hrStream, timestamps, duration);
    if (result) {
      curve.push({ duration, hr: result.avgHR });
    }
  }

  return curve;
}

/**
 * Analyzes HR curve to identify HR response characteristics.
 *
 * @param curve - HR curve points
 * @param maxHR - Known max heart rate
 * @returns Analyzed HR curve with zones
 */
export function analyzeHRCurve(curve: HRCurvePoint[], maxHR: number): HRCurve {
  // Sort by duration
  const sortedCurve = [...curve].sort((a, b) => a.duration - b.duration);

  // Estimate LTHR from 20min HR (typically 95% of 20min max)
  const hr20min = sortedCurve.find((p) => p.duration === 1200);
  const lthr = hr20min ? hr20min.hr * 0.95 : maxHR * 0.85;

  // Define HR zones based on LTHR
  const zones = [
    { zone: 1, min: 50, max: Math.round(lthr * 0.82) },
    { zone: 2, min: Math.round(lthr * 0.82), max: Math.round(lthr * 0.89) },
    { zone: 3, min: Math.round(lthr * 0.89), max: Math.round(lthr * 0.93) },
    { zone: 4, min: Math.round(lthr * 0.93), max: Math.round(lthr) },
    { zone: 5, min: Math.round(lthr), max: maxHR },
  ];

  // Identify HR response type
  // Fast responders reach high HR quickly, slow responders take longer
  const hr1min = sortedCurve.find((p) => p.duration === 60);
  const hr5min = sortedCurve.find((p) => p.duration === 300);

  let hrResponse: 'fast' | 'normal' | 'slow' = 'normal';
  if (hr1min && hr5min) {
    const percentOfMax1min = hr1min.hr / maxHR;
    const percentOfMax5min = hr5min.hr / maxHR;
    const diff = percentOfMax5min - percentOfMax1min;

    if (diff < 0.05) {
      hrResponse = 'fast'; // HR reaches near-max quickly
    } else if (diff > 0.15) {
      hrResponse = 'slow'; // Takes time to reach high HR
    }
  }

  return {
    points: sortedCurve,
    zones,
    hrResponse,
  };
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Finds the maximum average power for a given duration.
 *
 * @param powerStream - Array of power values
 * @param timestamps - Array of timestamps
 * @param durationSeconds - Target duration in seconds
 * @returns Max average power result or null
 */
export function findMaxAveragePower(
  powerStream: number[],
  timestamps: number[],
  durationSeconds: number
): { avgPower: number; startIndex: number; endIndex: number } | null {
  if (powerStream.length < 2) return null;

  let maxAvg = 0;
  let maxStartIdx = 0;
  let maxEndIdx = 0;

  for (let i = 0; i < powerStream.length; i++) {
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

    // Calculate average power for this window
    const sum = powerStream.slice(i, endIdx).reduce((s, p) => s + p, 0);
    const avg = sum / (endIdx - i);

    if (avg > maxAvg) {
      maxAvg = avg;
      maxStartIdx = i;
      maxEndIdx = endIdx;
    }
  }

  return maxAvg > 0 ? { avgPower: maxAvg, startIndex: maxStartIdx, endIndex: maxEndIdx } : null;
}

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
