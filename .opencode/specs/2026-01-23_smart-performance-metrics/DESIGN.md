# Performance Tracking System: Design Document

## Core Concept

Auto-track fitness across all activity types, predict capabilities, and adapt workouts. Activity files (FIT/GPX/TCX) are the source of truth. Pre-compute metadata for fast queries, calculate performance metrics on-demand.

---

## Database Tables

### 1. `activities`

Pre-computed metadata from uploaded activity files for fast queries.

### 2. `activity_efforts`

Tracks athlete performance capabilities over time (power curves, speed records, etc.) across all activity types.

### 3. `profile_metrics`

Tracks weight, sleep, HRV, resting heart rate for recovery and power-to-weight context.

### 4. `notifications` (Planned)

System-generated alerts for auto-detected achievements (new personal records, fitness changes, recovery alerts).

---

## Effort Types by Sport

- **Power-based sports** (Cycling, Rowing): Power (watts) for standard durations
- **Speed-based sports** (Running, Swimming, Hiking): Speed (meters/second) for standard durations
  - _Note: Speed stored as meters/second for computational efficiency; convert to pace for display_

---

## How It Works

### When Activity File Uploaded:

1. Parse file and extract metadata
1. Determine sport category
1. Save to `activities` table
1. Extract best efforts for standard durations based on sport
1. Save to `activity_efforts`
1. Store source file
1. Compare to recent bests and create notifications if improvements detected

### Auto-Detection:

- Compare new efforts to recent bests (last 90 days)
- If significant improvement detected, create notification with details

### Performance Queries:

- **Threshold calculation:** Use recent best efforts to fit sport-specific models (e.g., Critical Power for cycling, Critical Speed for running)
- **Fitness progression:** Compare current vs historical CTL and key effort metrics
