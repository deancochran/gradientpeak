# Profile Performance Metric Logs - MVP Specification

## Executive Summary

**Feature Name:** Performance Capability Tracking System (MVP)

**Purpose:** Track athlete performance capabilities (power, pace, heart rate) over time to enable training load analysis and performance progression tracking.

**Target Users:** Intermediate to advanced endurance athletes who want data-driven training insights.

**MVP Scope:**

- **Single table:** `profile_performance_metric_logs` - Time-series performance capability data
- **Dynamic computation:** All analytics, goals, and progression computed from existing app data
- **Integration:** Leverage existing activities, training plans, and planned activities
- **Core package:** Database-independent business logic using Supabase-generated types

**Development Timeline:** 4-6 weeks MVP implementation

---

## 1. Technical Architecture

### System Overview

The system uses a layered architecture:

- **User Interface Layer:** Mobile app (manual entry, charts) and web dashboard (advanced analytics)
- **tRPC API Layer:** Handles CRUD operations, queries, and analytics
- **Data Layer:** Supabase database for metric logs, core package for calculations, integration with existing activities/plans/profile data

### Key Principles

1. **Single Source of Truth:** Metric logs tables (performance + profile) track all athlete data over time
2. **No Data Duplication:** Activities reference profile_id, not snapshots (enables retroactive recalculation)
3. **Pre-calculated Metrics:** TSS/IF calculated once and stored, not computed on every query
4. **Type Safety:** Core package uses Supabase-generated types, extending them as needed
5. **Local-First:** Existing architecture maintained - logs synced like activities
6. **Leverage Existing Data:** Use completed activities and training plans for context

### Architectural Benefits

**1. Retroactive Recalculation (Key Innovation):**
```
User realizes FTP was actually 260W in March (not 250W)
↓
Create new performance metric log with created_at = 2024-03-01
↓
Background job queries all activities in affected date range
↓
Recalculates TSS/IF for each activity using corrected FTP
↓
Updates activity metrics JSONB with new values
↓
CTL/ATL/TSB charts automatically reflect corrected data
```

**2. Efficient Training Load Queries:**
```
OLD APPROACH (with profile snapshots):
- Query 1000 activities with profile_snapshot
- For each activity: calculate TSS = (NP * duration * IF) / (FTP * 3600) * 100
- Aggregate TSS values for CTL/ATL/TSB calculation
- Time: ~500-1000ms for 1000 activities

NEW APPROACH (with metric logs):
- Query 1000 activities (TSS already in metrics JSONB)
- Aggregate pre-calculated TSS values
- Time: ~10-50ms for 1000 activities (10-100x faster)
```

**3. Third-Party Integration Efficiency:**
```
Strava webhook receives activity data:
- Power stream, HR stream, GPS track
- NO profile data included

OLD: How do we calculate TSS? Need to store profile snapshot with activity
NEW: Query user's performance metric logs for FTP at activity date → Calculate TSS

Benefits:
- No profile data duplication
- Accurate calculations even if user updates FTP later
- Cleaner integration code
```

**4. Single Source of Truth for All Metrics:**
```
Before: Profile data scattered across:
- profiles table (current values)
- activity profile_snapshot (historical snapshots)
- planned_activities (target values)

After: All temporal data in metric logs:
- profile_performance_metric_logs (FTP, pace, threshold HR over time)
- profile_metric_logs (weight, sleep, HRV over time)
- profiles table (current summary only)
```

### Data Flow Patterns

**Manual Entry (Metric Logs):** User → Mobile Form → Validation → tRPC Mutation → DB Insert → UI Update

**Activity Recording & Submission (NEW APPROACH):**
1. User completes activity recording
2. Mobile app submits activity data with `profile_id` only (NO profile snapshot)
3. Activity stored in database referencing profile
4. TSS/IF calculation: Query performance metric logs (FTP at activity date) + activity data
5. Background job computes TSS/IF and stores in activity metrics JSONB

**Third-Party Integration (Strava, Wahoo, Garmin):**
1. Webhook receives activity data from third-party
2. Create activity record with `profile_id` and source metadata
3. Query performance metric logs for user's FTP/threshold at activity date
4. Calculate TSS/IF using core package
5. Store calculated metrics in activity

