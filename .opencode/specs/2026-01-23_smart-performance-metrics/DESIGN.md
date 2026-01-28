# Minimalist Performance Tracking System: Design Document (Final)

## Core Philosophy

**Goal:** Auto-track fitness across all activity types, predict capabilities, adapt workouts - with minimal schema and maximum computation.

**Principle:** FIT files (or GPS files) are ground truth. Activities table holds pre-computed metadata. Compute performance state on-demand for any sport.

---

## Database Schema (Minimal & Universal)

### 1. `activities` (Existing)

**What:** Pre-computed metadata from activity files (FIT, GPX, TCX, etc.)
**Purpose:** Fast queries without re-parsing source files
**Key fields from `init.sql`:**

- `name`, `notes`, `type`, `location`
- `started_at`, `finished_at`, `duration_seconds`, `moving_seconds`
- `distance_meters`
- `calories`
- `elevation_gain_meters`, `elevation_loss_meters`
- `avg_heart_rate`, `max_heart_rate`
- `avg_power`, `max_power`, `normalized_power`
- `intensity_factor`, `training_stress_score`
- `avg_cadence`, `max_cadence`
- `avg_speed_mps`, `max_speed_mps`
- `fit_file_path` (Note: Design goal is to rename to `source_file_url`)
- `temperature` (Note: To be added)

### 2. `profile_performance_metric_logs` (Existing)

**What:** Tracks athlete performance capabilities over time (e.g., power curves).
**Purpose:** Universal performance tracking across all activity types.
**Key fields from `init.sql`:**

- `profile_id`
- `category` (e.g., 'run', 'bike')
- `type` (e.g., 'power', 'pace', 'speed', 'heart_rate')
- `value`
- `unit`
- `duration_seconds`
- `reference_activity_id`
- `recorded_at`

### 3. `profile_metric_logs` (Existing)

**What:** Weight, sleep, HRV, resting HR over time
**Purpose:** Context for power-to-weight, recovery capacity (universal across sports)
**Key fields from `init.sql`:**

- `profile_id`
- `metric_type` (e.g., 'weight_kg', 'hrv_ms')
- `value`
- `unit`
- `recorded_at`
- `reference_activity_id`

### 4. `notifications` (Planned - Not yet in `init.sql`)

**What:** System generated alerts for the user.
**Purpose:** Inform users of auto-detected achievements or required actions without blocking the data flow.
**Key fields:**

- `id` - UUID
- `profile_id` - Foreign key
- `type` - ENUM: 'new_best_effort', 'fitness_decay', 'recovery_alert', 'system'
- `title` - e.g., "New 20min Power Record!"
- `message` - e.g., "You hit 265W for 20 mins (+6%). Great job!"
- `data` - JSONB (store the detected effort details here for UI context)
- `is_read` - Boolean
- `created_at` - Timestamp

---

## Universal Effort Types by Sport

**Cycling:**

- effort_type=‘power’ (watts) → Best power for durations

**Running:**

- effort_type=‘pace’ (meters/second or min/km) → Best pace for distances
- effort_type=‘speed’ (meters/second) → Best speed for durations

**Swimming:**

- effort_type=‘pace’ (meters/second or min/100m) → Best pace for distances

**Rowing:**

- effort_type=‘power’ (watts) → Best power for durations
- effort_type=‘pace’ (split time per 500m) → Standard rowing metric

**Hiking/Walking:**

- effort_type=‘pace’ (meters/second) → Best sustained pace

---

## How It Works (Sport-Agnostic)

### On Activity File Upload (Edge Function)

```
1. Parse activity file (FIT/GPX/TCX) → Extract metadata
2. Determine category (bike/run/swim/row/ski/hike)
3. Insert into activities (TSS, duration, averages, etc.)
4. Extract best efforts for standard durations based on category:
   - Power sports (bike/row): 1s, 5s, 10s, 30s, 60s, 120s, 300s, 600s, 1200s, 2400s, 3600s, 5400s
   - Pace sports (run/swim/ski): 100m, 200m, 400m, 800m, 1000m, 1500m, 3000m, 5000m, 10000m, 21097m, 42195m
5. Insert into activity_efforts (duration, effort_type, value, start_offset)
6. Store source file in object storage (source_file_url)
7. Trigger auto-detection (compare to recent bests for this category)
```

### Auto-Detection & Notification Flow

**On activity file processing:**

1. Extract best efforts → Insert into `activity_efforts`
2. Query recent bests (last 90 days) for this category
3. For each duration/distance: Compare new vs best
4. If improvement > X% AND confidence > Y%:
   - **Action:** Insert into `notifications`
   - **Content:** "New 20min Power PR: 265W (+6%)"
   - **Data:** `{ "old_value": 250, "new_value": 265, "improvement": 0.06, "duration": 1200 }`

### Query: “What’s my current threshold?” (Universal)

**Cycling (FTP):**

```
1. Query activity_efforts WHERE effort_type='power' for 1200s, 480s (last 90 days)
2. Fit critical power model → CP
3. FTP = CP × 0.95
```

**Running (Threshold Pace):**

```
1. Query activity_efforts WHERE effort_type='pace' for 5000m, 10000m (last 90 days)
2. Fit critical speed model → CS
3. Threshold Pace = CS × 1.02
```

### Query: “Am I getting fitter?” (Universal)

```
1. Calculate CTL today from activities.TSS (last 42 days)
2. Calculate CTL 30 days ago
3. Compare
4. Query activity_efforts: Compare key duration/distance for this sport (e.g. 5min Power or 5k Pace)
```
