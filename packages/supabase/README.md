# Training Platform Database Schema Overview

This document provides a high-level overview of the database schema for a comprehensive training platform that manages athletes, training plans, and performance tracking.

## Core Architecture

The schema is built around a user-centric design that supports personalized training plans with detailed activity tracking and performance analysis. The database leverages Supabase's built-in authentication system and extends it with custom tables to create a complete training management solution.

All tables include `created_at` and `updated_at` timestamps for auditing purposes.

## Table Relationships and Structure

### User Management
`auth.users` serves as the foundation, utilizing Supabase's built-in authentication system to handle user accounts, login credentials, and security.

This table is extended by **`profiles`**, which stores comprehensive personal information, preferences, and athlete-specific metrics. These metrics are critical for defining workout intensity, scaling training plans, and tailoring analytics to each athlete’s physiology.

### Key fields in `profiles` include:

**Fitness Metrics:**
- `threshold_hr` — Threshold Heart Rate (bpm); nullable for new users.
- `ftp` — Functional Threshold Power (watts); nullable for new users.
- `weight_kg` — Athlete’s body weight (kg), used in power-to-weight performance metrics.

**Personalization & Preferences:**
- `gender` — User's gender for use in predictive models and analytics.
- `dob` — Date of birth, used to calculate age-based targets and zones.
- `username` — Public-facing username/handle; must be unique.
- `language` — Preferred language/locale for the user interface.
- `preferred_units` — Chosen measurement system (metric vs imperial).
- `avatar_url` — Profile picture/avatar for use across the platform.
- `bio` — Optional short biography or description.

### Training Plan Framework
**`profile_plans`** contains personalized training plans for each user. This table enables users to follow multiple plans simultaneously while maintaining separate progress tracking for each.

Key fields include:
- `snapshot_ftp` & `snapshot_threshold_hr` — A snapshot of the user's fitness metrics at the time the plan is created, ensuring the plan's context remains stable.
- `config` — A flexible JSONB field to store progression rules like ramp rate and weekly targets, allowing the core application to drive plan logic.
- `config_version` — Indicates which schema version is used for the `config` JSONB, ensuring backward compatibility.

### Activity Planning and Execution
`planned_activities` stores scheduled workouts, which can be part of a plan or standalone sessions.
- `id` — Primary key, UUID.
- `profile_plan_id` — Optional foreign key → `profile_plans.id`.
- `structure` — JSONB object defining workout steps, repetitions, and targets.
- `structure_version` — Indicates which schema version is used for the `structure` JSONB, ensuring backward compatibility.
- `requires_threshold_hr` / `requires_ftp` — Boolean flags for quick checks on workout requirements.
- `estimated_duration` & `estimated_tss` — Pre-calculated estimates of the workout's length and training stress, computed by the core application logic.
- `adherence_score` — A nullable field to be populated by the core package after a workout is completed and analyzed.

Each planned activity includes a **`structure`** field (stored as JSONB) that defines the workout steps. This approach avoids an unbounded relational table of steps while keeping workouts portable and compatible with common training formats.

## Activities & Performance Analysis

This part of the schema is designed to handle completed workouts, from the raw data file to a full analytical summary.

### `activities`
This is the central table for a completed workout. Instead of storing all the data here, it primarily acts as a pointer to the raw activity data file and tracks its synchronization status.
- `local_storage_path` — The path to the activity file on the user's device.
- `cloud_storage_path` — The path to the activity file once uploaded to cloud storage.
- `sync_status` — The synchronization state of the file (e.g., `local_only`, `syncing`, `synced`).

### `activity_results`
This table stores the comprehensive analytical summary of a completed workout, calculated by the core package from the raw data.
- `activity_id` — Foreign key → `activities.id`.
- **Profile Snapshot:** Captures the user's `weight_kg`, `ftp`, and `threshold_hr` at the time of the activity for accurate calculations.
- **Training Load:** `tss`, `ctl`, `atl`, `tsb`.
- **Power Metrics:** `normalized_power`, `avg_power`, `intensity_factor`, etc.
- **Heart Rate Metrics:** `avg_heart_rate`, `max_heart_rate`.
- **Cadence, Speed, Distance, and Elevation** metrics.
- **Compliance:** `adherence_score` and `workout_match` to score performance against a planned activity.

### `activity_streams`
This table contains the granular, time-series data from a recorded activity, optimized for storage and retrieval.
- `activity_id` — Foreign key → `activities.id`.
- `type` — The type of data stream (e.g., 'power', 'heartrate', 'latlng').
- `data`, `data_latlng`, `data_moving` — Columns that store the actual time-series data in arrays (`double precision[]`, `boolean[]`), which is a highly efficient storage method for this type of information.

## Schema Benefits

This architecture supports sophisticated training management by enabling dynamic plan adaptation, comprehensive performance tracking, and detailed analytics while maintaining data integrity through proper relational design. The separation of the raw data's location (`activities`) from its analytical summary (`activity_results`) and time-series data (`activity_streams`) creates a robust and scalable system. This allows the application to handle large data files efficiently while providing rich, queryable insights into athlete performance.
