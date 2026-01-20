# GradientPeak Activity Recording & Submission Specification

## Overview

This document provides a high-level overview of how GradientPeak handles activity recording, submission, and processing. It covers the complete data flow from mobile recording through cloud submission to backend analysis.

---

## Architecture Summary

**GradientPeak uses a local-first, event-driven architecture:**

1. **Mobile (Expo)** - Records sensor data locally, compresses, and uploads
2. **tRPC API Layer** - Receives activities and triggers processing
3. **Backend Processing** - Calculates metrics, analyzes performance, detects test efforts
4. **Database (Supabase)** - Stores activity metadata and compressed time-series streams

**Key Principle:** All activity data is stored as **compressed time-series streams** for maximum flexibility and portability.

---

## Phase 1: Mobile Recording (Expo/React Native)

### 1.1 Service Architecture

**Location:** `apps/mobile/lib/services/ActivityRecorder/`

The `ActivityRecorderService` is a **lifecycle-scoped service** that:
- Lives only while the recording screen (`/record`) is mounted
- Automatically cleans up when navigating away
- Manages recording state machine: `pending → ready → recording → paused → finished`

**Key Components:**
- **ActivityRecorderService** - Main orchestrator
- **SensorsManager** - Bluetooth sensor connections (HR, power, cadence, FTMS trainers)
- **LocationManager** - GPS tracking (outdoor activities only)
- **LiveMetricsManager** - Real-time metric calculations and buffering
- **StreamBuffer** - Persists sensor data to local files
- **PlanManager** - Activity plan progression (optional)
- **NotificationsManager** - Foreground service notifications

### 1.2 Recording Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ 1. INITIALIZATION (pending)                                 │
│    - User navigates to /record screen                       │
│    - useActivityRecorder() hook creates service instance    │
│    - Service checks permissions (Bluetooth, Location, etc.) │
│    - User selects activity type (bike/run/swim)             │
│    - User selects location (indoor/outdoor)                 │
│    - Optional: User selects a workout plan                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. SENSOR CONNECTION (ready)                                │
│    - User scans for Bluetooth devices                       │
│    - Connects HR monitor, power meter, etc.                 │
│    - Outdoor: GPS acquires signal                           │
│    - Service transitions to "ready" when ready to record    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. ACTIVE RECORDING (recording)                             │
│    - User presses "Start"                                   │
│    - LiveMetricsManager starts StreamBuffer                 │
│    - Sensor data flows in at 1-4Hz:                         │
│      • Heart rate (1Hz)                                     │
│      • Power (1-4Hz)                                        │
│      • Cadence (1Hz)                                        │
│      • Speed (1Hz)                                          │
│      • GPS location (1Hz, outdoor only)                     │
│    - Data buffered in memory (100 samples)                  │
│    - Flushed to local files every 100 samples               │
│    - Real-time metrics displayed in UI                      │
│    - Optional: Plan step progression & auto-advance         │
│    - Optional: FTMS trainer auto-control (ERG mode)         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. PAUSE/RESUME (optional)                                  │
│    - User pauses recording                                  │
│    - StreamBuffer stops writing                             │
│    - Elapsed time continues, moving time pauses             │
│    - Resume: StreamBuffer resumes, moving time restarts     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. FINISH RECORDING (finished)                              │
│    - User presses "Finish"                                  │
│    - LiveMetricsManager flushes final buffer to files       │
│    - StreamBuffer finalizes all chunk files                 │
│    - Service emits "recordingComplete" event                │
│    - User navigates to submit screen                        │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Data Storage During Recording

**StreamBuffer File Structure:**
```
Expo FileSystem DocumentDirectory/
└── stream-chunks/
    ├── {recordingId}_heartrate_chunk_0.json
    ├── {recordingId}_heartrate_chunk_1.json
    ├── {recordingId}_power_chunk_0.json
    ├── {recordingId}_power_chunk_1.json
    ├── {recordingId}_latlng_chunk_0.json
    └── ...
```

**Chunk File Format (JSON):**
```json
{
  "metric": "heartrate",
  "values": [120, 125, 130, 135, ...],      // 100 samples
  "timestamps": [0, 1000, 2000, 3000, ...],  // milliseconds from start
  "dataType": "float"
}
```

