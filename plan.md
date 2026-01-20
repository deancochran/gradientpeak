# Performance Metrics Platform - Implementation Plan

**Goal:** Separate athlete capabilities from activity data, enabling temporal metric lookups, retroactive recalculation, and intelligent defaults.

**Architecture:** Database-independent core package → tRPC API layer → Mobile/Web apps

---

## Phase 1: Database Schema & Migrations

### 1.1 Create Profile Performance Metric Logs Table

**File:** `packages/supabase/migrations/YYYYMMDDHHMMSS_create_profile_performance_metric_logs.sql`

```sql
-- Enums for performance metrics
CREATE TYPE performance_metric_type AS ENUM ('power', 'pace', 'heart_rate');

-- Main performance metrics table
CREATE TABLE profile_performance_metric_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Metric identification
  category activity_category NOT NULL,
  type performance_metric_type NOT NULL,
  value NUMERIC NOT NULL CHECK (value > 0),
  unit TEXT NOT NULL,
  duration_seconds INTEGER CHECK (duration_seconds > 0),

  -- Provenance
  reference_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
);
```

### 1.2 Create Profile Metric Logs Table

**File:** `packages/supabase/migrations/YYYYMMDDHHMMSS_create_profile_metric_logs.sql`

```sql
-- Already provided in spec.md (lines 119-180)
-- See spec.md for complete SQL
```

### 1.3 Update Supabase Types

**Command:**
```bash
cd packages/supabase
pnpm run generate-types
```

**Verify new types in:** `packages/supabase/types/database.ts`

---

## Phase 2: Core Package Implementation

### 2.1 Create Performance Metric Schemas

**File:** `packages/core/schemas/performance-metrics.ts`

### 2.2 Implement Intelligent Defaults

**File:** `packages/core/estimation/defaults.ts`


### 2.3 Implement Temporal Metric Lookup

**File:** `packages/core/utils/temporal-metrics.ts`

### 2.4 Multi-Modal TSS Calculation

**File:** `packages/core/calculations/tss.ts` (update)

#### Power-Based TSS (Existing)

```typescript
export interface TSSFromPowerParams {
  powerStream: number[];
  timestamps: number[];
  ftp: number;
  weight?: number;
}

export interface TSSResult {
  tss: number;
  normalizedPower: number;
  intensityFactor: number;
  variabilityIndex: number;
}

export function calculateTSSFromPower(params: TSSFromPowerParams): TSSResult {
  const { powerStream, timestamps, ftp, weight } = params;

  // Calculate 30-second rolling average (normalized power)
  const normalizedPower = calculateNormalizedPower(powerStream);

  // Calculate intensity factor
  const intensityFactor = normalizedPower / ftp;

  // Calculate duration in hours
  const durationSeconds = timestamps[timestamps.length - 1] - timestamps[0];
  const hours = durationSeconds / 3600;

  // TSS formula: (duration × NP × IF) / (FTP × 3600) × 100
  const tss = (durationSeconds * normalizedPower * intensityFactor) / (ftp * 3600) * 100;

  // Variability index
  const avgPower = powerStream.reduce((sum, p) => sum + p, 0) / powerStream.length;
  const variabilityIndex = normalizedPower / avgPower;

  return {
    tss: Math.round(tss),
    normalizedPower: Math.round(normalizedPower),
    intensityFactor: Math.round(intensityFactor * 100) / 100,
    variabilityIndex: Math.round(variabilityIndex * 100) / 100,
  };
}
```

#### Heart Rate-Based TSS (HRSS)

```typescript
export interface HRSSParams {
  hrStream: number[];
  timestamps: number[];
  lthr: number; // Lactate threshold heart rate
  maxHR: number;
  restingHR?: number;
}

export interface HRSSResult {
  hrss: number;
  avgHR: number;
  timeInZones: { zone: number; seconds: number; percentage: number }[];
  source: 'hr';
}

/**
 * Calculate heart rate-based TSS (HRSS).
 * Uses Coggan's 5-zone model with weighted zone points.
 */
export function calculateHRSS(params: HRSSParams): HRSSResult {
  const { hrStream, timestamps, lthr, maxHR, restingHR = 60 } = params;

  // Define HR zones (% of LTHR)
  const zones = [
    { zone: 1, min: restingHR, max: lthr * 0.82, points: 20 },  // Active recovery
    { zone: 2, min: lthr * 0.82, max: lthr * 0.89, points: 30 }, // Endurance
    { zone: 3, min: lthr * 0.89, max: lthr * 0.93, points: 40 }, // Tempo
    { zone: 4, min: lthr * 0.93, max: lthr * 1.00, points: 50 }, // Threshold
    { zone: 5, min: lthr * 1.00, max: maxHR, points: 100 },      // VO2max+
  ];

  let totalPoints = 0;
  const timeInZones = zones.map(z => ({ ...z, seconds: 0, percentage: 0 }));

  // Calculate time in each zone
  for (let i = 0; i < hrStream.length; i++) {
    const hr = hrStream[i];
    const duration = i < hrStream.length - 1
      ? timestamps[i + 1] - timestamps[i]
      : 1;

    const zone = zones.find(z => hr >= z.min && hr < z.max) || zones[zones.length - 1];
    const zoneIndex = zones.indexOf(zone);

    timeInZones[zoneIndex].seconds += duration;
    totalPoints += (zone.points / 3600) * duration; // Points per second
  }

  const totalDuration = timestamps[timestamps.length - 1] - timestamps[0];
  timeInZones.forEach(z => {
    z.percentage = Math.round((z.seconds / totalDuration) * 100);
  });

  const avgHR = hrStream.reduce((sum, hr) => sum + hr, 0) / hrStream.length;

  return {
    hrss: Math.round(totalPoints),
    avgHR: Math.round(avgHR),
    timeInZones: timeInZones.map(({ zone, seconds, percentage }) =>
      ({ zone, seconds, percentage })
    ),
    source: 'hr',
  };
}
```

#### Pace-Based TSS (Running)

