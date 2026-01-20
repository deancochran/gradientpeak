# Performance Metrics Platform - Technical Specification

## Vision

We are building an independent performance metrics platform that serves as the central intelligence layer for athlete training data. This platform stands as its own service, capable of tracking and managing athletic performance metrics across multiple sports while seamlessly integrating with major third-party providers like Garmin, Wahoo, Strava, and TrainingPeaks.

The platform receives training data from multiple sources—our mobile application, third-party integrations, and direct API connections—and intelligently processes this information to track athlete progression, calculate training load, and provide actionable insights. It operates as a communication hub, actively pushing updates back to our application whenever performance metrics change or new insights are discovered.

## Problem Statement

Our current architecture treats athlete capabilities as static snapshots embedded within each activity record. When an athlete completes a workout, we copy their entire profile—FTP, weight, heart rate thresholds—directly into that activity's data. This creates several critical issues:
- Data duplication across hundreds of activities per athlete
- Performance bottlenecks in training load calculations
- No separation between activity data and athlete capabilities
- Inability to integrate with third-party services that don't provide profile data
- No retroactive recalculation when athlete discovers metric errors

## Platform Architecture

### Core Principle

The platform operates on a fundamental separation of concerns: **activities record what happened during training; metrics define who the athlete is.**

By decoupling these two concepts, we create a system that can track athletic evolution over time, intelligently default missing information, and serve as a single source of truth for performance data across multiple applications and integrations.

### Platform Capabilities

**Independent Service Operation**
The metrics platform runs as a standalone service with its own database, business logic, and API layer. It can operate independently of our main application, receiving data from any authorized source and serving metrics to any authorized consumer.

**Multi-Source Data Ingestion**
The platform accepts training data from:
- Our mobile application (direct activity uploads)
- Third-party services via webhook integrations (Strava, Garmin, TrainingPeaks, Wahoo)
- Direct API calls from external applications
- Manual entry through web interfaces

**Intelligent Metric Management**
When the platform receives activity data, it automatically determines which performance metrics to use, generates intelligent defaults when metrics are missing, and analyzes the activity to detect potential performance improvements.

**Active Communication**
The platform doesn't wait to be queried. When it discovers new insights—a detected FTP improvement, a suspicious training load pattern, or a suggested metric update—it actively communicates back to our application through webhooks or message queues, ensuring the athlete's training dashboard reflects the most current information.

---

## Data Model

### Performance Metrics Storage

The platform maintains a historical record of each athlete's capabilities. This includes power thresholds for cycling (FTP at various durations), pace thresholds for running (threshold pace for different distances), and heart rate zones across all sports.

Each metric entry captures not just the value itself, but also important context: when it was recorded, where it came from (manual entry, detected from activity, imported from third-party service, or system-generated estimate).

The platform indexes this data to quickly answer questions like "What was this athlete's FTP when they completed this ride three months ago?" or "What are their current running pace zones?"

#### Table: `profile_performance_metric_logs`

**Purpose:** Track athlete performance capabilities over time for creating performance curves and calculating training zones.

**Core Fields:**
- **Identity:** id, profile_id
- **Metrics:** category (bike/run/swim/row/other), type (power/pace/speed/heart_rate), value, unit, duration_seconds
- **Provenance:** source (manual/test/race/calculated/estimated/adjusted), reference_activity_id, calculation_method
- **Context:** environmental_conditions (JSONB), notes
- **Lifecycle:** is_active, superseded_by, valid_until
- **Metadata:** created_at, updated_at

**Key Constraints:**
- Value must be positive
- Duration must be positive
- Source limited to predefined options
- Profile foreign key with cascade delete

**Indexes for Performance:**
- Active logs by profile
- Metric lookup by profile/category/type/duration
- Temporal queries by created_at
- Reference activity lookup
- Environmental conditions (GIN)

**Example Data:**
- FTP progression (bike, power, 60min): 240W → 250W → 255W
- 5K pace (run, pace, 1200s): 4:30/km → 4:20/km
- Threshold heart rate (bike, heart_rate, 60min): 165 bpm → 168 bpm

### Profile Metrics Storage

Separate from performance capabilities, the platform tracks biometric and lifestyle factors: body weight, resting heart rate, sleep duration, heart rate variability, stress levels, and muscle soreness. These metrics provide context for training decisions and recovery recommendations but don't directly determine training zones.

#### Table: `profile_metric_logs`

**Purpose:** Track biometric and lifestyle metrics that influence training but can't be used for performance curves.

**Core Fields:**
- **Identity:** id, profile_id, metric_type, value, unit
- **Types:** weight_kg, resting_hr_bpm, sleep_hours, hrv_ms, vo2_max, body_fat_pct, hydration_level, stress_score, soreness_level
- **Provenance:** source (manual/device/calculated), reference_activity_id (optional), notes
- **Lifecycle:** recorded_at (timestamp for the metric), created_at, updated_at