**Why chunked files?**
- Fault tolerance: Power loss only loses last 100 samples
- Memory efficiency: Only buffer 100 samples in RAM
- Incremental writing: No blocking operations during recording

### 1.4 Real-time Metrics

**Current Readings (1-4Hz updates):**
- Heart rate (BPM)
- Power (watts)
- Speed (m/s)
- Cadence (RPM)
- GPS coordinates (outdoor)
- Heading/compass (outdoor)

**Session Statistics (1Hz updates):**
- Duration (elapsed time)
- Moving time (excluding pauses)
- Distance (meters)
- Average HR, power, speed, cadence
- Max HR, power, speed, cadence
- HR zone distribution (5 zones)
- Power zone distribution (7 zones)
- Calories (estimated)
- Total work (kJ)
- Ascent/descent (outdoor)

---

## Phase 2: Activity Submission (Mobile)

### 2.1 Submission Flow

**Location:** `apps/mobile/lib/hooks/useActivitySubmission.ts`

```
┌─────────────────────────────────────────────────────────────┐
│ 1. AUTOMATIC PROCESSING (on recordingComplete event)        │
│    - useActivitySubmission() hook listens for event         │
│    - Aggregates all chunk files from StreamBuffer           │
│    - Merges chunks into complete streams per metric         │
│    - Example: 50 heartrate chunks → 1 complete HR stream    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. STREAM COMPRESSION (per metric)                          │
│    - Convert values array to Float32Array                   │
│    - Gzip compress using pako library                       │
│    - Convert to base64 string for transport                 │
│    - Compress timestamps separately                         │
│    - Calculate compression stats:                           │
│      • Original size: ~4KB/100 samples                      │
│      • Compressed size: ~1KB/100 samples (75% reduction)    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. METRIC CALCULATION (client-side)                         │
│    - Calculate basic metrics from streams:                  │
│      • Duration (elapsed time)                              │
│      • Moving time (excluding pauses)                       │
│      • Distance (from GPS or speed integration)             │
│      • Average/max HR, power, speed, cadence                │
│      • Normalized power (30-sec rolling average)            │
│      • Variability Index (VI)                               │
│      • Total work (kJ)                                      │
│      • Elevation gain/loss (outdoor)                        │
│    - Skip FTP-dependent metrics (calculated server-side)    │
│    - Skip zone calculations (calculated server-side)        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. ACTIVITY OBJECT ASSEMBLY                                 │
│    - Build PublicActivitiesInsert object:                   │
│      • profile_id (user ID)                                 │
│      • name (e.g., "outdoor bike - 1/20/2026")              │
│      • type (bike/run/swim)                                 │
│      • location (indoor/outdoor)                            │
│      • started_at, finished_at (ISO timestamps)             │
│      • duration_seconds, moving_seconds                     │
│      • distance_meters                                      │
│      • metrics (JSONB - basic calculated metrics)           │
│      • activity_plan_id (if from a workout plan)            │
│    - Build activity_streams array (compressed)              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. USER REVIEW & EDIT                                       │
│    - Submit screen shows preview                            │
│    - User can edit:                                         │
│      • Activity name                                        │
│      • Notes                                                │
│      • Privacy (public/private)                             │
│    - User presses "Save Activity"                           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. UPLOAD TO SERVER                                         │
│    - Call trpc.activities.createWithStreams.mutate()        │
│    - Payload structure:                                     │
│      {                                                      │
│        activity: { ... },          // Activity metadata     │
│        activity_streams: [ ... ]   // Compressed streams    │
│      }                                                      │
│    - Upload size: ~50KB - 2MB depending on duration         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. CLEANUP (after successful upload)                        │
│    - Delete all local chunk files                           │
│    - Invalidate React Query cache (triggers UI refresh)     │
│    - Navigate to activity detail screen                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Compression Format

**Stream Compression Pipeline:**
```
Raw Data (in-memory)
  ↓
Float32Array (for numeric data) or JSON (for latlng)
  ↓
Gzip compression (pako library)
  ↓