```typescript
export interface RunningTSSParams {
  paceStream: number[]; // seconds per km
  timestamps: number[];
  elevationStream?: number[]; // meters
  thresholdPace: number; // seconds per km
  distance: number; // meters
}

export interface RunningTSSResult {
  tss: number;
  normalizedPace: number; // Normalized graded pace
  intensityFactor: number;
  source: 'pace';
}

/**
 * Calculate running TSS based on pace.
 * Uses Normalized Graded Pace (NGP) to account for elevation changes.
 */
export function calculateRunningTSS(params: RunningTSSParams): RunningTSSResult {
  const { paceStream, timestamps, elevationStream, thresholdPace, distance } = params;

  // Calculate grade-adjusted pace if elevation available
  let adjustedPaceStream = paceStream;
  if (elevationStream) {
    adjustedPaceStream = calculateGradeAdjustedPace(paceStream, elevationStream, timestamps);
  }

  // Calculate normalized graded pace (NGP) - similar to normalized power
  const normalizedPace = calculateNormalizedPace(adjustedPaceStream);

  // Calculate intensity factor (IF = NGP / threshold pace)
  // Note: For pace, higher is slower, so invert
  const intensityFactor = thresholdPace / normalizedPace;

  // Calculate duration in hours
  const durationSeconds = timestamps[timestamps.length - 1] - timestamps[0];
  const hours = durationSeconds / 3600;

  // TSS formula for running: (duration_hours × IF²) × 100
  const tss = hours * Math.pow(intensityFactor, 2) * 100;

  return {
    tss: Math.round(tss),
    normalizedPace: Math.round(normalizedPace),
    intensityFactor: Math.round(intensityFactor * 100) / 100,
    source: 'pace',
  };
}

/**
 * Adjust pace for grade/elevation changes.
 * Uphill running is harder, downhill is easier.
 */
function calculateGradeAdjustedPace(
  paceStream: number[],
  elevationStream: number[],
  timestamps: number[]
): number[] {
  const adjusted: number[] = [];

  for (let i = 0; i < paceStream.length; i++) {
    const pace = paceStream[i];

    if (i === 0) {
      adjusted.push(pace);
      continue;
    }

    // Calculate grade
    const elevationGain = elevationStream[i] - elevationStream[i - 1];
    const distance = (timestamps[i] - timestamps[i - 1]) / pace; // rough distance
    const grade = distance > 0 ? (elevationGain / distance) * 100 : 0;

    // Adjustment factor (simplified - real algorithm more complex)
    // +1% grade = ~12 seconds per mile slower
    // -1% grade = ~8 seconds per mile slower (less benefit going down)
    const adjustmentFactor = grade > 0
      ? 1 + (grade * 0.035)
      : 1 + (grade * 0.02);

    adjusted.push(pace / adjustmentFactor);
  }

  return adjusted;
}

function calculateNormalizedPace(paceStream: number[]): number {
  // 30-second rolling average, similar to normalized power
  const windowSize = 30;
  const rollingAverages: number[] = [];

  for (let i = 0; i < paceStream.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = paceStream.slice(start, i + 1);
    const avg = window.reduce((sum, p) => sum + p, 0) / window.length;
    rollingAverages.push(avg);
  }

  // Return average of rolling averages
  return rollingAverages.reduce((sum, p) => sum + p, 0) / rollingAverages.length;
}
```

#### Universal TSS Calculator

```typescript
export interface UniversalTSSParams {
  powerStream?: number[];
  hrStream?: number[];
  paceStream?: number[];
  elevationStream?: number[];
  timestamps: number[];
  ftp?: number;
  lthr?: number;
  maxHR?: number;
  restingHR?: number;
  thresholdPace?: number;
  distance?: number;
  weight?: number;
}

export type UniversalTSSResult =
  | (TSSResult & { source: 'power'; confidence: 'high' })
  | (HRSSResult & { confidence: 'medium' })
  | (RunningTSSResult & { confidence: 'medium' });

/**
 * Calculate TSS from whatever data is available.
 * Priority: Power > Heart Rate > Pace
 */
export function calculateTSSFromAvailableData(
  params: UniversalTSSParams
): UniversalTSSResult | null {
  const {
    powerStream, hrStream, paceStream, elevationStream, timestamps,
    ftp, lthr, maxHR, restingHR, thresholdPace, distance, weight
  } = params;

  // Try power-based TSS first (most accurate)
  if (powerStream && powerStream.length > 0 && ftp) {
    const result = calculateTSSFromPower({ powerStream, timestamps, ftp, weight });
    return { ...result, source: 'power', confidence: 'high' };
  }

  // Fallback to HR-based TSS
  if (hrStream && hrStream.length > 0 && lthr && maxHR) {
    const result = calculateHRSS({ hrStream, timestamps, lthr, maxHR, restingHR });
    return { ...result, confidence: 'medium' };
  }

  // Fallback to pace-based TSS (running only)
  if (paceStream && paceStream.length > 0 && thresholdPace && distance) {
    const result = calculateRunningTSS({
      paceStream,
      timestamps,
      elevationStream,
      thresholdPace,
      distance
    });
    return { ...result, confidence: 'medium' };
  }

  return null; // No data available for TSS calculation
}
```


### 2.5 Performance Curve Calculations

**File:** `packages/core/calculations/curves.ts`