**Key Constraints:**
- Value must be appropriate for metric type (positive, within ranges)
- Metric type limited to predefined options
- Profile foreign key with cascade delete
- Recorded_at allows backdating entries

**Indexes for Performance:**
- Logs by profile and metric type
- Logs by recorded_at for time-series queries
- Reference activity lookup (optional)

**Example Data:**
- weight_kg: 75.0 → 74.5 → 74.8
- sleep_hours: 7.5 → 8.0 → 6.5
- resting_hr_bpm: 52 → 50 → 51
- hrv_ms: 65 → 68 → 62

**SQL Schema:**
```sql
CREATE TYPE profile_metric_type AS ENUM (
  'weight_kg',
  'resting_hr_bpm',
  'sleep_hours',
  'hrv_ms',
  'vo2_max',
  'body_fat_pct',
  'hydration_level',
  'stress_score',
  'soreness_level',
  'wellness_score'
);

CREATE TYPE metric_source AS ENUM (
  'manual',
  'device',
  'calculated',
  'estimated'
);

CREATE TABLE profile_metric_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  metric_type profile_metric_type NOT NULL,
  value NUMERIC NOT NULL CHECK (value >= 0),
  unit TEXT NOT NULL,
  source metric_source NOT NULL DEFAULT 'manual',
  reference_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL, -- When the metric was measured
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_profile_metric_logs_profile_type_date
  ON profile_metric_logs(profile_id, metric_type, recorded_at DESC);
CREATE INDEX idx_profile_metric_logs_recorded_at
  ON profile_metric_logs(recorded_at DESC);
CREATE INDEX idx_profile_metric_logs_reference_activity
  ON profile_metric_logs(reference_activity_id)
  WHERE reference_activity_id IS NOT NULL;

-- RLS policies
ALTER TABLE profile_metric_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own metric logs"
  ON profile_metric_logs FOR SELECT
  USING (auth.uid() IN (SELECT id FROM profiles WHERE id = profile_id));

CREATE POLICY "Users can insert their own metric logs"
  ON profile_metric_logs FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE id = profile_id));

CREATE POLICY "Users can update their own metric logs"
  ON profile_metric_logs FOR UPDATE
  USING (auth.uid() IN (SELECT id FROM profiles WHERE id = profile_id));

CREATE POLICY "Users can delete their own metric logs"
  ON profile_metric_logs FOR DELETE
  USING (auth.uid() IN (SELECT id FROM profiles WHERE id = profile_id));
```

**Metric Type Specifications:**
- `weight_kg`: Body weight in kilograms (40-300)
- `resting_hr_bpm`: Resting heart rate in beats per minute (30-120)
- `sleep_hours`: Hours of sleep (0-24, decimal)
- `hrv_ms`: Heart rate variability in milliseconds (0-300)
- `vo2_max`: VO2 max in ml/kg/min (20-90)
- `body_fat_pct`: Body fat percentage (3-60)
- `hydration_level`: Hydration level 1-10 scale
- `stress_score`: Stress level 1-10 scale
- `soreness_level`: Muscle soreness 1-10 scale
- `wellness_score`: Overall wellness 1-10 scale

### Activity Data Structure

Activities in the platform are simplified to contain only the essential training data: what sport was performed, how long it lasted, distance covered, and the raw data streams (power output over time, heart rate progression, pace variations).

Critically, activities no longer duplicate profile information. Instead, they maintain a simple reference to which profile performed the activity. They also store pre-calculated training metrics—Training Stress Score, Intensity Factor, Normalized Power—computed once when the activity is uploaded and saved for efficient future queries.

The platform remembers which performance metric values were used to calculate these training metrics, allowing it to understand the context of historical workouts even as the athlete's capabilities evolve.

**Migration: Remove Profile Snapshots from Activities**

**Current State:** Activities store `profile_snapshot` JSONB with FTP, weight_kg, threshold_hr, age at time of activity.

**New Approach:** Activities reference `profile_id` and query metric logs for calculations.

**Benefits:**
1. **Retroactive Recalculation:** Update historical FTP → recalculate all TSS/IF scores automatically
2. **Single Source of Truth:** Profile and biometric data in one place, not duplicated across activities
3. **Efficient Third-Party Integrations:** Strava/Wahoo imports only store activity data, not profile snapshots
4. **Temporal Queries:** "What was my FTP on 2024-03-15?" → query performance metric logs
5. **Reduced Storage:** No duplicate profile data per activity

---

## Intelligence Layer

### Calculation Engine

The platform contains a centralized calculation engine responsible for all metric-related computations. This engine operates independently of any specific database or storage mechanism, making it portable and testable.

**Location:** `packages/core/`

The engine handles:
- Generating sensible default values when an athlete hasn't provided specific metrics
- Computing Training Stress Score and related training load metrics from activity data
- Calculating training zones (power zones, pace zones, heart rate zones) from threshold values
- Analyzing activity data streams to detect significant efforts that might indicate performance improvements