**Training Load Analysis:**
1. Query all activities with date range
2. For each activity, get TSS from activity metrics (pre-calculated)
3. Query current performance metric logs for latest FTP (for zone calculations)
4. Core package computes CTL/ATL/TSB time series
5. Return results → Render charts

**Retroactive Recalculation (Key Benefit):**
1. User updates historical FTP (e.g., realizes FTP was higher in March)
2. Create new performance metric log entry with backdated `created_at`
3. Background job triggers recalculation of affected activities
4. All TSS/IF scores updated automatically
5. CTL/ATL/TSB charts refresh with corrected data

**Progression Tracking:** Query Metric Logs → Core Package (analyze trends) → Return Progression Data → Display Insights

---

## 2. Database Schema

### Table 1: `profile_performance_metric_logs`

**Purpose:** Track athlete performance capabilities over time for creating performance curves and calculating training zones.

**Core Fields:**

- Identity: id, profile_id
- Metrics: category (bike/run/swim/row/other), type (power/pace/speed/heart_rate), value, unit, duration_seconds
- Provenance: source (manual/test/race/calculated/estimated/adjusted), confidence_score, reference_activity_id, calculation_method
- Context: environmental_conditions (JSONB), notes
- Lifecycle: is_active, superseded_by, valid_until
- Metadata: created_at, updated_at

**Key Constraints:**

- Value must be positive
- Duration must be positive
- Confidence score between 0-1
- Source limited to predefined options
- Profile foreign key with cascade delete

**Indexes for Performance:**

- Active logs by profile
- Metric lookup by profile/category/type/duration
- Reference activity lookup
- Environmental conditions (GIN)

**Example Data:**
- FTP progression (bike, power, 60min): 240W → 250W → 255W
- 5K pace (run, pace, 1200s): 4:30/km → 4:20/km
- Threshold heart rate (bike, heart_rate, 60min): 165 bpm → 168 bpm

### Table 2: `profile_metric_logs` (NEW)

**Purpose:** Track biometric and lifestyle metrics that influence training but can't be used for performance curves.

**Core Fields:**

- Identity: id, profile_id, metric_type, value, unit
- Types: weight_kg, resting_hr_bpm, sleep_hours, hrv_ms, vo2_max, body_fat_pct, hydration_level, stress_score, soreness_level
- Provenance: source (manual/device/calculated), reference_activity_id (optional), notes
- Lifecycle: recorded_at (timestamp for the metric), created_at, updated_at

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

### Migration: Remove Profile Snapshots from Activities

**Current State:** Activities store `profile_snapshot` JSONB with FTP, weight_kg, threshold_hr, age at time of activity.

**New Approach:** Activities reference `profile_id` and query metric logs for calculations.

**Benefits:**

1. **Retroactive Recalculation:** Update historical FTP → recalculate all TSS/IF scores automatically
2. **Single Source of Truth:** Profile and biometric data in one place, not duplicated across activities
3. **Efficient Third-Party Integrations:** Strava/Wahoo imports only store activity data, not profile snapshots
4. **Temporal Queries:** "What was my FTP on 2024-03-15?" → query performance metric logs
5. **Reduced Storage:** No duplicate profile data per activity

**Migration Strategy:**

1. **Phase 1:** Create both metric log tables
2. **Phase 2:** Seed initial data from current profile values
3. **Phase 3:** Backfill from activity `profile_snapshot` fields (one-time migration)
4. **Phase 4:** Update activity submission to use profile_id only
5. **Phase 5:** Deprecate `profile_snapshot` field (keep for backward compatibility initially)

### Metric Log Queries for Activity Calculations

**Scenario:** Calculate TSS for activity completed on 2024-03-15

```sql
-- Get FTP at time of activity
SELECT value
FROM profile_performance_metric_logs
WHERE profile_id = $1
  AND category = 'bike'
  AND type = 'power'
  AND duration_seconds = 3600
  AND created_at <= '2024-03-15'
  AND is_active = true
ORDER BY created_at DESC
LIMIT 1;

-- Get weight at time of activity
SELECT value
FROM profile_metric_logs
WHERE profile_id = $1
  AND metric_type = 'weight_kg'
  AND recorded_at <= '2024-03-15'
ORDER BY recorded_at DESC
LIMIT 1;

-- Calculate TSS using core package with these values
```

**Fallback Strategy:** If no metric logs exist for activity date, use current profile values.

---

## 3. Core Package (Business Logic)

### Location: `packages/core/`