```typescript
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
 * Calculate power curve from activity power stream.
 * Returns max average power for standard durations.
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
 * Analyze power curve to identify athlete phenotype and critical power.
 */
export function analyzePowerCurve(curve: PowerCurvePoint[]): PowerCurve {
  // Sort by duration
  const sortedCurve = [...curve].sort((a, b) => a.duration - b.duration);

  // Find critical power (CP) - approximately 60min power
  const cp60 = sortedCurve.find(p => p.duration === 3600);
  const cp20 = sortedCurve.find(p => p.duration === 1200);
  const criticalPower = cp60?.power || (cp20 ? cp20.power * 0.95 : 0);

  // Calculate W' (anaerobic capacity)
  // W' = (P5min - CP) × 300 seconds (simplified model)
  const p5min = sortedCurve.find(p => p.duration === 300);
  const wPrime = p5min ? (p5min.power - criticalPower) * 300 : 0;

  // Identify phenotype based on power distribution
  const p5s = sortedCurve.find(p => p.duration === 5)?.power || 0;
  const p5min_val = p5min?.power || 0;
  const p60min = cp60?.power || 0;

  // Ratios
  const sprintRatio = p5s / p60min; // High for sprinters
  const enduranceRatio = p60min / p5min_val; // High for time-trialists

  let phenotype: 'sprinter' | 'time-trialist' | 'all-rounder';
  if (sprintRatio > 3.0 && enduranceRatio < 0.85) {
    phenotype = 'sprinter';
  } else if (sprintRatio < 2.5 && enduranceRatio > 0.90) {
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

// Pace Curve for Runners

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
 * Calculate pace curve from running activity.
 */
export function calculatePaceCurve(
  paceStream: number[], // seconds per km
  timestamps: number[],
  distanceStream: number[] // cumulative distance in meters
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
 * Analyze pace curve to identify runner type and predict race times.
 */
export function analyzePaceCurve(curve: PaceCurvePoint[]): PaceCurve {
  // Sort by distance
  const sortedCurve = [...curve].sort((a, b) => a.distance - b.distance);

  // Calculate Riegel exponent (performance decay)
  // T2 = T1 × (D2/D1)^n where n is the Riegel exponent
  // Typical values: 1.06-1.08 for endurance runners, 1.09-1.12 for sprinters
  const p5k = sortedCurve.find(p => p.distance === 5000);
  const p10k = sortedCurve.find(p => p.distance === 10000);

  let riegelExponent = 1.06; // default
  if (p5k && p10k) {
    riegelExponent = Math.log(p10k.time / p5k.time) / Math.log(10000 / 5000);
  }

  // Critical velocity (velocity sustainable for ~1 hour)
  const cv = p10k ? (10000 / p10k.time) : 3.5; // m/s

  // Predict race times using Riegel formula
  const predictedTimes = {
    '5k': p5k?.time || predictTime(5000, cv, riegelExponent),
    '10k': p10k?.time || predictTime(10000, cv, riegelExponent),
    'half-marathon': predictTime(21097, cv, riegelExponent),
    'marathon': predictTime(42195, cv, riegelExponent),
  };

  // Identify runner type
  let runnerType: 'sprinter' | 'middle-distance' | 'endurance';
  if (riegelExponent > 1.10) {
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

function predictTime(distance: number, criticalVelocity: number, riegelExponent: number): number {
  // Time = Distance / (CV × (Distance/Reference)^(n-1))
  const referenceDistance = 10000;
  return distance / (criticalVelocity * Math.pow(distance / referenceDistance, riegelExponent - 1));
}

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

    // Find end point
    let endIdx = i;
    while (
      endIdx < distanceStream.length &&
      distanceStream[endIdx] - startDistance < targetDistance
    ) {
      endIdx++;
    }

    if (endIdx >= distanceStream.length) break;

    const actualDistance = distanceStream[endIdx] - startDistance;
    if (Math.abs(actualDistance - targetDistance) > targetDistance * 0.1) continue; // 10% tolerance

    const time = timestamps[endIdx] - timestamps[i];
    const avgPace = time / (actualDistance / 1000); // seconds per km

    if (avgPace < bestPace) {
      bestPace = avgPace;
      bestTime = time;
    }
  }

  return bestPace < Infinity ? { pace: bestPace, time: bestTime } : null;
}

// Heart Rate Curve

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
 * Calculate HR curve - max sustainable HR for various durations.
 */
export function calculateHRCurve(
  hrStream: number[],
  timestamps: number[]
): HRCurvePoint[] {
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

function findMaxAverageHR(
  hrStream: number[],
  timestamps: number[],
  durationSeconds: number
): { avgHR: number } | null {
  let maxAvg = 0;

  for (let i = 0; i < hrStream.length; i++) {
    const startTime = timestamps[i];
    const targetEndTime = startTime + durationSeconds;

    let endIdx = i;
    while (endIdx < timestamps.length && timestamps[endIdx] < targetEndTime) {
      endIdx++;
    }

    if (endIdx - i < 10) continue;

    const sum = hrStream.slice(i, endIdx).reduce((s, hr) => s + hr, 0);
    const avg = sum / (endIdx - i);

    if (avg > maxAvg) {
      maxAvg = avg;
    }
  }

  return maxAvg > 0 ? { avgHR: maxAvg } : null;
}
```

### 2.6 Implement Test Effort Detection (Multi-Modal)

**File:** `packages/core/detection/power-tests.ts`

```typescript
export interface TestEffortSuggestion {
  type: 'ftp' | 'vo2max_power' | 'anaerobic_power';
  value: number;
  duration: number;
}

/**
 * Analyzes activity power stream to detect test efforts.
 * Returns suggested FTP and other power metrics.
 */
export function detectPowerTestEfforts(
  powerStream: number[],
  timestamps: number[]
): TestEffortSuggestion[] {
  const suggestions: TestEffortSuggestion[] = [];

  // Detect 20-minute max effort (FTP test)
  const twentyMinMax = findMaxAveragePower(powerStream, timestamps, 1200);
  if (twentyMinMax && twentyMinMax.avgPower > 150) {
    suggestions.push({
      type: 'ftp',
      value: Math.round(twentyMinMax.avgPower * 0.95),
      duration: 1200,
      detectionMethod: '20min test * 0.95',
      confidence: 'high',
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
    });
  }

  return suggestions;
}

/**
 * Finds the maximum average power for a given duration.
 */
function findMaxAveragePower(
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
    const targetEndTime = startTime + durationSeconds;

    // Find end index
    let endIdx = i;
    while (endIdx < timestamps.length && timestamps[endIdx] < targetEndTime) {
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

  return maxAvg > 0
    ? { avgPower: maxAvg, startIndex: maxStartIdx, endIndex: maxEndIdx }
    : null;
}
```

**File:** `packages/core/detection/pace-tests.ts`

```typescript
export interface RunningTestSuggestion {
  type: 'threshold_pace' | '5k_pace' | '10k_pace';
  value: number; // seconds per km
  distance: number; // meters
  duration: number; // seconds
  detectionMethod: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detect running test efforts from pace stream.
 */
export function detectRunningTestEfforts(
  paceStream: number[], // seconds per km
  timestamps: number[],
  distanceStream: number[]
): RunningTestSuggestion[] {
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
      type: 'threshold_pace',
      value: tempo.pace,
      distance: tempo.distance,
      duration: tempo.duration,
      detectionMethod: `${Math.round(tempo.duration / 60)}min tempo run`,
      confidence: 'medium',
    });
  }

  return suggestions;
}

function detectTempoRuns(
  paceStream: number[],
  timestamps: number[]
): { pace: number; distance: number; duration: number }[] {
  const tempos: { pace: number; distance: number; duration: number }[] = [];
  const minDuration = 1200; // 20 minutes
  const maxDuration = 2400; // 40 minutes

  for (let duration = minDuration; duration <= maxDuration; duration += 300) {
    const result = findMaxAveragePower(paceStream, timestamps, duration);
    if (result) {
      // Check if pace is consistent (< 5% variation)
      const paceWindow = paceStream.slice(result.startIndex, result.endIndex);
      const paceStdDev = calculateStdDev(paceWindow);
      const paceCV = paceStdDev / result.avgPower;

      if (paceCV < 0.05) {
        // Consistent effort
        tempos.push({
          pace: result.avgPower,
          distance: duration * (1000 / result.avgPower), // rough estimate
          duration,
        });
      }
    }
  }

  return tempos;
}
```