Base64 encoding (for JSON transport)
  ↓
Database storage (Supabase)
```

**Example Compression Ratio:**
- 1 hour cycling activity (~3600 samples per metric)
- Uncompressed: ~14KB per metric
- Compressed: ~3-4KB per metric (70-75% reduction)
- Total upload size: ~30-100KB (depending on number of metrics)

---

## Phase 3: API Reception (Next.js + tRPC)

### 3.1 Activity Creation Endpoint

**Location:** `packages/trpc/src/routers/activities.ts`

**Endpoint:** `trpc.activities.createWithStreams`

```
┌─────────────────────────────────────────────────────────────┐
│ 1. REQUEST VALIDATION                                       │
│    - Validate activity object schema (Zod)                  │
│    - Validate streams array schema (Zod)                    │
│    - Verify user authentication (JWT)                       │
│    - Verify profile_id matches authenticated user           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. DATABASE TRANSACTION (Supabase)                          │
│    - Insert activity record into "activities" table         │
│    - Generate UUID for activity                             │
│    - Return created activity with ID                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. STREAM STORAGE                                           │
│    - Attach activity_id to each stream                      │
│    - Bulk insert into "activity_streams" table              │
│    - Each stream contains:                                  │
│      • type (heartrate, power, etc.)                        │
│      • data_type (float, latlng, boolean)                   │
│      • compressed_values (base64 gzipped data)              │
│      • compressed_timestamps (base64 gzipped timestamps)    │
│      • sample_count, original_size                          │
│      • min_value, max_value, avg_value (pre-calculated)     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. ERROR HANDLING                                           │
│    - If stream insertion fails:                             │
│      • Rollback: Delete created activity record             │
│      • Return error to client                               │
│    - If activity insertion fails:                           │
│      • Return error immediately (no streams created)        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. RETURN SUCCESS                                           │
│    - Return created activity object to client               │
│    - Client triggers metric calculation (next phase)        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Database Schema

**Activities Table:**
```sql
activities:
  - id (uuid, primary key)
  - profile_id (uuid, foreign key)
  - name (text)
  - type (text: bike/run/swim/strength/other)
  - location (text: indoor/outdoor)
  - started_at (timestamp)
  - finished_at (timestamp)
  - duration_seconds (integer)
  - moving_seconds (integer)
  - distance_meters (integer)
  - metrics (jsonb) -- Calculated metrics storage
  - hr_zone_seconds (integer[5]) -- Time in each HR zone
  - power_zone_seconds (integer[7]) -- Time in each power zone
  - activity_plan_id (uuid, nullable)
  - route_id (uuid, nullable)
  - created_at, updated_at
```

**Activity Streams Table:**
```sql
activity_streams:
  - id (uuid, primary key)
  - activity_id (uuid, foreign key → activities)
  - type (text: heartrate, power, speed, cadence, latlng, etc.)
  - data_type (text: float, latlng, boolean)
  - compressed_values (text) -- Base64 gzipped data
  - compressed_timestamps (text) -- Base64 gzipped timestamps
  - sample_count (integer)
  - original_size (integer)
  - min_value, max_value, avg_value (float, nullable)
  - created_at
```

**Foreign Key Cascade:**
- Deleting an activity automatically deletes all its streams

---

## Phase 4: Background Processing & Analysis

### 4.1 Metric Calculation Pipeline

**Location:** `packages/trpc/src/routers/activities.ts`

**Endpoint:** `trpc.activities.calculateMetrics`