**CRITICAL:** All calculation logic lives in `@repo/core` - database-independent, pure functions.

### Schemas

The core package leverages and extends Supabase-generated types rather than duplicating them. Includes:

- Database type re-exports
- Zod schemas for validation (runtime safety)
- Enums for categories, types, units, sources
- Form schemas for user input
- Standard durations (hardcoded constants)

### Key Calculations

**Training Load Analysis:**

- CTL (Chronic Training Load) = Fitness (42-day exponentially weighted moving average of TSS)
- ATL (Acute Training Load) = Fatigue (7-day exponentially weighted moving average of TSS)
- TSB (Training Stress Balance) = CTL - ATL (Form)
- **Efficient calculation** using pre-calculated TSS from activities
- No per-activity FTP lookups needed for CTL/ATL/TSB

**TSS/IF Calculation (NEW - uses metric logs):**

- Calculate TSS using activity power data + FTP from performance metric logs
- Calculate IF (Intensity Factor) = Normalized Power / FTP
- Calculate VI (Variability Index) = Normalized Power / Average Power
- Supports weight-adjusted calculations using profile metric logs
- **Input:** Activity data + profile_id + activity date
- **Output:** TSS, IF, VI for storage in activity metrics

**Temporal Metric Lookup (NEW):**

- `getPerformanceMetricAtDate()` - Get FTP/pace/HR at specific date
- `getProfileMetricAtDate()` - Get weight/sleep/HRV at specific date
- Handles missing data with fallbacks (interpolation, current profile, null)
- Used for activity calculations and historical analysis

**Current Capability:**

- Returns most recent active log for given parameters
- Used for zone calculations, training plan targets
- Fast lookup with indexed queries

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

**Confidence Scoring:**

- Calculates reliability based on source type
- Factors in recency (confidence decays over time)
- Bonus for reference activity linkage
- Returns score between 0-1
- Used to prioritize which metric to use for calculations

**FTP Estimation:**

- From 20-minute test result (multiply by 0.95)
- From ramp test (75% of max 1-minute power)
- From activity power analysis (heuristic detection)
- Validates input values

**Weight-Adjusted Metrics (NEW):**

- Power-to-weight ratio (W/kg)
- Normalized power per kg
- VAM (Vertical Ascent Meters) per kg
- Requires weight from profile metric logs at activity date

---

## 4. tRPC API Layer

### Key Procedures

**Performance Metric Logs CRUD:**

- `profilePerformanceMetrics.list` - Get all performance logs with filtering
- `profilePerformanceMetrics.getById` - Retrieve specific log
- `profilePerformanceMetrics.create` - Add new performance log
- `profilePerformanceMetrics.update` - Modify existing log
- `profilePerformanceMetrics.deactivate` - Soft delete

**Profile Metric Logs CRUD (NEW):**

- `profileMetrics.list` - Get all profile logs (weight, sleep, HRV, etc.)
- `profileMetrics.getById` - Retrieve specific log
- `profileMetrics.create` - Add new profile metric log
- `profileMetrics.update` - Modify existing log
- `profileMetrics.delete` - Hard delete (biometric data can be removed)

**Temporal Queries (NEW - Critical for Activity Calculations):**

- `profilePerformanceMetrics.getAtDate` - Get FTP/pace/HR at specific date
- `profileMetrics.getAtDate` - Get weight/sleep at specific date
- `profilePerformanceMetrics.getForDateRange` - Get all metrics in date range
- `profileMetrics.getForDateRange` - Get all biometrics in date range

**Analytics Procedures:**

- `profilePerformanceMetrics.getCurrent` - Most recent capability
- `profilePerformanceMetrics.analyzeProgression` - Trend analysis
- `profilePerformanceMetrics.getPowerCurve` - Calculate power curve
- `activities.getTrainingLoad` - CTL/ATL/TSB (uses pre-calculated TSS)

**Activity Integration (UPDATED):**

- `activities.create` - Store activity with profile_id (NO snapshot)
- `activities.calculateMetrics` - Background job to calculate TSS/IF
- `activities.recalculateMetrics` - Triggered when performance metrics updated
- `activities.recalculateForDateRange` - Batch recalculation

**Input Validation:**

- Uses Zod schemas from core package
- Type-safe parameters and returns
- Proper error handling and user feedback
- Validates metric types and value ranges

**Integration Points:**