**File:** `packages/core/detection/hr-tests.ts`

```typescript
export interface HRTestSuggestion {
  type: 'lthr' | 'max_hr';
  value: number; // bpm
  duration: number; // seconds
  detectionMethod: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detect HR test efforts and estimate LTHR/max HR.
 */
export function detectHRTestEfforts(
  hrStream: number[],
  timestamps: number[]
): HRTestSuggestion[] {
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
  const rampTest = detectRampTest(hrStream, timestamps);
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
 * Detect ramp test - progressive effort to exhaustion.
 */
function detectRampTest(
  hrStream: number[],
  timestamps: number[]
): { lthr: number; maxHR: number; duration: number } | null {
  // Look for progressive HR increase over 10-30 minutes
  const minDuration = 600; // 10 minutes
  const maxDuration = 1800; // 30 minutes

  for (let i = 0; i < hrStream.length; i++) {
    const startHR = hrStream[i];
    const startTime = timestamps[i];

    let endIdx = i;
    while (
      endIdx < hrStream.length &&
      timestamps[endIdx] - startTime < maxDuration
    ) {
      endIdx++;
    }

    if (endIdx - i < 100) continue; // Need enough data points

    const window = hrStream.slice(i, endIdx);
    const duration = timestamps[endIdx - 1] - startTime;

    if (duration < minDuration) continue;

    // Check for progressive increase
    const hrIncrease = window[window.length - 1] - window[0];
    const avgIncreaseRate = hrIncrease / duration; // bpm per second

    if (avgIncreaseRate > 0.1 && avgIncreaseRate < 0.3) {
      // Looks like a ramp test
      const maxHR = Math.max(...window);
      const lthr = Math.round(maxHR * 0.85); // Estimate LTHR at 85% of max

      return { lthr, maxHR: Math.round(maxHR), duration };
    }
  }

  return null;
}
```

---

## Phase 3: tRPC API Layer

### 3.1 Profile Performance Metrics Router

**File:** `packages/trpc/src/routers/profile-performance-metrics.ts`

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  performanceMetricLogSchema,
  createPerformanceMetricInputSchema,
  performanceMetricCategorySchema,
  performanceMetricTypeSchema,
} from '@repo/core/schemas/performance-metrics';

export const profilePerformanceMetricsRouter = router({
  /**
   * List all performance metric logs for current user.
   */
  list: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema.optional(),
        type: performanceMetricTypeSchema.optional(),
        isActive: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;
      const profileId = session.user.id;

      let query = supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.category) {
        query = query.eq('category', input.category);
      }

      if (input.type) {
        query = query.eq('type', input.type);
      }

      if (input.isActive !== undefined) {
        query = query.eq('is_active', input.isActive);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data;
    }),

  /**
   * Get performance metric at a specific date.
   * Critical for activity TSS calculation.
   */
  getAtDate: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema,
        type: performanceMetricTypeSchema,
        durationSeconds: z.number().int().positive().optional(),
        date: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;
      const profileId = session.user.id;

      let query = supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', profileId)
        .eq('category', input.category)
        .eq('type', input.type)
        .eq('is_active', true)
        .lte('created_at', input.date.toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (input.durationSeconds) {
        query = query.eq('duration_seconds', input.durationSeconds);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data?.[0] || null;
    }),

  /**
   * Get all metrics in a date range.
   */
  getForDateRange: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema.optional(),
        type: performanceMetricTypeSchema.optional(),
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;
      const profileId = session.user.id;

      let query = supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', profileId)
        .gte('created_at', input.startDate.toISOString())
        .lte('created_at', input.endDate.toISOString())
        .order('created_at', { ascending: false });

      if (input.category) query = query.eq('category', input.category);
      if (input.type) query = query.eq('type', input.type);

      const { data, error } = await query;

      if (error) throw error;

      return data;
    }),

  /**
   * Create new performance metric log.
   */
  create: protectedProcedure
    .input(createPerformanceMetricInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      // Ensure profileId matches authenticated user
      if (input.profileId !== session.user.id) {
        throw new Error('Unauthorized');
      }

      const { data, error } = await supabase
        .from('profile_performance_metric_logs')
        .insert({
          profile_id: input.profileId,
          category: input.category,
          type: input.type,
          value: input.value,
          unit: input.unit,
          duration_seconds: input.durationSeconds,
          source: input.source,
          reference_activity_id: input.referenceActivityId,
          environmental_conditions: input.environmentalConditions,
          notes: input.notes,
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    }),

  /**
   * Deactivate a metric (soft delete).
   */
  deactivate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      const { data, error } = await supabase
        .from('profile_performance_metric_logs')
        .update({ is_active: false })
        .eq('id', input.id)
        .eq('profile_id', session.user.id)
        .select()
        .single();

      if (error) throw error;

      return data;
    }),
});
```

### 3.2 Profile Metrics Router

**File:** `packages/trpc/src/routers/profile-metrics.ts`

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  profileMetricLogSchema,
  createProfileMetricInputSchema,
  profileMetricTypeSchema,
} from '@repo/core/schemas/profile-metrics';

export const profileMetricsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        metricType: profileMetricTypeSchema.optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      let query = supabase
        .from('profile_metric_logs')
        .select('*')
        .eq('profile_id', session.user.id)
        .order('recorded_at', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.metricType) {
        query = query.eq('metric_type', input.metricType);
      }

      if (input.startDate) {
        query = query.gte('recorded_at', input.startDate.toISOString());
      }

      if (input.endDate) {
        query = query.lte('recorded_at', input.endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      return data;
    }),

  getAtDate: protectedProcedure
    .input(
      z.object({
        metricType: profileMetricTypeSchema,
        date: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      // Find closest metric at or before date
      const { data, error } = await supabase
        .from('profile_metric_logs')
        .select('*')
        .eq('profile_id', session.user.id)
        .eq('metric_type', input.metricType)
        .lte('recorded_at', input.date.toISOString())
        .order('recorded_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      return data?.[0] || null;
    }),

  create: protectedProcedure
    .input(createProfileMetricInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      if (input.profileId !== session.user.id) {
        throw new Error('Unauthorized');
      }

      const { data, error } = await supabase
        .from('profile_metric_logs')
        .insert({
          profile_id: input.profileId,
          metric_type: input.metricType,
          value: input.value,
          unit: input.unit,
          source: input.source,
          reference_activity_id: input.referenceActivityId,
          notes: input.notes,
          recorded_at: input.recordedAt || new Date(),
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      const { error } = await supabase
        .from('profile_metric_logs')
        .delete()
        .eq('id', input.id)
        .eq('profile_id', session.user.id);

      if (error) throw error;

      return { success: true };
    }),
});
```