**Key Calculations:**

**Training Load Analysis:**
- CTL (Chronic Training Load) = Fitness (42-day exponentially weighted moving average of TSS)
- ATL (Acute Training Load) = Fatigue (7-day exponentially weighted moving average of TSS)
- TSB (Training Stress Balance) = CTL - ATL (Form)
- **Efficient calculation** using pre-calculated TSS from activities

**TSS/IF Calculation (uses metric logs):**
- Calculate TSS using activity power data + FTP from performance metric logs
- Calculate IF (Intensity Factor) = Normalized Power / FTP
- Calculate VI (Variability Index) = Normalized Power / Average Power
- Supports weight-adjusted calculations using profile metric logs
- **Input:** Activity data + profile_id + activity date
- **Output:** TSS, IF, VI for storage in activity metrics

**Temporal Metric Lookup:**
- `getPerformanceMetricAtDate()` - Get FTP/pace/HR at specific date
- `getProfileMetricAtDate()` - Get weight/sleep/HRV at specific date
- Handles missing data with fallbacks (interpolation, current profile, null)
- Used for activity calculations and historical analysis

**Progression Analysis:**
- Analyzes trends over specified timeframe
- Calculates change, percentage change, trend direction
- Projects future performance based on current rate
- Returns improvement/decline indicators
- Works with both performance and profile metrics

**Power Curve:**
- Interpolates power values for standard durations
- Uses actual logged values when available
- Estimates missing durations using mathematical models
- Supports power-based training zones
- **Critical durations:** 5s, 1min, 5min, 20min, 60min (FTP)

### Metric Resolution Strategy

When the platform needs to determine an athlete's capabilities for calculating training zones or processing an activity, it follows a simple strategy: look up the most recent metric values for that athlete and sport.

If no metrics exist—perhaps this is a brand new athlete who just signed up—the platform generates intelligent defaults based on whatever information is available (typically body weight and age). These defaults are marked as estimates rather than verified data.

The platform never looks backward in time to find historical metrics. It always uses current values for new activities, maintaining a forward-looking perspective that reflects the athlete's present capabilities.

### Intelligent Defaults

The platform excels at working with incomplete information. When an athlete first joins and hasn't provided detailed performance data, the platform makes educated guesses based on standard physiological relationships.

**Power Threshold Estimation**
For cycling, the platform estimates Functional Threshold Power (FTP) using the athlete's body weight and an assumed power-to-weight ratio typical of recreational cyclists (2.5 watts per kilogram). A 75-kilogram athlete would receive an initial FTP estimate of 188 watts—conservative but reasonable for someone starting their training journey.

**Heart Rate Threshold Estimation**
Using the classic maximum heart rate formula based on age, the platform calculates a threshold heart rate suitable for tempo training. This gives new athletes immediate access to heart rate zones even before they've completed any threshold tests.

**Pace Threshold Estimation**
For runners, the platform uses the athlete's indicated fitness level (beginner, intermediate, or advanced) to assign conservative pace estimates. A beginner might start at six minutes per kilometer, while an advanced runner might begin at four minutes per kilometer.

**Source Attribution**
Every metric—whether provided by the athlete, detected from training data, imported from a third-party service, or estimated by the system—carries source attribution. This helps the platform choose the best available information and informs the athlete about data quality through the interface.

**Implementation in Core Package:**
```typescript
/**
 * Generates intelligent default FTP based on athlete weight.
 * Uses conservative 2.5 W/kg for recreational cyclists.
 */
export function estimateFTPFromWeight(weightKg: number): {
  value: number;
  source: 'estimated';
} {
  return {
    value: Math.round(weightKg * 2.5),
    source: 'estimated',
  };
}

/**
 * Estimates threshold heart rate from age.
 * Uses standard 220 - age formula, then 85% for threshold.
 */
export function estimateThresholdHR(age: number): {
  value: number;
  source: 'estimated';
} {
  const maxHR = 220 - age;
  const thresholdHR = Math.round(maxHR * 0.85);
  return {
    value: thresholdHR,
    source: 'estimated',
  };
}

/**
 * Estimates threshold pace based on fitness level.
 */
export function estimateThresholdPace(fitnessLevel: 'beginner' | 'intermediate' | 'advanced'): {
  value: number; // seconds per km
  source: 'estimated';
} {
  const paceMap = {
    beginner: 360, // 6:00/km
    intermediate: 300, // 5:00/km
    advanced: 240, // 4:00/km
  };

  return {
    value: paceMap[fitnessLevel],
    source: 'estimated',
  };
}
```

---

## Athlete Onboarding Experience

### Minimal Required Information

The platform requires only the bare essentials during initial signup: the athlete's body weight and age. These two data points enable the generation of reasonable performance estimates across all sports, ensuring athletes can immediately begin recording training without extensive form-filling.