- Activity submission queries metric logs for TSS calculation
- Third-party webhooks query metric logs for user's FTP
- Background jobs recalculate metrics when logs updated
- Profile sync updates from most recent metric logs

---

## 5. Data Flow & Integration

### Integration with Existing Features

**Activities (UPDATED APPROACH):**

- **No more profile snapshots** - Activities only store `profile_id`
- TSS/IF calculated by querying performance metric logs at activity date
- Weight-adjusted metrics use profile metric logs (weight_kg at activity date)
- Post-activity review suggests creating metric logs from test efforts
- Background recalculation when performance metrics updated

**Training Plans:**

- Zones computed dynamically from current performance metric logs
- Progressive plans adjust based on capability improvements
- Plan adherence uses metric logs for target validation

**Planned Activities:**

- Scheduled workouts use performance metric logs for appropriate targets
- Post-workout adherence calculated using capabilities at activity date
- Structured workout targets reference current FTP/pace from logs

**Profile:**

- Profile table stores current summary values (latest FTP, weight, etc.)
- Profile values auto-sync from most recent metric logs
- Profile acts as fallback when no metric logs exist
- Migration path: seed initial logs from profile data

**Third-Party Integrations (Strava, Wahoo, Garmin):**

- Webhook receives raw activity data (power, HR, distance, time)
- Query user's performance metric logs for FTP/threshold at activity date
- Calculate TSS/IF using core package with queried metrics
- Store activity with `profile_id` reference only
- **No need to sync profile data** from third-party services
- Efficient: only activity data stored, metrics calculated on-demand

### Dynamic Computation Examples

**Current FTP:** Query performance metric logs for latest 60-minute power value, use for zone calculations and training targets.

**Activity TSS Calculation (NEW):**
```typescript
// OLD: Used profile snapshot stored in activity
const tss = calculateTSS({
  normalizedPower: activity.metrics.normalized_power,
  duration: activity.duration_seconds,
  ftp: activity.profile_snapshot.ftp, // ❌ Snapshot could be stale
});

// NEW: Query performance metric logs at activity date
const ftp = await getPerformanceMetricAtDate({
  profileId: activity.profile_id,
  category: 'bike',
  type: 'power',
  duration: 3600,
  date: activity.started_at,
});

const tss = calculateTSS({
  normalizedPower: activity.metrics.normalized_power,
  duration: activity.duration_seconds,
  ftp: ftp.value, // ✅ Accurate FTP at activity date
});
```

**Training Load (CTL/ATL/TSB Efficiency):**
- **OLD:** Query all activities with profile snapshots, calculate TSS for each, compute CTL/ATL/TSB
- **NEW:** Activities store pre-calculated TSS in metrics JSONB, direct aggregation for CTL/ATL/TSB
- **Benefit:** 10-100x faster queries for training load charts (no per-activity calculation)
- **Recalculation:** Background job updates TSS when performance metrics change

**Weight-Adjusted Power:**
```typescript
// Query weight at activity date from profile metric logs
const weight = await getProfileMetricAtDate({
  profileId: activity.profile_id,
  metricType: 'weight_kg',
  date: activity.started_at,
});

const powerToWeight = activity.metrics.normalized_power / weight.value;
```

**Progression Analysis:** Analyze metric changes over time, calculate improvement rates, project future performance.

**Zone Calculations:** Use most recent performance metric logs for current zones, historical logs for zone distribution analysis.

### Migration Strategy

1. **Create tables** - `profile_performance_metric_logs` and `profile_metric_logs`
2. **Seed initial data** from existing profile FTP/threshold HR/weight
3. **Backfill from activities** - Extract profile_snapshot data into metric logs (one-time)
4. **Update activity submission** - Remove profile snapshot, use profile_id only
5. **Background job** - Calculate TSS/IF for all activities using metric logs
6. **Gradual deprecation** - Keep profile_snapshot field for backward compatibility
7. **Graceful fallback** - Use current profile values if no logs exist for date range

### Performance Optimization Strategy

**Pre-calculate and Cache:**
- TSS/IF stored in activity metrics JSONB after calculation
- Recalculated only when performance metrics updated
- CTL/ATL/TSB queries become simple aggregations

**Indexed Queries:**
- Profile metric logs indexed by (profile_id, metric_type, recorded_at)
- Performance metric logs indexed by (profile_id, category, type, duration_seconds, created_at)
- Fast temporal lookups: "What was FTP on this date?"