### 3.3 Update Activity Router for TSS Calculation

**File:** `packages/trpc/src/routers/activities.ts` (modify existing)

```typescript
// Add background job for TSS calculation
import { calculateTSSFromStream } from '@repo/core/calculations/tss';
import { detectPowerTestEfforts } from '@repo/core/detection/power-tests';

export const activityRouter = router({
  // ... existing procedures

  /**
   * Calculate TSS for an activity using metric logs.
   * Supports multi-modal calculation (power, HR, pace).
   * Called as background job after activity upload.
   */
  calculateMetrics: protectedProcedure
    .input(z.object({ activityId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      // Fetch activity
      const { data: activity, error: activityError } = await supabase
        .from('activities')
        .select('*')
        .eq('id', input.activityId)
        .eq('profile_id', session.user.id)
        .single();

      if (activityError) throw activityError;

      // Fetch JSON from storage
      const { data: jsonData } = await supabase.storage
        .from('activities')
        .download(activity.storage_path);

      if (!jsonData) throw new Error('Activity JSON not found');

      const activityJson = JSON.parse(await jsonData.text());
      const activityDate = new Date(activity.start_time);
      const activityCategory = activity.sport_type; // 'bike', 'run', 'swim', etc.

      // Extract all available streams
      const powerStream = activityJson.streams?.power;
      const hrStream = activityJson.streams?.heart_rate;
      const paceStream = activityJson.streams?.pace;
      const elevationStream = activityJson.streams?.elevation;
      const timestamps = activityJson.streams?.time;
      const distance = activity.distance;

      // Get weight (used for various calculations)
      const weightMetric = await ctx.caller.profileMetrics.getAtDate({
        metricType: 'weight_kg',
        date: activityDate,
      });
      const weight = weightMetric?.value || 75;

      // === POWER-BASED METRICS ===
      let ftp: number | undefined;
      if (powerStream && powerStream.length > 0) {
        const ftpMetric = await ctx.caller.profilePerformanceMetrics.getAtDate({
          category: activityCategory,
          type: 'power',
          durationSeconds: 3600,
          date: activityDate,
        });

        if (!ftpMetric) {
          // Estimate FTP from weight
          const estimatedFTP = estimateFTPFromWeight(weight);
          ftp = estimatedFTP.value;

          // Store estimated FTP
          await ctx.caller.profilePerformanceMetrics.create({
            profileId: session.user.id,
            category: activityCategory,
            type: 'power',
            value: ftp,
            unit: 'watts',
            durationSeconds: 3600,
            source: 'estimated',
            notes: `Estimated from weight (${weight}kg)`,
          });
        } else {
          ftp = ftpMetric.value;
        }
      }

      // === HEART RATE-BASED METRICS ===
      let lthr: number | undefined;
      let maxHR: number | undefined;
      if (hrStream && hrStream.length > 0) {
        const lthrMetric = await ctx.caller.profilePerformanceMetrics.getAtDate({
          category: activityCategory,
          type: 'heart_rate',
          durationSeconds: 3600,
          date: activityDate,
        });

        const maxHRMetric = await ctx.caller.profilePerformanceMetrics.getAtDate({
          category: activityCategory,
          type: 'heart_rate',
          durationSeconds: 0, // Max HR
          date: activityDate,
        });

        lthr = lthrMetric?.value;
        maxHR = maxHRMetric?.value;

        // Estimate if missing
        if (!maxHR) {
          const ageMetric = await ctx.caller.profileMetrics.getAtDate({
            metricType: 'age',
            date: activityDate,
          });
          const age = ageMetric?.value || 30;
          const estimatedMaxHR = estimateMaxHR(age);
          maxHR = estimatedMaxHR.value;

          // Store estimated max HR
          await ctx.caller.profilePerformanceMetrics.create({
            profileId: session.user.id,
            category: activityCategory,
            type: 'heart_rate',
            value: maxHR,
            unit: 'bpm',
            durationSeconds: 0,
            source: 'estimated',
            notes: `Estimated from age (${age})`,
          });
        }

        if (!lthr && maxHR) {
          const estimatedLTHR = estimateLTHR(maxHR);
          lthr = estimatedLTHR.value;

          // Store estimated LTHR
          await ctx.caller.profilePerformanceMetrics.create({
            profileId: session.user.id,
            category: activityCategory,
            type: 'heart_rate',
            value: lthr,
            unit: 'bpm',
            durationSeconds: 3600,
            source: 'estimated',
            notes: `Estimated from max HR (${maxHR} bpm)`,
          });
        }
      }

      // === PACE-BASED METRICS (Running) ===
      let thresholdPace: number | undefined;
      if (paceStream && paceStream.length > 0 && activityCategory === 'run') {
        const paceMetric = await ctx.caller.profilePerformanceMetrics.getAtDate({
          category: 'run',
          type: 'pace',
          durationSeconds: 3600,
          date: activityDate,
        });

        thresholdPace = paceMetric?.value;

        // Estimate if missing (from recent runs)
        if (!thresholdPace) {
          // TODO: Implement estimateThresholdPaceFromRecentRuns
          const estimatedPace = 300; // Default 5:00 min/km
          thresholdPace = estimatedPace;

          await ctx.caller.profilePerformanceMetrics.create({
            profileId: session.user.id,
            category: 'run',
            type: 'pace',
            value: thresholdPace,
            unit: 'sec/km',
            durationSeconds: 3600,
            source: 'estimated',
            notes: 'Default threshold pace',
          });
        }
      }

      // === UNIVERSAL TSS CALCULATION ===
      const tssResult = calculateTSSFromAvailableData({
        powerStream,
        hrStream,
        paceStream,
        elevationStream,
        timestamps,
        ftp,
        lthr,
        maxHR,
        thresholdPace,
        distance,
        weight,
      });

      if (!tssResult) {
        throw new Error('Unable to calculate TSS - insufficient data');
      }

      // === PERFORMANCE CURVES ===
      const curves: any = {};

      if (powerStream && powerStream.length > 0) {
        const powerCurvePoints = calculatePowerCurve(powerStream, timestamps);
        const powerCurveAnalysis = analyzePowerCurve(powerCurvePoints);
        curves.power = powerCurveAnalysis;
      }

      if (paceStream && paceStream.length > 0 && activityCategory === 'run') {
        const distanceStream = activityJson.streams?.distance;
        if (distanceStream) {
          const paceCurvePoints = calculatePaceCurve(paceStream, timestamps, distanceStream);
          const paceCurveAnalysis = analyzePaceCurve(paceCurvePoints);
          curves.pace = paceCurveAnalysis;
        }
      }

      if (hrStream && hrStream.length > 0) {
        const hrCurvePoints = calculateHRCurve(hrStream, timestamps);
        curves.heartRate = { points: hrCurvePoints };
      }

      // === TEST EFFORT DETECTION ===
      const suggestions: any[] = [];

      if (powerStream && timestamps) {
        const powerTests = detectPowerTestEfforts(powerStream, timestamps);
        for (const test of powerTests) {
          await ctx.caller.metricSuggestions.create({
            profileId: session.user.id,
            activityId: input.activityId,
            metricCategory: activityCategory,
            metricType: 'power',
            suggestedValue: test.value,
            currentValue: ftp,
            confidence: test.confidence,
            detectionMethod: test.detectionMethod,
          });
          suggestions.push(test);
        }
      }

      if (paceStream && timestamps && activityCategory === 'run') {
        const distanceStream = activityJson.streams?.distance;
        if (distanceStream) {
          const runningTests = detectRunningTestEfforts(paceStream, timestamps, distanceStream);
          for (const test of runningTests) {
            await ctx.caller.metricSuggestions.create({
              profileId: session.user.id,
              activityId: input.activityId,
              metricCategory: 'run',
              metricType: 'pace',
              suggestedValue: test.value,
              currentValue: thresholdPace,
              confidence: test.confidence,
              detectionMethod: test.detectionMethod,
            });
            suggestions.push(test);
          }
        }
      }

      if (hrStream && timestamps) {
        const hrTests = detectHRTestEfforts(hrStream, timestamps);
        for (const test of hrTests) {
          await ctx.caller.metricSuggestions.create({
            profileId: session.user.id,
            activityId: input.activityId,
            metricCategory: activityCategory,
            metricType: 'heart_rate',
            suggestedValue: test.value,
            currentValue: test.type === 'lthr' ? lthr : maxHR,
            confidence: test.confidence,
            detectionMethod: test.detectionMethod,
          });
          suggestions.push(test);
        }
      }

      // === UPDATE ACTIVITY ===
      const { error: updateError } = await supabase
        .from('activities')
        .update({
          metrics: {
            tss: tssResult.tss,
            tss_source: tssResult.source,
            tss_confidence: tssResult.confidence,
            normalized_power: 'normalizedPower' in tssResult ? tssResult.normalizedPower : null,
            intensity_factor: 'intensityFactor' in tssResult ? tssResult.intensityFactor : null,
            variability_index: 'variabilityIndex' in tssResult ? tssResult.variabilityIndex : null,
            hrss: 'hrss' in tssResult ? tssResult.hrss : null,
            avg_hr: 'avgHR' in tssResult ? tssResult.avgHR : null,
            normalized_pace: 'normalizedPace' in tssResult ? tssResult.normalizedPace : null,
            curves,
          },
        })
        .eq('id', input.activityId);

      if (updateError) throw updateError;

      return {
        metrics: tssResult,
        curves,
        suggestions,
        calculationSource: tssResult.source,
      };
    }),
});
```