### Optional Athletic Profile

Following basic registration, the platform offers athletes the opportunity to provide known performance metrics. This step is entirely optional—the platform works whether they provide detailed information or skip it entirely.

For cyclists, the platform asks about current FTP and threshold heart rate. For runners, it asks about recent race paces and threshold heart rate. For all athletes, it inquires about typical sleep patterns, resting heart rate, and self-assessed fitness level.

### Adaptive Platform Behavior

When an athlete provides specific metrics during onboarding, the platform stores these values and marks them as manually entered. The athlete immediately benefits from accurate training zones and personalized workout targets.

When an athlete skips the optional onboarding, the platform generates defaults on their first activity upload. These defaults are marked as system estimates. The athlete can still record workouts, view training metrics, and track progress—the experience simply indicates that metric accuracy will improve as they provide more information or complete more training sessions.

---

## Platform Integration Points

### Metric Management Endpoints

The platform exposes RESTful endpoints for creating, reading, updating, and managing both performance and profile metrics. Applications can submit new metric values (for example, when an athlete manually updates their FTP), retrieve current metric values for calculating training zones, or query metric history to visualize progression over time.

Each metric submission includes the metric type (FTP, threshold pace, weight, resting heart rate), the recorded value, the unit of measurement, and when the measurement was taken. The platform automatically tracks data sources.

**tRPC API Procedures:**

**Performance Metric Logs CRUD:**
- `profilePerformanceMetrics.list` - Get all performance logs with filtering
- `profilePerformanceMetrics.getById` - Retrieve specific log
- `profilePerformanceMetrics.create` - Add new performance log
- `profilePerformanceMetrics.update` - Modify existing log
- `profilePerformanceMetrics.deactivate` - Soft delete

**Profile Metric Logs CRUD:**
- `profileMetrics.list` - Get all profile logs (weight, sleep, HRV, etc.)
- `profileMetrics.getById` - Retrieve specific log
- `profileMetrics.create` - Add new profile metric log
- `profileMetrics.update` - Modify existing log
- `profileMetrics.delete` - Hard delete (biometric data can be removed)

**Temporal Queries (Critical for Activity Calculations):**
- `profilePerformanceMetrics.getAtDate` - Get FTP/pace/HR at specific date
- `profileMetrics.getAtDate` - Get weight/sleep at specific date
- `profilePerformanceMetrics.getForDateRange` - Get all metrics in date range
- `profileMetrics.getForDateRange` - Get all biometrics in date range

### Activity Ingestion Flow

When the platform receives an activity—whether from our mobile app, a third-party integration, or a direct API call—it follows a consistent processing pipeline:

**Step 1: Validate and Store Raw Activity Data**
Duration, distance, sport type, and detailed data streams showing how power, heart rate, and pace varied throughout the session.

**Step 2: Query Athlete's Current Performance Metrics**
Query the athlete's current performance metrics for the relevant sport. If metrics are missing, generate intelligent defaults and store them for future use.

**Step 3: Calculate Training Metrics**
Calculate training metrics using the retrieved or generated performance values. Training Stress Score, Intensity Factor, and Normalized Power are computed and stored directly with the activity for efficient future queries.

**Step 4: Analyze Activity for Significant Efforts**
Analyze the activity's data streams looking for significant efforts—sustained power outputs, fast pace segments, or other indicators of performance capability. These detected efforts become suggested metric updates.

**Step 5: Return Processed Activity**
Return the processed activity to the requesting application along with any metric suggestions, allowing the athlete to review and approve potential performance improvements.

**Implementation Flow:**
```typescript
// Activity submission (mobile app or webhook)
1. User completes activity recording
2. Mobile app submits activity data with `profile_id` only (NO profile snapshot)
3. Activity stored in database referencing profile
4. Background job queries performance metric logs for FTP at activity date
5. Calculate TSS/IF and store in activity metrics JSONB
6. Analyze activity for test efforts (optional)
7. Create metric suggestions if improvements detected
8. Push notification to mobile app if suggestions created
```

### Metric Suggestions and Approvals

When the platform detects a significant effort during activity analysis, it creates a suggestion rather than automatically updating metrics. The platform exposes endpoints for retrieving these suggestions and for athletes to explicitly approve or reject them.

This approval workflow keeps athletes in control of their performance data while reducing manual entry—the platform does the analytical work of detecting improvements, but the athlete makes the final decision about updating their capabilities.

**Suggestion Workflow:**
```typescript
// After activity processing
1. Detect 20-minute max effort at 215W
2. Calculate implied FTP: 215 * 0.95 = 204W
3. Compare to current FTP from metric logs (188W)
4. Create suggestion: "New FTP: 204W (8.5% improvement)"
5. Store suggestion with reference to activity
6. Push notification to mobile app
7. User reviews suggestion in app
8. User approves → Create new performance metric log
9. Trigger recalculation of activities after this date
```