**Background Processing:**
- Activity submission stores raw data immediately
- Background job calculates TSS/IF using metric logs
- User sees activity instantly, metrics appear within seconds
- Third-party integrations processed in batches

---

## 6. Implementation Phases

### Phase 1: Foundation & Migration (Week 1-2)

**Database:**
- Create migration for `profile_performance_metric_logs` table
- Create migration for `profile_metric_logs` table (NEW)
- Add indexes for temporal queries
- Update Supabase types

**Core Package:**
- Create schemas leveraging Supabase types
- Add temporal lookup functions (getMetricAtDate)
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
- Add confidence score calculation
- Add weight-adjusted metric calculations

### Phase 3: Training Load Optimization (Week 3)

**Efficient CTL/ATL/TSB:**
- Use pre-calculated TSS from activities (no per-activity lookups)
- Optimize queries with proper indexes
- Implement caching for frequently accessed data
- Background updates when metrics change

**Testing:**
- Performance benchmarks (1000+ activities)
- Validate recalculation accuracy
- Test fallback scenarios (missing metrics)

### Phase 4: Mobile UI (Week 3-4)

**Metric Entry:**
- Manual entry form for performance metrics (modal)
- Manual entry form for profile metrics (weight, sleep, HRV)
- Capability overview screen (list current capabilities)
- Progression charts (per metric)

**Activity Integration:**
- Post-activity: suggest creating metric logs from test efforts
- Activity detail: show metrics used for TSS calculation
- Activity detail: show weight at time of activity

### Phase 5: Web Dashboard (Week 4-5)

**Analytics:**
- Advanced analytics views
- Power curve visualization
- Training load charts (CTL/ATL/TSB over time)
- Historical progression analysis
- Biometric trends (weight, sleep, HRV over time)

**Data Management:**
- Bulk import/export capabilities
- Metric log history viewer
- Recalculation tools for admins
- Data integrity checks

### Phase 6: Auto-Detection (Week 5-6) - Optional

**Activity Analysis:**
- Background job to detect test efforts (20min power, 5K pace)
- Suggest metric log creation from detected tests
- User approval flow before creating logs
- Confidence scoring for auto-detected values

**Third-Party Integration:**
- Automatic metric calculation for Strava/Wahoo uploads
- Batch processing for historical imports
- Webhook handlers query metric logs efficiently

### Phase 7: Polish & Optimization (Week 6)

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
- Plan removal for v2.0

---

## Success Criteria

### MVP Success Metrics

**User Features:**
- Users can manually log performance metrics (FTP, pace, threshold HR)
- Users can manually log profile metrics (weight, sleep, HRV, resting HR)
- Users can view current capabilities across standard durations
- Users can track progression over time with charts
- Activities no longer store profile snapshots (use profile_id reference)
- Training load (CTL/ATL/TSB) computed efficiently from pre-calculated TSS

**Integration Features:**
- Third-party activities (Strava, Wahoo) calculate TSS using metric logs
- User-uploaded activities calculate TSS accurately
- Retroactive recalculation works when metrics updated
- Automatic profile sync from latest metric logs

**Performance:**
- CTL/ATL/TSB queries complete in <100ms (1000+ activities)
- Activity submission completes instantly (background TSS calculation)
- Metric log queries optimized with proper indexes

### Technical Success Criteria

**Architecture:**
- Two-table implementation (performance + profile metrics)
- Core package fully database-independent
- Supabase types properly leveraged
- Temporal queries work correctly (metric at specific date)
- Fallback strategies for missing metrics

**Data Integrity:**
- No duplicate profile data across activities
- Single source of truth for all metrics
- Migration from profile_snapshot successful
- Backward compatibility maintained during transition

**Testing:**
- Core package has 100% test coverage for calculations
- Integration tests for temporal queries
- Performance benchmarks meet targets
- Recalculation accuracy validated

---

## 7. Key Design Decisions

### Why Two Tables?

**`profile_performance_metric_logs` (performance curves):**
- Multi-dimensional: category × type × duration
- Example: bike + power + 60min = FTP
- Used for: Zone calculations, performance curves, TSS/IF calculation
- Complex queries: "Give me all power metrics for bike at standard durations"