**Triggered:** Automatically after activity upload (from mobile client)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. FETCH ACTIVITY WITH STREAMS                              │
│    - Query activity by ID                                   │
│    - Join with activity_streams table                       │
│    - Verify user owns activity (security)                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. DECOMPRESS STREAMS                                       │
│    - Decode base64 strings                                  │
│    - Gunzip compressed data                                 │
│    - Convert to typed arrays:                               │
│      • Float32Array for numeric streams                     │
│      • Nested arrays for latlng                             │
│      • Boolean arrays for moving stream                     │
│    - Extract streams:                                       │
│      • powerStream: number[]                                │
│      • hrStream: number[]                                   │
│      • speedStream: number[]                                │
│      • paceStream: number[] (calculated from speed)         │
│      • elevationStream: number[]                            │
│      • timestamps: number[]                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. FETCH TEMPORAL METRICS (historical context)              │
│    - Get activity date: activityDate = activity.started_at  │
│    - Query profile_performance_metric_logs:                 │
│      • FTP at activityDate (power, 3600s duration)          │
│      • LTHR at activityDate (heart_rate, 3600s duration)    │
│      • Max HR at activityDate (heart_rate, 0s duration)     │
│      • Threshold Pace (run only, 3600s duration)            │
│    - Query profile_metric_logs:                             │
│      • Weight at activityDate (for w/kg calculations)       │
│    - Get profile data:                                      │
│      • Date of birth (for age-based max HR estimation)      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. INTELLIGENT METRIC ESTIMATION (if missing)               │
│    - If no FTP found:                                       │
│      • estimateFTPFromWeight(weight)                        │
│      • Default: 2.8 watts/kg for recreational cyclist       │
│      • Store estimated FTP for future use                   │
│    - If no Max HR found:                                    │
│      • estimateMaxHR(age) = 220 - age                       │
│      • Store estimated max HR                               │
│    - If no LTHR found:                                      │
│      • estimateLTHR(maxHR) = maxHR * 0.95                   │
│      • Store estimated LTHR                                 │
│    - If no threshold pace (running):                        │
│      • Default: 5:00 min/km                                 │
│      • Store default threshold pace                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. CALCULATE TSS (Multi-Modal Fallback)                     │
│    - Priority 1 - Power-based TSS:                          │
│      IF powerStream exists AND ftp exists:                  │
│        • normalizedPower = 30-sec rolling avg               │
│        • intensityFactor = normalizedPower / ftp            │
│        • TSS = (duration × NP × IF) / (FTP × 3600) × 100    │
│        • variabilityIndex = NP / avgPower                   │
│    - Priority 2 - Heart Rate TSS (HRSS):                    │
│      IF hrStream exists AND lthr exists:                    │
│        • HRSS = similar formula using HR zones              │
│    - Priority 3 - Pace-based TSS (running):                 │
│      IF paceStream exists AND thresholdPace exists:         │
│        • Normalized Pace (grade-adjusted if elevation)      │
│        • Pace TSS = duration × paceIntensity²               │
│    - Return: TSSResult with source and confidence           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. CALCULATE PERFORMANCE CURVES                             │
│    - Power Curve (if power data exists):                    │
│      • Calculate max average power for:                     │
│        5s, 10s, 30s, 1min, 5min, 20min, 60min              │
│      • Analyze curve shape                                  │
│      • Identify strengths (sprinter vs time-trialist)       │
│    - Pace Curve (running only):                             │
│      • Calculate best paces for:                            │
│        400m, 1km, 5km, 10km, half marathon                 │
│      • Adjust for elevation                                 │
│    - Heart Rate Curve:                                      │
│      • Max sustained HR for various durations               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. DETECT TEST EFFORTS                                      │
│    - Power Test Detection:                                  │
│      • Look for sustained efforts at 95%+ max power         │
│      • Identify 5min, 20min FTP test efforts                │
│      • Return suggested FTP values with confidence          │
│    - Running Test Detection:                                │
│      • Look for sustained pacing efforts                    │
│      • Identify tempo runs, threshold runs                  │
│      • Return suggested threshold pace                      │
│    - Heart Rate Test Detection:                             │
│      • Look for sustained max HR efforts                    │
│      • Suggest LTHR and max HR updates                      │
│    - Generate metric_suggestions (for UI display)           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. UPDATE ACTIVITY WITH CALCULATED METRICS                  │
│    - Build metrics JSONB object:                            │
│      {                                                      │
│        tss, tss_source, tss_confidence,                     │
│        normalized_power, intensity_factor,                  │
│        variability_index, hrss, avg_hr,                     │
│        normalized_pace, curves: { power, pace, hr }         │
│      }                                                      │
│    - Update activities table with new metrics               │
│    - Invalidate client cache (triggers UI refresh)          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. RETURN CALCULATION RESULTS                               │
│    - Return to client:                                      │
│      • Calculated metrics (TSS, IF, NP, etc.)               │
│      • Performance curves                                   │
│      • Metric suggestions (test efforts detected)           │
│      • Calculation source (power/HR/pace)                   │
│    - Client displays suggestions to user                    │
│    - User can accept/reject suggested metric updates        │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Metric Calculation Details