### 3.4 Add to Root Router

**File:** `packages/trpc/src/root.ts` (modify)

```typescript
import { profilePerformanceMetricsRouter } from './routers/profile-performance-metrics';
import { profileMetricsRouter } from './routers/profile-metrics';

export const appRouter = router({
  // ... existing routers
  profilePerformanceMetrics: profilePerformanceMetricsRouter,
  profileMetrics: profileMetricsRouter,
});
```

---

## Phase 4: Data Migration

### 4.1 Seed Initial Metrics from Activity Snapshots

**Note:** Since `ftp`, `threshold_hr`, and `weight_kg` columns have been removed from the `profiles` table, we cannot seed initial metrics from there. Instead, we extract historical metric values from `profile_snapshot` JSONB fields in activities (see Phase 4.2 below).

**Alternative for New Users:**
- Users will enter their current metrics during onboarding (Phase 5.3)
- Or manually update metrics in settings (Phase 5.7)
- System will generate intelligent defaults if no metrics exist

**File:** `scripts/seed-initial-metrics.ts` (DEPRECATED - Use Phase 4.2 instead)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seedInitialMetrics() {
  console.log('Seeding initial performance metrics from activity snapshots...');
  console.log('NOTE: This script is deprecated. Use backfill-from-snapshots.ts instead.');
  console.log('Profiles table no longer contains ftp, threshold_hr, or weight_kg columns.');

  // Historical metrics will be extracted from activity profile_snapshot fields
  // See Phase 4.2: Backfill from Activity Profile Snapshots
}

