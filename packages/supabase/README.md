# Training Platform Database Schema Overview

This document provides a high-level overview of the database schema for a comprehensive training platform that manages athletes, training plans, and performance tracking.

## Core Architecture

The schema is built around a user-centric design that supports personalized training plans with detailed activity tracking and performance analysis. The database leverages Supabase's built-in authentication system and extends it with custom tables to create a complete training management solution.

All tables include `created_at` and `updated_at` timestamps for auditing purposes.

## Table Relationships and Structure

### User Management
`auth.users` serves as the foundation, utilizing Supabase's built-in authentication system to handle user accounts, login credentials, and security.

This table is extended by **`profiles`**, which stores comprehensive personal information, preferences, and athlete-specific metrics. These metrics are critical for defining workout intensity, scaling training plans, and tailoring analytics to each athlete’s physiology and training level.

### Fields in profiles include:

`profile_id` — Primary key, UUID, foreign key to auth.users.id.
`threshold_hr` — Threshold Heart Rate (bpm); nullable for new users; used for defining HR training zones and intensity targets.
`ftp` — Functional Threshold Power (watts); nullable for new users; used for power-based training zones and workload calculations.
`weight_kg` — Athlete’s body weight (kg), used in power-to-weight performance metrics.
`gender` — Gender, used in predictive models and analytics.
`dob` — Date of birth, used to calculate age-based targets, zones, and long-term progression.

### Personalization & Preferences
`username` — Public-facing username/handle; must be unique.
`language` — Preferred language/locale for the user interface.
`preferred_units` — Chosen measurement system (metric vs imperial).
`preferred_metrics` — User’s focus metrics (e.g., power, HR, pace, RPE); used to highlight training feedback.
`avatar_url` — Profile picture/avatar for use across the platform.
`bio` — Optional short biography or description.

By anchoring workouts to both **physiological metrics** and **personal preferences**, the platform ensures training prescriptions are personalized, adaptive, and engaging, supporting athletes from beginner through advanced levels while also making the system enjoyable to use day-to-day.
### Training Plan Framework
**`profile_plans`** contains the dynamically generated, personalized training plan for each user. When a user selects a plan from the platform's library (which is stored as hardcoded templates for easy jump starts), a unique instance of that plan is created and stored here. This table enables users to follow multiple plans simultaneously while maintaining separate progress tracking for each.

### Activity Planning and Execution
`planned_activities` stores scheduled workouts, dynamically adapted based on fitness level, progress, and plan requirements.
- `id` — Primary key, UUID.
- `plan_id` — Foreign key → profile_plans.id.
- `structure` — JSON object defining workout steps, repetitions, and targets.
- `structure_version` — Indicates which JSON/Zod schema version is used for validation.
- `requires_threshold_hr` / requires_ftp — Boolean flags inherited from plan for quick checks.

- Optional fields: `notes`, `estimated duration`, `TSS`, etc.

Each planned activity includes a **`structure`** field (stored as JSON) that defines the workout steps. This approach avoids an unbounded relational table of steps while keeping workouts portable and compatible with common training formats (Garmin FIT, Wahoo plan.json, TrainingPeaks structure JSON).

The `structure` describes the workout as an ordered set of steps or repetitions, with duration, intensity, and targets. Example:

```json
{
  "Structure": [
    {
      "IntensityClass": "WarmUp",
      "Name": "Warm up",
      "Length": { "Unit": "Second", "Value": 600 },
      "Type": "Step",
      "IntensityTarget": {
        "Unit": "PercentOfFtp",
        "Value": 60,
        "MinValue": 55,
        "MaxValue": 65
      }
    },
    ...
  ]
}

```
Supported fields:

- `Step types`: Step or Repetition (repeated sub-steps).
- `Length units`: Second, Meter, Repetition.
- `IntensityClass`: WarmUp, Active, Rest, CoolDown.
- `IntensityTarget`: can be expressed in %FTP, %MaxHR, %ThresholdHR, speed, cadence, or RPE.
- `Optional fields`: Name, Notes, CadenceTarget, OpenDuration.

By embedding structure as JSON, the platform can compute planned duration, distance, and training stress (TSS) while keeping the schema compact and easily interoperable with other training ecosystems.

Notes for implementation:
- %FTP, %MaxHR, %ThresholdHR, RPE, speed, and cadence can be calculated from profile info, and can be used to determine the range (min/max) values to guide step intensity.
- Planned activities that require threshold_hr or ftp should trigger an alert if the value is missing; flags like `requires_threshold_hr` and `requires_ftp` can be stored in planned_activities.

## Activities & Performance Analysis

`activities` captures all completed sessions, either recorded through devices or manually entered.

- id — Primary key, UUID.
- profile_id — Foreign key → profiles.profile_id.
- planned_activity_id — Optional foreign key → planned_activities.id.
- started_at, ended_at — Timestamps.
- source — Device or manual entry.

`activity_results` provides analytical metrics:
- activity_id — Foreign key → activities.id.
- Metrics: TSS, CTL, compliance score, normalized power, etc.
- All fields should have appropriate numeric types (float or integer) with NULL defaults if data is missing.

`activity_streams` contains granular, time-series data:
- Each row represents a timestamped metric (HR, power, cadence, GPS coordinates, speed).
- Columns: activity_id, timestamp, metric_type, value.
- Indexing or partitioning recommended for large datasets.

## Schema Benefits

This architecture supports sophisticated training management by enabling dynamic plan adaptation, comprehensive performance tracking, and detailed analytics while maintaining data integrity through proper relational design. The local-first approach ensures athletes can record activities and access planned workouts without connectivity, while the cloud-based analysis engine provides advanced insights once synchronized. The separation of planned versus completed activities allows for intelligent training adjustments based on actual performance and compliance patterns, creating a responsive training system that evolves with the athlete's development.