---

## Third-Party Service Integration

### Universal Data Ingestion

The platform is designed from the ground up to accept training data from any source. Whether an athlete uses Strava to track rides, Garmin devices for runs, TrainingPeaks for structured workouts, or Wahoo for indoor training, the platform seamlessly ingests their data.

Third-party services connect through webhook integrations—when an athlete completes a workout in Strava, Strava sends that activity data directly to our platform. The platform parses the incoming data format (which varies by service), extracts the relevant information, and processes it through the same pipeline used for activities uploaded through our mobile application.

### Data Harmonization

Each third-party service structures its data differently. Strava provides average power and heart rate along with detailed stream data. Garmin includes lap information and device-specific metrics. TrainingPeaks focuses on planned versus actual workout comparison.

The platform's integration layer handles these differences, mapping each service's data format to our internal structure. Power data becomes power data regardless of whether it came from a Wahoo bike computer, a Garmin Edge, or a Strava upload. Heart rate is heart rate whether tracked by an Apple Watch or a Polar chest strap.

**Third-Party Integration Flow:**
```typescript
// Strava webhook example
1. Strava webhook receives activity completion
2. Platform receives webhook with activity data (power stream, HR stream, GPS)
3. NO profile data included from Strava
4. Create activity record with profile_id and source metadata
5. Query performance metric logs for user's FTP at activity date
6. Calculate TSS/IF using core package with queried metrics
7. Store calculated metrics in activity
8. Analyze for test efforts → create suggestions
9. Push notification to mobile app with new activity + suggestions
```

**Benefits:**
- No profile data duplication
- Accurate calculations even if user updates FTP later
- Cleaner integration code
- Consistent processing regardless of data source

### Metric Import and Enhancement

When third-party services provide their own metric calculations—for example, if Garmin Connect includes an FTP estimate or TrainingPeaks reports threshold pace—the platform imports these values and marks them with appropriate source attribution.

These imported metrics enhance the platform's understanding of athlete capabilities, especially for new athletes who haven't yet provided manual metrics or completed enough training for the platform to detect thresholds through activity analysis.

### Bidirectional Communication

The platform's integration architecture supports not just receiving data from third-party services, but also potentially pushing calculated metrics back to them. An FTP value detected through our platform's analysis could be shared back to TrainingPeaks to update an athlete's training zones across all their connected applications, creating a truly unified training ecosystem.

---

## Performance Detection Intelligence

### Automatic Effort Recognition

One of the platform's most valuable capabilities is its ability to recognize when an athlete has completed a significant effort that might indicate improved performance. Rather than requiring athletes to manually record every fitness test or threshold update, the platform constantly monitors incoming activities for telltale signs of capability changes.

**Power-Based Detection**
When analyzing cycling activities, the platform searches for sustained high-power efforts. A 20-minute interval at maximum sustainable power is a classic FTP test. The platform detects this effort, calculates an implied FTP based on established physiological relationships (typically multiplying the 20-minute power by 0.95), and suggests the athlete update their threshold.

Similarly, 5-minute maximum efforts indicate VO2max power, and 1-minute efforts reveal anaerobic capacity. Each of these detected efforts becomes a potential metric update, presented to the athlete for review.

**Pace-Based Detection**
For running activities, the platform identifies best efforts across common race distances. A hard 5-kilometer segment during a workout suggests threshold pace capabilities. A strong 10-kilometer effort provides another data point for calibrating training zones.

The platform calculates suggested threshold pace values from these efforts using standard running physiology relationships, then presents them to the athlete as potential metric updates.

**Implementation in Core Package:**
```typescript
/**
 * Analyzes activity power stream to detect test efforts.
 * Returns suggested FTP values.
 */
export function detectPowerTestEfforts(
  powerStream: number[],
  timestamps: number[]
): TestEffortSuggestion[] {
  const suggestions: TestEffortSuggestion[] = [];

  // Detect 20-minute max effort
  const twentyMinMax = findMaxAveragePower(powerStream, timestamps, 1200);
  if (twentyMinMax && twentyMinMax.avgPower > 150) {
    suggestions.push({
      type: 'ftp',
      value: Math.round(twentyMinMax.avgPower * 0.95),
      source: 'calculated',
      duration: 1200,
      detectionMethod: '20min test',
    });
  }

  // Detect 5-minute max effort (VO2max power)
  const fiveMinMax = findMaxAveragePower(powerStream, timestamps, 300);
  if (fiveMinMax && fiveMinMax.avgPower > 200) {
    suggestions.push({
      type: 'vo2max_power',
      value: Math.round(fiveMinMax.avgPower),
      source: 'calculated',
      duration: 300,
      detectionMethod: '5min max effort',
    });
  }

  return suggestions;
}
```

### Profile-Controlled Updates

