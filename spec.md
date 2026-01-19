# Profile Performance Metric Logs - MVP Specification

## Executive Summary

**Feature Name:** Performance Capability Tracking System (MVP)

**Purpose:** Enable sophisticated training load analysis and performance progression tracking by maintaining a time-series log of user performance capabilities (power, pace, heart rate) across effort durations.

**Target Users:** Intermediate to advanced endurance athletes who understand performance metrics and want data-driven training insights.

**MVP Scope:**
- **Single table:** `profile_performance_metric_logs` - Time-series performance capability data
- **Dynamic computation:** All analytics, goals, and progression computed from existing app data
- **Integration:** Leverage existing activities, training plans, and planned activities
- **Core package:** Database-independent business logic using Supabase-generated types

**Development Timeline:** 4-6 weeks MVP implementation

---

## Table of Contents

1. [Technical Architecture](#1-technical-architecture)
2. [Database Schema](#2-database-schema)
3. [Core Package (Business Logic)](#3-core-package-business-logic)
4. [tRPC API Layer](#4-trpc-api-layer)
5. [Data Flow & Integration](#5-data-flow--integration)
6. [Implementation Phases](#6-implementation-phases)

---

## 1. Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface Layer                      │
├──────────────────────────┬──────────────────────────────────┤
│  Mobile App (RN)         │  Web Dashboard (Next.js)         │
│  - Manual entry          │  - Advanced analytics            │
│  - Capability charts     │  - Progression tracking          │
│  - Post-activity review  │  - Training load analysis        │
└──────────────┬───────────┴───────────┬──────────────────────┘
               │                       │
               └───────────┬───────────┘
                           │
               ┌───────────▼───────────┐
               │   tRPC API Layer      │
               │  - CRUD operations    │
               │  - Query capabilities │
               │  - Analytics queries  │
               └───────────┬───────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────▼────────┐ ┌─────▼──────┐ ┌──────▼─────────┐
│  Supabase DB     │ │ Core Pkg   │ │ Existing Data  │
│  - Metric logs   │ │ - Calcs    │ │ - Activities   │
│                  │ │ - Analysis │ │ - Plans        │
│                  │ │ - Types    │ │ - Profile      │
└──────────────────┘ └────────────┘ └────────────────┘
```

### Key Principles

1. **Single Source of Truth:** `profile_performance_metric_logs` tracks all performance capabilities over time
2. **Dynamic Computation:** Training load (CTL/ATL/TSB), goals, and zones computed on-demand from logs + activities
3. **Type Safety:** Core package uses Supabase-generated types, extending them as needed
4. **Local-First:** Existing architecture maintained - logs synced like activities
5. **Leverage Existing Data:** Use completed activities and training plans for context

### Data Flow Patterns

**Pattern 1: Manual Entry**
```
User → Mobile Form → Validation → tRPC Mutation → DB Insert → Invalidate Queries → UI Update
```

**Pattern 2: Auto-Generation from Activity (Future)**
```
Activity Completed → Background Analysis → Detect Test Effort →
Calculate Metric → tRPC Mutation → DB Insert → Update Charts
```

**Pattern 3: Training Load Analysis**
```
Query Activities + Metric Logs → Core Package (compute CTL/ATL/TSB) →
Return Time Series → Render Charts
```

**Pattern 4: Progression Tracking**
```
Query Metric Logs (filtered by category/type/duration) → Core Package (analyze trends) →
Return Progression Data → Display Insights
```

---

## 2. Database Schema

### 2.1 Single Table: `profile_performance_metric_logs`

This is the **ONLY** new table needed for MVP. Everything else is computed dynamically.

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

  -- Provenance (how this value was determined)
  source TEXT NOT NULL CHECK (source IN (
    'manual',      -- User manually entered
    'test',        -- Formal test (FTP test, ramp test, etc.)
    'race',        -- Race performance
    'calculated',  -- Derived from activity data
    'estimated',   -- Algorithmic estimation
    'adjusted'     -- User adjusted previous value
  )),
  confidence_score NUMERIC(3, 2) CHECK (confidence_score BETWEEN 0 AND 1), -- 0.00 to 1.00
  reference_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  calculation_method TEXT, -- 'ftp_20min_0.95', 'ramp_test_0.75', 'critical_power_model', etc.

  -- Environmental Context (optional, for advanced analysis)
  conditions JSONB, -- { indoor: true, altitude: 2000, temperature: 25, surface: 'trainer' }

  -- Lifecycle Management
  is_active BOOLEAN NOT NULL DEFAULT true,
  superseded_by UUID REFERENCES profile_performance_metric_logs(id) ON DELETE SET NULL,
  valid_until TIMESTAMP WITH TIME ZONE, -- NULL = indefinite

  -- Metadata
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_metric_logs_profile_active
  ON profile_performance_metric_logs(profile_id, is_active)
  WHERE is_active = true;

CREATE INDEX idx_metric_logs_lookup
  ON profile_performance_metric_logs(profile_id, category, type, duration_seconds, created_at DESC);

CREATE INDEX idx_metric_logs_reference
  ON profile_performance_metric_logs(reference_activity_id)
  WHERE reference_activity_id IS NOT NULL;

CREATE INDEX idx_metric_logs_conditions
  ON profile_performance_metric_logs USING GIN(conditions);

-- Trigger for updated_at
CREATE TRIGGER update_metric_logs_updated_at
  BEFORE UPDATE ON profile_performance_metric_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 2.2 Example Data

```sql
-- User's FTP progression over time
INSERT INTO profile_performance_metric_logs
  (profile_id, category, type, value, unit, duration_seconds, source, confidence_score, calculation_method, created_at)
VALUES
  ('user-id', 'bike', 'power', 250, 'watts', 3600, 'test', 0.95, 'ftp_20min_0.95', '2024-01-01'),
  ('user-id', 'bike', 'power', 265, 'watts', 3600, 'test', 0.95, 'ftp_20min_0.95', '2024-02-15'),
  ('user-id', 'bike', 'power', 275, 'watts', 3600, 'test', 0.95, 'ftp_20min_0.95', '2024-04-01');

-- User's 5K running pace progression
INSERT INTO profile_performance_metric_logs
  (profile_id, category, type, value, unit, duration_seconds, source, reference_activity_id, created_at)
VALUES
  ('user-id', 'run', 'pace', 4.2, 'min_per_km', 1200, 'race', 'activity-123', '2024-03-15'),
  ('user-id', 'run', 'pace', 4.05, 'min_per_km', 1200, 'race', 'activity-456', '2024-06-20');
```

### 2.3 Environmental Conditions (JSONB)

Optional context for advanced analysis - helps understand performance variations.

```typescript
// Example conditions structure
{
  environment: 'indoor' | 'outdoor',
  altitude?: number,          // meters above sea level
  temperature?: number,       // celsius
  surface?: 'road' | 'track' | 'trail' | 'treadmill' | 'trainer',
  equipment?: {
    bike?: 'road' | 'tt' | 'gravel' | 'mountain',
    wheels?: 'standard' | 'aero',
    position?: 'hoods' | 'drops' | 'aero_bars'
  },
  notes?: string
}
```

---

## 3. Core Package (Business Logic)

### 3.1 Location: `packages/core/`

**CRITICAL:** All calculation logic lives in `@repo/core` - database-independent, pure functions.

### 3.2 Schemas

The core package should **leverage and extend** Supabase-generated types rather than duplicate them.

**File:** `packages/core/schemas/performance_metrics.ts`

```typescript
import { z } from 'zod';
import type { Database } from '@repo/supabase/database.types';

// Re-export database types
export type ProfilePerformanceMetricLog =
  Database['public']['Tables']['profile_performance_metric_logs']['Row'];

export type ProfilePerformanceMetricLogInsert =
  Database['public']['Tables']['profile_performance_metric_logs']['Insert'];

export type ProfilePerformanceMetricLogUpdate =
  Database['public']['Tables']['profile_performance_metric_logs']['Update'];

// Zod schemas for validation (runtime safety)
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
  'adjusted',
]);

export const environmentalConditionsSchema = z.object({
  environment: z.enum(['indoor', 'outdoor']).optional(),
  altitude: z.number().min(0).max(9000).optional(),
  temperature: z.number().min(-40).max(60).optional(),
  surface: z.enum(['road', 'track', 'trail', 'treadmill', 'trainer']).optional(),
  equipment: z.record(z.string()).optional(),
  notes: z.string().optional(),
}).optional();

// Form schemas for user input
export const createMetricLogSchema = z.object({
  category: performanceMetricCategorySchema,
  type: performanceMetricTypeSchema,
  value: z.number().positive(),
  unit: metricUnitSchema,
  duration_seconds: z.number().int().positive(),
  source: metricSourceSchema,
  confidence_score: z.number().min(0).max(1).optional(),
  reference_activity_id: z.string().uuid().optional(),
  calculation_method: z.string().optional(),
  conditions: environmentalConditionsSchema,
  notes: z.string().optional(),
});

export type CreateMetricLogInput = z.infer<typeof createMetricLogSchema>;

// Standard durations (hardcoded - no DB table needed)
export const STANDARD_DURATIONS = [
  { seconds: 5, label: '5s Sprint', description: 'Neuromuscular power' },
  { seconds: 30, label: '30s Anaerobic', description: 'Anaerobic capacity' },
  { seconds: 60, label: '1min Anaerobic', description: 'Sustained anaerobic' },
  { seconds: 120, label: '2min VO2max', description: 'High aerobic capacity' },
  { seconds: 300, label: '5min VO2max', description: 'VO2max power/pace' },
  { seconds: 1200, label: '20min Test', description: 'FTP test duration' },
  { seconds: 3600, label: '60min FTP', description: 'Functional threshold' },
  { seconds: 7200, label: '2hr Tempo', description: 'Sustained endurance' },
] as const;

export type StandardDuration = typeof STANDARD_DURATIONS[number];
```

### 3.3 Calculations

**File:** `packages/core/calculations/performance_analysis.ts`

```typescript
import type { ProfilePerformanceMetricLog } from '../schemas/performance_metrics';
import type { Database } from '@repo/supabase/database.types';

type Activity = Database['public']['Tables']['activities']['Row'];

/**
 * Calculate training load metrics (CTL, ATL, TSB) from activities and performance logs.
 *
 * CTL (Chronic Training Load) = Fitness (42-day exponentially weighted moving average of TSS)
 * ATL (Acute Training Load) = Fatigue (7-day exponentially weighted moving average of TSS)
 * TSB (Training Stress Balance) = CTL - ATL (Form)
 *
 * This function integrates completed activities with current performance metrics
 * to provide accurate training load assessment.
 */
export function calculateTrainingLoad(params: {
  activities: Activity[];
  metricLogs: ProfilePerformanceMetricLog[];
  currentFTP?: number;
  analysisDate?: Date;
}): {
  ctl: number;
  atl: number;
  tsb: number;
  trend: 'improving' | 'maintaining' | 'detraining';
} {
  // Implementation: compute from activities using current FTP from metric logs
  // This is where we integrate existing activity data with new metric logs

  const { activities, metricLogs, currentFTP, analysisDate = new Date() } = params;

  // Get current FTP from metric logs if not provided
  const ftp = currentFTP ?? getCurrentFTP(metricLogs, 'bike');

  // Calculate TSS for each activity using current FTP
  // Use existing TSS calculation from core package

  // Apply exponentially weighted moving averages
  // CTL: 42-day EWMA
  // ATL: 7-day EWMA

  // Return computed metrics
  return {
    ctl: 0, // TODO: implement
    atl: 0,
    tsb: 0,
    trend: 'maintaining',
  };
}

/**
 * Get current capability value for a specific metric.
 * Returns the most recent active log for the given parameters.
 */
export function getCurrentCapability(params: {
  logs: ProfilePerformanceMetricLog[];
  category: string;
  type: string;
  duration_seconds?: number;
}): ProfilePerformanceMetricLog | null {
  const { logs, category, type, duration_seconds } = params;

  const filtered = logs
    .filter(log =>
      log.is_active &&
      log.category === category &&
      log.type === type &&
      (!duration_seconds || log.duration_seconds === duration_seconds)
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return filtered[0] ?? null;
}

/**
 * Helper to get current FTP from metric logs.
 */
export function getCurrentFTP(
  logs: ProfilePerformanceMetricLog[],
  category: 'bike' | 'run' = 'bike'
): number | null {
  const ftpLog = getCurrentCapability({
    logs,
    category,
    type: 'power',
    duration_seconds: 3600, // 60-minute power = FTP
  });

  return ftpLog?.value ?? null;
}

/**
 * Analyze progression for a specific capability over time.
 * Returns trend analysis, rate of improvement, and projection.
 */
export function analyzeProgression(params: {
  logs: ProfilePerformanceMetricLog[];
  category: string;
  type: string;
  duration_seconds?: number;
  timeframe_days?: number;
}): {
  current: number | null;
  baseline: number | null;
  change: number;
  changePercent: number;
  trend: 'improving' | 'stable' | 'declining';
  ratePerWeek: number;
  projection30Days: number | null;
} {
  const { logs, category, type, duration_seconds, timeframe_days = 90 } = params;

  // Filter logs for specified metric
  const filtered = logs
    .filter(log =>
      log.is_active &&
      log.category === category &&
      log.type === type &&
      (!duration_seconds || log.duration_seconds === duration_seconds)
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (filtered.length === 0) {
    return {
      current: null,
      baseline: null,
      change: 0,
      changePercent: 0,
      trend: 'stable',
      ratePerWeek: 0,
      projection30Days: null,
    };
  }

  const current = filtered[0].value;

  // Get baseline from timeframe_days ago
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeframe_days);

  const historicalLogs = filtered.filter(
    log => new Date(log.created_at) <= cutoffDate
  );

  const baseline = historicalLogs[0]?.value ?? current;

  const change = current - baseline;
  const changePercent = baseline > 0 ? (change / baseline) * 100 : 0;

  // Determine trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (changePercent > 2) trend = 'improving';
  if (changePercent < -2) trend = 'declining';

  // Calculate rate of change per week
  const daysElapsed = timeframe_days;
  const weeksElapsed = daysElapsed / 7;
  const ratePerWeek = weeksElapsed > 0 ? change / weeksElapsed : 0;

  // Project 30 days forward
  const projection30Days = current + (ratePerWeek * (30 / 7));

  return {
    current,
    baseline,
    change,
    changePercent,
    trend,
    ratePerWeek,
    projection30Days,
  };
}

/**
 * Calculate power curve from metric logs.
 * Returns interpolated power values for standard durations.
 */
export function calculatePowerCurve(params: {
  logs: ProfilePerformanceMetricLog[];
  category: string;
  durations?: number[];
}): Record<number, number> {
  const { logs, category, durations = [5, 60, 300, 1200, 3600] } = params;

  const powerLogs = logs
    .filter(log =>
      log.is_active &&
      log.category === category &&
      log.type === 'power'
    )
    .sort((a, b) => a.duration_seconds - b.duration_seconds);

  const curve: Record<number, number> = {};

  // Interpolate or use actual values
  for (const duration of durations) {
    const exactMatch = powerLogs.find(log => log.duration_seconds === duration);
    if (exactMatch) {
      curve[duration] = exactMatch.value;
    } else {
      // Interpolate between nearest values
      const lower = powerLogs
        .filter(log => log.duration_seconds < duration)
        .sort((a, b) => b.duration_seconds - a.duration_seconds)[0];
      const upper = powerLogs
        .filter(log => log.duration_seconds > duration)
        .sort((a, b) => a.duration_seconds - b.duration_seconds)[0];

      if (lower && upper) {
        // Linear interpolation
        const ratio = (duration - lower.duration_seconds) /
                     (upper.duration_seconds - lower.duration_seconds);
        curve[duration] = lower.value + (upper.value - lower.value) * ratio;
      } else if (lower) {
        // Extrapolate down from lower (power decreases for longer durations)
        const hourlyDecay = 0.95; // Assume 5% decay per hour
        const hours = (duration - lower.duration_seconds) / 3600;
        curve[duration] = lower.value * Math.pow(hourlyDecay, hours);
      } else if (upper) {
        // Extrapolate up from upper (power increases for shorter durations)
        const hourlyIncrease = 1.2; // Simplified model
        const hours = (upper.duration_seconds - duration) / 3600;
        curve[duration] = upper.value * Math.pow(hourlyIncrease, hours);
      }
    }
  }

  return curve;
}

/**
 * Estimate FTP from 20-minute test result.
 */
export function estimateFTPFrom20MinTest(twentyMinPower: number): number {
  if (twentyMinPower <= 0) throw new Error('Invalid power value');
  return Math.round(twentyMinPower * 0.95);
}

/**
 * Estimate FTP from ramp test (75% of max 1-minute power).
 */
export function estimateFTPFromRampTest(maxOneMinPower: number): number {
  if (maxOneMinPower <= 0) throw new Error('Invalid power value');
  return Math.round(maxOneMinPower * 0.75);
}

/**
 * Calculate confidence score for a metric log based on source and recency.
 */
export function calculateConfidenceScore(params: {
  source: string;
  daysSinceCreated: number;
  hasReferenceActivity: boolean;
}): number {
  const { source, daysSinceCreated, hasReferenceActivity } = params;

  // Source reliability weights
  const sourceWeights: Record<string, number> = {
    test: 0.95,
    race: 0.90,
    calculated: 0.85,
    manual: 0.70,
    estimated: 0.60,
    adjusted: 0.65,
  };

  let confidence = sourceWeights[source] ?? 0.5;

  // Decay confidence over time (10% per 30 days)
  const decayRate = 0.10 / 30;
  const recencyFactor = Math.max(0.5, 1 - (daysSinceCreated * decayRate));
  confidence *= recencyFactor;

  // Bonus for reference activity
  if (hasReferenceActivity) {
    confidence = Math.min(1.0, confidence * 1.1);
  }

  return Math.round(confidence * 100) / 100;
}
```

---

## 4. tRPC API Layer

**File:** `packages/trpc/src/routers/performance_metrics.ts`

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  createMetricLogSchema,
  performanceMetricCategorySchema,
  performanceMetricTypeSchema,
} from '@repo/core/schemas/performance_metrics';
import {
  analyzeProgression,
  calculatePowerCurve,
  calculateTrainingLoad,
  getCurrentCapability,
} from '@repo/core/calculations/performance_analysis';

export const performanceMetricsRouter = router({
  /**
   * List all metric logs for the current user with filtering.
   */
  list: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema.optional(),
        type: performanceMetricTypeSchema.optional(),
        duration_seconds: z.number().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const { supabase, user } = ctx;

      let query = supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.category) {
        query = query.eq('category', input.category);
      }
      if (input.type) {
        query = query.eq('type', input.type);
      }
      if (input.duration_seconds) {
        query = query.eq('duration_seconds', input.duration_seconds);
      }

      const { data, error } = await query;

      if (error) throw new Error(`Failed to fetch metrics: ${error.message}`);

      return data ?? [];
    }),

  /**
   * Get a specific metric log by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const { supabase, user } = ctx;

      const { data, error } = await supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('id', input.id)
        .eq('profile_id', user.id)
        .single();

      if (error) throw new Error(`Failed to fetch metric: ${error.message}`);
      if (!data) throw new Error('Metric not found');

      return data;
    }),

  /**
   * Create a new metric log.
   */
  create: protectedProcedure
    .input(createMetricLogSchema)
    .mutation(async ({ input, ctx }) => {
      const { supabase, user } = ctx;

      const { data, error } = await supabase
        .from('profile_performance_metric_logs')
        .insert({
          profile_id: user.id,
          ...input,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create metric: ${error.message}`);

      return data;
    }),

  /**
   * Update an existing metric log.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: createMetricLogSchema.partial(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { supabase, user } = ctx;

      const { data, error } = await supabase
        .from('profile_performance_metric_logs')
        .update(input.data)
        .eq('id', input.id)
        .eq('profile_id', user.id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update metric: ${error.message}`);

      return data;
    }),

  /**
   * Mark a metric log as inactive (soft delete).
   */
  deactivate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { supabase, user } = ctx;

      const { error } = await supabase
        .from('profile_performance_metric_logs')
        .update({ is_active: false })
        .eq('id', input.id)
        .eq('profile_id', user.id);

      if (error) throw new Error(`Failed to deactivate metric: ${error.message}`);

      return { success: true };
    }),

  /**
   * Get current capability (most recent active log) for a metric.
   */
  getCurrent: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema,
        type: performanceMetricTypeSchema,
        duration_seconds: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { supabase, user } = ctx;

      let query = supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', user.id)
        .eq('category', input.category)
        .eq('type', input.type)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (input.duration_seconds) {
        query = query.eq('duration_seconds', input.duration_seconds);
      }

      const { data, error } = await query;

      if (error) throw new Error(`Failed to fetch current metric: ${error.message}`);

      return data?.[0] ?? null;
    }),

  /**
   * Analyze progression for a specific metric over time.
   */
  analyzeProgression: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema,
        type: performanceMetricTypeSchema,
        duration_seconds: z.number().optional(),
        timeframe_days: z.number().min(7).max(365).default(90),
      })
    )
    .query(async ({ input, ctx }) => {
      const { supabase, user } = ctx;

      // Fetch all logs for this metric
      let query = supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', user.id)
        .eq('category', input.category)
        .eq('type', input.type)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (input.duration_seconds) {
        query = query.eq('duration_seconds', input.duration_seconds);
      }

      const { data: logs, error } = await query;

      if (error) throw new Error(`Failed to fetch logs: ${error.message}`);

      // Use core package to analyze progression
      return analyzeProgression({
        logs: logs ?? [],
        category: input.category,
        type: input.type,
        duration_seconds: input.duration_seconds,
        timeframe_days: input.timeframe_days,
      });
    }),

  /**
   * Calculate power curve from logs.
   */
  getPowerCurve: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema,
        durations: z.array(z.number()).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { supabase, user } = ctx;

      const { data: logs, error } = await supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', user.id)
        .eq('category', input.category)
        .eq('type', 'power')
        .eq('is_active', true);

      if (error) throw new Error(`Failed to fetch power logs: ${error.message}`);

      return calculatePowerCurve({
        logs: logs ?? [],
        category: input.category,
        durations: input.durations,
      });
    }),

  /**
   * Calculate training load (CTL/ATL/TSB) using activities + metric logs.
   */
  getTrainingLoad: protectedProcedure
    .input(
      z.object({
        analysisDate: z.date().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { supabase, user } = ctx;

      // Fetch recent activities (last 42 days for CTL)
      const fortyTwoDaysAgo = new Date();
      fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42);

      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('*')
        .eq('profile_id', user.id)
        .gte('started_at', fortyTwoDaysAgo.toISOString())
        .order('started_at', { ascending: false });

      if (activitiesError) {
        throw new Error(`Failed to fetch activities: ${activitiesError.message}`);
      }

      // Fetch all active metric logs
      const { data: metricLogs, error: logsError } = await supabase
        .from('profile_performance_metric_logs')
        .select('*')
        .eq('profile_id', user.id)
        .eq('is_active', true);

      if (logsError) {
        throw new Error(`Failed to fetch metric logs: ${logsError.message}`);
      }

      // Use core package to calculate training load
      return calculateTrainingLoad({
        activities: activities ?? [],
        metricLogs: metricLogs ?? [],
        analysisDate: input.analysisDate,
      });
    }),
});
```

---

## 5. Data Flow & Integration

### 5.1 Integration with Existing Features

**Activities:**
- Completed activities can reference metric logs via `reference_activity_id`
- Training load analysis uses both activities (TSS from workouts) and metric logs (current FTP)
- Post-activity review can suggest creating metric logs from test efforts

**Training Plans:**
- Training plan structure (already exists) references target zones
- Zones computed dynamically from current metric logs
- Progressive plans adjust based on capability improvements

**Planned Activities:**
- Scheduled workouts use metric logs to set appropriate targets
- Post-workout adherence calculated using current capabilities

**Profile:**
- Profile FTP/threshold HR can be synced from metric logs
- Profile acts as fallback when no metric logs exist
- Migration path: seed initial metric logs from profile data

### 5.2 Dynamic Computation Examples

**Example 1: Current FTP**
```typescript
// No need for separate "goals" table - compute current capability on-demand
const currentFTP = await trpc.performanceMetrics.getCurrent.query({
  category: 'bike',
  type: 'power',
  duration_seconds: 3600,
});