**Power-based TSS (most accurate):**
```typescript
normalizedPower = calculateNormalizedPower(powerStream, timestamps)
  // 30-second rolling average, 4th power mean

intensityFactor = normalizedPower / ftp

TSS = (duration_seconds * normalizedPower * intensityFactor)
      / (ftp * 3600) * 100

variabilityIndex = normalizedPower / avgPower
```

**Heart Rate-based TSS (HRSS):**
```typescript
hrZones = calculateHRZones(hrStream, lthr, maxHR)
  // Time spent in each zone (Z1-Z5)

HRSS = weighted sum of time in each zone
  // Higher zones contribute more stress
```

**Pace-based TSS (running):**
```typescript
normalizedPace = calculateNormalizedPace(paceStream, elevationStream)
  // Grade-adjusted pace (GAP)

paceIntensity = normalizedPace / thresholdPace

Pace TSS = duration_seconds * (paceIntensity²) / 3600 * 100
```

### 4.3 Performance Curve Analysis

**Power Curve Points:**
- 5 seconds (neuromuscular power)
- 1 minute (anaerobic capacity)
- 5 minutes (VO2max power)
- 20 minutes (FTP estimate)
- 60 minutes (sustained threshold)

**Curve Shape Analysis:**
```
High 5s/60min ratio → Sprinter profile
Low 5s/60min ratio → Time-trialist profile
Flat curve → Well-rounded athlete
```

**Use Cases:**
- Identify training focus areas
- Compare performances over time
- Detect FTP changes
- Suggest new metric values

---

## Phase 5: User Experience & UI Flow

### 5.1 Mobile App User Journey

```
Home Screen
    ↓
Press "Record Activity" button
    ↓
Record Screen (/record)
    ↓
Select Activity Type (Bike/Run/Swim)
    ↓
Select Location (Indoor/Outdoor)
    ↓
Optional: Select Workout Plan
    ↓
Connect Bluetooth Sensors
    ↓
Wait for GPS Lock (outdoor)
    ↓
Press "Start" → Recording begins
    ↓
[Recording in progress - live metrics displayed]
    ↓
Press "Finish" → Navigate to Submit Screen
    ↓
Submit Screen (/submit-activity)
    ↓
Edit Activity Name/Notes
    ↓
Press "Save Activity" → Upload to server
    ↓
[Upload progress indicator]
    ↓
Navigate to Activity Detail Screen
    ↓
[Metrics calculated in background]
    ↓
View calculated TSS, curves, suggestions
```

### 5.2 Real-time UI Updates During Recording

**Recording Screen Cards:**
1. **Zones Card** - Current HR/power zone with live readings
2. **Map Card** (outdoor) - GPS route with breadcrumb trail
3. **Plan Card** (if planned) - Current step with progress bar
4. **Metrics Card** - Key stats (time, distance, avg power/HR)
5. **Footer Controls** - Start/Pause/Finish buttons

**Update Frequencies:**
- Live metrics: 1-4Hz (depending on sensor)
- Session stats: 1Hz
- Plan step progress: 1Hz
- GPS map: 1Hz

### 5.3 Background Processing UX

**After Upload:**
1. Activity appears in list immediately (with basic metrics)
2. "Calculating metrics..." indicator shown
3. Background calculation completes (5-15 seconds)
4. UI refreshes with full metrics (TSS, zones, curves)
5. Suggestions banner appears if test efforts detected
6. User can accept/reject metric suggestions

---