The platform never assumes it knows better than the athlete. All detected efforts create suggestions, not automatic changes. After an activity, the athlete sees clear communication: "We detected a 20-minute effort at 215 watts. This suggests an FTP of 204 watts, which is higher than your current 188-watt setting. Would you like to update your FTP?"

This keeps the athlete in control while dramatically reducing the friction of keeping performance metrics current. The platform does the analytical work; the athlete makes the decisions.

---

## Training Zone Intelligence

### Dynamic Zone Calculation

The platform continuously calculates training zones based on each athlete's current performance metrics. When displaying zones or providing workout targets, the platform queries the athlete's most recent threshold values and applies standard zone calculation formulas.

For cycling, power zones are expressed as percentages of FTP: recovery efforts below 55% of threshold, endurance training between 56-75%, tempo work at 76-90%, threshold intervals at 91-105%, and VO2max efforts above 106%.

For running, pace zones are calculated relative to threshold pace: easy runs at 60-90 seconds per kilometer slower than threshold, tempo runs 15-30 seconds slower, threshold intervals at pace, and VO2max efforts 15-30 seconds faster.

For all sports, heart rate zones are calculated from threshold heart rate, with each zone representing a specific percentage range appropriate for different training adaptations.

### Data Quality Communication

The platform transparently communicates data quality to athletes through the interface. When zones are calculated from metrics the athlete manually entered or that were detected from high-quality threshold tests, the interface indicates this with clear visual markers.

When zones are based on system estimates or imported data, the interface shows appropriate indicators and encourages the athlete to update their metrics for more accurate training guidance.

This transparency helps athletes understand when their training zones are reliable and when they should invest time in proper testing to improve data quality.

---

## Training Load Analytics

### Efficient Metric Pre-Calculation

The platform calculates Training Stress Score and related metrics once when an activity is uploaded, then stores these values for efficient future queries. This design decision dramatically improves performance when displaying training load charts or analyzing fitness trends.

For cycling activities, the platform computes Normalized Power (a power-duration weighted average that better represents physiological stress than simple average power), Intensity Factor (the ratio of effort to threshold capability), and Training Stress Score (a composite metric representing overall training load).

For running activities, the platform calculates equivalent metrics based on pace and duration, using threshold pace as the reference point for intensity.

These pre-calculated values are stored directly with the activity. When the athlete views a training load chart spanning hundreds of workouts, the platform simply aggregates the stored TSS values rather than recomputing them from raw data—a 10 to 100 times performance improvement.

### Fitness and Fatigue Modeling

Using the pre-calculated TSS values, the platform efficiently computes sophisticated training load metrics that help athletes understand their current form:

**Chronic Training Load (Fitness)**
A 42-day exponentially weighted average of daily training stress, representing the athlete's accumulated fitness adaptations. This metric trends slowly upward during consistent training and slowly downward during rest periods.

**Acute Training Load (Fatigue)**
A 7-day exponentially weighted average representing recent training stress and current fatigue levels. This metric responds quickly to hard training blocks and recovery days.

**Training Stress Balance (Form)**
The difference between fitness and fatigue, indicating whether the athlete is fresh and ready for hard efforts or accumulated fatigue and needing recovery. The platform monitors this balance to help athletes avoid overtraining while maintaining productive stress levels.

These calculations power the platform's training insights, helping athletes and coaches understand whether current training loads are sustainable, whether recovery is adequate, and when the athlete is likely to be in peak form.

---

## Transitioning from Current Architecture

### One-Time Migration Process

Moving from the current snapshot-based architecture to the new metrics platform requires a carefully orchestrated one-time data migration. This migration transforms embedded profile data into the new separated metric structure while preserving all historical training information.

**Phase One: Data Extraction**
The migration begins by reading every existing activity record and extracting the embedded profile snapshots. Since many activities contain identical profile data (an athlete's FTP doesn't change every workout), the process deduplicates these snapshots to identify unique metric values and when they were in effect.

**Phase Two: Metric Creation**
For each athlete, the migration creates initial metric entries in the new performance metrics table. These entries capture the most recent known values for FTP, threshold pace, threshold heart rate, and other performance indicators. The migration timestamps these metrics to the athlete's account creation date and marks them as migrated data.

**Phase Three: Activity Recalculation**
With the new metrics table populated, the migration recalculates training metrics for all historical activities. Each activity's Training Stress Score, Intensity Factor, and Normalized Power are recomputed using the migrated metric values and stored in the new calculated metrics structure.

**Phase Four: Validation**
Before completing the migration, the process validates data integrity by comparing recalculated training metrics against original values. Any significant discrepancies trigger investigation to ensure the migration preserved accuracy.

**Phase Five: Architecture Cleanup**
Once validation confirms the migration's success, the old embedded profile snapshot fields are removed from the activities table, completing the transition to the new architecture.

### Risk Management

The migration includes comprehensive safety measures. Complete database backups are taken immediately before beginning the process, allowing rollback if critical issues emerge. The migration can be executed incrementally—processing accounts in batches rather than all at once—to enable early detection of edge cases without affecting all athletes simultaneously.