seedInitialMetrics().catch(console.error);
```

**Migration Strategy:**
1. Skip this phase (columns don't exist in profiles table anymore)
2. Use Phase 4.2 to backfill from activity `profile_snapshot` fields
3. New users enter metrics during onboarding
4. Existing users update metrics in settings

### 4.2 Backfill from Activity Profile Snapshots (PRIMARY MIGRATION STRATEGY)

**Purpose:** Extract historical metric values from `profile_snapshot` JSONB fields in activities to populate the new metric tables.

**File:** `scripts/backfill-from-snapshots.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// One-time script to extract unique metric values from activity profile_snapshot fields
async function backfillFromSnapshots() {
  console.log('Backfilling metrics from activity profile_snapshot fields...');

  const { data: activities } = await supabase
    .from('activities')
    .select('id, profile_id, profile_snapshot, start_time')
    .not('profile_snapshot', 'is', null)
    .order('start_time', { ascending: true });

  if (!activities || activities.length === 0) {
    console.log('No activities with profile_snapshot found.');
    return;
  }

  const metricsByProfile = new Map();

  for (const activity of activities) {
    const snapshot = activity.profile_snapshot;
    const profileId = activity.profile_id;
    const activityDate = new Date(activity.start_time);

    if (!metricsByProfile.has(profileId)) {
      metricsByProfile.set(profileId, []);
    }

    // Extract FTP if exists and changed
    if (snapshot.ftp) {
      const existing = metricsByProfile.get(profileId).find(
        (m) => m.type === 'ftp' && m.value === snapshot.ftp
      );

      if (!existing) {
        metricsByProfile.get(profileId).push({
          type: 'ftp',
          value: snapshot.ftp,
          date: activityDate,
          category: 'bike',
          metricType: 'power',
        });
      }
    }

    // Extract threshold_hr if exists and changed
    if (snapshot.threshold_hr) {
      const existing = metricsByProfile.get(profileId).find(
        (m) => m.type === 'threshold_hr' && m.value === snapshot.threshold_hr
      );

      if (!existing) {
        metricsByProfile.get(profileId).push({
          type: 'threshold_hr',
          value: snapshot.threshold_hr,
          date: activityDate,
          category: 'bike',
          metricType: 'heart_rate',
        });
      }
    }

    // Extract weight_kg if exists and changed
    if (snapshot.weight_kg) {
      const existing = metricsByProfile.get(profileId).find(
        (m) => m.type === 'weight_kg' && m.value === snapshot.weight_kg
      );

      if (!existing) {
        metricsByProfile.get(profileId).push({
          type: 'weight_kg',
          value: snapshot.weight_kg,
          date: activityDate,
        });
      }
    }
  }

  // Insert deduplicated metrics
  let performanceMetricsInserted = 0;
  let profileMetricsInserted = 0;

  for (const [profileId, metrics] of metricsByProfile) {
    for (const metric of metrics) {
      if (metric.type === 'ftp') {
        const { error } = await supabase.from('profile_performance_metric_logs').insert({
          profile_id: profileId,
          category: metric.category,
          type: metric.metricType,
          value: metric.value,
          unit: 'watts',
          duration_seconds: 3600,
          notes: 'Backfilled from activity snapshot',
          recorded_at: metric.date,
        });

        if (!error) performanceMetricsInserted++;
      } else if (metric.type === 'threshold_hr') {
        const { error } = await supabase.from('profile_performance_metric_logs').insert({
          profile_id: profileId,
          category: metric.category,
          type: metric.metricType,
          value: metric.value,
          unit: 'bpm',
          duration_seconds: 3600,
          notes: 'Backfilled from activity snapshot',
          recorded_at: metric.date,
        });

        if (!error) performanceMetricsInserted++;
      } else if (metric.type === 'weight_kg') {
        const { error } = await supabase.from('profile_metric_logs').insert({
          profile_id: profileId,
          metric_type: 'weight_kg',
          value: metric.value,
          unit: 'kg',
          notes: 'Backfilled from activity snapshot',
          recorded_at: metric.date,
        });

        if (!error) profileMetricsInserted++;
      }
    }
  }

  console.log('Backfill complete!');
  console.log(`Performance metrics inserted: ${performanceMetricsInserted}`);
  console.log(`Profile metrics inserted: ${profileMetricsInserted}`);
  console.log(`Profiles processed: ${metricsByProfile.size}`);
}

backfillFromSnapshots().catch(console.error);
```

**Run migration:**
```bash
tsx scripts/backfill-from-snapshots.ts
```

**Expected Results:**
- Extracts unique FTP, threshold_hr, and weight_kg values from all historical activities
- Deduplicates by value (same value = same metric, only stored once)
- Sets `recorded_at` to activity start_time (earliest occurrence of that metric value)
- Creates temporal history of metric changes over time

---

## Phase 5: Mobile App Integration

### 5.1 Update Activity Submission

**File:** `apps/mobile/lib/services/ActivityRecorder/index.ts` (modify)

```typescript
// Remove profile snapshot from submission
async finish(): Promise<ActivityData> {
  // ... existing logic

  const activityData = {
    // NO profile_snapshot field
    profile_id: this.profile.id,
    type: this.activityType,
    distance: this.sessionStats.distance,
    duration: this.sessionStats.duration,
    start_time: this.startTime,
    end_time: new Date(),
    // ... other fields
  };

  // Store JSON in Supabase Storage
  const jsonPath = await this.storeActivityJson(activityData);

  // Create activity record
  const activity = await this.createActivityRecord({
    ...activityData,
    storage_path: jsonPath,
  });

  // Trigger background TSS calculation
  await this.triggerMetricsCalculation(activity.id);

  return activity;
}

private async triggerMetricsCalculation(activityId: string) {
  // Call tRPC mutation to calculate TSS in background
  await trpc.activities.calculateMetrics.mutate({ activityId });
}
```

### 5.2 Create Metrics Entry UI

**File:** `apps/mobile/components/metrics/PerformanceMetricForm.tsx`

```typescript
import { useState } from 'react';
import { View, Text } from 'react-native';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';

