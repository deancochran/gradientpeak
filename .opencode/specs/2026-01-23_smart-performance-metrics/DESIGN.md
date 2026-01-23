# Smart Performance Metrics System - Design Document

**Created:** 2026-01-23  
**Status:** Design Phase  
**Separate From:** FIT File Implementation (2026-01-22)

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Goals & Requirements](#goals--requirements)
4. [System Architecture](#system-architecture)
5. [Power/Pace Curve Models](#powerpace-curve-models)
6. [Smart Metric Suggestions](#smart-metric-suggestions)
7. [Automatic TSS Recalculation](#automatic-tss-recalculation)
8. [Database Schema Changes](#database-schema-changes)
9. [API Design](#api-design)
10. [Implementation Phases](#implementation-phases)
11. [Testing Strategy](#testing-strategy)
12. [Performance Considerations](#performance-considerations)
13. [Future Enhancements](#future-enhancements)

---

## Overview

The Smart Performance Metrics System automates the management of interdependent performance metrics and ensures training load calculations remain accurate when athlete capabilities change. This system includes:

1. **Industry-standard power/pace curve modeling** using Critical Power and Critical Pace models
2. **Smart metric suggestions** that detect when related metrics should be updated
3. **Automatic TSS recalculation** for all affected activities when metrics change
4. **Curve-based metric derivation** to estimate related performance values

---

## Problem Statement

### Current Issues

1. **Metric Independence Problem**
   - When an athlete updates FTP (e.g., 240W → 260W), related metrics don't update automatically
   - Critical Power at 5min, 20min, etc. remain stale
   - Threshold heart rate, lactate threshold pace may also need updating
   - No system to detect or suggest these updates

2. **Historical Data Accuracy Problem**
   - TSS calculations for past activities use metrics that were current when the activity was recorded
   - If an athlete discovers their FTP was actually higher 3 months ago, all TSS values from that period are wrong
   - No mechanism to recalculate historical TSS values

3. **Incomplete Performance Profile Problem**
   - Athletes often only know FTP but not 5-second power, 5-minute power, etc.
   - Industry-standard models (Critical Power) can estimate these values
   - Missing opportunity to provide complete power/pace curves

### Real-World Example

```
Scenario:
- Athlete has FTP = 240W (recorded Jan 1)
- Does 50 activities in January with TSS calculated using 240W
- Tests FTP on Feb 1, discovers it's actually 250W
- Updates FTP to 250W on Feb 1

Problems:
1. All 50 January activities still show TSS based on 240W (too high)
2. 5-min power, 20-min power, etc. still reflect old fitness level
3. No suggestion to update LTHR or other related metrics
4. Athlete doesn't know what their 5-sec or 5-min power should be
```

---

## Goals & Requirements

### Primary Goals

1. **Accurate Historical Analysis**
   - TSS values should reflect the athlete's actual fitness at the time of each activity
   - When metrics are updated, affected activities should be recalculated

2. **Complete Performance Profiles**
   - Provide industry-standard power curve modeling (Critical Power model)
   - Derive missing metrics from known values
   - Support multi-duration metrics (1s, 5s, 1min, 5min, 20min, 60min power)

3. **Intelligent Suggestions**
   - Detect when one metric changes significantly
   - Suggest updates to related metrics based on physiological relationships
   - Learn from athlete's historical data

4. **User Control**
   - Suggestions should be optional
   - Manual overrides always possible
   - Clear visibility into what was auto-calculated vs. manually entered

### Non-Goals (Out of Scope)

- Automatic metric updates without user confirmation (too risky)
- Real-time FTP estimation during activities (handled by FIT file implementation)
- Machine learning models for metric prediction (use established sport science models)
- Integration with external platforms (Strava, TrainingPeaks) for metric import

---

## System Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Smart Metrics System                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────┐      ┌──────────────────────┐          │
│  │  Curve Modeling    │      │  Metric Suggestions  │          │
│  │  Engine            │─────▶│  Service             │          │
│  │                    │      │                      │          │
│  │ - Critical Power   │      │ - Detect changes     │          │
│  │ - Critical Pace    │      │ - Calculate related  │          │
│  │ - W' calculation   │      │ - Confidence scores  │          │
│  └────────────────────┘      └──────────────────────┘          │
│           │                            │                         │
│           └────────────┬───────────────┘                         │
│                        ▼                                         │
│           ┌────────────────────────┐                            │
│           │  Metric Update Service │                            │
│           │                        │                            │
│           │ - Apply updates        │                            │
│           │ - Trigger recalc       │                            │
│           │ - Audit trail          │                            │
│           └────────────────────────┘                            │
│                        │                                         │
│                        ▼                                         │
│           ┌────────────────────────┐                            │
│           │  TSS Recalculation     │                            │
│           │  Job Queue             │                            │
│           │                        │                            │
│           │ - Find affected        │                            │
│           │ - Recalculate TSS      │                            │
│           │ - Update activities    │                            │
│           └────────────────────────┘                            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Updates FTP
      │
      ▼
1. Metric Update Service
   - Validates new value
   - Creates new metric log entry
   - Records old value for audit
      │
      ▼
2. Curve Modeling Engine
   - Analyzes athlete's power curve data
   - Calculates CP (Critical Power)
   - Calculates W' (anaerobic capacity)
      │
      ▼
3. Metric Suggestions Service
   - Derives related metrics from curve
   - Compares to current values
   - Generates suggestions with confidence scores
      │
      ▼
4. User Reviews & Accepts Suggestions
      │
      ▼
5. TSS Recalculation Job
   - Finds all activities after metric date
   - Recalculates TSS using new FTP
   - Updates activity records
   - Marks activities as "recalculated"
```

---

## Power/Pace Curve Models

### Critical Power Model

The **Critical Power (CP) model** is the industry-standard approach for modeling the power-duration relationship. It's based on decades of exercise physiology research.

#### Mathematical Model

The two-parameter hyperbolic model:

```
P(t) = CP + W' / t

Where:
- P(t) = sustainable power for duration t
- CP = Critical Power (sustainable indefinitely, ~FTP)
- W' = Anaerobic Work Capacity (finite energy above CP, in joules)
- t = duration in seconds
```

#### Example Calculation

```
Given an athlete's best efforts:
- 1200W @ 5 seconds
- 450W @ 5 minutes (300s)
- 255W @ 60 minutes (3600s)

Solve for CP and W':
Using least-squares regression on the hyperbolic curve:

CP ≈ 250W
W' ≈ 18,000 J

This allows estimation of power at any duration:
- 1 minute: 250 + 18000/60 = 550W
- 20 minutes: 250 + 18000/1200 = 265W
```

#### Implementation

```typescript
// packages/core/calculations/critical-power.ts

interface PowerDurationPoint {
  duration_seconds: number;
  power_watts: number;
}

interface CriticalPowerModel {
  cp: number; // Critical Power (watts)
  w_prime: number; // Anaerobic Work Capacity (joules)
  r_squared: number; // Model fit quality (0-1)
  data_points: number; // Number of efforts used
}

/**
 * Calculate Critical Power model from athlete's best efforts
 *
 * Uses two-parameter hyperbolic model: P(t) = CP + W'/t
 * Solved using least-squares regression
 *
 * @param efforts - Array of best power efforts at various durations
 * @returns Critical Power model with CP and W'
 */
export function calculateCriticalPowerModel(
  efforts: PowerDurationPoint[],
): CriticalPowerModel {
  // Minimum 3 data points for reliable model
  if (efforts.length < 3) {
    throw new Error("Need at least 3 efforts for CP model");
  }

  // Convert to linear form: W = CP * t + W'
  // Where W = total work (power * time)
  const linearData = efforts.map((e) => ({
    duration: e.duration_seconds,
    work: e.power_watts * e.duration_seconds,
  }));

  // Linear regression: W = CP * t + W'
  const {
    slope: cp,
    intercept: w_prime,
    r_squared,
  } = linearRegression(
    linearData.map((d) => d.duration),
    linearData.map((d) => d.work),
  );

  return {
    cp: Math.round(cp * 10) / 10,
    w_prime: Math.round(w_prime),
    r_squared,
    data_points: efforts.length,
  };
}

/**
 * Predict power for a given duration using CP model
 */
export function predictPowerAtDuration(
  model: CriticalPowerModel,
  duration_seconds: number,
): number {
  return model.cp + model.w_prime / duration_seconds;
}

/**
 * Estimate FTP from Critical Power
 * FTP is typically 95-100% of CP, default to 95%
 */
export function estimateFTPFromCP(cp: number): number {
  return Math.round(cp * 0.95);
}
```

### Critical Pace Model (Running)

Similar to Critical Power but for running pace:

```
s(t) = CS + D' / t

Where:
- s(t) = sustainable speed for duration t (m/s)
- CS = Critical Speed (sustainable speed, ~threshold pace)
- D' = Distance capacity above CS (meters)
- t = duration in seconds
```

Implementation follows same pattern as Critical Power.

### Standard Durations

Industry-standard test durations for power/pace curves:

```typescript
// packages/core/constants/performance-metrics.ts

export const STANDARD_TEST_DURATIONS = {
  // Sprint capabilities
  PEAK_POWER_5S: 5,
  PEAK_POWER_15S: 15,
  PEAK_POWER_30S: 30,

  // Anaerobic capacity
  ANAEROBIC_1MIN: 60,
  ANAEROBIC_2MIN: 120,

  // VO2max
  VO2MAX_3MIN: 180,
  VO2MAX_5MIN: 300,
  VO2MAX_8MIN: 480,

  // Threshold
  THRESHOLD_20MIN: 1200,
  THRESHOLD_30MIN: 1800,
  FTP_60MIN: 3600,

  // Endurance (for pace curves)
  HALF_MARATHON: 5400, // 90 minutes
  MARATHON: 10800, // 180 minutes
} as const;

export const POWER_CURVE_DURATIONS = [
  5, 15, 30, 60, 120, 180, 300, 480, 1200, 1800, 3600,
];

export const PACE_CURVE_DURATIONS = [
  60, 300, 600, 1200, 1800, 3600, 5400, 10800,
];
```

---

## Smart Metric Suggestions

### Detection System

The system monitors metric changes and suggests related updates based on:

1. **Physiological Relationships**
   - FTP correlates with 5-min power, 20-min power
   - FTP changes typically indicate LTHR changes
   - VO2max power relates to FTP
2. **Historical Patterns**
   - Learn ratios from athlete's own data
   - Example: If athlete's 5-min power is typically 120% of FTP
3. **Sport Science Models**
   - Use established percentages (e.g., 5-min = 120% FTP, 20-min = 105% FTP)

### Suggestion Generation

```typescript
// packages/core/services/metric-suggestions.ts

interface MetricSuggestion {
  metric: {
    category: ActivityCategory;
    type: PerformanceMetricType;
    duration_seconds?: number;
  };
  current_value?: number;
  suggested_value: number;
  confidence: "high" | "medium" | "low";
  basis: "power_curve" | "historical_ratio" | "sport_science";
  explanation: string;
  auto_apply: boolean; // High confidence suggestions can be auto-applied
}

interface SuggestionContext {
  profile_id: string;
  updated_metric: {
    category: ActivityCategory;
    type: PerformanceMetricType;
    duration_seconds?: number;
    old_value: number;
    new_value: number;
    recorded_at: Date;
  };
  historical_metrics: ProfilePerformanceMetricLog[];
  recent_activities: Activity[];
}

/**
 * Generate smart suggestions when a metric is updated
 */
export async function generateMetricSuggestions(
  context: SuggestionContext,
): Promise<MetricSuggestion[]> {
  const suggestions: MetricSuggestion[] = [];

  // Example: FTP updated
  if (
    context.updated_metric.type === "power" &&
    context.updated_metric.duration_seconds === 3600 // FTP
  ) {
    // Build power curve from historical data
    const powerCurve = await buildPowerCurveFromActivities(
      context.profile_id,
      context.recent_activities,
    );

    // Calculate CP model
    const cpModel = calculateCriticalPowerModel(powerCurve);

    // Generate suggestions for other durations
    for (const duration of POWER_CURVE_DURATIONS) {
      if (duration === 3600) continue; // Skip FTP itself

      const predicted = predictPowerAtDuration(cpModel, duration);
      const current = findCurrentMetric(
        context.historical_metrics,
        "power",
        duration,
      );

      // Only suggest if significantly different or missing
      if (
        !current ||
        Math.abs(predicted - current.value) / current.value > 0.05
      ) {
        suggestions.push({
          metric: {
            category: "bike",
            type: "power",
            duration_seconds: duration,
          },
          current_value: current?.value,
          suggested_value: Math.round(predicted),
          confidence:
            cpModel.r_squared > 0.95
              ? "high"
              : cpModel.r_squared > 0.85
                ? "medium"
                : "low",
          basis: "power_curve",
          explanation: `Based on your power curve model (R²=${cpModel.r_squared.toFixed(3)})`,
          auto_apply: cpModel.r_squared > 0.95 && cpModel.data_points >= 5,
        });
      }
    }

    // Suggest LTHR update if FTP changed significantly
    const ftpChangePercent =
      (context.updated_metric.new_value - context.updated_metric.old_value) /
      context.updated_metric.old_value;

    if (Math.abs(ftpChangePercent) > 0.05) {
      const currentLTHR = findCurrentMetric(
        context.historical_metrics,
        "heart_rate",
        3600,
      );

      if (currentLTHR) {
        // Assume LTHR changes at ~50% the rate of FTP
        const suggestedLTHR = Math.round(
          currentLTHR.value * (1 + ftpChangePercent * 0.5),
        );

        suggestions.push({
          metric: {
            category: "bike",
            type: "heart_rate",
            duration_seconds: 3600,
          },
          current_value: currentLTHR.value,
          suggested_value: suggestedLTHR,
          confidence: "medium",
          basis: "sport_science",
          explanation: `FTP changed by ${(ftpChangePercent * 100).toFixed(1)}%, LTHR typically changes proportionally`,
          auto_apply: false, // Never auto-apply HR changes
        });
      }
    }
  }

  return suggestions;
}
```

### Suggestion UI Flow

```
1. User updates FTP from 240W → 260W

2. System generates suggestions:
   ┌─────────────────────────────────────────────────┐
   │ 🔍 Smart Suggestions                            │
   ├─────────────────────────────────────────────────┤
   │ Based on your updated FTP, we recommend         │
   │ updating these related metrics:                 │
   │                                                  │
   │ ✓ 5-minute power: 290W → 312W (high confidence)│
   │   Based on your power curve model               │
   │                                                  │
   │ ✓ 20-minute power: 250W → 270W (high confidence)│
   │   Based on your power curve model               │
   │                                                  │
   │ ⚠ LTHR: 165 bpm → 169 bpm (medium confidence)  │
   │   FTP increased 8.3%, LTHR typically changes    │
   │                                                  │
   │ [ Apply All ] [ Review Each ] [ Dismiss ]       │
   └─────────────────────────────────────────────────┘

3. User can:
   - Apply all suggestions
   - Review and selectively apply
   - Edit suggested values before applying
   - Dismiss all
```

---

## Automatic TSS Recalculation

### Trigger Conditions

TSS recalculation should be triggered when:

1. **Metric Update (Retroactive)**
   - User updates a metric with `recorded_at` in the past
   - All activities between `recorded_at` and today need recalculation
2. **Metric Correction**
   - User explicitly marks a metric as "correction" (vs. new improvement)
   - Indicates the old value was wrong, not that fitness changed
3. **Manual Recalculation Request**
   - User can manually trigger recalc for date range

### Affected Activities Query

```sql
-- Find all activities that need TSS recalculation
-- after FTP metric update

SELECT a.id, a.start_time, a.tss
FROM activities a
WHERE a.profile_id = :profile_id
  AND a.category = :metric_category  -- e.g., 'bike'
  AND a.start_time >= :metric_recorded_at
  AND a.start_time < NOW()
  AND a.tss IS NOT NULL  -- Only recalc if TSS was already calculated
ORDER BY a.start_time ASC;
```

### Recalculation Job

```typescript
// packages/core/services/tss-recalculation.ts

interface RecalculationJob {
  id: string;
  profile_id: string;
  trigger_metric_id: string;
  trigger_metric_type: "ftp" | "lthr" | "threshold_pace";
  old_value: number;
  new_value: number;
  recorded_at: Date;
  status: "pending" | "in_progress" | "completed" | "failed";
  affected_activity_count: number;
  processed_activity_count: number;
  created_at: Date;
  completed_at?: Date;
  error?: string;
}

/**
 * Queue TSS recalculation job for all affected activities
 */
export async function queueTSSRecalculation(
  profileId: string,
  metricUpdate: {
    id: string;
    category: ActivityCategory;
    type: PerformanceMetricType;
    duration_seconds?: number;
    old_value: number;
    new_value: number;
    recorded_at: Date;
  },
): Promise<RecalculationJob> {
  // Only certain metrics affect TSS
  const affectsTSS =
    (metricUpdate.type === "power" && metricUpdate.duration_seconds === 3600) ||
    (metricUpdate.type === "heart_rate" &&
      metricUpdate.duration_seconds === 3600) ||
    (metricUpdate.type === "pace" && metricUpdate.duration_seconds === 3600);

  if (!affectsTSS) {
    throw new Error("Metric does not affect TSS calculations");
  }

  // Find affected activities
  const affectedActivities = await findAffectedActivities(
    profileId,
    metricUpdate.category,
    metricUpdate.recorded_at,
  );

  // Create job record
  const job: RecalculationJob = {
    id: generateId(),
    profile_id: profileId,
    trigger_metric_id: metricUpdate.id,
    trigger_metric_type: getTriggerType(metricUpdate),
    old_value: metricUpdate.old_value,
    new_value: metricUpdate.new_value,
    recorded_at: metricUpdate.recorded_at,
    status: "pending",
    affected_activity_count: affectedActivities.length,
    processed_activity_count: 0,
    created_at: new Date(),
  };

  // Queue for background processing
  await backgroundJobQueue.add("recalculate-tss", job);

  return job;
}

/**
 * Process TSS recalculation job
 * Runs as background job to avoid blocking user
 */
export async function processTSSRecalculationJob(
  job: RecalculationJob,
): Promise<void> {
  try {
    // Update job status
    await updateJobStatus(job.id, "in_progress");

    // Find all affected activities
    const activities = await findAffectedActivities(
      job.profile_id,
      job.trigger_metric_type,
      job.recorded_at,
    );

    // Process in batches to avoid memory issues
    const BATCH_SIZE = 50;
    for (let i = 0; i < activities.length; i += BATCH_SIZE) {
      const batch = activities.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map((activity) => recalculateActivityTSS(activity, job)),
      );

      // Update progress
      await updateJobProgress(job.id, i + batch.length);
    }

    // Mark complete
    await updateJobStatus(job.id, "completed", {
      completed_at: new Date(),
    });

    // Notify user
    await notifyJobComplete(job);
  } catch (error) {
    await updateJobStatus(job.id, "failed", {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Recalculate TSS for a single activity
 */
async function recalculateActivityTSS(
  activity: Activity,
  job: RecalculationJob,
): Promise<void> {
  // Fetch the metric value that was current at activity time
  const metricAtActivityTime = await getMetricAtDate(
    job.profile_id,
    job.trigger_metric_type,
    activity.start_time,
  );

  if (!metricAtActivityTime) {
    // No metric available at this time, skip
    return;
  }

  // Recalculate TSS based on metric type
  let newTSS: number;

  if (job.trigger_metric_type === "ftp") {
    // TSS = (duration * NP * IF) / (FTP * 3600) * 100
    // Need to fetch activity's NP (normalized power)
    const np = activity.normalized_power;
    if (!np) return;

    const ftp = metricAtActivityTime.value;
    const intensity_factor = np / ftp;
    const duration_hours = activity.moving_time_seconds / 3600;

    newTSS = Math.round(((duration_hours * np * intensity_factor) / ftp) * 100);
  } else if (job.trigger_metric_type === "lthr") {
    // HRSS calculation using LTHR
    const avgHR = activity.average_heart_rate;
    if (!avgHR) return;

    const lthr = metricAtActivityTime.value;
    const duration_hours = activity.moving_time_seconds / 3600;

    // Simplified HRSS: (duration * avg_hr / lthr)^2 * duration * 100
    newTSS = Math.round(Math.pow(avgHR / lthr, 2) * duration_hours * 100);
  }

  // Store old TSS for audit trail
  const oldTSS = activity.tss;

  // Update activity
  await updateActivity(activity.id, {
    tss: newTSS,
    tss_recalculated_at: new Date(),
    tss_recalculation_job_id: job.id,
    tss_old_value: oldTSS,
  });
}
```

### User Notification

When recalculation completes:

```
┌─────────────────────────────────────────────────┐
│ ✅ TSS Recalculation Complete                   │
├─────────────────────────────────────────────────┤
│ Your FTP update from 240W to 260W on Jan 15    │
│ triggered recalculation of 47 activities.       │
│                                                  │
│ Summary:                                         │
│ • Activities updated: 47                         │
│ • Date range: Jan 15 - Jan 23                   │
│ • Average TSS change: -8.3%                     │
│                                                  │
│ [ View Updated Activities ] [ Dismiss ]         │
└─────────────────────────────────────────────────┘
```

---

## Database Schema Changes

### New Tables

#### 1. `metric_recalculation_jobs`

Tracks TSS recalculation background jobs.

```sql
CREATE TABLE metric_recalculation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Trigger information
  trigger_metric_id UUID NOT NULL REFERENCES profile_performance_metric_logs(id),
  trigger_metric_type TEXT NOT NULL,
  old_value NUMERIC NOT NULL,
  new_value NUMERIC NOT NULL,
  metric_recorded_at TIMESTAMPTZ NOT NULL,

  -- Job status
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  affected_activity_count INTEGER NOT NULL DEFAULT 0,
  processed_activity_count INTEGER NOT NULL DEFAULT 0,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  CONSTRAINT valid_counts CHECK (processed_activity_count <= affected_activity_count)
);

CREATE INDEX idx_recalc_jobs_profile ON metric_recalculation_jobs(profile_id, created_at DESC);
CREATE INDEX idx_recalc_jobs_status ON metric_recalculation_jobs(status) WHERE status IN ('pending', 'in_progress');
```

#### 2. `metric_suggestions`

Stores generated metric suggestions for user review.

```sql
CREATE TABLE metric_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Trigger metric
  trigger_metric_id UUID NOT NULL REFERENCES profile_performance_metric_logs(id),

  -- Suggested metric
  category activity_category NOT NULL,
  type performance_metric_type NOT NULL,
  duration_seconds INTEGER,

  -- Values
  current_value NUMERIC,
  suggested_value NUMERIC NOT NULL,

  -- Metadata
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  basis TEXT NOT NULL CHECK (basis IN ('power_curve', 'historical_ratio', 'sport_science')),
  explanation TEXT NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'dismissed')),
  applied_metric_id UUID REFERENCES profile_performance_metric_logs(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_metric_suggestions_profile ON metric_suggestions(profile_id, status, created_at DESC);
```

### Schema Modifications

#### Update `activities` table

Add columns to track TSS recalculations:

```sql
ALTER TABLE activities
ADD COLUMN tss_recalculated_at TIMESTAMPTZ,
ADD COLUMN tss_recalculation_job_id UUID REFERENCES metric_recalculation_jobs(id),
ADD COLUMN tss_old_value NUMERIC;

CREATE INDEX idx_activities_tss_recalc ON activities(tss_recalculation_job_id)
WHERE tss_recalculation_job_id IS NOT NULL;
```

#### Update `profile_performance_metric_logs` table

Add columns to track metric relationships:

```sql
ALTER TABLE profile_performance_metric_logs
ADD COLUMN is_correction BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'activity_detection', 'curve_model', 'suggestion')),
ADD COLUMN source_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
ADD COLUMN parent_metric_id UUID REFERENCES profile_performance_metric_logs(id) ON DELETE SET NULL;

-- is_correction: true if this metric corrects historical data (triggers TSS recalc)
-- source: how this metric was created
-- source_activity_id: activity that generated this metric (if auto-detected)
-- parent_metric_id: if derived from another metric (e.g., 5-min power from FTP)
```

---

## API Design

### tRPC Endpoints

#### Profile Performance Metrics Router Extensions

```typescript
// packages/trpc/src/routers/profile-performance-metrics.ts

export const profilePerformanceMetricsRouter = createTRPCRouter({
  // ... existing endpoints ...

  /**
   * Update metric with optional TSS recalculation
   */
  updateWithRecalc: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        value: z.number().positive(),
        recorded_at: z.date(),
        is_correction: z.boolean().default(false),
        trigger_tss_recalc: z.boolean().default(true),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, session } = ctx;

      // Fetch old metric value
      const { data: oldMetric } = await supabase
        .from("profile_performance_metric_logs")
        .select("*")
        .eq("id", input.id)
        .eq("profile_id", session.user.id)
        .single();

      if (!oldMetric) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Update metric
      const { data: updatedMetric } = await supabase
        .from("profile_performance_metric_logs")
        .update({
          value: input.value,
          recorded_at: input.recorded_at.toISOString(),
          is_correction: input.is_correction,
          notes: input.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select()
        .single();

      // Generate suggestions
      const suggestions = await generateMetricSuggestions({
        profile_id: session.user.id,
        updated_metric: {
          category: oldMetric.category,
          type: oldMetric.type,
          duration_seconds: oldMetric.duration_seconds,
          old_value: oldMetric.value,
          new_value: input.value,
          recorded_at: input.recorded_at,
        },
        historical_metrics: [], // Fetch from DB
        recent_activities: [], // Fetch from DB
      });

      // Queue TSS recalculation if requested
      let recalcJob = null;
      if (input.trigger_tss_recalc && input.is_correction) {
        recalcJob = await queueTSSRecalculation(session.user.id, {
          id: input.id,
          category: oldMetric.category,
          type: oldMetric.type,
          duration_seconds: oldMetric.duration_seconds,
          old_value: oldMetric.value,
          new_value: input.value,
          recorded_at: input.recorded_at,
        });
      }

      return {
        metric: updatedMetric,
        suggestions,
        recalculation_job: recalcJob,
      };
    }),

  /**
   * Generate power/pace curve model
   */
  generateCurveModel: protectedProcedure
    .input(
      z.object({
        category: performanceMetricCategorySchema,
        type: performanceMetricTypeSchema,
        start_date: z.date().optional(),
        end_date: z.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Fetch best efforts from activities
      const efforts = await fetchBestEfforts(
        ctx.session.user.id,
        input.category,
        input.type,
        input.start_date,
        input.end_date,
      );

      if (input.type === "power") {
        const cpModel = calculateCriticalPowerModel(efforts);

        // Generate curve data for visualization
        const curve = POWER_CURVE_DURATIONS.map((duration) => ({
          duration_seconds: duration,
          predicted_power: predictPowerAtDuration(cpModel, duration),
          actual_best: efforts.find((e) => e.duration_seconds === duration)
            ?.power_watts,
        }));

        return {
          model: cpModel,
          curve,
          estimated_ftp: estimateFTPFromCP(cpModel.cp),
        };
      }

      // Similar for pace curves
    }),

  /**
   * Get metric suggestions
   */
  getSuggestions: protectedProcedure
    .input(
      z.object({
        metric_id: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const suggestions = await ctx.supabase
        .from("metric_suggestions")
        .select("*")
        .eq("trigger_metric_id", input.metric_id)
        .eq("profile_id", ctx.session.user.id)
        .eq("status", "pending")
        .order("confidence", { ascending: false });

      return suggestions.data;
    }),

  /**
   * Apply metric suggestion
   */
  applySuggestion: protectedProcedure
    .input(
      z.object({
        suggestion_id: z.string().uuid(),
        override_value: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch suggestion
      const { data: suggestion } = await ctx.supabase
        .from("metric_suggestions")
        .select("*")
        .eq("id", input.suggestion_id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!suggestion) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Create new metric
      const value = input.override_value || suggestion.suggested_value;
      const { data: newMetric } = await ctx.supabase
        .from("profile_performance_metric_logs")
        .insert({
          profile_id: ctx.session.user.id,
          category: suggestion.category,
          type: suggestion.type,
          duration_seconds: suggestion.duration_seconds,
          value,
          unit: METRIC_UNITS[suggestion.type],
          source: "suggestion",
          parent_metric_id: suggestion.trigger_metric_id,
          notes: `Applied from suggestion: ${suggestion.explanation}`,
        })
        .select()
        .single();

      // Mark suggestion as accepted
      await ctx.supabase
        .from("metric_suggestions")
        .update({
          status: "accepted",
          applied_metric_id: newMetric.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", input.suggestion_id);

      return newMetric;
    }),

  /**
   * Get TSS recalculation job status
   */
  getRecalculationJob: protectedProcedure
    .input(
      z.object({
        job_id: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data: job } = await ctx.supabase
        .from("metric_recalculation_jobs")
        .select("*")
        .eq("id", input.job_id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      return job;
    }),
});
```

---

## Implementation Phases

### Phase 1: Critical Power Model (Week 1-2)

**Goal:** Implement power curve modeling

- [ ] Create `@repo/core/calculations/critical-power.ts`
- [ ] Implement CP model calculation (least-squares regression)
- [ ] Implement power prediction at any duration
- [ ] Add tests for CP calculations
- [ ] Create tRPC endpoint `generateCurveModel`
- [ ] Build UI to visualize power curve

**Deliverables:**

- Working CP model calculation
- API endpoint to generate curve
- Basic visualization

### Phase 2: Metric Suggestions (Week 3-4)

**Goal:** Detect metric changes and suggest updates

- [ ] Create database tables (`metric_suggestions`)
- [ ] Implement `generateMetricSuggestions` service
- [ ] Create suggestion detection logic
- [ ] Build UI for reviewing suggestions
- [ ] Add tRPC endpoints for suggestions
- [ ] Test suggestion accuracy

**Deliverables:**

- Suggestion generation system
- Review UI
- API endpoints

### Phase 3: TSS Recalculation (Week 5-6)

**Goal:** Automatically recalculate TSS when metrics change

- [ ] Create database tables (`metric_recalculation_jobs`)
- [ ] Add activity schema updates
- [ ] Implement background job queue
- [ ] Create `queueTSSRecalculation` service
- [ ] Implement `processTSSRecalculationJob`
- [ ] Build progress tracking UI
- [ ] Add user notifications

**Deliverables:**

- Background job system
- TSS recalculation logic
- Progress UI

### Phase 4: Critical Pace Model (Week 7)

**Goal:** Extend to running metrics

- [ ] Implement Critical Speed model
- [ ] Add pace curve calculations
- [ ] Update UI for pace curves
- [ ] Test with running data

**Deliverables:**

- CS model for running
- Pace curve visualization

### Phase 5: Polish & Testing (Week 8)

**Goal:** Production-ready system

- [ ] Performance optimization
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] Error handling
- [ ] User feedback integration

---

## Testing Strategy

### Unit Tests

```typescript
// packages/core/calculations/__tests__/critical-power.test.ts

describe("Critical Power Model", () => {
  it("should calculate CP and W' from power data", () => {
    const efforts = [
      { duration_seconds: 5, power_watts: 1200 },
      { duration_seconds: 60, power_watts: 550 },
      { duration_seconds: 300, power_watts: 450 },
      { duration_seconds: 1200, power_watts: 315 },
      { duration_seconds: 3600, power_watts: 280 },
    ];

    const model = calculateCriticalPowerModel(efforts);

    expect(model.cp).toBeCloseTo(275, 0);
    expect(model.w_prime).toBeGreaterThan(15000);
    expect(model.w_prime).toBeLessThan(20000);
    expect(model.r_squared).toBeGreaterThan(0.95);
  });

  it("should predict power at any duration", () => {
    const model = {
      cp: 250,
      w_prime: 18000,
      r_squared: 0.98,
      data_points: 5,
    };

    const power_20min = predictPowerAtDuration(model, 1200);
    expect(power_20min).toBeCloseTo(265, 0);

    const power_5min = predictPowerAtDuration(model, 300);
    expect(power_5min).toBeCloseTo(310, 0);
  });
});
```

### Integration Tests

```typescript
// Test metric suggestion generation
describe("Metric Suggestions", () => {
  it("should suggest related metrics when FTP updates", async () => {
    // Setup: Create profile with FTP and activities
    const profile = await createTestProfile();
    const oldFTP = await createMetric(profile.id, {
      type: "power",
      duration_seconds: 3600,
      value: 240,
      recorded_at: new Date("2026-01-01"),
    });

    // Update FTP
    const newFTP = await updateMetric(oldFTP.id, {
      value: 260,
      recorded_at: new Date("2026-01-15"),
    });

    // Generate suggestions
    const suggestions = await generateMetricSuggestions({
      profile_id: profile.id,
      updated_metric: newFTP,
      historical_metrics: [],
      recent_activities: [],
    });

    // Should suggest 5-min, 20-min power updates
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.metric.duration_seconds === 300)).toBe(
      true,
    );
    expect(suggestions.some((s) => s.metric.duration_seconds === 1200)).toBe(
      true,
    );
  });
});
```

### End-to-End Tests

```typescript
// Test full TSS recalculation flow
describe("TSS Recalculation", () => {
  it("should recalculate TSS for all affected activities", async () => {
    // Setup: Create profile, FTP, and activities
    const profile = await createTestProfile();
    await createMetric(profile.id, {
      type: "power",
      duration_seconds: 3600,
      value: 240,
      recorded_at: new Date("2026-01-01"),
    });

    // Create activities with TSS based on FTP=240
    const activities = await createTestActivities(profile.id, 10);

    // Update FTP retroactively (correction)
    const job = await updateMetricWithRecalc(profile.id, {
      value: 260,
      recorded_at: new Date("2026-01-01"),
      is_correction: true,
      trigger_tss_recalc: true,
    });

    // Wait for job to complete
    await waitForJobCompletion(job.id);

    // Verify all activities were updated
    const updatedActivities = await fetchActivities(profile.id);
    expect(updatedActivities.every((a) => a.tss_recalculated_at !== null)).toBe(
      true,
    );

    // Verify TSS values changed
    const oldTSS = activities[0].tss;
    const newTSS = updatedActivities[0].tss;
    expect(newTSS).not.toBe(oldTSS);
    expect(newTSS).toBeLessThan(oldTSS); // Higher FTP = lower TSS
  });
});
```

---

## Performance Considerations

### Optimization Strategies

1. **Batch Processing**
   - Process activities in batches of 50
   - Avoid loading all activities into memory
   - Use database cursors for large datasets

2. **Background Jobs**
   - Use job queue (Bull/BullMQ) for recalculations
   - Never block user requests
   - Provide progress updates

3. **Caching**
   - Cache CP model calculations (invalidate on new activities)
   - Cache metric lookups at specific dates
   - Use Redis for frequently accessed data

4. **Database Indexes**
   - Index on `(profile_id, category, type, duration_seconds, recorded_at DESC)`
   - Index on `(profile_id, start_time)` for activity lookups
   - Partial indexes for pending jobs

5. **Query Optimization**
   - Use temporal index for "metric at date" queries
   - Limit curve calculations to last 42 days by default
   - Aggregate statistics at database level

### Scalability

- **Expected Load:** 1000 users, 100 metric updates/day, 10 TSS recalc jobs/day
- **Job Duration:** ~1 second per activity, max 50 activities per batch
- **Storage:** Minimal overhead (~100 bytes per suggestion, ~500 bytes per job)

---

## Future Enhancements

### Phase 6+

1. **Advanced Models**
   - 3-parameter CP model (Pmax addition)
   - W' balance tracking during activities
   - Fatigue-adjusted CP model

2. **Machine Learning**
   - Learn personalized metric ratios
   - Predict training adaptations
   - Anomaly detection for suspicious metrics

3. **Integration**
   - Import power curves from TrainingPeaks
   - Sync FTP changes to Strava
   - Export to WKO5 format

4. **Analytics**
   - Trend analysis of CP/W' over time
   - Training load impact on CP model
   - Recovery time prediction

5. **Multi-Sport**
   - Swim critical speed models
   - Strength training metrics
   - Triathlon-specific multi-discipline curves

---

## References

### Sport Science Literature

1. Monod, H., & Scherrer, J. (1965). "The work capacity of a synergic muscular group"
2. Jones, A. M., et al. (2010). "Critical power: Implications for determination of VO2max and exercise tolerance"
3. Coggan, A. (2003). "Training and racing using a power meter" (TSS methodology)

### Industry Tools

- TrainingPeaks: Critical Power charts, TSS calculations
- WKO5: Power Duration model, mFTP
- Intervals.icu: Power curve, FTP estimation
- Golden Cheetah: CP model, W' balance

### GradientPeak Internal

- FIT File Implementation Spec (2026-01-22)
- Activity Processing Documentation
- TSS Calculation Reference (`packages/core/calculations/tss.ts`)

---

## Conclusion

This Smart Performance Metrics System provides:

1. **Industry-standard curve modeling** using Critical Power/Pace models
2. **Intelligent suggestions** based on physiological relationships
3. **Automatic TSS recalculation** to maintain historical accuracy
4. **Complete performance profiles** derived from minimal input

The system ensures that GradientPeak provides accurate training load tracking and actionable performance insights while reducing manual data entry burden on athletes.
