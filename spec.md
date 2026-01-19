# Profile Performance Metric Logs - Complete Technical Specification

## Executive Summary

**Feature Name:** Capability Tracking & Goal Management System

**Purpose:** Transform GradientPeak from a performance tracker into a performance planning system by maintaining a comprehensive ledger of user capabilities (power, pace, heart rate) across effort durations, enabling goal setting, progression tracking, and training zone management.

**Target Users:** Intermediate to advanced endurance athletes (cyclists, runners, swimmers, triathletes) who understand performance metrics and want to train toward specific capability goals.

**Business Impact:**
- **Differentiation:** Unique environmental condition modeling and transparent goal tracking
- **Retention:** +15-25% expected retention lift for engaged users
- **Monetization:** Premium tier ($8-12/mo) for automated estimates and advanced analytics
- **MAU Impact:** Estimated 20-30% of serious athletes will actively use this feature

**Development Timeline:** 16 weeks (4 phases) to full feature set

---

## Table of Contents

1. [Technical Architecture](#1-technical-architecture)
2. [Database Schema](#2-database-schema)
3. [Core Package (Business Logic)](#3-core-package-business-logic)
4. [tRPC API Layer](#4-trpc-api-layer)
5. [Mobile Implementation](#5-mobile-implementation)
6. [Web Implementation](#6-web-implementation)
7. [User Workflows](#7-user-workflows)
8. [Integration Points](#8-integration-points)
9. [Strengths & Weaknesses](#9-strengths--weaknesses)
10. [Impact on Existing Features](#10-impact-on-existing-features)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Success Metrics & KPIs](#12-success-metrics--kpis)
13. [Risks & Mitigations](#13-risks--mitigations)

---

## 1. Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface Layer                      │
├──────────────────────────┬──────────────────────────────────┤
│  Mobile App (RN)         │  Web Dashboard (Next.js)         │
│  - Manual entry forms    │  - Advanced analytics            │
│  - Capability charts     │  - Goal management               │
│  - Goal tracking         │  - Historical progression        │
│  - Post-activity review  │  - Population benchmarks         │
└──────────────┬───────────┴───────────┬──────────────────────┘
               │                       │
               └───────────┬───────────┘
                           │
               ┌───────────▼───────────┐
               │   tRPC API Layer      │
               │  - CRUD operations    │
               │  - Query capabilities │
               │  - Goal management    │
               │  - Analytics          │
               └───────────┬───────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────▼────────┐ ┌─────▼──────┐ ┌──────▼─────────┐
│  Supabase DB     │ │ Core Pkg   │ │ Background     │
│  - Metric logs   │ │ - Calcs    │ │ Jobs           │
│  - Goals         │ │ - Modeling │ │ - Auto-detect  │
│  - Conditions    │ │ - Zones    │ │ - Decay        │
└──────────────────┘ └────────────┘ └────────────────┘
```

### Data Flow Patterns

**Pattern 1: Manual Entry**
```
User → Mobile Form → tRPC Mutation → Validation → DB Insert → Invalidate Queries → UI Update
```

**Pattern 2: Auto-Generation (Future)**
```
Activity Completed → Background Job → Analyze Activity → Detect Test →
Calculate Estimate → User Approval UI → tRPC Mutation → DB Insert
```

**Pattern 3: Query Current Capabilities**
```
User Views Profile → tRPC Query → Aggregation (latest per duration) →
Core Package (format) → Return to UI
```

**Pattern 4: Goal Progress Tracking**
```
New Estimate Logged → tRPC Mutation → Check Active Goals →
Calculate Gaps → Emit Notifications → Update Goal Status
```

---

## 2. Database Schema

### 2.1 Main Table: `profile_performance_metric_logs`

```sql
CREATE TABLE profile_performance_metric_logs (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Core Metrics
  category TEXT NOT NULL CHECK (category IN ('bike', 'run', 'swim', 'row', 'other')),
  type TEXT NOT NULL CHECK (type IN ('power', 'pace', 'speed', 'heart_rate')),
  value NUMERIC(10, 2) NOT NULL CHECK (value > 0),
  unit TEXT NOT NULL, -- 'watts', 'watts_per_kg', 'min_per_km', 'min_per_mi', 'min_per_100m', 'bpm', 'm_per_s'
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),

  -- Provenance
  source TEXT NOT NULL CHECK (source IN ('manual', 'test', 'race', 'calculated', 'estimated', 'predicted', 'goal', 'adjusted')),
  confidence_score NUMERIC(3, 2) CHECK (confidence_score BETWEEN 0 AND 1), -- 0.00 to 1.00
  reference_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  calculation_method TEXT, -- 'ftp_20min_0.95', 'ramp_test_0.75', 'critical_power_model', etc.
  algorithm_version TEXT, -- 'v1.0', 'v2.1', etc. for reproducibility

  -- Conditions
  conditions JSONB, -- { indoor: true, altitude: 2000, temperature: 25, equipment: 'road_bike' }

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  superseded_by UUID REFERENCES profile_performance_metric_logs(id) ON DELETE SET NULL,
  valid_until TIMESTAMP WITH TIME ZONE, -- NULL = indefinite

  -- Metadata
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Indexes
  CONSTRAINT unique_log_per_timestamp UNIQUE (profile_id, category, type, duration_seconds, conditions, created_at)
);

-- Indexes for query performance
CREATE INDEX idx_metric_logs_profile_active ON profile_performance_metric_logs(profile_id, is_active) WHERE is_active = true;
CREATE INDEX idx_metric_logs_lookup ON profile_performance_metric_logs(profile_id, category, type, duration_seconds, created_at DESC);
CREATE INDEX idx_metric_logs_reference ON profile_performance_metric_logs(reference_activity_id) WHERE reference_activity_id IS NOT NULL;
CREATE INDEX idx_metric_logs_conditions ON profile_performance_metric_logs USING GIN(conditions);

-- Trigger to update updated_at
CREATE TRIGGER update_metric_logs_updated_at
  BEFORE UPDATE ON profile_performance_metric_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 2.2 Goals Table: `profile_capability_goals`

```sql
CREATE TABLE profile_capability_goals (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Goal Definition
  name TEXT NOT NULL, -- "Sub-3hr marathon", "300w FTP", "4:00/km 10k"
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('bike', 'run', 'swim', 'row', 'other')),
  type TEXT NOT NULL CHECK (type IN ('power', 'pace', 'speed', 'heart_rate')),
  target_value NUMERIC(10, 2) NOT NULL CHECK (target_value > 0),
  target_unit TEXT NOT NULL,
  target_duration_seconds INTEGER NOT NULL CHECK (target_duration_seconds > 0),

  -- Timeline
  target_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  achieved_at TIMESTAMP WITH TIME ZONE,
  abandoned_at TIMESTAMP WITH TIME ZONE,

  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned', 'on_track', 'at_risk')),
  priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5), -- 1=highest, 5=lowest

  -- Progress Tracking
  baseline_log_id UUID REFERENCES profile_performance_metric_logs(id) ON DELETE SET NULL,
  current_log_id UUID REFERENCES profile_performance_metric_logs(id) ON DELETE SET NULL,
  progress_percentage NUMERIC(5, 2), -- Auto-calculated: (current - baseline) / (target - baseline) * 100

  -- Metadata
  tags TEXT[], -- ['race', 'power', 'breakthrough']
  is_public BOOLEAN DEFAULT false, -- Share goal with friends?
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goals_profile_active ON profile_capability_goals(profile_id, status) WHERE status = 'active';
CREATE INDEX idx_goals_target_date ON profile_capability_goals(profile_id, target_date) WHERE target_date IS NOT NULL;
```

### 2.3 Standard Durations Reference

```sql
CREATE TABLE standard_effort_durations (
  duration_seconds INTEGER PRIMARY KEY,
  label TEXT NOT NULL, -- '5s Sprint', '1min Anaerobic', '5min VO2max', '20min Test', '1hr FTP'
  description TEXT,
  typical_test_protocols TEXT[], -- ['maximal_sprint', 'standing_start']
  sort_order INTEGER NOT NULL
);

-- Seed data
INSERT INTO standard_effort_durations (duration_seconds, label, description, sort_order) VALUES
  (5, '5s Sprint', 'Maximal neuromuscular power', 1),
  (30, '30s Anaerobic', 'Anaerobic capacity', 2),
  (60, '1min Anaerobic', 'Sustained anaerobic power', 3),
  (120, '2min VO2max', 'High aerobic capacity', 4),
  (300, '5min VO2max', 'VO2max power/pace', 5),
  (480, '8min Threshold', 'Near-threshold sustained', 6),
  (1200, '20min Test', 'Standard FTP test duration', 7),
  (3600, '60min FTP', 'Functional threshold', 8),
  (7200, '2hr Tempo', 'Sustained endurance', 9),
  (14400, '4hr Endurance', 'Long-distance capability', 10);
```

### 2.4 Environmental Conditions Schema

```jsonb
// conditions JSONB structure
{
  "environment": "indoor" | "outdoor",
  "altitude": 0,              // meters above sea level
  "temperature": 20,          // celsius
  "humidity": 50,             // percentage
  "wind": "none" | "light" | "moderate" | "heavy",
  "terrain": "flat" | "hilly" | "mountainous",
  "surface": "road" | "track" | "trail" | "treadmill" | "trainer",
  "equipment": {
    "bike": "road" | "tt" | "gravel" | "mountain",
    "wheels": "standard" | "aero" | "deep_section",
    "position": "hoods" | "drops" | "aero_bars"
  },
  "notes": "Custom conditions description"
}
```

---

## 3. Core Package (Business Logic)

### 3.1 Location: `packages/core/`

**CRITICAL:** All calculation logic lives in `@repo/core` - database-independent, pure functions.

### 3.2 Schemas (`packages/core/schemas/performance_metrics.ts`)

```typescript
import { z } from 'zod';

export const performanceMetricCategorySchema = z.enum([
  'bike',
  'run',
  'swim',
  'row',
  'other',
]);

export const performanceMetricTypeSchema = z.enum([
  'power',
  'pace',
  'speed',
  'heart_rate',
]);

export const metricUnitSchema = z.enum([
  'watts',
  'watts_per_kg',
  'min_per_km',
  'min_per_mi',
  'min_per_100m',
  'bpm',
  'm_per_s',
]);

export const metricSourceSchema = z.enum([
  'manual',
  'test',
  'race',
  'calculated',
  'estimated',
  'predicted',
  'goal',
  'adjusted',
]);

export const environmentalConditionsSchema = z.object({
  environment: z.enum(['indoor', 'outdoor']).optional(),
  altitude: z.number().min(0).max(9000).optional(), // meters
  temperature: z.number().min(-40).max(60).optional(), // celsius
  humidity: z.number().min(0).max(100).optional(),
  wind: z.enum(['none', 'light', 'moderate', 'heavy']).optional(),
  terrain: z.enum(['flat', 'hilly', 'mountainous']).optional(),
  surface: z.enum(['road', 'track', 'trail', 'treadmill', 'trainer']).optional(),
  equipment: z.record(z.string()).optional(),
  notes: z.string().optional(),
});

export const performanceMetricLogSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  category: performanceMetricCategorySchema,
  type: performanceMetricTypeSchema,
  value: z.number().positive(),
  unit: metricUnitSchema,
  duration_seconds: z.number().int().positive(),
  source: metricSourceSchema,
  confidence_score: z.number().min(0).max(1).optional(),
  reference_activity_id: z.string().uuid().optional(),
  calculation_method: z.string().optional(),
  algorithm_version: z.string().optional(),
  conditions: environmentalConditionsSchema.optional(),
  is_active: z.boolean().default(true),
  superseded_by: z.string().uuid().optional(),
  valid_until: z.date().optional(),
  notes: z.string().optional(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const capabilityGoalSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: performanceMetricCategorySchema,
  type: performanceMetricTypeSchema,
  target_value: z.number().positive(),
  target_unit: metricUnitSchema,
  target_duration_seconds: z.number().int().positive(),
  target_date: z.date().optional(),
  status: z.enum(['active', 'achieved', 'abandoned', 'on_track', 'at_risk']),
  priority: z.number().int().min(1).max(5).default(3),
  baseline_log_id: z.string().uuid().optional(),
  current_log_id: z.string().uuid().optional(),
  progress_percentage: z.number().optional(),
  tags: z.array(z.string()).default([]),
  is_public: z.boolean().default(false),
  created_at: z.date(),
  achieved_at: z.date().optional(),
  abandoned_at: z.date().optional(),
  updated_at: z.date(),
});

export type PerformanceMetricLog = z.infer<typeof performanceMetricLogSchema>;
export type CapabilityGoal = z.infer<typeof capabilityGoalSchema>;
export type EnvironmentalConditions = z.infer<typeof environmentalConditionsSchema>;
```

### 3.3 Calculations (`packages/core/calculations/performance_estimates.ts`)

```typescript
/**
 * Calculate FTP from 20-minute test using standard 95% multiplier.
 *
 * @param twentyMinutePower - Average power from 20min all-out test (watts)
 * @returns Estimated FTP in watts
 *
 * @example
 * ```typescript
 * const ftp = calculateFTPFrom20MinTest(285); // Returns 271
 * ```
 */
export function calculateFTPFrom20MinTest(twentyMinutePower: number): number {
  if (twentyMinutePower <= 0) {
    throw new Error('Twenty minute power must be positive');
  }
  return Math.round(twentyMinutePower * 0.95);
}

/**
 * Calculate FTP from ramp test using 75% of max 1-minute power.
 *
 * @param maxOneMinutePower - Peak 1-minute power from ramp test
 * @returns Estimated FTP in watts
 */
export function calculateFTPFromRampTest(maxOneMinutePower: number): number {
  if (maxOneMinutePower <= 0) {
    throw new Error('Max one minute power must be positive');
  }
  return Math.round(maxOneMinutePower * 0.75);
}

/**
 * Extrapolate power curve from single FTP value using simplified model.
 *
 * Uses hybrid approach:
 * - Short durations (<5min): Anaerobic capacity dominant
 * - Mid durations (5-60min): VO2max to FTP transition
 * - Long durations (>60min): Aerobic endurance dominant
 *
 * @param ftp - Functional Threshold Power (60min power)
 * @param durations - Array of duration values in seconds to estimate
 * @returns Map of duration to estimated power
 *
 * @example
 * ```typescript
 * const powerCurve = estimatePowerCurveFromFTP(271, [5, 60, 300, 1200, 3600]);
 * // Returns: { 5: 850, 60: 420, 300: 340, 1200: 285, 3600: 271 }
 * ```
 */
export function estimatePowerCurveFromFTP(
  ftp: number,
  durations: number[]
): Record<number, number> {
  const curve: Record<number, number> = {};

  for (const duration of durations) {
    if (duration <= 0) continue;

    // Simplified power duration relationship
    // Real implementation would use Critical Power model or polynomial fit
    if (duration <= 5) {
      // 5s power ~3.1x FTP (neuromuscular)
      curve[duration] = Math.round(ftp * 3.1);
    } else if (duration <= 60) {
      // 1min power ~1.55x FTP (anaerobic capacity)
      curve[duration] = Math.round(ftp * 1.55);
    } else if (duration <= 300) {
      // 5min power ~1.18x FTP (VO2max)
      curve[duration] = Math.round(ftp * 1.18);
    } else if (duration <= 1200) {
      // 20min power ~1.05x FTP (above threshold)
      curve[duration] = Math.round(ftp * 1.05);
    } else if (duration <= 3600) {
      // 60min power = FTP
      curve[duration] = ftp;
    } else {
      // Long duration power ~0.85-0.95x FTP (endurance fade)
      const hours = duration / 3600;
      const fadeFactor = 0.95 - (hours - 1) * 0.02; // 2% per hour fade
      curve[duration] = Math.round(ftp * Math.max(0.75, fadeFactor));
    }
  }

  return curve;
}

/**
 * Calculate confidence score for an estimate based on multiple factors.
 *
 * Confidence is affected by:
 * - Source type (test > race > calculated > estimated > predicted)
 * - Data quality (completeness, sensor accuracy)
 * - Recency (decays over time)
 * - Validation (has it been confirmed by actual performance?)
 *
 * @returns Confidence score from 0.0 to 1.0
 */
export function calculateEstimateConfidence(params: {
  source: string;
  daysSinceCreated: number;
  hasReferenceActivity: boolean;
  dataQualityScore?: number; // 0-1, if available
}): number {
  let confidence = 0.5; // Base confidence

  // Source reliability
  const sourceWeights = {
    test: 0.95,
    race: 0.90,
    calculated: 0.85,
    manual: 0.70,
    estimated: 0.60,
    predicted: 0.50,
    goal: 0.30,
    adjusted: 0.65,
  };
  confidence = sourceWeights[params.source as keyof typeof sourceWeights] || 0.5;

  // Recency decay (10% confidence loss per 30 days)
  const decayRate = 0.10 / 30;
  const recencyFactor = Math.max(0.5, 1 - (params.daysSinceCreated * decayRate));
  confidence *= recencyFactor;

  // Reference activity bonus
  if (params.hasReferenceActivity) {
    confidence = Math.min(1.0, confidence * 1.1);
  }

  // Data quality factor
  if (params.dataQualityScore !== undefined) {
    confidence *= params.dataQualityScore;
  }

  return Math.round(confidence * 100) / 100; // Round to 2 decimals
}

/**
 * Adjust capability estimate for environmental conditions.
 *
 * @example
 * Indoor FTP 285w → Outdoor FTP ~270w (5% reduction)
 * Sea level 285w → 2000m altitude ~260w (9% reduction)
 */
export function adjustForEnvironment(
  baseValue: number,
  baseConditions: EnvironmentalConditions,
  targetConditions: EnvironmentalConditions
): { adjustedValue: number; adjustmentFactor: number; reason: string } {
  let factor = 1.0;
  const reasons: string[] = [];

  // Indoor to outdoor adjustment (typically 3-7% reduction)
  if (baseConditions.environment === 'indoor' && targetConditions.environment === 'outdoor') {
    factor *= 0.95;
    reasons.push('Indoor to outdoor (-5%)');
  }

  // Altitude adjustment (3% per 1000m)
  if (targetConditions.altitude && targetConditions.altitude > 1000) {
    const altitudePenalty = (targetConditions.altitude / 1000) * 0.03;
    factor *= (1 - altitudePenalty);
    reasons.push(`Altitude ${targetConditions.altitude}m (-${(altitudePenalty * 100).toFixed(1)}%)`);
  }

  // Temperature extremes (>35°C or <0°C)
  if (targetConditions.temperature !== undefined) {
    if (targetConditions.temperature > 35) {
      factor *= 0.97;
      reasons.push('High temperature (-3%)');
    } else if (targetConditions.temperature < 0) {
      factor *= 0.98;
      reasons.push('Cold temperature (-2%)');
    }
  }

  // Wind resistance (outdoor cycling)
  if (targetConditions.wind === 'heavy') {
    factor *= 0.92;
    reasons.push('Heavy wind (-8%)');
  } else if (targetConditions.wind === 'moderate') {
    factor *= 0.96;
    reasons.push('Moderate wind (-4%)');
  }

  return {
    adjustedValue: Math.round(baseValue * factor),
    adjustmentFactor: factor,
    reason: reasons.join(', ') || 'No adjustments',
  };
}

/**
 * Calculate goal progress metrics.
 */
export function calculateGoalProgress(
  baseline: number,
  current: number,
  target: number
): {
  progress_percentage: number;
  gap_absolute: number;
  gap_percentage: number;
  is_on_track: boolean;
} {
  const totalGap = target - baseline;
  const currentGap = current - baseline;
  const progress_percentage = totalGap > 0 ? (currentGap / totalGap) * 100 : 0;

  const gap_absolute = target - current;
  const gap_percentage = current > 0 ? (gap_absolute / current) * 100 : 0;

  // On track if making at least 50% progress or within 5% of target
  const is_on_track = progress_percentage >= 50 || Math.abs(gap_percentage) < 5;

  return {
    progress_percentage: Math.round(progress_percentage * 10) / 10,
    gap_absolute: Math.round(gap_absolute * 10) / 10,
    gap_percentage: Math.round(gap_percentage * 10) / 10,
    is_on_track,
  };
}
```

### 3.4 Validation (`packages/core/validation/performance_metrics.ts`)

```typescript
/**
 * Validate that a performance metric value is realistic for the given category/type/duration.
 *
 * Returns validation result with warnings for outliers.
 */
export function validateMetricValue(
  category: string,
  type: string,
  value: number,
  duration_seconds: number
): { isValid: boolean; warnings: string[]; severity: 'info' | 'warning' | 'error' } {
  const warnings: string[] = [];
  let severity: 'info' | 'warning' | 'error' = 'info';

  // Power validation (bike)
  if (category === 'bike' && type === 'power') {
    const wattsPerKg = value / 75; // Assume 75kg average

    // Professional level checks
    if (duration_seconds === 3600 && value > 400) {
      warnings.push('FTP >400w is world-class professional level');
      severity = 'warning';
    }
    if (duration_seconds === 3600 && value < 100) {
      warnings.push('FTP <100w is unusually low for cycling');
      severity = 'warning';
    }

    // 5min power checks
    if (duration_seconds === 300 && wattsPerKg > 7) {
      warnings.push('5min power >7w/kg is world-class level');
      severity = 'warning';
    }

    // Sanity check: 5s power should be > 60min power
    // (This requires fetching other durations - implementation detail)
  }

  // Pace validation (run)
  if (category === 'run' && type === 'pace') {
    // value is min/km
    if (value < 2.5) {
      warnings.push('Pace faster than 2:30/km is world record territory');
      severity = 'warning';
    }
    if (value > 10) {
      warnings.push('Pace slower than 10:00/km is walking speed');
      severity = 'info';
    }

    // Marathon pace checks
    if (duration_seconds >= 7200 && value < 3.0) {
      warnings.push('Marathon pace <3:00/km is elite professional level');
      severity = 'warning';
    }
  }

  // Heart rate validation
  if (type === 'heart_rate') {
    if (value > 220) {
      warnings.push('Heart rate >220 bpm exceeds typical maximum');
      severity = 'error';
    }
    if (value < 40) {
      warnings.push('Heart rate <40 bpm is unusually low');
      severity = 'warning';
    }
  }

  const isValid = severity !== 'error';

  return { isValid, warnings, severity };
}

/**
 * Validate that environmental conditions are logically consistent.
 */
export function validateConditions(conditions: EnvironmentalConditions): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Indoor shouldn't have wind/terrain
  if (conditions.environment === 'indoor') {
    if (conditions.wind && conditions.wind !== 'none') {
      errors.push('Indoor environment should not have wind');
    }
    if (conditions.terrain && conditions.terrain !== 'flat') {
      errors.push('Indoor environment is typically flat');
    }
  }

  // Altitude and temperature consistency
  if (conditions.altitude && conditions.altitude > 3000 && conditions.temperature && conditions.temperature > 25) {
    errors.push('High altitude typically has cooler temperatures');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

### 3.5 Unit Tests (`packages/core/calculations/__tests__/performance_estimates.test.ts`)

```typescript
import { calculateFTPFrom20MinTest, estimatePowerCurveFromFTP, calculateEstimateConfidence } from '../performance_estimates';

describe('calculateFTPFrom20MinTest', () => {
  it('should calculate FTP as 95% of 20min power', () => {
    expect(calculateFTPFrom20MinTest(285)).toBe(271);
    expect(calculateFTPFrom20MinTest(300)).toBe(285);
    expect(calculateFTPFrom20MinTest(200)).toBe(190);
  });

  it('should throw error for non-positive power', () => {
    expect(() => calculateFTPFrom20MinTest(0)).toThrow();
    expect(() => calculateFTPFrom20MinTest(-10)).toThrow();
  });

  it('should round to nearest watt', () => {
    expect(calculateFTPFrom20MinTest(283)).toBe(269); // 283 * 0.95 = 268.85 → 269
  });
});

describe('estimatePowerCurveFromFTP', () => {
  const ftp = 270;
  const durations = [5, 60, 300, 1200, 3600];

  it('should estimate higher power for shorter durations', () => {
    const curve = estimatePowerCurveFromFTP(ftp, durations);

    expect(curve[5]).toBeGreaterThan(curve[60]);
    expect(curve[60]).toBeGreaterThan(curve[300]);
    expect(curve[300]).toBeGreaterThan(curve[1200]);
    expect(curve[1200]).toBeGreaterThan(curve[3600]);
  });

  it('should return FTP for 60min duration', () => {
    const curve = estimatePowerCurveFromFTP(ftp, [3600]);
    expect(curve[3600]).toBe(ftp);
  });

  it('should estimate ~3x FTP for 5s sprint', () => {
    const curve = estimatePowerCurveFromFTP(ftp, [5]);
    expect(curve[5]).toBeCloseTo(ftp * 3.1, -1); // Within 10w
  });
});

describe('calculateEstimateConfidence', () => {
  it('should assign high confidence to test-based estimates', () => {
    const confidence = calculateEstimateConfidence({
      source: 'test',
      daysSinceCreated: 1,
      hasReferenceActivity: true,
    });
    expect(confidence).toBeGreaterThan(0.90);
  });

  it('should decay confidence over time', () => {
    const recent = calculateEstimateConfidence({
      source: 'test',
      daysSinceCreated: 1,
      hasReferenceActivity: true,
    });
    const old = calculateEstimateConfidence({
      source: 'test',
      daysSinceCreated: 90,
      hasReferenceActivity: true,
    });
    expect(old).toBeLessThan(recent);
  });

  it('should assign lower confidence to goals', () => {
    const goal = calculateEstimateConfidence({
      source: 'goal',
      daysSinceCreated: 1,
      hasReferenceActivity: false,
    });
    expect(goal).toBeLessThan(0.40);
  });
});
```

---

## 4. tRPC API Layer

### 4.1 Router: `packages/trpc/src/routers/performance_metrics.ts`

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  performanceMetricLogSchema,
  capabilityGoalSchema,
  performanceMetricCategorySchema,
  performanceMetricTypeSchema,
  metricSourceSchema,
  environmentalConditionsSchema,
} from '@repo/core/schemas/performance_metrics';
import {
  calculateFTPFrom20MinTest,
  estimatePowerCurveFromFTP,
  calculateEstimateConfidence,
  adjustForEnvironment,
  calculateGoalProgress,
} from '@repo/core/calculations/performance_estimates';
import { validateMetricValue } from '@repo/core/validation/performance_metrics';

export const performanceMetricsRouter = router({
  /**
   * Create a new performance metric log entry.
   */
  create: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema,
        type: performanceMetricTypeSchema,
        value: z.number().positive(),
        unit: z.string(),
        duration_seconds: z.number().int().positive(),
        source: metricSourceSchema,
        confidence_score: z.number().min(0).max(1).optional(),
        reference_activity_id: z.string().uuid().optional(),
        calculation_method: z.string().optional(),
        conditions: environmentalConditionsSchema.optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Validate metric value
      const validation = validateMetricValue(
        input.category,
        input.type,
        input.value,
        input.duration_seconds
      );

      if (!validation.isValid) {
        throw new Error(`Invalid metric value: ${validation.warnings.join(', ')}`);
      }

      // Auto-calculate confidence if not provided
      const confidence_score = input.confidence_score ?? calculateEstimateConfidence({
        source: input.source,
        daysSinceCreated: 0,
        hasReferenceActivity: !!input.reference_activity_id,
      });

      // Insert into database
      const { data, error } = await ctx.supabase
        .from('profile_performance_metric_logs')
        .insert({
          profile_id: ctx.session.user.id,
          ...input,
          confidence_score,
          algorithm_version: 'v1.0',
        })
        .select()
        .single();

      if (error) throw error;

      // Check if this update affects any active goals
      await checkGoalProgress(ctx, data);

      return data;
    }),

  /**
   * Get current capabilities (latest estimate per duration).
   */
  getCurrentCapabilities: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema,
        type: performanceMetricTypeSchema,
        conditions: environmentalConditionsSchema.optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Query for latest log per duration
      const { data, error } = await ctx.supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', ctx.session.user.id)
        .eq('category', input.category)
        .eq('type', input.type)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by duration, take most recent
      const latestByDuration = new Map<number, typeof data[0]>();
      for (const log of data) {
        if (!latestByDuration.has(log.duration_seconds)) {
          latestByDuration.set(log.duration_seconds, log);
        }
      }

      // Convert to array and sort by duration
      const capabilities = Array.from(latestByDuration.values()).sort(
        (a, b) => a.duration_seconds - b.duration_seconds
      );

      // Apply environmental adjustments if requested
      if (input.conditions) {
        return capabilities.map(cap => {
          const adjusted = adjustForEnvironment(
            cap.value,
            cap.conditions || {},
            input.conditions!
          );
          return {
            ...cap,
            adjusted_value: adjusted.adjustedValue,
            adjustment_factor: adjusted.adjustmentFactor,
            adjustment_reason: adjusted.reason,
          };
        });
      }

      return capabilities;
    }),

  /**
   * Get power/pace curve for visualization.
   */
  getPowerCurve: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema,
        type: performanceMetricTypeSchema,
        conditions: environmentalConditionsSchema.optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const capabilities = await ctx.procedures.performanceMetrics.getCurrentCapabilities({
        category: input.category,
        type: input.type,
        conditions: input.conditions,
      });

      // If we have FTP, extrapolate full curve
      const ftpLog = capabilities.find(c => c.duration_seconds === 3600);
      if (ftpLog && input.type === 'power') {
        const estimatedCurve = estimatePowerCurveFromFTP(
          ftpLog.value,
          [5, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200]
        );

        // Merge with actual data (prefer actual over estimated)
        const mergedCurve = Object.entries(estimatedCurve).map(([duration, power]) => {
          const actual = capabilities.find(c => c.duration_seconds === Number(duration));
          return {
            duration_seconds: Number(duration),
            value: actual?.value ?? power,
            source: actual?.source ?? 'estimated',
            confidence: actual?.confidence_score ?? 0.6,
            is_estimated: !actual,
          };
        });

        return mergedCurve;
      }

      return capabilities.map(c => ({
        duration_seconds: c.duration_seconds,
        value: c.value,
        source: c.source,
        confidence: c.confidence_score,
        is_estimated: false,
      }));
    }),

  /**
   * Get progression history for a specific duration.
   */
  getProgression: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema,
        type: performanceMetricTypeSchema,
        duration_seconds: z.number().int().positive(),
        start_date: z.date().optional(),
        end_date: z.date().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      let query = ctx.supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', ctx.session.user.id)
        .eq('category', input.category)
        .eq('type', input.type)
        .eq('duration_seconds', input.duration_seconds)
        .order('created_at', { ascending: true });

      if (input.start_date) {
        query = query.gte('created_at', input.start_date.toISOString());
      }
      if (input.end_date) {
        query = query.lte('created_at', input.end_date.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      return data;
    }),

  /**
   * Create a new capability goal.
   */
  createGoal: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        category: performanceMetricCategorySchema,
        type: performanceMetricTypeSchema,
        target_value: z.number().positive(),
        target_unit: z.string(),
        target_duration_seconds: z.number().int().positive(),
        target_date: z.date().optional(),
        priority: z.number().int().min(1).max(5).default(3),
        tags: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get current capability as baseline
      const currentLogs = await ctx.procedures.performanceMetrics.getCurrentCapabilities({
        category: input.category,
        type: input.type,
      });

      const baseline = currentLogs.find(
        log => log.duration_seconds === input.target_duration_seconds
      );

      // Calculate initial progress if baseline exists
      let progress_percentage = 0;
      if (baseline) {
        const progress = calculateGoalProgress(
          baseline.value,
          baseline.value,
          input.target_value
        );
        progress_percentage = progress.progress_percentage;
      }

      // Insert goal
      const { data, error } = await ctx.supabase
        .from('profile_capability_goals')
        .insert({
          profile_id: ctx.session.user.id,
          ...input,
          baseline_log_id: baseline?.id,
          current_log_id: baseline?.id,
          progress_percentage,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    }),

  /**
   * Get all active goals with progress.
   */
  getActiveGoals: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('profile_capability_goals')
      .select(`
        *,
        baseline:baseline_log_id (*),
        current:current_log_id (*)
      `)
      .eq('profile_id', ctx.session.user.id)
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .order('target_date', { ascending: true, nullsFirst: false });

    if (error) throw error;

    return data;
  }),

  /**
   * Update goal progress (called when new capability logged).
   */
  updateGoalProgress: protectedProcedure
    .input(
      z.object({
        goal_id: z.string().uuid(),
        new_log_id: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Get goal and new log
      const [goal, newLog] = await Promise.all([
        ctx.supabase
          .from('profile_capability_goals')
          .select('*, baseline:baseline_log_id (*)')
          .eq('id', input.goal_id)
          .single(),
        ctx.supabase
          .from('profile_performance_metric_logs')
          .select('*')
          .eq('id', input.new_log_id)
          .single(),
      ]);

      if (goal.error || newLog.error) {
        throw goal.error || newLog.error;
      }

      // Calculate new progress
      const progress = calculateGoalProgress(
        goal.data.baseline?.value ?? 0,
        newLog.data.value,
        goal.data.target_value
      );

      // Determine new status
      let status = goal.data.status;
      if (progress.gap_absolute <= 0) {
        status = 'achieved';
      } else if (progress.is_on_track) {
        status = 'on_track';
      } else {
        status = 'at_risk';
      }

      // Update goal
      const { data, error } = await ctx.supabase
        .from('profile_capability_goals')
        .update({
          current_log_id: input.new_log_id,
          progress_percentage: progress.progress_percentage,
          status,
          achieved_at: status === 'achieved' ? new Date() : undefined,
        })
        .eq('id', input.goal_id)
        .select()
        .single();

      if (error) throw error;

      return data;
    }),
});

/**
 * Helper function to check if new log affects any goals.
 */
async function checkGoalProgress(ctx: any, newLog: any) {
  // Find goals matching this log's category/type/duration
  const { data: matchingGoals } = await ctx.supabase
    .from('profile_capability_goals')
    .select('id')
    .eq('profile_id', ctx.session.user.id)
    .eq('category', newLog.category)
    .eq('type', newLog.type)
    .eq('target_duration_seconds', newLog.duration_seconds)
    .eq('status', 'active');

  // Update progress for each matching goal
  if (matchingGoals) {
    await Promise.all(
      matchingGoals.map(goal =>
        ctx.procedures.performanceMetrics.updateGoalProgress({
          goal_id: goal.id,
          new_log_id: newLog.id,
        })
      )
    );
  }
}
```

### 4.2 Router Export (`packages/trpc/src/routers/index.ts`)

```typescript
import { router } from '../trpc';
import { activityRouter } from './activities';
import { profilesRouter } from './profiles';
import { performanceMetricsRouter } from './performance_metrics'; // NEW

export const appRouter = router({
  activities: activityRouter,
  profiles: profilesRouter,
  performanceMetrics: performanceMetricsRouter, // NEW
});

export type AppRouter = typeof appRouter;
```

---

## 5. Mobile Implementation

### 5.1 Screens Structure

```
apps/mobile/app/(internal)/(tabs)/
└── performance.tsx                  # NEW: Main performance tab

apps/mobile/app/(internal)/(standard)/
├── capability-detail.tsx            # NEW: View single capability progression
├── goal-detail.tsx                  # NEW: View goal with progress
├── log-capability.tsx               # NEW: Manual entry form
└── power-curve.tsx                  # NEW: Visualize power/pace curve
```

### 5.2 Main Performance Screen (`apps/mobile/app/(internal)/(tabs)/performance.tsx`)

```tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { trpc } from '@/lib/trpc';
import { Icon } from '@/components/ui/icon';
import { Plus, TrendingUp, Target } from 'lucide-react-native';
import { router } from 'expo-router';
import { capabilitySelectionStore } from '@/lib/stores/capabilitySelectionStore';

export default function PerformanceScreen() {
  const [selectedCategory, setSelectedCategory] = useState<'bike' | 'run'>('bike');
  const [selectedType, setSelectedType] = useState<'power' | 'pace'>('power');

  const { data: capabilities, isLoading } = trpc.performanceMetrics.getCurrentCapabilities.useQuery({
    category: selectedCategory,
    type: selectedType,
  });

  const { data: goals } = trpc.performanceMetrics.getActiveGoals.useQuery();

  return (
    <ScrollView className="flex-1 bg-background">
      {/* Header */}
      <View className="p-4 border-b border-border">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-2xl font-bold text-foreground">Performance</Text>
          <Pressable
            onPress={() => router.push('/(internal)/(standard)/log-capability')}
            className="bg-primary rounded-full p-2"
          >
            <Icon as={Plus} className="text-primary-foreground" size={24} />
          </Pressable>
        </View>

        {/* Category Toggle */}
        <View className="flex-row gap-2">
          {['bike', 'run'].map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setSelectedCategory(cat as any)}
              className={`flex-1 py-2 px-4 rounded-lg ${
                selectedCategory === cat ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <Text
                className={`text-center font-semibold ${
                  selectedCategory === cat ? 'text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Power Curve Preview */}
      <View className="p-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-lg font-semibold text-foreground">Current Capabilities</Text>
          <Pressable onPress={() => router.push('/(internal)/(standard)/power-curve')}>
            <Text className="text-primary font-medium">View Curve</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <Text className="text-muted-foreground">Loading...</Text>
        ) : (
          <View className="bg-card rounded-lg p-4 gap-3">
            {capabilities?.slice(0, 4).map((cap) => (
              <Pressable
                key={cap.id}
                onPress={() => {
                  capabilitySelectionStore.getState().select(cap);
                  router.push('/(internal)/(standard)/capability-detail');
                }}
                className="flex-row items-center justify-between"
              >
                <Text className="text-muted-foreground">
                  {formatDuration(cap.duration_seconds)}
                </Text>
                <Text className="text-foreground font-semibold text-lg">
                  {cap.value} {cap.unit}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {cap.source}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Active Goals */}
      <View className="p-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-lg font-semibold text-foreground">Active Goals</Text>
          <Pressable onPress={() => router.push('/(internal)/(standard)/create-goal')}>
            <Icon as={Target} className="text-primary" size={20} />
          </Pressable>
        </View>

        {goals?.length === 0 ? (
          <View className="bg-card rounded-lg p-6 items-center">
            <Icon as={Target} className="text-muted-foreground mb-2" size={40} />
            <Text className="text-muted-foreground text-center">
              Set a goal to track your progress
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {goals?.map((goal) => (
              <Pressable
                key={goal.id}
                onPress={() => {
                  router.push(`/(internal)/(standard)/goal-detail?id=${goal.id}`);
                }}
                className="bg-card rounded-lg p-4"
              >
                <View className="flex-row items-start justify-between mb-2">
                  <View className="flex-1">
                    <Text className="text-foreground font-semibold">{goal.name}</Text>
                    <Text className="text-muted-foreground text-sm">
                      Target: {goal.target_value} {goal.target_unit}
                    </Text>
                  </View>
                  <View
                    className={`px-2 py-1 rounded ${
                      goal.status === 'on_track'
                        ? 'bg-green-500/20'
                        : goal.status === 'at_risk'
                        ? 'bg-yellow-500/20'
                        : 'bg-blue-500/20'
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        goal.status === 'on_track'
                          ? 'text-green-500'
                          : goal.status === 'at_risk'
                          ? 'text-yellow-500'
                          : 'text-blue-500'
                      }`}
                    >
                      {goal.status.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                {/* Progress Bar */}
                <View className="bg-muted rounded-full h-2 overflow-hidden">
                  <View
                    className={`h-full ${
                      goal.status === 'on_track' ? 'bg-green-500' : 'bg-yellow-500'
                    }`}
                    style={{ width: `${Math.min(100, goal.progress_percentage || 0)}%` }}
                  />
                </View>
                <Text className="text-muted-foreground text-xs mt-1">
                  {goal.progress_percentage?.toFixed(0)}% complete
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${seconds / 60}min`;
  return `${seconds / 3600}hr`;
}
```

### 5.3 Manual Entry Form (`apps/mobile/app/(internal)/(standard)/log-capability.tsx`)

```tsx
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function LogCapabilityScreen() {
  const [category, setCategory] = useState<'bike' | 'run'>('bike');
  const [type, setType] = useState<'power' | 'pace'>('power');
  const [value, setValue] = useState('');
  const [duration, setDuration] = useState('3600'); // Default to FTP (1 hour)
  const [source, setSource] = useState<'manual' | 'test' | 'calculated'>('manual');
  const [notes, setNotes] = useState('');

  const utils = trpc.useUtils();
  const createMutation = trpc.performanceMetrics.create.useMutation({
    onSuccess: () => {
      utils.performanceMetrics.getCurrentCapabilities.invalidate();
      utils.performanceMetrics.getActiveGoals.invalidate();
      router.back();
    },
  });

  const handleSubmit = () => {
    if (!value || !duration) return;

    const unit = category === 'bike' ? 'watts' : 'min_per_km';

    createMutation.mutate({
      category,
      type,
      value: parseFloat(value),
      unit,
      duration_seconds: parseInt(duration),
      source,
      notes: notes || undefined,
    });
  };

  return (
    <ScrollView className="flex-1 bg-background p-4">
      <Text className="text-2xl font-bold text-foreground mb-6">Log Capability</Text>

      {/* Category Selection */}
      <View className="mb-4">
        <Label className="text-foreground mb-2">Activity Type</Label>
        <View className="flex-row gap-2">
          {['bike', 'run'].map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat as any)}
              className={`flex-1 py-3 rounded-lg ${
                category === cat ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <Text
                className={`text-center font-medium ${
                  category === cat ? 'text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Metric Type */}
      <View className="mb-4">
        <Label className="text-foreground mb-2">Metric Type</Label>
        <Select value={type} onValueChange={(val) => setType(val as any)}>
          <SelectTrigger>
            <SelectValue placeholder="Select metric type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="power">Power</SelectItem>
            <SelectItem value="pace">Pace</SelectItem>
            <SelectItem value="heart_rate">Heart Rate</SelectItem>
          </SelectContent>
        </Select>
      </View>

      {/* Duration */}
      <View className="mb-4">
        <Label className="text-foreground mb-2">Duration</Label>
        <Select value={duration} onValueChange={setDuration}>
          <SelectTrigger>
            <SelectValue placeholder="Select duration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5 seconds (Sprint)</SelectItem>
            <SelectItem value="60">1 minute (Anaerobic)</SelectItem>
            <SelectItem value="300">5 minutes (VO2max)</SelectItem>
            <SelectItem value="1200">20 minutes (Test)</SelectItem>
            <SelectItem value="3600">60 minutes (FTP)</SelectItem>
          </SelectContent>
        </Select>
      </View>

      {/* Value */}
      <View className="mb-4">
        <Label className="text-foreground mb-2">
          Value ({category === 'bike' ? 'watts' : 'min/km'})
        </Label>
        <Input
          value={value}
          onChangeText={setValue}
          keyboardType="numeric"
          placeholder={category === 'bike' ? '270' : '4.5'}
          className="text-foreground"
        />
      </View>

      {/* Source */}
      <View className="mb-4">
        <Label className="text-foreground mb-2">Source</Label>
        <Select value={source} onValueChange={(val) => setSource(val as any)}>
          <SelectTrigger>
            <SelectValue placeholder="How was this measured?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual Entry</SelectItem>
            <SelectItem value="test">From Test</SelectItem>
            <SelectItem value="calculated">Calculated</SelectItem>
          </SelectContent>
        </Select>
      </View>

      {/* Notes */}
      <View className="mb-6">
        <Label className="text-foreground mb-2">Notes (Optional)</Label>
        <Input
          value={notes}
          onChangeText={setNotes}
          placeholder="Indoor trainer, felt strong, etc."
          multiline
          numberOfLines={3}
          className="text-foreground"
        />
      </View>

      {/* Submit Button */}
      <Button
        onPress={handleSubmit}
        disabled={!value || !duration || createMutation.isPending}
        className="w-full"
      >
        <Text className="text-primary-foreground font-semibold">
          {createMutation.isPending ? 'Logging...' : 'Log Capability'}
        </Text>
      </Button>
    </ScrollView>
  );
}
```

### 5.4 Selection Store (`apps/mobile/lib/stores/capabilitySelectionStore.ts`)

```typescript
import { create } from 'zustand';

interface CapabilitySelectionStore {
  selected: any | null;
  select: (capability: any) => void;
  reset: () => void;
}

export const capabilitySelectionStore = create<CapabilitySelectionStore>((set) => ({
  selected: null,
  select: (capability) => set({ selected: capability }),
  reset: () => set({ selected: null }),
}));
```

---

## 6. Web Implementation

### 6.1 Routes Structure

```
apps/web/app/(dashboard)/
├── performance/
│   ├── page.tsx                     # Main performance dashboard
│   ├── capabilities/
│   │   └── [id]/page.tsx           # Capability detail & progression
│   ├── goals/
│   │   ├── page.tsx                # All goals list
│   │   ├── [id]/page.tsx          # Goal detail
│   │   └── new/page.tsx           # Create goal form
│   └── analytics/
│       └── page.tsx                # Advanced analytics (premium)
```

### 6.2 Main Dashboard (`apps/web/app/(dashboard)/performance/page.tsx`)

```tsx
'use client';

import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PowerCurveChart } from '@/components/performance/PowerCurveChart';
import { GoalProgressCard } from '@/components/performance/GoalProgressCard';
import { CapabilitiesTable } from '@/components/performance/CapabilitiesTable';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export default function PerformancePage() {
  const { data: bikePower } = trpc.performanceMetrics.getPowerCurve.useQuery({
    category: 'bike',
    type: 'power',
  });

  const { data: runPace } = trpc.performanceMetrics.getPowerCurve.useQuery({
    category: 'run',
    type: 'pace',
  });

  const { data: goals } = trpc.performanceMetrics.getActiveGoals.useQuery();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Performance</h1>
          <p className="text-muted-foreground">
            Track your capabilities and progress toward goals
          </p>
        </div>
        <Button asChild>
          <Link href="/performance/goals/new">
            <Plus className="mr-2 h-4 w-4" />
            New Goal
          </Link>
        </Button>
      </div>

      {/* Active Goals Summary */}
      {goals && goals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {goals.map((goal) => (
                <GoalProgressCard key={goal.id} goal={goal} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Power/Pace Curves */}
      <Tabs defaultValue="bike" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bike">Cycling Power</TabsTrigger>
          <TabsTrigger value="run">Running Pace</TabsTrigger>
        </TabsList>

        <TabsContent value="bike" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cycling Power Curve</CardTitle>
            </CardHeader>
            <CardContent>
              {bikePower && <PowerCurveChart data={bikePower} type="power" />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All Cycling Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <CapabilitiesTable category="bike" type="power" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="run" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Running Pace Curve</CardTitle>
            </CardHeader>
            <CardContent>
              {runPace && <PowerCurveChart data={runPace} type="pace" />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All Running Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <CapabilitiesTable category="run" type="pace" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### 6.3 Power Curve Chart Component (`apps/web/components/performance/PowerCurveChart.tsx`)

```tsx
'use client';

import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface PowerCurveChartProps {
  data: Array<{
    duration_seconds: number;
    value: number;
    is_estimated: boolean;
    confidence: number;
  }>;
  type: 'power' | 'pace';
}

export function PowerCurveChart({ data, type }: PowerCurveChartProps) {
  const chartData = {
    labels: data.map((d) => formatDuration(d.duration_seconds)),
    datasets: [
      {
        label: type === 'power' ? 'Power (watts)' : 'Pace (min/km)',
        data: data.map((d) => d.value),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        pointBackgroundColor: data.map((d) =>
          d.is_estimated ? 'rgba(59, 130, 246, 0.5)' : 'rgb(59, 130, 246)'
        ),
        pointRadius: data.map((d) => (d.is_estimated ? 3 : 5)),
        tension: 0.3,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          afterLabel: (context: any) => {
            const point = data[context.dataIndex];
            return [
              `Confidence: ${(point.confidence * 100).toFixed(0)}%`,
              point.is_estimated ? '(Estimated)' : '(Measured)',
            ];
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        title: {
          display: true,
          text: type === 'power' ? 'Power (watts)' : 'Pace (min/km)',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Duration',
        },
      },
    },
  };

  return (
    <div className="h-[400px]">
      <Line data={chartData} options={options} />
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  return `${Math.floor(seconds / 3600)}hr`;
}
```

---

## 7. User Workflows

### 7.1 Workflow 1: Manual Goal Setting

**User Story:** As a cyclist, I want to set a goal FTP of 300w for my upcoming race season.

**Steps:**
1. Navigate to Performance tab → Tap "Set Goal"
2. Select category: Bike
3. Select metric: Power
4. Select duration: 60 minutes (FTP)
5. Enter target: 300w
6. Set target date: June 1, 2026
7. Add note: "A-priority race: State Championship RR"
8. Tap "Create Goal"

**System Actions:**
- Query current FTP (e.g., 270w from last test)
- Calculate gap: 30w (11.1% improvement needed)
- Create goal with status "active"
- Display progress: 0% toward goal
- Add to active goals list

**Expected Result:**
- Goal visible on Performance tab
- Gap shown: "Need +30w (11.1% improvement)"
- Progress bar at 0%
- Estimated training needed: "12-16 weeks for this gain"

---

### 7.2 Workflow 2: Post-Activity Capability Update

**User Story:** User completes a 20-minute FTP test and wants to log the result.

**Steps:**
1. Complete activity with 285w average power for 20min
2. Activity saved → Navigate to activity detail
3. System detects: "This looks like a 20-minute FTP test"
4. System calculates: FTP = 285 × 0.95 = 271w
5. User sees prompt: "Update your FTP to 271w based on this test?"
6. User reviews calculation, taps "Confirm"

**System Actions:**
- Create performance log:
  - value: 271w
  - duration: 3600s
  - source: 'calculated'
  - calculation_method: 'ftp_20min_0.95'
  - reference_activity_id: [activity ID]
  - confidence_score: 0.92
- Extrapolate power curve for other durations
- Update all active goals with new baseline
- Recalculate training zones (Z2, Z3, Z4, etc.)

**Expected Result:**
- FTP updated from 270w → 271w
- Goal progress updated: "1w gained, 29w to go (3.3% complete)"
- Power curve refreshed with new estimates
- Training zones automatically updated
- Notification: "Your FTP increased by 1w! 🎉"

---

### 7.3 Workflow 3: Environmental Adjustment

**User Story:** User trains indoors but wants to set realistic outdoor race goal.

**Steps:**
1. View current capabilities → Indoor FTP: 285w
2. Tap "Adjust for Conditions"
3. Change environment: Indoor → Outdoor
4. System suggests: "Outdoor FTP typically 5-7% lower"
5. System calculates: 285w × 0.95 = 271w
6. User reviews, taps "Log Outdoor Estimate"

**System Actions:**
- Create new log with adjusted value
- conditions: { environment: 'outdoor' }
- source: 'adjusted'
- reference_log_id: [original indoor log]
- confidence_score: 0.78 (lower than test-based)

**Expected Result:**
- Two FTP values visible:
  - Indoor: 285w (from test)
  - Outdoor: 271w (adjusted)
- Can toggle between views
- Goals show appropriate value based on race environment
- Pacing recommendations use outdoor FTP for outdoor races

---

### 7.4 Workflow 4: Goal Achievement

**User Story:** User achieves their goal FTP of 300w.

**Steps:**
1. User does FTP test → 302w average
2. System calculates FTP: 302 × 0.95 = 287w
3. User logs result
4. System detects: "You've surpassed your goal of 280w!"

**System Actions:**
- Update goal status: 'active' → 'achieved'
- Set achieved_at timestamp
- Calculate final progress: 100%+
- Send congratulations notification
- Suggest next goal: "Ready for 290w?"

**Expected Result:**
- Goal marked as "Achieved" with celebration UI
- Achievement badge/animation
- Statistics shown:
  - Started: 270w (Jan 1)
  - Target: 280w
  - Achieved: 287w (Apr 15)
  - Timeline: 14 weeks (2 weeks ahead of schedule)
- Prompt to set new goal or retire goal

---

### 7.5 Workflow 5: Progression Analysis

**User Story:** User wants to see FTP progression over past 6 months.

**Steps:**
1. Navigate to Performance tab
2. Tap on "60min FTP" capability card
3. View "Progression" tab

**System Actions:**
- Query all FTP logs from past 6 months
- Sort chronologically
- Display as:
  - Line chart showing trend
  - Table with date, value, source, change from previous
  - Statistics: Starting FTP, Current FTP, Change %, Avg gain per week

**Expected Result:**
```
FTP Progression (Last 6 Months)

[Line chart showing steady increase from 260w → 285w]

Date        FTP     Source      Change      Notes
------------------------------------------------------
Oct 15      260w    Test        -           Baseline
Nov 20      265w    Test        +5w (+1.9%) Solid test
Dec 28      268w    Calculated  +3w (+1.1%) From race
Jan 25      275w    Test        +7w (+2.6%) Big jump!
Mar 10      280w    Test        +5w (+1.8%) On track
Apr 15      285w    Test        +5w (+1.8%) Current

Summary:
- Total gain: 25w (+9.6%)
- Average weekly gain: 1.0w
- Best test: Apr 15 (285w)
```

---

## 8. Integration Points

### 8.1 Activity Recording → Capability Logs

**Integration Type:** Post-Activity Analysis

**Location:**
- `apps/mobile/lib/services/ActivityRecorder/index.ts` (after activity finished)
- Background job on web

**Flow:**
```typescript
// After activity is saved
async function analyzeActivityForCapabilities(activityId: string) {
  const activity = await fetchActivity(activityId);

  // Detect maximal efforts
  const maximalEfforts = detectMaximalEfforts(activity);

  for (const effort of maximalEfforts) {
    // Calculate capability from effort
    const capability = calculateCapabilityFromEffort(effort);

    // Show user approval prompt
    const approved = await showCapabilityPrompt(capability);

    if (approved) {
      // Log capability with reference to activity
      await trpc.performanceMetrics.create.mutate({
        ...capability,
        reference_activity_id: activityId,
        source: 'calculated',
      });
    }
  }
}
```

**User Experience:**
- Post-activity summary shows detected capabilities
- User can approve/reject each suggestion
- Approved capabilities automatically logged
- Goals updated in real-time

---

### 8.2 Capability Logs → Training Zones

**Integration Type:** Automatic Zone Calculation

**Location:**
- `packages/core/calculations/zones.ts`
- Update zones whenever FTP/Pace logged

**Flow:**
```typescript
// When new FTP logged
async function onFTPUpdated(newFTP: number, profileId: string) {
  // Calculate power zones from FTP
  const powerZones = calculatePowerZones(newFTP, 'coggan'); // 7-zone model

  // Calculate heart rate zones (if max HR known)
  const profile = await getProfile(profileId);
  const hrZones = profile.maxHeartRate
    ? calculateHeartRateZones(profile.maxHeartRate, '5-zone')
    : null;

  // Update profile zones
  await updateProfileZones(profileId, {
    power_zones: powerZones,
    heart_rate_zones: hrZones,
    last_updated: new Date(),
    ftp: newFTP,
  });

  // Invalidate zone-dependent UI
  await invalidateQueries(['training-zones', 'activity-plans']);
}
```

**User Experience:**
- Zones automatically recalculate when FTP changes
- Notification: "Your training zones have been updated"
- Activity plans adjust targets to new zones
- Interval workouts scale automatically

---

### 8.3 Activity Plans → Capability Targets

**Integration Type:** Bi-directional Planning

**Location:**
- `packages/core/schemas/activity_plan_v2.ts`
- Activity plan creation UI

**Flow:**
```typescript
// When creating activity plan
async function createActivityPlan(params: {
  category: 'bike' | 'run';
  targetCapability?: { duration: number; value: number };
}) {
  // Get current capabilities
  const capabilities = await trpc.performanceMetrics.getCurrentCapabilities.query({
    category: params.category,
    type: params.category === 'bike' ? 'power' : 'pace',
  });

  // Use target capability or current FTP
  const ftp = params.targetCapability?.value ?? capabilities.find(c => c.duration_seconds === 3600)?.value;

  // Generate plan steps with zone-based targets
  const steps = [
    { name: 'Warm-up', targetPowerZone: 2, duration: 600 },
    { name: 'Main Set', targetPowerZone: 4, duration: 1200 },
    { name: 'Cool-down', targetPowerZone: 1, duration: 600 },
  ];

  // Convert zones to absolute values
  const stepsWithTargets = steps.map(step => ({
    ...step,
    targetPower: ftp * zoneMultipliers[step.targetPowerZone],
  }));

  return createPlan(stepsWithTargets);
}
```

**User Experience:**
- Plans automatically use current FTP for targets
- Can preview plan with goal FTP: "Train as if you already have 300w FTP"
- Progress tracking shows if plan targets are achievable
- Adaptive plans adjust to capability changes

---

### 8.4 Goals → Notifications & Coaching

**Integration Type:** Proactive User Engagement

**Location:**
- Background job checking goal progress
- Push notification service

**Triggers:**
1. **Goal Achieved:** Immediate notification with celebration
2. **Goal At Risk:** Weekly check if progress < 50% and target date < 4 weeks away
3. **Milestone Reached:** Notification at 25%, 50%, 75% progress
4. **Recommendation:** "Based on your progress, consider testing FTP this week"

**Flow:**
```typescript
// Weekly goal progress check
async function checkGoalProgress() {
  const activeGoals = await getAllActiveGoals();

  for (const goal of activeGoals) {
    const daysUntilTarget = daysBetween(new Date(), goal.target_date);
    const progress = goal.progress_percentage;

    // At risk detection
    if (daysUntilTarget < 30 && progress < 50) {
      await sendNotification({
        type: 'goal_at_risk',
        title: `${goal.name} may be at risk`,
        message: `You're ${progress.toFixed(0)}% toward your goal with ${daysUntilTarget} days left. Consider increasing training volume.`,
        actions: ['View Goal', 'Adjust Goal'],
      });
    }

    // Milestone celebrations
    if (progress >= 50 && !goal.milestone_50_sent) {
      await sendNotification({
        type: 'goal_milestone',
        title: `Halfway to ${goal.name}! 🎉`,
        message: `You've made great progress. Keep up the momentum!`,
      });
      await markMilestoneSent(goal.id, 'milestone_50_sent');
    }
  }
}
```

---

### 8.5 Capabilities → Social Features (Future)

**Integration Type:** Competitive Benchmarking

**Flow:**
- Compare your FTP to similar athletes (age, weight, experience)
- Leaderboards for local area
- Share goal achievements to activity feed
- Challenge friends to capability goals

**Privacy:**
- Capabilities private by default
- Can make specific goals public
- Opt-in to anonymous benchmarking data

---

## 9. Strengths & Weaknesses

### Strengths

**✅ 1. Architectural Clarity**
- Clean separation: Database (storage) → Core (logic) → tRPC (API) → UI (interaction)
- Database-independent core package enables testing without mocks
- Append-only logs create natural audit trail
- Proper indexing ensures O(log n) queries as claimed

**✅ 2. Forward-Looking Mental Model**
- Shifts focus from "what you did" to "what you can do"
- Goal-oriented training vs achievement-oriented tracking
- Proactive planning vs reactive analysis
- Competitive differentiator

**✅ 3. Flexibility & Extensibility**
- Supports multiple sports (bike, run, swim, row)
- Multiple metrics (power, pace, heart rate)
- Multiple durations (5s to 4hr+)
- Multiple sources (test, race, calculated, predicted, goal)
- Environmental condition modeling (indoor/outdoor, altitude, etc.)

**✅ 4. Data Integrity**
- Immutable logs preserve history
- Confidence scoring for estimate reliability
- Reference to source activities for traceability
- Validation prevents impossible values
- Superseding mechanism maintains data lineage

**✅ 5. User Workflow Integration**
- Post-activity capability detection
- Automatic zone calculation
- Goal progress tracking with notifications
- Environmental adjustments for realistic planning
- Historical progression analysis

**✅ 6. Monetization Potential**
- Premium tier for automated estimates
- Advanced analytics (phenotype analysis, benchmarking)
- Training plan generation from goals
- Race prediction tools
- Competitive value prop vs $200/year TrainingPeaks

---

### Weaknesses

**❌ 1. Missing Core Intelligence**
- **No automatic estimate generation algorithm** - Manual logging only in MVP
- **No test detection logic** - Can't identify maximal efforts from activities
- **No power duration modeling** - Simplified extrapolation vs industry-standard Critical Power models
- **No reconciliation system** - What happens when predicted ≠ actual?
- **Impact:** Without automation, this is just a fancy spreadsheet. Low adoption expected.

**❌ 2. Confidence Scoring Incomplete**
- Current implementation is simplistic (source-based multipliers)
- Doesn't account for:
  - Seasonal fitness variations
  - Training load trends (CTL/ATL)
  - Recent injury/illness
  - Competition periodization
- **Impact:** Users may not trust estimates, leading to manual overrides and loss of system value.

**❌ 3. Unit Handling Anti-Pattern**
- "Units implied by category + type" is problematic
- Swim pace: 100m vs 100yd
- Run pace: km vs miles
- Power: watts vs watts/kg
- **Impact:** International users and swimmers will hit edge cases, data corruption risk.

**❌ 4. No Data Quality Validation**
- Activity stream quality not assessed (power meter drops, GPS errors)
- No outlier detection for logged values
- No validation against population norms
- **Impact:** Garbage in, garbage out. Bad data leads to bad estimates and user distrust.

**❌ 5. Goal Management Underspecified**
- No plan generation to achieve goals
- No intermediate milestone suggestions
- No risk assessment ("this goal is unrealistic given timeline")
- No adaptive goal adjustment
- **Impact:** Goals feel aspirational rather than actionable. Low engagement.

**❌ 6. Environmental Adjustment Oversimplified**
- Fixed multipliers (indoor → outdoor = 0.95)
- Real world: Highly individual (0.85-0.98 depending on rider)
- No learning from actual indoor vs outdoor performance data
- **Impact:** Adjustments may be inaccurate, leading users to ignore feature.

**❌ 7. Scalability Concerns Not Addressed**
- 9,360 rows/user/year → 93.6M rows with 10K users over 10 years
- No archiving strategy
- No data retention policy
- Partitioning mentioned but not specified
- **Impact:** Performance degradation after 2-3 years, expensive storage costs.

**❌ 8. Mobile UX Complexity**
- Feature requires understanding of FTP, power curves, training zones
- Steep learning curve for casual users
- No onboarding flow specified
- **Impact:** <20% adoption rate expected, limited to experienced athletes.

**❌ 9. Competitive Positioning Overstated**
- Proposal claims to replace $200/year TrainingPeaks
- Reality: Missing 80% of TrainingPeaks features (automated curve, CTL/ATL, advanced modeling)
- Intervals.icu already provides similar features for free
- **Impact:** May set unrealistic expectations, struggle to justify premium pricing.

**❌ 10. No Synchronization Strategy**
- What if user manually logs FTP on mobile and web simultaneously?
- Conflict resolution not specified
- Optimistic updates could cause data inconsistencies
- **Impact:** Edge case bugs, frustrated users, data loss.

---

### Critical Missing Pieces

**Must-Have for MVP:**
1. **Test detection algorithm** - At minimum, detect 20min and ramp tests
2. **Automatic FTP calculation with user approval** - Key value prop
3. **Basic power curve extrapolation** - Make it useful beyond manual logging
4. **Unit field in schema** - Prevent future data corruption
5. **Validation rules** - Prevent impossible values from being logged

**Should-Have for Launch:**
1. **Confidence scoring v2** - Factor in recency, training load, data quality
2. **Goal progress notifications** - Keep users engaged
3. **Zone auto-update** - Show immediate benefit when capability changes
4. **Historical progression charts** - Visualize improvement
5. **Onboarding tutorial** - Teach users how to use feature

**Nice-to-Have for Premium:**
1. **Advanced modeling** (Critical Power, VO2max estimation)
2. **Phenotype analysis** (sprinter vs time-trialist)
3. **Population benchmarking**
4. **Predictive training plans** (how to achieve goal)
5. **Race performance prediction**

---

## 10. Impact on Existing Features

### 10.1 Profiles Table

**Changes Required:**
```sql
ALTER TABLE profiles ADD COLUMN current_ftp INTEGER;
ALTER TABLE profiles ADD COLUMN current_ftp_updated_at TIMESTAMP;
ALTER TABLE profiles ADD COLUMN training_zones JSONB;
ALTER TABLE profiles ADD COLUMN training_zones_updated_at TIMESTAMP;
```

**Impact:** Denormalized cache of current FTP for fast access. Updated via trigger when new capability logged.

---

### 10.2 Activity Plans (Structured Workouts)

**Current State:** Plans have target power/pace zones

**New Capability:**
- Automatically populate targets from current FTP
- Validate plan is achievable given current capabilities
- Show "this plan is designed for 280w FTP, your current is 270w"
- Offer to scale plan to current capabilities

**Example:**
```typescript
// Before
const plan = {
  steps: [
    { name: 'Threshold', targetPower: 280, duration: 1200 },
  ],
};

// After (enhanced)
const plan = {
  steps: [
    {
      name: 'Threshold',
      targetPowerZone: 4,  // Zone 4 = 91-105% FTP
      targetPower: currentFTP * 0.98,  // Auto-calculated
      duration: 1200,
      achievability: 'high',  // Based on current capabilities
    },
  ],
};
```

**Impact:** Plans become dynamic and personalized. Reduces user error of training at wrong intensities.

---

### 10.3 Activity Recorder

**Current State:** Records activities with sensor data

**New Capability:**
- Post-activity analysis for maximal efforts
- "Did you just do a 20min FTP test?" prompt
- One-tap capability logging from activity
- Automatic goal progress updates

**Integration Point:**
```typescript
// In ActivityRecorder.finish()
async finish() {
  const activity = await this.saveActivity();

  // NEW: Analyze for capabilities
  const detectedCapabilities = await analyzeForCapabilities(activity);

  if (detectedCapabilities.length > 0) {
    // Show prompt: "Update your FTP?"
    await showCapabilityPrompt(detectedCapabilities);
  }

  return activity;
}
```

**Impact:** Seamless workflow from recording → capability update → goal progress. Key user retention driver.

---

### 10.4 Training Load (CTL/ATL/TSB)

**Current State:** May already calculate fitness/fatigue/form

**New Synergy:**
- High CTL (fitness) → higher confidence in capability estimates
- Recent ATL spike (fatigue) → discount test results
- Positive TSB (form) → ideal time for testing
- Declining CTL → prompt user to retest capabilities

**Example:**
```typescript
// When user logs FTP test
function validateTestTiming(testResult: number, trainingLoad: TrainingLoad) {
  if (trainingLoad.tsb < -20) {
    return {
      valid: true,
      warning: 'You tested while fatigued (TSB -22). Your actual FTP may be 3-5w higher when fresh.',
      confidence: 0.82,  // Lower confidence due to fatigue
    };
  }
  return { valid: true, confidence: 0.95 };
}
```

**Impact:** More intelligent capability tracking that accounts for current form.

---

### 10.5 Analytics & Reporting

**New Reports Enabled:**
1. **Capability Timeline** - Chart showing FTP/pace progression over time
2. **Goal Dashboard** - All active goals with progress bars
3. **Power Profile** - Phenotype analysis (5s, 1min, 5min, 20min, 1hr power)
4. **Benchmark Comparison** - Your capabilities vs similar athletes
5. **Prediction Calculator** - "If you improve FTP by 10w, estimated race time improves by X"

**Impact:** Adds significant value to analytics section, justifies premium tier.

---

### 10.6 Social/Community Features

**New Social Features Enabled:**
1. **Goal Sharing** - Post goals to feed: "I'm aiming for 300w FTP by June!"
2. **Achievement Celebrations** - Auto-post when goal achieved
3. **Challenge Friends** - "Can you beat my 5min power?"
4. **Group Goals** - Team FTP challenges
5. **Leaderboards** - Local/age group rankings (opt-in)

**Impact:** Adds competitive/motivational elements. Could drive engagement and virality.

---

### 10.7 Integrations (Strava, TrainingPeaks, etc.)

**Export:**
- Sync FTP to TrainingPeaks/Garmin Connect
- Export power curve as CSV
- Share goal achievements to Strava

**Import:**
- Import FTP from Garmin/Wahoo devices
- Import race results as capability data points
- Sync activity efforts to detect tests

**Impact:** Reduces friction for users already in other ecosystems.

---

## 11. Implementation Roadmap

### Phase 0: Foundation (Week 1-2) - 2 weeks

**Goal:** Database schema, core package calculations, basic tRPC API

**Deliverables:**
- [ ] Database migration with full schema (including missing fields)
- [ ] Core package schemas (Zod validation)
- [ ] Core package calculations (FTP, power curve, confidence)
- [ ] tRPC router (CRUD operations)
- [ ] Unit tests for core calculations (100% coverage)

**Success Criteria:**
- All tests pass
- Can manually log capability via API
- Query returns current capabilities per duration

**Team:** 1 backend engineer
**Risk:** Low

---

### Phase 1: Mobile MVP (Week 3-6) - 4 weeks

**Goal:** Manual logging and goal setting on mobile

**Deliverables:**
- [ ] Performance tab UI
- [ ] Manual capability entry form
- [ ] Current capabilities display (list view)
- [ ] Goal creation form
- [ ] Goal progress display
- [ ] Basic capability detail screen (progression list)

**Success Criteria:**
- 50 beta users can log capabilities
- 30% of beta users create at least one goal
- NPS > 6 from beta users

**Team:** 1 mobile engineer, 1 designer
**Risk:** Low-Medium (UX complexity for new users)

---

### Phase 2: Web Dashboard (Week 5-8) - 4 weeks (parallel with Phase 1)

**Goal:** Rich analytics and visualization on web

**Deliverables:**
- [ ] Performance dashboard page
- [ ] Power curve visualization (Chart.js)
- [ ] Capabilities table with sorting/filtering
- [ ] Goal management UI (create, edit, archive)
- [ ] Progression charts (historical timeline)
- [ ] Environmental condition adjustment UI

**Success Criteria:**
- Web dashboard functional and polished
- Power curve visualization accurate
- Users can manage all capabilities and goals

**Team:** 1 web engineer, 1 designer
**Risk:** Low

---

### Phase 3: Automation - Test Detection (Week 7-10) - 4 weeks

**Goal:** Automatically detect FTP tests and suggest capability updates

**Deliverables:**
- [ ] 20-minute test detection algorithm
- [ ] Ramp test detection algorithm
- [ ] FTP calculation with user approval flow
- [ ] Post-activity capability prompt UI (mobile)
- [ ] Background job for analysis (web activities)
- [ ] Reference activity linking

**Success Criteria:**
- 80%+ accuracy detecting 20min tests
- 70%+ accuracy detecting ramp tests
- 50%+ of detected tests approved by users
- <5% false positives

**Team:** 1 backend engineer, 1 mobile engineer
**Risk:** High (algorithm accuracy critical for user trust)

---

### Phase 4: Intelligent Features (Week 11-14) - 4 weeks

**Goal:** Advanced modeling, confidence scoring, goal notifications

**Deliverables:**
- [ ] Advanced power curve modeling (Critical Power or polynomial fit)
- [ ] Confidence scoring v2 (recency, training load, data quality)
- [ ] Goal progress notifications (milestones, at-risk)
- [ ] Automatic zone updates when FTP changes
- [ ] Activity plan integration (use current FTP for targets)
- [ ] Reconciliation workflow (predicted vs actual)

**Success Criteria:**
- Confidence scores correlate with user approval rate (r > 0.7)
- Notification engagement rate > 40%
- Zone updates happen automatically for 90%+ of users
- Power curve estimates within 5% of actual for 80% of users

**Team:** 1 backend engineer, 1 mobile engineer, 1 data scientist (part-time)
**Risk:** High (ML/modeling expertise required)

---

### Phase 5: Polish & Premium (Week 15-16) - 2 weeks

**Goal:** Onboarding, premium features, marketing prep

**Deliverables:**
- [ ] Onboarding tutorial (explain FTP, power curves, goals)
- [ ] Phenotype analysis (sprinter vs TT vs climber)
- [ ] Population benchmarking (compare to similar athletes)
- [ ] Premium tier gating (automated estimates, advanced analytics)
- [ ] Marketing landing page
- [ ] In-app upgrade prompts

**Success Criteria:**
- 80%+ of new users complete onboarding
- Phenotype analysis matches user self-assessment
- 5-10% conversion to premium tier
- Marketing materials ready for launch

**Team:** 1 backend engineer, 1 mobile engineer, 1 web engineer, 1 designer, 1 product marketing
**Risk:** Medium (conversion rate unknown)

---

### Phase 6: Launch & Iteration (Week 17+)

**Goal:** Public launch, monitoring, iteration

**Activities:**
- Launch to all users
- Monitor adoption metrics (see Section 12)
- Gather user feedback
- A/B test premium pricing
- Iterate on UX pain points
- Add requested features (community voting)

**Success Criteria:** See Section 12

---

## 12. Success Metrics & KPIs

### Engagement Metrics

**Primary:**
- **Adoption Rate:** % of MAU who log at least one capability
  - Target: >20% within 3 months of launch
  - Stretch: >35% within 6 months

- **Active Users:** % of capability users who log ≥1 per month
  - Target: >60% monthly retention
  - Stretch: >75% monthly retention

- **Goal Setting Rate:** % of capability users who create ≥1 goal
  - Target: >40% within first 30 days
  - Stretch: >60% within first 30 days

**Secondary:**
- Average capabilities logged per active user per month
  - Target: >3
- Average goals per user
  - Target: >1.5
- % of goals achieved within target date
  - Target: >15% (realistic given training variability)

---

### Quality Metrics

**Accuracy:**
- **Auto-Detection Accuracy:** % of 20min tests correctly detected
  - Target: >75%
  - Stretch: >85%

- **User Approval Rate:** % of auto-generated estimates approved by user
  - Target: >70%
  - Stretch: >85%

- **Estimate Accuracy:** Actual performance vs predicted capability (within 5%)
  - Target: >70% of tests within confidence interval
  - Stretch: >85%

**Trust:**
- **User Trust Survey:** "I trust the capability estimates" (1-10 scale)
  - Target: >7.0 average
  - Stretch: >8.0 average

- **Override Rate:** % of auto-generated estimates manually overridden
  - Target: <20% (low overrides = high trust)

---

### Business Metrics

**Retention:**
- **30-day Retention Lift:** Capability users vs non-users
  - Target: +15% retention
  - Stretch: +25% retention

- **90-day Retention Lift:**
  - Target: +20% retention
  - Stretch: +30% retention

**Monetization:**
- **Premium Conversion Rate:** % of capability users who upgrade to premium
  - Target: 5-7% within 90 days
  - Stretch: 10-12%

- **Premium MRR Contribution:** Revenue from capability-driven premium upgrades
  - Target: $5,000 MRR within 6 months
  - Stretch: $10,000 MRR within 6 months

**Virality:**
- **Goal Sharing Rate:** % of goal achievements shared to social
  - Target: >15%
  - Stretch: >25%

- **Referral Lift:** New users from goal-sharing vs baseline
  - Target: +5% referral rate
  - Stretch: +10% referral rate

---

### Operational Metrics

**Performance:**
- **Query Latency:** p95 for getCurrentCapabilities query
  - Target: <200ms
  - Stretch: <100ms

- **Table Size Growth:** Row count over time
  - Monitor: Expected 9,360 rows/user/year
  - Alert: If growth exceeds 150% of projection

**Quality:**
- **Error Rate:** Failed capability creation attempts
  - Target: <1% of mutations fail
  - Stretch: <0.5%

- **Data Quality:** % of logged capabilities with impossible values
  - Target: <2% (caught by validation)
  - Stretch: <0.5%

---

### User Satisfaction

**Surveys:**
- **Feature Usefulness:** "How useful is capability tracking?" (1-10)
  - Target: >7.5
  - Stretch: >8.5

- **Net Promoter Score (NPS):** Impact of feature on overall NPS
  - Target: +5 points for capability users
  - Stretch: +10 points

**Qualitative:**
- User interviews (n=20) at 30 days post-launch
- Support ticket volume (target: <5% of users)
- Feature request themes

---

### Kill Criteria (When to Abandon)

**If by 90 days post-launch:**
- Adoption rate <10%
- 30-day retention lift <5%
- Premium conversion <2%
- User satisfaction <6.0
- Majority of feedback is negative

**Then:** Sunset feature, archive for future iteration

---

## 13. Risks & Mitigations

### High-Priority Risks

**Risk 1: Low Adoption (<20% of users)**

**Cause:** Feature too complex, not enough value for effort

**Probability:** High (40%)

**Impact:** High (wasted 16 weeks of development)

**Mitigations:**
1. **Pre-launch survey** - Ask 200 users: "Would you use capability tracking?"
   - If <40% say yes, reconsider scope
2. **Excellent onboarding** - 5-screen tutorial explaining value
3. **Quick wins** - Show benefits immediately (auto-update zones, goal suggestions)
4. **Progressive disclosure** - Start simple (just FTP), add complexity gradually
5. **Incentivize** - "Log your FTP to unlock advanced analytics"

**Contingency:** If adoption <10% after 60 days, pivot to "Goals-only" simplified version

---

**Risk 2: Automated Estimates Are Inaccurate**

**Cause:** Algorithms don't account for real-world variability (fatigue, weather, pacing)

**Probability:** Medium (30%)

**Impact:** High (destroys user trust, feature abandoned)

**Mitigations:**
1. **Conservative estimates** - Prefer underestimating vs overestimating
2. **Wide confidence intervals** - Show "FTP: 265-275w (95% confidence)"
3. **User approval required** - Never auto-apply, always prompt
4. **Feedback loop** - Learn from user overrides to improve algorithms
5. **Multiple data points** - Don't rely on single test, triangulate from multiple activities

**Contingency:** If approval rate <60%, fall back to manual-only mode and improve algorithms

---

**Risk 3: Users Don't Trust "Goal" vs "Current" Distinction**

**Cause:** Confusion about aspirational vs actual capabilities

**Probability:** Medium (25%)

**Impact:** Medium (feature works but limited engagement)

**Mitigations:**
1. **Clear labeling** - Use color coding (green=current, blue=goal)
2. **Separate views** - Don't mix current and goal in same chart
3. **Visual distinction** - Dotted lines for goals, solid for current
4. **Contextual help** - Tooltips explaining difference
5. **User testing** - 20 users test UI before launch, iterate based on confusion points

**Contingency:** Simplify to single "Current Capabilities" view if users struggle

---

**Risk 4: Environmental Adjustments Are Inaccurate**

**Cause:** Fixed multipliers don't reflect individual physiology

**Probability:** Medium (30%)

**Impact:** Low-Medium (nice-to-have feature, not core value)

**Mitigations:**
1. **Make adjustments suggestions, not facts** - "Typically 5-7% lower outdoors"
2. **Learn from user data** - Track actual indoor vs outdoor performance ratio per user
3. **Allow manual override** - Users can set their own adjustment factors
4. **Confidence scoring** - Mark adjusted estimates as lower confidence
5. **A/B test** - 50% of users get adjustments, 50% don't, compare engagement

**Contingency:** If users ignore adjustments (usage <10%), remove feature to reduce complexity

---

**Risk 5: Scalability Issues After 2-3 Years**

**Cause:** 93M+ rows for 10K users, query performance degrades

**Probability:** Low (15%)

**Impact:** Medium (solvable with engineering, but expensive)

**Mitigations:**
1. **Partition from day 1** - Partition by (profile_id, created_at)
2. **Archive strategy** - Move logs >2 years old to cold storage
3. **Materialized views** - Cache current capabilities per user
4. **Monitor proactively** - Set alerts for p95 latency >500ms
5. **Load testing** - Simulate 100K users before scaling past 10K

**Contingency:** Implement archiving and optimization when table exceeds 10M rows

---

**Risk 6: Premium Conversion Below Target (<5%)**

**Cause:** Free tier sufficient for most users, premium not compelling

**Probability:** Medium (35%)

**Impact:** High (monetization strategy fails)

**Mitigations:**
1. **Gate high-value features** - Advanced modeling, phenotype analysis premium-only
2. **Limit free capabilities** - Free: manual logging only, Premium: automated estimates
3. **Trial period** - 30-day free trial of premium to demonstrate value
4. **In-context upsells** - "Upgrade to unlock full power curve"
5. **A/B test pricing** - $5, $8, $12 tiers to find optimal conversion × revenue

**Contingency:** If conversion <3%, reconsider premium gating (may need different feature set)

---

**Risk 7: Feature Cannibalizes Existing Premium Subscriptions**

**Cause:** Users subscribed for other features, now unsubscribe since capability tracking is free

**Probability:** Low (10%)

**Impact:** High (net negative revenue)

**Mitigations:**
1. **Bundle strategically** - Capability tracking enhances existing premium features
2. **Add value, don't replace** - Existing premium users get advanced capabilities features
3. **Monitor churn** - Track if premium churn increases post-launch
4. **Cohort analysis** - Compare pre/post launch premium retention

**Contingency:** If premium churn increases >15%, gate more aggressively or bundle differently

---

**Risk 8: Competitive Response from TrainingPeaks/Intervals.icu**

**Cause:** Established players add similar features or price more aggressively

**Probability:** Medium (25%)

**Impact:** Medium (harder to differentiate)

**Mitigations:**
1. **Tight integration** - Leverage GradientPeak ecosystem (recording, plans, zones)
2. **Better UX** - Simpler, cleaner than TrainingPeaks
3. **Unique features** - Environmental adjustments, explicit goal tracking
4. **Faster iteration** - Add requested features within weeks, not months
5. **Community building** - Foster engaged community around capability improvement

**Contingency:** If competitors match features, compete on UX and price (undercut TrainingPeaks)

---

**Risk 9: Regulatory/Privacy Concerns**

**Cause:** Health data regulations (GDPR, HIPAA), user data breaches

**Probability:** Low (5%)

**Impact:** Critical (legal liability, user trust destroyed)

**Mitigations:**
1. **Privacy by default** - All capabilities private unless user explicitly shares
2. **Data encryption** - Encrypt capabilities at rest and in transit
3. **GDPR compliance** - Right to deletion, data export
4. **Security audit** - Third-party audit before launch
5. **Transparent policies** - Clear privacy policy, user control over data

**Contingency:** If breach occurs, immediate disclosure, incident response plan, regulatory compliance

---

**Risk 10: Technical Debt from Rapid Development**

**Cause:** 16-week timeline pressure leads to shortcuts, poor code quality

**Probability:** High (45%)

**Impact:** Medium (slower future iteration, bugs)

**Mitigations:**
1. **Mandatory code reviews** - No PR merged without review
2. **Test coverage requirements** - 80%+ for core package, 60%+ for UI
3. **Refactor sprints** - Week 12 dedicated to cleanup
4. **Documentation as you go** - Update CLAUDE.md and README files
5. **Technical debt backlog** - Track and prioritize cleanup tasks

**Contingency:** If velocity drops >25% due to debt, pause features for 2-week cleanup sprint

---

## Conclusion

### Is This Feature Worth Building?

**Short Answer: YES, with significant caveats.**

### The Good

1. **Solid Foundation** - The schema design (with fixes) and core concept are sound
2. **Clear Differentiation** - Environmental adjustments and transparent goal tracking are unique
3. **Ecosystem Integration** - Fits naturally with activity recording, plans, and zones
4. **Monetization Path** - Premium tier for advanced features is viable ($5-12/mo)
5. **User Value** - Shifts mindset from reactive tracking to proactive planning

### The Reality Check

1. **Feature as proposed is incomplete** - Manual logging only has limited appeal
2. **Automation is critical** - Must detect tests and calculate estimates automatically
3. **Competitive positioning is overstated** - You're building 20% of TrainingPeaks, not replacing it
4. **UX complexity is underestimated** - FTP, power curves, zones confuse casual users
5. **16-week timeline is aggressive** - Especially Phase 3 (test detection algorithms)

### Recommended Strategy

**Phase 0-2 (8 weeks):** Build foundation + manual logging MVP
- **Goal:** Validate that capability tracking provides value at all
- **Success Metric:** 50 beta users, 30% create goals, NPS >6
- **Go/No-Go Decision:** If metrics hit, proceed to Phase 3 (automation)

**Phase 3-4 (8 weeks):** Add automation and intelligence
- **Goal:** Automated FTP detection, confidence scoring, goal notifications
- **Success Metric:** 80% detection accuracy, 70% approval rate
- **Go/No-Go Decision:** If metrics hit, proceed to Phase 5 (premium)

**Phase 5-6 (4 weeks):** Polish and launch
- **Goal:** Public launch with premium tier
- **Success Metric:** 20% adoption, 5% premium conversion
- **Post-Launch:** Iterate based on user feedback and metrics

### Expected Outcomes (Base Case)

- **Adoption:** 20-25% of MAU (2,000-2,500 users if 10K MAU)
- **Retention Lift:** +15-20% for engaged users
- **Premium Conversion:** 5-7% (100-175 premium users)
- **Revenue:** $8K-14K MRR ($96K-168K ARR)
- **Development Cost:** 16 weeks × 2-3 engineers = 32-48 engineer-weeks

**ROI:** Positive if retention lift drives LTV gains and premium conversions sustain

### Kill Criteria

**Abandon if by 90 days post-launch:**
- Adoption <10%
- Premium conversion <2%
- Retention lift <5%
- User satisfaction <6.0

### Final Recommendation

**BUILD IT** - with realistic expectations, phased rollout, and clear go/no-go gates.

This feature has genuine potential to differentiate GradientPeak in a crowded fitness app market. The forward-looking "capability planning" mindset is valuable and underserved. However, success depends entirely on:

1. **Nailing the automation** - Manual logging won't drive adoption
2. **Building trust** - Accurate, explainable estimates with user approval
3. **Simplifying UX** - Progressive disclosure, excellent onboarding
4. **Tight integration** - Make it essential to existing workflows (recording, plans, zones)

The proposal provides a strong starting point, but implementation will be significantly more complex than suggested. Budget 16 weeks, plan for 20-24 weeks realistically. Validate early, iterate often, and don't oversell competitive positioning.

**Confidence Level: 75%** - Uncertain about adoption rate and algorithm accuracy, but confident in strategic fit and technical feasibility.