**`profile_metric_logs` (biometric data):**
- Simple: metric_type × value
- Example: weight_kg = 75.0
- Used for: Weight-adjusted metrics, wellness tracking, trend analysis
- Simple queries: "Give me weight on this date"

**Why not combine?** Different query patterns, different use cases, cleaner schema.

### Why Remove Profile Snapshots?

**Problems with profile snapshots:**
1. **Data duplication** - Same FTP stored in 100+ activities
2. **No retroactive updates** - Can't fix historical mistakes
3. **Integration complexity** - Third-party services don't provide profile data
4. **Storage waste** - Redundant data across activities
5. **Inconsistency risk** - Profile vs snapshot values diverge

**Benefits of metric logs:**
1. **Single source of truth** - One place for all temporal metrics
2. **Retroactive accuracy** - Update FTP, recalculate all TSS automatically
3. **Clean integrations** - Query metrics separately from activity data
4. **Storage efficiency** - No redundant profile data per activity
5. **Better analytics** - Track metric progression over time

### Why Pre-calculate TSS?

**Calculation Frequency:**
- CTL/ATL/TSB charts queried frequently (dashboard, mobile app)
- Each query needs TSS for 42-100+ activities
- Calculating TSS on-demand = 100+ calculations per page load

**Pre-calculation Strategy:**
- Calculate TSS once when activity submitted (or in background)
- Store in activity metrics JSONB
- Recalculate only when performance metrics updated
- Result: 10-100x faster training load queries

### Transition Strategy

**Phase 1: Additive (No Breaking Changes)**
- Create new metric log tables
- Activities still have profile_snapshot field
- New activities optionally use metric logs
- Both systems work in parallel

**Phase 2: Migration (One-time)**
- Seed metric logs from profile values
- Backfill from activity profile_snapshot fields
- Validate data integrity
- Test recalculation accuracy

**Phase 3: Deprecation (Gradual)**
- New activities use metric logs only
- Mark profile_snapshot as deprecated
- Keep field for backward compatibility (read-only)
- Plan removal for v2.0

**Fallback Strategy:**
- If no metric log for date → use current profile value
- If no profile value → skip calculation or return null
- Graceful degradation ensures system always works

## 8. Implementation Notes

### Critical Requirements

**Database:**
- Both metric log tables must have proper indexes for temporal queries
- RLS policies must secure user data (users can only access own logs)
- CASCADE DELETE on profile ensures data cleanup

**Core Package:**
- All calculation functions must handle missing metrics gracefully
- Temporal lookup functions must support date ranges and fallbacks
- 100% test coverage for TSS/IF calculation with metric logs

**tRPC API:**
- Temporal query procedures must be performant (<50ms)
- Background jobs for TSS calculation must be reliable
- Recalculation triggers must handle large batches efficiently

**Mobile/Web:**
- Activity submission must work immediately (async TSS calculation)
- User sees activity right away, metrics appear within seconds
- Charts must handle missing data gracefully

### Performance Targets

- **Metric log query** (single metric at date): <10ms
- **Activity TSS calculation** (with metric lookup): <50ms
- **CTL/ATL/TSB query** (100 activities): <50ms
- **Recalculation batch** (1000 activities): <5 seconds
- **Third-party webhook** (process activity): <200ms

### Testing Strategy

**Unit Tests:**
- Core package: TSS calculation with metric logs
- Core package: Temporal metric lookup (edge cases)
- Core package: Fallback strategies

**Integration Tests:**
- tRPC: Create activity → calculate TSS using metric logs
- tRPC: Update metric log → trigger recalculation
- tRPC: Third-party webhook → query metrics → calculate TSS

**Performance Tests:**
- Benchmark CTL/ATL/TSB queries (1000+ activities)
- Benchmark recalculation batches (100+ activities)
- Validate index effectiveness

**Migration Tests:**
- Seed from profile values
- Backfill from profile_snapshot fields
- Validate data integrity
- Compare old vs new TSS calculations

## Notes

- **No goals table needed:** Goals can be computed as "target metric logs" or handled in UI state
- **No standard durations table needed:** Hardcoded constants in core package (5s, 1min, 5min, 20min, 60min)
- **Leverage existing data:** Activities, training plans, and profile provide rich context
- **Type safety:** Core package uses Supabase-generated types + Zod for validation
- **Keep it simple:** Two tables + pre-calculated metrics = maximum flexibility and performance
- **Backward compatible:** Profile snapshot field kept during transition for safety