Clear communication with athletes explains the enhancement to their data and sets expectations about any temporary service interruptions during the migration window.

**Migration Strategy:**
1. **Phase 1:** Create both metric log tables
2. **Phase 2:** Seed initial data from current profile values
3. **Phase 3:** Backfill from activity `profile_snapshot` fields (one-time migration)
4. **Phase 4:** Update activity submission to use profile_id only
5. **Phase 5:** Deprecate `profile_snapshot` field (keep for backward compatibility initially)

**Fallback Strategy:**
- If no metric log for date → use current profile value
- If no profile value → use intelligent defaults
- Graceful degradation ensures system always works

---

## Success Criteria

### Performance Benchmarks

The platform is designed for speed and efficiency. Metric lookups—finding an athlete's current FTP or threshold pace—complete in under 10 milliseconds. Processing an activity, including metric retrieval and training metric calculation, finishes in under 50 milliseconds. Training load charts displaying data from hundreds of activities render in under 50 milliseconds thanks to pre-calculated metrics.

**Performance Targets:**
- **Metric log query** (single metric at date): <10ms
- **Activity TSS calculation** (with metric lookup): <50ms
- **CTL/ATL/TSB query** (100 activities): <50ms
- **Recalculation batch** (1000 activities): <5 seconds
- **Third-party webhook** (process activity): <200ms

### Data Quality Targets

Within 30 days of an athlete joining the platform, at least 80% of active athletes should have performance metrics from manual entry, detected thresholds from completed workouts, or imported data from third-party services.

The platform's intelligent defaults should be reasonably accurate. When comparing system-estimated values against later verified metrics, estimates should fall within 15% of actual values at least 70% of the time.

### Data Integrity Standards

The platform enforces sensible validation rules to prevent data quality issues. FTP values must fall between 50 and 500 watts for cycling. Threshold heart rates must be between 100 and 200 beats per minute. Threshold pace must be between 3:00 and 8:00 per kilometer for running. Body weight must be between 40 and 150 kilograms.

These validation rules prevent accidental data entry errors while accommodating the full range of human athletic performance.

---

## Platform Vision Summary

### Core Capabilities Delivered

This platform establishes itself as an independent performance metrics service with several defining characteristics:

**Separated Data Architecture**
Activities and athlete capabilities are maintained as distinct concepts. Activities record training history; metrics define current athlete capabilities. This separation enables proper tracking of athletic progression and eliminates data duplication.

**Intelligent Operation**
The platform works effectively with incomplete information through intelligent defaults, progressively improves data quality through automatic effort detection, and transparently communicates data quality to athletes.

**Universal Integration**
The platform seamlessly accepts data from our mobile application, major third-party services (Strava, Garmin, TrainingPeaks, Wahoo), and direct API connections. It harmonizes different data formats into a unified internal structure.

**Active Communication**
Rather than passively waiting for queries, the platform actively pushes updates and insights back to our main application when it detects metric improvements, identifies concerning training load patterns, or generates valuable suggestions.

**Performance at Scale**
Pre-calculated training metrics enable fast aggregation across hundreds of activities. Optimized database indexing ensures rapid metric lookups. The architecture supports thousands of concurrent athletes without performance degradation.

### Explicitly Out of Scope

To maintain focus on the core platform capabilities, several features are deliberately excluded from this initial implementation:

Historical metric updates and activity recalculation are not supported—the platform operates with a forward-looking perspective where new activities always use current metrics.

Advanced training plan adaptation, performance projection, machine learning features, and comparative analytics represent future enhancements beyond the current scope.

Automatic wearable device synchronization is not included, though manual API integration with wearable platforms is supported through the standard integration endpoints.

### Architectural Foundation

This platform establishes the fundamental infrastructure for sophisticated training intelligence. By separating athlete capabilities from training history, implementing intelligent defaults, and creating a robust integration layer, we enable future capabilities like adaptive training plans, predictive performance modeling, and personalized recovery recommendations.

The platform operates as a standalone service with clear boundaries and well-defined interfaces, making it a reusable component that can serve multiple applications while maintaining a single source of truth for athlete performance data.

---

## Implementation Phases

### Phase 1: Foundation & Migration (Week 1-2)

**Database:**
- Create migration for `profile_performance_metric_logs` table
- Create migration for `profile_metric_logs` table
- Add indexes for temporal queries
- Update Supabase types

**Core Package:**
- Create schemas leveraging Supabase types
- Add temporal lookup functions (getMetricAtDate)
- Add intelligent default generation functions
- Add TSS/IF calculation with metric log inputs
- Write comprehensive tests

**tRPC API:**
- Implement CRUD for both metric log tables
- Implement temporal query procedures (getAtDate)
- Test with manual entries