## Data Flow Summary Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        MOBILE (EXPO)                                 │
│                                                                      │
│  ┌────────────────┐                                                 │
│  │  Recording     │  1. Sensor data (1-4Hz)                         │
│  │  Service       │────────────────────────┐                        │
│  └────────────────┘                        ↓                        │
│                                   ┌──────────────────┐              │
│                                   │  StreamBuffer    │              │
│                                   │  (local files)   │              │
│                                   └──────────────────┘              │
│                                            ↓                         │
│  ┌────────────────┐                ┌──────────────────┐             │
│  │  Submission    │  2. Aggregate  │  Aggregated      │             │
│  │  Hook          │←───────────────│  Streams         │             │
│  └────────────────┘                └──────────────────┘             │
│         │                                                            │
│         │ 3. Compress & upload                                      │
│         ↓                                                            │
└─────────┼────────────────────────────────────────────────────────────┘
          │
          │ HTTP (tRPC)
          ↓
┌──────────────────────────────────────────────────────────────────────┐
│                     NEXT.JS + tRPC API                               │
│                                                                      │
│  ┌────────────────┐                                                 │
│  │  createWith    │  4. Validate & store                            │
│  │  Streams       │────────────────────────┐                        │
│  └────────────────┘                        ↓                        │
│                                   ┌──────────────────┐              │
│                                   │   SUPABASE       │              │
│                                   │   PostgreSQL     │              │
│                                   └──────────────────┘              │
│                                            │                         │
│  ┌────────────────┐                       │ 5. Fetch                │
│  │  calculate     │  6. Decompress        │                         │
│  │  Metrics       │←──────────────────────┘                         │
│  └────────────────┘                                                 │
│         │                                                            │
│         │ 7. Fetch historical metrics                               │
│         ↓                                                            │
│  ┌────────────────┐                                                 │
│  │  Temporal      │  FTP, LTHR, weight                              │
│  │  Metric Logs   │  at activity date                               │
│  └────────────────┘                                                 │
│         │                                                            │
│         │ 8. Calculate TSS, curves, detect tests                    │
│         ↓                                                            │
│  ┌────────────────┐                                                 │
│  │  Core Package  │  Pure calculation functions                     │
│  │  (@repo/core)  │  (database-independent)                         │
│  └────────────────┘                                                 │
│         │                                                            │
│         │ 9. Update activity with results                           │
│         ↓                                                            │
│  ┌────────────────┐                                                 │
│  │   Database     │  Store metrics in JSONB                         │
│  │   Update       │                                                 │
│  └────────────────┘                                                 │
│         │                                                            │
└─────────┼────────────────────────────────────────────────────────────┘
          │
          │ 10. Return results
          ↓
┌──────────────────────────────────────────────────────────────────────┐
│                        MOBILE UI                                     │
│                                                                      │
│  - Activity appears with full metrics                               │
│  - Performance curves displayed                                     │
│  - Test effort suggestions shown                                    │
│  - User can accept/reject metric updates                            │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Key Technical Decisions

### Why Compressed Streams?

**Advantages:**
1. **Portability** - No vendor lock-in, can export/import easily
2. **Flexibility** - Can recalculate metrics with new algorithms
3. **Storage efficiency** - 70-75% compression ratio
4. **Data integrity** - Original sensor data preserved forever
5. **Historical recalculation** - Update FTP → recalculate all activities

**Trade-offs:**
- More complex decompression logic
- Slightly higher initial processing time
- More storage than summary metrics only

### Why Temporal Metric Lookup?

**Problem:** An athlete's FTP/LTHR changes over time.

**Solution:** Store performance metrics with timestamps in `profile_performance_metric_logs`:
```sql
profile_performance_metric_logs:
  - profile_id
  - category (bike/run)
  - type (power/heart_rate/pace)
  - value (e.g., 250 watts)
  - duration_seconds (e.g., 3600 for FTP)
  - recorded_at (timestamp)
  - source (test/estimated/manual)
```

**Example:**
- Activity from Jan 1, 2024 → Use FTP recorded before Jan 1, 2024
- Activity from Jun 1, 2024 → Use FTP recorded before Jun 1, 2024
- Ensures TSS calculations use historically accurate thresholds

### Why Multi-Modal TSS Calculation?