// Use this for zone calculations, training plan targets, etc.
```

**Example 2: Training Load**
```typescript
// Compute CTL/ATL/TSB from activities + metric logs
const trainingLoad = await trpc.performanceMetrics.getTrainingLoad.query({});

// Returns: { ctl: 85, atl: 92, tsb: -7, trend: 'improving' }
// All computed dynamically - no separate storage needed
```

**Example 3: Progression Analysis**
```typescript
// Analyze FTP progression over last 90 days
const progression = await trpc.performanceMetrics.analyzeProgression.query({
  category: 'bike',
  type: 'power',
  duration_seconds: 3600,
  timeframe_days: 90,
});

// Returns: {
//   current: 275,
//   baseline: 250,
//   change: +25,
//   changePercent: +10%,
//   trend: 'improving',
//   ratePerWeek: +2.8,
//   projection30Days: 287
// }
```

### 5.3 Migration Strategy

1. **Seed initial data** from existing profile FTP/threshold HR
2. **Backfill historical data** from activity analysis (optional)
3. **Gradual adoption** - features work with or without metric logs
4. **Graceful fallback** - use profile values if no logs exist

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Create database migration for `profile_performance_metric_logs`
- [ ] Update Supabase types (`pnpm run supabase:gen-types`)
- [ ] Create core package schemas (leveraging Supabase types)
- [ ] Implement basic CRUD in tRPC router
- [ ] Test with manual entries

### Phase 2: Core Calculations (Week 2-3)
- [ ] Implement progression analysis in core package
- [ ] Implement power curve calculation
- [ ] Implement training load calculation (CTL/ATL/TSB)
- [ ] Add confidence score calculation
- [ ] Write comprehensive tests for calculations

### Phase 3: Mobile UI (Week 3-4)
- [ ] Manual entry form (modal)
- [ ] Capability overview screen (list current capabilities)
- [ ] Progression charts (per metric)
- [ ] Post-activity: suggest creating metric logs
- [ ] Integration with activity detail screen

### Phase 4: Web Dashboard (Week 4-5)
- [ ] Advanced analytics views
- [ ] Power curve visualization
- [ ] Training load charts (CTL/ATL/TSB over time)
- [ ] Historical progression analysis
- [ ] Export capabilities

### Phase 5: Auto-Detection (Week 5-6) - Optional
- [ ] Background job to detect test efforts in activities
- [ ] Suggest metric log creation from detected tests
- [ ] User approval flow before creating logs
- [ ] Confidence scoring for auto-detected values

### Phase 6: Polish & Optimization
- [ ] Performance optimization
- [ ] Error handling & edge cases
- [ ] User feedback & iteration
- [ ] Documentation

---

## Success Criteria

### MVP Success Metrics
- [ ] Users can manually log performance metrics
- [ ] Users can view current capabilities across standard durations
- [ ] Users can track progression over time with charts
- [ ] Training load (CTL/ATL/TSB) computed from activities + logs
- [ ] Core package has 100% test coverage for calculations
- [ ] Mobile and web UIs functional and intuitive

### Technical Success Criteria
- [ ] Single table implementation (no unnecessary complexity)
- [ ] Core package fully database-independent
- [ ] Supabase types properly leveraged
- [ ] Dynamic computation working correctly
- [ ] Integration with existing features seamless

---

## Notes

- **No goals table needed:** Goals can be computed as "target metric logs" or handled in UI state
- **No standard durations table needed:** Hardcoded constants in core package
- **Leverage existing data:** Activities, training plans, and profile provide rich context
- **Type safety:** Core package uses Supabase-generated types + Zod for validation
- **Keep it simple:** MVP focuses on single table + dynamic computation for maximum flexibility