**Migration:**
- Seed initial performance logs from profile (FTP, threshold_hr)
- Seed initial profile logs from profile (weight_kg)
- Backfill from activity profile_snapshot fields (one-time script)

### Phase 2: Activity Integration (Week 2-3)

**Update Activity Submission:**
- Remove profile snapshot from activity upload schema
- Store profile_id reference only
- Create background job for TSS/IF calculation
- Query performance metrics at activity date for calculations
- Query profile metrics for weight-adjusted calculations

**Background Jobs:**
- TSS/IF calculator using metric logs
- Batch processor for third-party activities
- Recalculation trigger when metrics updated

**Core Package:**
- Implement progression analysis
- Implement power curve calculation
- Add weight-adjusted metric calculations
- Add test effort detection algorithms

### Phase 3: Intelligence & Detection (Week 3-4)

**Effort Detection:**
- Implement power-based test detection (20min, 5min)
- Implement pace-based test detection (5K, 10K)
- Create suggestion workflow
- Add approval endpoints

**Intelligent Defaults:**
- FTP estimation from weight
- Threshold HR estimation from age
- Threshold pace estimation from fitness level

**Mobile UI:**
- Onboarding flow (minimal + optional)
- Manual entry forms (performance + profile metrics)
- Suggestion approval interface
- Capability overview screen

### Phase 4: Third-Party Integration (Week 4-5)

**Webhook Handlers:**
- Strava webhook integration
- Garmin webhook integration
- Wahoo webhook integration
- TrainingPeaks webhook integration (future)

**Data Harmonization:**
- Parse different data formats
- Map to internal structure
- Query metrics for calculations
- Store with source metadata

**Active Communication:**
- Push notifications for new activities
- Push notifications for suggestions
- Webhook callbacks to mobile app
- Real-time updates

### Phase 5: Training Load Optimization (Week 5)

**Efficient CTL/ATL/TSB:**
- Use pre-calculated TSS from activities (no per-activity lookups)
- Optimize queries with proper indexes
- Implement caching for frequently accessed data
- Background updates when metrics change

### Phase 6: Polish & Optimization (Week 6)

**Performance:**
- Query optimization and caching
- Background job monitoring
- Database index tuning

**User Experience:**
- Error handling & edge cases
- Fallback strategies (missing metrics)
- User feedback & iteration
- Documentation and help guides

**Deprecation:**
- Mark profile_snapshot field as deprecated
- Keep for backward compatibility (read-only)
- Add deprecation warnings to API documentation
- Update client applications to stop using deprecated fields

### Phase 7: Profile Snapshot Removal (Week 7-8)

**Preparation:**
- Audit all codebases for profile_snapshot usage
- Verify 100% of activity submissions use profile_id only
- Confirm all historical data has been migrated to metric logs
- Document final state of migration for stakeholders

**Database Cleanup:**
- Create migration to drop profile_snapshot column from activities table
- Remove any remaining profile_snapshot references from database
- Clean up migration scripts that referenced old architecture
- Update database documentation to reflect new schema

**Code Cleanup:**
- Remove all profile_snapshot handling code from API endpoints
- Remove profile_snapshot types from schema definitions
- Remove profile_snapshot serialization/deserialization logic
- Update API documentation to remove deprecated endpoints

**Verification:**
- Verify all existing functionality works without profile_snapshot
- Confirm no runtime errors from removed code
- Validate data integrity across all athlete accounts
- Monitor system performance post-removal

---

## Technical Notes

### Critical Requirements

**Database:**
- Both metric log tables must have proper indexes for temporal queries
- RLS policies must secure user data (users can only access own logs)
- CASCADE DELETE on profile ensures data cleanup

**Core Package:**
- All calculation functions must handle missing metrics gracefully
- Temporal lookup functions must support date ranges and fallbacks
- All calculation logic is database-independent (pure functions)

**tRPC API:**
- Temporal query procedures must be performant (<50ms)
- Background jobs for TSS calculation must be reliable
- Recalculation triggers must handle large batches efficiently

**Mobile:**
- Activity submission must work immediately (async TSS calculation)
- User sees activity right away, metrics appear within seconds
- Charts must handle missing data gracefully

### Key Design Decisions

**Why Two Tables?**
- `profile_performance_metric_logs`: Multi-dimensional (category × type × duration), used for zone calculations and performance curves
- `profile_metric_logs`: Simple (metric_type × value), used for biometric tracking and weight-adjusted metrics
- Different query patterns, different use cases, cleaner schema

**Why Remove Profile Snapshots?**
- Eliminates data duplication across activities
- Enables retroactive recalculation when metrics updated
- Simplifies third-party integrations (no profile data needed)
- Creates single source of truth for all temporal metrics

**Why Pre-calculate TSS?**
- Training load queries are frequent (dashboard, mobile app)
- Calculating on-demand = 100+ calculations per page load
- Pre-calculation = 10-100x faster queries
- Recalculate only when performance metrics updated