**Fallback Chain:**
1. Power-based TSS (most accurate)
2. HR-based TSS (HRSS) if no power
3. Pace-based TSS (running) if no power/HR
4. Estimated TSS from duration if nothing else

**Confidence Levels:**
- `high` - Power-based with measured FTP
- `medium` - HR-based with measured LTHR
- `low` - Estimated values or pace-based

**Benefits:**
- Every activity gets a TSS value
- Clear indication of calculation confidence
- Graceful degradation for missing data

---

## Performance Characteristics

### Recording Performance

- **Memory usage:** ~5-10MB during recording (buffered data)
- **Battery drain:** ~15-20% per hour (GPS + Bluetooth + screen)
- **File I/O:** Write every 100 samples (~every 25-100 seconds)
- **UI update rate:** 1-4Hz for live metrics, 1Hz for stats

### Upload Performance

- **Typical upload size:** 50KB - 2MB (1-4 hour activities)
- **Upload time:** 2-5 seconds on good connection
- **Compression time:** 1-2 seconds (client-side)
- **Processing time:** 5-15 seconds (server-side)

### Calculation Performance

- **TSS calculation:** ~100ms for 1 hour activity
- **Power curve:** ~200ms for 1 hour activity
- **Stream decompression:** ~500ms for 1 hour activity
- **Total processing:** 5-15 seconds end-to-end

---

## Error Handling & Edge Cases

### Mobile Recording

**Sensor disconnection:**
- Service continues recording with available sensors
- Missing data shows as gaps in streams
- User notified of disconnection

**GPS signal loss (outdoor):**
- Service continues with last known position
- Speed/distance calculated from accelerometer
- User warned of GPS loss

**App backgrounding:**
- Foreground service keeps recording active
- Bluetooth sensors reconnected on foreground
- GPS tracking continues in background

**Low storage:**
- StreamBuffer checks available space before writing
- Warning shown if <100MB available
- Recording blocked if <50MB available

**Battery saver mode:**
- GPS accuracy may degrade
- Bluetooth connections may be throttled
- User warned to disable battery saver

### Submission & Upload

**Compression failure:**
- Fallback to JSON storage (uncompressed)
- User warned of larger file size
- Upload continues with all data preserved

**Upload failure:**
- Retry with exponential backoff
- Local data preserved until successful upload
- User can retry manually

**Partial upload (activity saved, streams failed):**
- Rollback transaction (delete activity)
- User can retry full upload

### Backend Processing

**Missing threshold metrics:**
- Intelligent estimation based on age/weight
- Store estimated values for future use
- Flag as "estimated" in UI

**Corrupted stream data:**
- Skip corrupted stream
- Calculate metrics from available data
- Log error for debugging

**Calculation timeout:**
- Fall back to basic metrics only
- User can trigger recalculation manually

---

## Future Enhancements

### Planned Features

1. **Real-time Coaching**
   - Plan step guidance with audio cues
   - Auto-adjust targets based on fatigue
   - Smart pacing recommendations

2. **Advanced Analytics**
   - Training load prediction
   - Fatigue modeling (CTL/ATL/TSB)
   - Performance trending

3. **Social Features**
   - Activity sharing
   - Leaderboards
   - Group challenges

4. **Third-party Integrations**
   - Strava sync
   - TrainingPeaks export
   - Wahoo/Garmin import

### Technical Improvements

1. **Offline-first architecture**
   - Full offline recording
   - Queue uploads for later
   - Sync when connection available

2. **Incremental processing**
   - Calculate metrics during recording
   - Show live TSS estimate
   - Reduce post-upload processing time

3. **Advanced compression**
   - Delta encoding for timestamps
   - Custom compression for GPS coordinates
   - Further reduce storage size

---

## Conclusion

GradientPeak's recording and submission system is designed for:

✅ **Reliability** - Fault-tolerant chunked storage, automatic retry
✅ **Flexibility** - Compressed streams enable historical recalculation
✅ **Intelligence** - Multi-modal TSS, temporal metrics, test detection
✅ **Performance** - Efficient compression, background processing
✅ **User Experience** - Real-time feedback, automatic metric calculation

This architecture supports the core mission: **help athletes train smarter through data-driven insights**.