export function PerformanceMetricForm({ profileId, onSuccess }: Props) {
  const [ftp, setFTP] = useState('');
  const [thresholdHR, setThresholdHR] = useState('');

  const createMetric = trpc.profilePerformanceMetrics.create.useMutation({
    onSuccess: () => {
      onSuccess();
      toast.success('Metrics updated');
    },
  });

  const handleSubmit = async () => {
    if (ftp) {
      await createMetric.mutateAsync({
        profileId,
        category: 'bike',
        type: 'power',
        value: Number(ftp),
        unit: 'watts',
        durationSeconds: 3600,
        source: 'manual',
      });
    }

    if (thresholdHR) {
      await createMetric.mutateAsync({
        profileId,
        category: 'bike',
        type: 'heart_rate',
        value: Number(thresholdHR),
        unit: 'bpm',
        durationSeconds: 3600,
        source: 'manual',
      });
    }
  };

  return (
    <View className="p-4 space-y-4">
      <View>
        <Text className="text-foreground font-semibold mb-2">FTP (watts)</Text>
        <Input
          value={ftp}
          onChangeText={setFTP}
          keyboardType="numeric"
          placeholder="Enter your FTP"
        />
      </View>

      <View>
        <Text className="text-foreground font-semibold mb-2">
          Threshold HR (bpm)
        </Text>
        <Input
          value={thresholdHR}
          onChangeText={setThresholdHR}
          keyboardType="numeric"
          placeholder="Enter your threshold heart rate"
        />
      </View>

      <Button
        onPress={handleSubmit}
        disabled={createMetric.isPending}
        className="w-full"
      >
        <Text className="text-primary-foreground">
          {createMetric.isPending ? 'Saving...' : 'Save Metrics'}
        </Text>
      </Button>
    </View>
  );
}
```

### 5.3 Display Metric Suggestions

**File:** `apps/mobile/components/metrics/MetricSuggestions.tsx`

```typescript
export function MetricSuggestions({ activityId }: Props) {
  const { data: suggestions } = trpc.metricSuggestions.getForActivity.useQuery({
    activityId,
  });

  const approveSuggestion = trpc.metricSuggestions.approve.useMutation({
    onSuccess: () => {
      toast.success('Metric updated!');
    },
  });

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <View className="bg-card rounded-lg p-4 space-y-3">
      <Text className="text-foreground font-semibold">
        Performance Improvements Detected
      </Text>

      {suggestions.map((suggestion) => (
        <View key={suggestion.id} className="border-t border-border pt-3">
          <Text className="text-foreground">
            New FTP: {suggestion.suggestedValue}W
          </Text>
          <Text className="text-muted-foreground text-sm">
            {((suggestion.suggestedValue - suggestion.currentValue) / suggestion.currentValue * 100).toFixed(1)}% improvement
          </Text>
          <Text className="text-muted-foreground text-xs mt-1">
            {suggestion.detectionMethod}
          </Text>

          <Button
            onPress={() => approveSuggestion.mutate({ id: suggestion.id })}
            variant="default"
            size="sm"
            className="mt-2"
          >
            <Text className="text-primary-foreground">Approve Update</Text>
          </Button>
        </View>
      ))}
    </View>
  );
}
```

---

## Phase 6: Testing

### 6.1 Core Package Tests

**File:** `packages/core/estimation/__tests__/defaults.test.ts`

```typescript
import { estimateFTPFromWeight, estimateThresholdHR } from '../defaults';

describe('estimateFTPFromWeight', () => {
  it('should estimate FTP at 2.5 W/kg', () => {
    const result = estimateFTPFromWeight(75);
    expect(result.value).toBe(188); // 75 * 2.5 = 187.5, rounded to 188
    expect(result.source).toBe('estimated');
  });

  it('should handle different weights', () => {
    expect(estimateFTPFromWeight(60).value).toBe(150);
    expect(estimateFTPFromWeight(90).value).toBe(225);
  });
});

describe('estimateThresholdHR', () => {
  it('should estimate threshold HR from age', () => {
    const result = estimateThresholdHR(30);
    // Max HR = 220 - 30 = 190
    // Threshold = 190 * 0.85 = 161.5 → 162
    expect(result.value).toBe(162);
    expect(result.source).toBe('estimated');
  });
});
```

**File:** `packages/core/utils/__tests__/temporal-metrics.test.ts`

```typescript
import { getPerformanceMetricAtDate } from '../temporal-metrics';

describe('getPerformanceMetricAtDate', () => {
  const metrics = [
    {
      id: '1',
      value: 250,
      createdAt: new Date('2024-01-01'),
      validUntil: null,
    },
    {
      id: '2',
      value: 260,
      createdAt: new Date('2024-02-01'),
      validUntil: null,
    },
  ];

  it('should return most recent metric before date', () => {
    const result = getPerformanceMetricAtDate(
      metrics,
      new Date('2024-01-15')
    );
    expect(result?.value).toBe(250);
  });

  it('should return newer metric for later date', () => {
    const result = getPerformanceMetricAtDate(
      metrics,
      new Date('2024-02-15')
    );
    expect(result?.value).toBe(260);
  });

  it('should return null for date before any metrics', () => {
    const result = getPerformanceMetricAtDate(
      metrics,
      new Date('2023-12-01')
    );
    expect(result).toBeNull();
  });
});
```

### 6.2 Integration Tests

**File:** `tests/integration/trpc/profile-performance-metrics.test.ts`

```typescript
import { createTestContext } from '../helpers';

describe('profilePerformanceMetrics router', () => {
  it('should create performance metric', async () => {
    const ctx = createTestContext();
    const caller = createCaller(ctx);

    const metric = await caller.profilePerformanceMetrics.create({
      profileId: ctx.session.user.id,
      category: 'bike',
      type: 'power',
      value: 250,
      unit: 'watts',
      durationSeconds: 3600,
      source: 'manual',
    });

    expect(metric.value).toBe(250);
    expect(metric.category).toBe('bike');
  });

  it('should get metric at date', async () => {
    const ctx = createTestContext();
    const caller = createCaller(ctx);

    // Create metric on Jan 1
    await caller.profilePerformanceMetrics.create({
      profileId: ctx.session.user.id,
      category: 'bike',
      type: 'power',
      value: 250,
      unit: 'watts',
      durationSeconds: 3600,
      source: 'manual',
    });

    // Query for Jan 15 - should return Jan 1 metric
    const metric = await caller.profilePerformanceMetrics.getAtDate({
      category: 'bike',
      type: 'power',
      durationSeconds: 3600,
      date: new Date('2024-01-15'),
    });

    expect(metric?.value).toBe(250);
  });
});
```

---

## Phase 7: Documentation

### 7.1 Update CLAUDE.md

Add section on Performance Metrics Platform:

```markdown
## Performance Metrics Platform

The platform uses a **temporal metrics** architecture:

- **Activities** - Store ONLY activity data (distance, duration, streams)
- **Performance Metrics** - Store athlete capabilities over time (FTP, pace, HR zones)
- **Profile Metrics** - Store biometric data (weight, sleep, HRV)

### Key Principles

1. **Temporal Lookups** - Always query metrics at activity date
2. **Intelligent Defaults** - Generate estimates when metrics missing
3. **No Profile Snapshots** - Activities reference profile_id only

### Using Metrics in Code

```typescript
// Get FTP at activity date
const ftp = await trpc.profilePerformanceMetrics.getAtDate({
  category: 'bike',
  type: 'power',
  durationSeconds: 3600,
  date: activityDate,
});

// Calculate TSS with temporal FTP
const metrics = calculateTSSFromStream({
  powerStream,
  timestamps,
  ftp: ftp.value,
});
```


## Success Criteria

- ✅ Activities submitted without profile_snapshot
- ✅ TSS calculated using temporal metric lookups
- ✅ Intelligent defaults generated when metrics missing
- ✅ Metric suggestions created from test effort detection
- ✅ All existing functionality preserved
- ✅ Performance metrics meet <10ms target
- ✅ All tests passing
- ✅ Documentation complete
