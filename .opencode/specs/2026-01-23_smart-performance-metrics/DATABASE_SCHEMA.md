# Universal Critical Intensity System - Database Schema Specification

**Created:** 2026-01-23  
**Status:** Design Complete  
**Related:** DESIGN.md, ABSTRACTION.md, IMPLEMENTATION_GUIDE.md

---

## Table of Contents

1. [Schema Overview](#schema-overview)
2. [Design Decisions](#design-decisions)
3. [Required Schema Changes](#required-schema-changes)
4. [Data Model](#data-model)
5. [Migration Files](#migration-files)
6. [Query Patterns](#query-patterns)
7. [RLS Policies](#rls-policies)
8. [Example Data](#example-data)
9. [Performance Optimization](#performance-optimization)
10. [Testing & Validation](#testing--validation)

---

## Schema Overview

### How CI Models Fit Into Existing Schema

The Universal Critical Intensity (CI) system leverages the **existing `profile_performance_metric_logs` table** rather than creating a new table. This design decision provides:

- **Temporal tracking**: CI models evolve over time as athlete fitness changes
- **Consistency**: Same table structure for all performance metrics
- **Simplicity**: No additional joins required for queries
- **Proven architecture**: Reuses existing temporal query patterns

### Existing Table Structure

```sql
-- Current table (packages/supabase/migrations/20260120134733_profile_metric_logs.sql)
CREATE TABLE profile_performance_metric_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idx INTEGER NOT NULL DEFAULT nextval('profile_performance_metric_logs_idx_seq'::regclass),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Metric identification
  category activity_category NOT NULL,
  type performance_metric_type NOT NULL,
  value NUMERIC NOT NULL CHECK (value > 0),
  unit TEXT NOT NULL,
  duration_seconds INTEGER CHECK (duration_seconds > 0),

  -- Provenance
  reference_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  notes TEXT,

  -- Timestamps
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Current Indexes

```sql
-- Temporal lookup (critical for "metric at date" queries)
CREATE INDEX idx_profile_performance_metric_logs_temporal_lookup
  ON profile_performance_metric_logs(profile_id, category, type, duration_seconds, recorded_at DESC);

-- Profile metrics list
CREATE INDEX idx_profile_performance_metric_logs_profile
  ON profile_performance_metric_logs(profile_id, recorded_at DESC);

-- Chronological ordering
CREATE INDEX idx_profile_performance_metric_logs_recorded_at
  ON profile_performance_metric_logs(recorded_at DESC);

-- Activity reference lookup
CREATE INDEX idx_profile_performance_metric_logs_reference_activity
  ON profile_performance_metric_logs(reference_activity_id)
  WHERE reference_activity_id IS NOT NULL;
```

---

## Design Decisions

### Why Use Existing Table vs. New Table?

#### Option A: New `critical_intensity_models` Table

**Pros:**

- ✅ Dedicated structure for CI-specific data
- ✅ Clearer separation of concerns
- ✅ Could include model-specific metadata (R², phenotype, etc.)

**Cons:**

- ❌ Duplicate temporal tracking logic
- ❌ Additional joins required for queries
- ❌ More complex migration path
- ❌ Breaks consistency with other metrics

#### Option B: Extend Existing `profile_performance_metric_logs` Table (CHOSEN)

**Pros:**

- ✅ Reuses proven temporal query patterns
- ✅ Consistent with existing metrics architecture
- ✅ Simpler queries (single table)
- ✅ Minimal schema changes required
- ✅ CI values are performance metrics (CP, CS, etc.)

**Cons:**

- ⚠️ Need JSONB metadata for model-specific data
- ⚠️ Requires new enum values for metric types

**Decision:** Use existing table with enum extensions and JSONB metadata.

### Trade-offs

| Aspect               | Existing Table Approach      | New Table Approach          |
| -------------------- | ---------------------------- | --------------------------- |
| **Implementation**   | ✅ Simple migration          | ❌ Complex migration        |
| **Query Complexity** | ✅ Single table queries      | ❌ Requires joins           |
| **Consistency**      | ✅ Matches existing patterns | ⚠️ New pattern              |
| **Extensibility**    | ✅ Easy to add categories    | ✅ Easy to add model fields |
| **Performance**      | ✅ Existing indexes work     | ⚠️ Need new indexes         |
| **Type Safety**      | ⚠️ JSONB for metadata        | ✅ Typed columns            |

**Final Verdict:** Existing table approach wins on simplicity and consistency.

---

## Required Schema Changes

### 1. New Enum Values for `performance_metric_type`

Add CI-specific metric types to support different manifestations:

```sql
-- Migration: 20260123140000_add_ci_metric_types.sql
-- Add new metric types for Critical Intensity models

-- Critical Power (Cycling)
ALTER TYPE performance_metric_type ADD VALUE IF NOT EXISTS 'critical_power';

-- Critical Speed (Running, Swimming)
ALTER TYPE performance_metric_type ADD VALUE IF NOT EXISTS 'critical_speed';

-- Critical Pace (Alternative for Running/Swimming)
ALTER TYPE performance_metric_type ADD VALUE IF NOT EXISTS 'critical_pace';

-- Work Capacity (W' for cycling)
ALTER TYPE performance_metric_type ADD VALUE IF NOT EXISTS 'work_capacity';

-- Distance Capacity (D' for running/swimming)
ALTER TYPE performance_metric_type ADD VALUE IF NOT EXISTS 'distance_capacity';
```

**Updated Enum:**

```sql
CREATE TYPE performance_metric_type AS ENUM (
  -- Existing values
  'power',          -- Instantaneous power
  'pace',           -- Instantaneous pace
  'speed',          -- Instantaneous speed
  'heart_rate',     -- Heart rate

  -- NEW: Critical Intensity values
  'critical_power',     -- CP (watts)
  'critical_speed',     -- CS (m/s)
  'critical_pace',      -- Critical pace (sec/km)
  'work_capacity',      -- W' (joules)
  'distance_capacity'   -- D' (meters)
);
```

### 2. New Column: `metadata` (JSONB)

Store model-specific data without breaking schema flexibility:

```sql
-- Migration: 20260123140000_add_ci_metric_types.sql (continued)

-- Add metadata column for CI model details
ALTER TABLE profile_performance_metric_logs
ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;

-- Create GIN index for efficient JSONB queries
CREATE INDEX idx_profile_performance_metric_logs_metadata_gin
  ON profile_performance_metric_logs USING GIN (metadata);

-- Add comment for documentation
COMMENT ON COLUMN profile_performance_metric_logs.metadata IS
  'JSONB metadata for CI models: {
    "capacity": number,           // W'' or D'' value
    "capacity_unit": string,      // "joules" or "meters"
    "quality": {
      "r_squared": number,        // 0-1
      "standard_error": number,
      "confidence_level": string, // "high" | "medium" | "low"
      "effort_count": number
    },
    "phenotype": string,          // "sprinter" | "time-trialist" | "all-rounder"
    "model_version": string,      // "2.0"
    "source_activity_ids": string[] // Activities used for calculation
  }';
```

### 3. New Column: `source` (Enum)

Track how the metric was generated:

```sql
-- Migration: 20260123140000_add_ci_metric_types.sql (continued)

-- Add source tracking
CREATE TYPE metric_source AS ENUM (
  'manual',              -- User manually entered
  'activity_detection',  -- Auto-detected from activity
  'curve_model',         -- Derived from CI model
  'suggestion',          -- Applied from suggestion
  'imported'             -- Imported from external service
);

ALTER TABLE profile_performance_metric_logs
ADD COLUMN source metric_source NOT NULL DEFAULT 'manual';

-- Create index for filtering by source
CREATE INDEX idx_profile_performance_metric_logs_source
  ON profile_performance_metric_logs(source)
  WHERE source != 'manual';

-- Add comment
COMMENT ON COLUMN profile_performance_metric_logs.source IS
  'How this metric was created: manual, activity_detection, curve_model, suggestion, imported';
```

### 4. Schema Enhancement Summary

**New Columns:**

- `metadata JSONB` - Model-specific data (quality, phenotype, etc.)
- `source metric_source` - Tracking how metric was created

**New Enum Values:**

- `performance_metric_type`: Added 5 CI-related types
- `metric_source`: New enum for provenance tracking

**New Indexes:**

- GIN index on `metadata` for JSONB queries
- B-tree index on `source` for filtering

**No Structural Changes:**

- Table structure remains backward compatible
- Existing queries continue to work
- Existing indexes continue to be effective

---

## Data Model

### How to Store Critical Power (Bike)

**Scenario:** Cyclist with CP = 250W, W' = 20,000J

```sql
-- Store Critical Power
INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  duration_seconds,
  source,
  metadata,
  recorded_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'bike',
  'critical_power',
  250,                    -- CP in watts
  'watts',
  NULL,                   -- CI is asymptotic, not duration-specific
  'curve_model',
  '{
    "capacity": 20000,
    "capacity_unit": "joules",
    "quality": {
      "r_squared": 0.963,
      "standard_error": 8.2,
      "confidence_level": "high",
      "effort_count": 7
    },
    "phenotype": "time-trialist",
    "model_version": "2.0",
    "source_activity_ids": [
      "a1b2c3d4-...",
      "e5f6g7h8-..."
    ],
    "ftp_estimate": 238,   -- CP × 0.95
    "power_to_weight": 3.57,
    "calculation_params": {
      "regression_method": "least_squares",
      "duration_range": [5, 3600],
      "data_points": 7
    }
  }'::jsonb,
  '2026-01-23 10:00:00+00'
);

-- Optionally: Store W' as separate metric for easier querying
INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  source,
  metadata,
  recorded_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'bike',
  'work_capacity',
  20000,                  -- W' in joules
  'joules',
  'curve_model',
  '{
    "critical_intensity": 250,
    "critical_intensity_unit": "watts"
  }'::jsonb,
  '2026-01-23 10:00:00+00'
);
```

**Query Pattern:**

```sql
-- Get latest CP model for a profile
SELECT
  value AS critical_power,
  metadata->>'capacity' AS w_prime,
  metadata->'quality'->>'r_squared' AS r_squared,
  metadata->>'phenotype' AS phenotype
FROM profile_performance_metric_logs
WHERE profile_id = '550e8400-e29b-41d4-a716-446655440000'
  AND category = 'bike'
  AND type = 'critical_power'
ORDER BY recorded_at DESC
LIMIT 1;
```

### How to Store Critical Speed (Run)

**Scenario:** Runner with CS = 4.5 m/s (3:42 min/km), D' = 180m

```sql
-- Store Critical Speed
INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  duration_seconds,
  source,
  metadata,
  recorded_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'run',
  'critical_speed',
  4.5,                    -- CS in m/s
  'm/s',
  NULL,
  'curve_model',
  '{
    "capacity": 180,
    "capacity_unit": "meters",
    "quality": {
      "r_squared": 0.951,
      "standard_error": 0.08,
      "confidence_level": "high",
      "effort_count": 5
    },
    "phenotype": "all-rounder",
    "model_version": "2.0",
    "display_units": {
      "pace_min_per_km": 3.70,
      "pace_min_per_mi": 5.95,
      "speed_km_h": 16.2
    },
    "race_predictions": {
      "5k_seconds": 1110,
      "10k_seconds": 2340,
      "half_marathon_seconds": 5160,
      "marathon_seconds": 11400
    },
    "riegel_exponent": 1.08
  }'::jsonb,
  '2026-01-23 10:00:00+00'
);

-- Store D' separately
INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  source,
  metadata,
  recorded_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'run',
  'distance_capacity',
  180,                    -- D' in meters
  'meters',
  'curve_model',
  '{
    "critical_intensity": 4.5,
    "critical_intensity_unit": "m/s"
  }'::jsonb,
  '2026-01-23 10:00:00+00'
);
```

### How to Store Critical Speed (Swim)

**Scenario:** Swimmer with CS = 1.5 m/s (1:06.7 per 100m), D' = 50m

```sql
-- Store Critical Speed (Swimming)
INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  duration_seconds,
  source,
  metadata,
  recorded_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'swim',
  'critical_speed',
  1.5,                    -- CS in m/s
  'm/s',
  NULL,
  'curve_model',
  '{
    "capacity": 50,
    "capacity_unit": "meters",
    "quality": {
      "r_squared": 0.942,
      "standard_error": 0.05,
      "confidence_level": "medium",
      "effort_count": 4
    },
    "phenotype": "all-rounder",
    "model_version": "2.0",
    "display_units": {
      "pace_sec_per_100m": 66.7,
      "pace_min_per_100m": 1.11
    },
    "distance_predictions": {
      "100m_seconds": 66,
      "200m_seconds": 140,
      "400m_seconds": 295,
      "1500m_seconds": 1150
    },
    "pool_vs_open_water": "pool"
  }'::jsonb,
  '2026-01-23 10:00:00+00'
);
```

### How to Store Strength Metrics

**Note:** Hyperbolic model does NOT apply to strength training.

**Alternative Approach: Volume-Load Tracking**

```sql
-- Store strength volume capacity (NOT CI model)
INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  source,
  metadata,
  recorded_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'strength',
  'power',  -- Use existing 'power' type, unit = 'volume'
  12000,                  -- Total volume capacity
  'volume_units',
  'manual',
  '{
    "critical_rpe": 7,
    "volume_by_rpe": {
      "6": 15000,
      "7": 12000,
      "8": 8000,
      "9": 4000
    },
    "one_rep_max_estimates": {
      "squat_kg": 150,
      "bench_kg": 100,
      "deadlift_kg": 180
    },
    "notes": "Strength metrics use volume-load, not hyperbolic CI model"
  }'::jsonb,
  '2026-01-23 10:00:00+00'
);
```

**Recommendation:** For strength, track volume at different RPE levels rather than using CI model.

### Metadata JSON Schema

**Schema Definition:**

```typescript
interface CIModelMetadata {
  // Anaerobic capacity (required for CI models)
  capacity: number;
  capacity_unit: "joules" | "meters" | "volume_units";

  // Model quality (required)
  quality: {
    r_squared: number; // 0-1
    standard_error: number;
    confidence_level: "high" | "medium" | "low";
    effort_count: number;
    warnings?: string[];
  };

  // Athlete phenotype (required)
  phenotype: "sprinter" | "time-trialist" | "all-rounder";

  // Model version for future compatibility
  model_version: string;

  // Source activities used for calculation
  source_activity_ids?: string[];

  // Display-friendly units (optional)
  display_units?: {
    [key: string]: number;
  };

  // Derived metrics (optional)
  ftp_estimate?: number; // Bike: CP × 0.95
  power_to_weight?: number; // Bike: W/kg
  race_predictions?: {
    // Run/Swim: Predicted times
    [distance: string]: number;
  };
  riegel_exponent?: number; // Run: Distance decay factor

  // Calculation parameters (for debugging/audit)
  calculation_params?: {
    regression_method: string;
    duration_range: [number, number];
    data_points: number;
  };

  // Relationship to other metrics
  critical_intensity?: number; // For capacity metrics
  critical_intensity_unit?: string;
}
```

**Validation:**

```typescript
import { z } from "zod";

export const ciModelMetadataSchema = z.object({
  capacity: z.number(),
  capacity_unit: z.enum(["joules", "meters", "volume_units"]),
  quality: z.object({
    r_squared: z.number().min(0).max(1),
    standard_error: z.number().nonnegative(),
    confidence_level: z.enum(["high", "medium", "low"]),
    effort_count: z.number().int().min(3),
    warnings: z.array(z.string()).optional(),
  }),
  phenotype: z.enum(["sprinter", "time-trialist", "all-rounder"]),
  model_version: z.string(),
  source_activity_ids: z.array(z.string().uuid()).optional(),
  display_units: z.record(z.number()).optional(),
  ftp_estimate: z.number().optional(),
  power_to_weight: z.number().optional(),
  race_predictions: z.record(z.number()).optional(),
  riegel_exponent: z.number().optional(),
  calculation_params: z
    .object({
      regression_method: z.string(),
      duration_range: z.tuple([z.number(), z.number()]),
      data_points: z.number().int(),
    })
    .optional(),
  critical_intensity: z.number().optional(),
  critical_intensity_unit: z.string().optional(),
});
```

---

## Migration Files

### Migration 1: Add CI Metric Types and Metadata

**File:** `packages/supabase/migrations/20260123140000_add_ci_metric_types.sql`

```sql
-- ============================================================================
-- Migration: Add Critical Intensity Model Support
-- Created: 2026-01-23 14:00:00
-- Description: Extends performance_metric_type enum and adds metadata column
--              for Universal Critical Intensity system
-- ============================================================================

-- ============================================================================
-- 1. ADD NEW ENUM VALUES
-- ============================================================================
-- Add CI-specific metric types to performance_metric_type enum

-- Critical Power (Cycling)
ALTER TYPE performance_metric_type ADD VALUE IF NOT EXISTS 'critical_power';

-- Critical Speed (Running, Swimming)
ALTER TYPE performance_metric_type ADD VALUE IF NOT EXISTS 'critical_speed';

-- Critical Pace (Alternative for Running/Swimming)
ALTER TYPE performance_metric_type ADD VALUE IF NOT EXISTS 'critical_pace';

-- Work Capacity (W' for cycling)
ALTER TYPE performance_metric_type ADD VALUE IF NOT EXISTS 'work_capacity';

-- Distance Capacity (D' for running/swimming)
ALTER TYPE performance_metric_type ADD VALUE IF NOT EXISTS 'distance_capacity';

-- ============================================================================
-- 2. ADD METADATA COLUMN
-- ============================================================================
-- Store CI model-specific data (quality metrics, phenotype, etc.)

ALTER TABLE profile_performance_metric_logs
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN profile_performance_metric_logs.metadata IS
'JSONB metadata for CI models and other metric enhancements.

For CI models, structure:
{
  "capacity": number,              // W'' or D'' value
  "capacity_unit": string,         // "joules" or "meters"
  "quality": {
    "r_squared": number,           // 0-1 (model fit)
    "standard_error": number,      // Prediction error
    "confidence_level": string,    // "high" | "medium" | "low"
    "effort_count": number         // Number of efforts used
  },
  "phenotype": string,             // "sprinter" | "time-trialist" | "all-rounder"
  "model_version": string,         // "2.0"
  "source_activity_ids": string[], // Activities used for calculation
  "display_units": object,         // User-friendly unit conversions
  "ftp_estimate": number,          // Derived FTP (bike only)
  "power_to_weight": number,       // W/kg (bike only)
  "race_predictions": object,      // Time predictions (run/swim only)
  "calculation_params": object     // Debug/audit info
}';

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_profile_performance_metric_logs_metadata_gin
  ON profile_performance_metric_logs USING GIN (metadata);

-- Index for quality queries (e.g., "show me high-confidence CI models")
CREATE INDEX IF NOT EXISTS idx_profile_performance_metric_logs_metadata_quality
  ON profile_performance_metric_logs ((metadata->'quality'->>'confidence_level'))
  WHERE type IN ('critical_power', 'critical_speed', 'critical_pace');

-- ============================================================================
-- 3. ADD SOURCE TRACKING ENUM
-- ============================================================================
-- Track how metrics were created

CREATE TYPE metric_source AS ENUM (
  'manual',              -- User manually entered
  'activity_detection',  -- Auto-detected from activity
  'curve_model',         -- Derived from CI model
  'suggestion',          -- Applied from smart suggestion
  'imported'             -- Imported from external service
);

-- Add source column
ALTER TABLE profile_performance_metric_logs
ADD COLUMN IF NOT EXISTS source metric_source NOT NULL DEFAULT 'manual';

-- Add comment
COMMENT ON COLUMN profile_performance_metric_logs.source IS
'Provenance: how this metric was created (manual, activity_detection, curve_model, suggestion, imported)';

-- Index for filtering by source
CREATE INDEX IF NOT EXISTS idx_profile_performance_metric_logs_source
  ON profile_performance_metric_logs(source)
  WHERE source != 'manual';

-- ============================================================================
-- 4. VERIFICATION QUERIES
-- ============================================================================
-- Run these after migration to verify success

-- Check new enum values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'critical_power'
      AND enumtypid = 'performance_metric_type'::regtype
  ) THEN
    RAISE EXCEPTION 'Migration failed: critical_power enum value not added';
  END IF;
END $$;

-- Check metadata column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profile_performance_metric_logs'
      AND column_name = 'metadata'
  ) THEN
    RAISE EXCEPTION 'Migration failed: metadata column not added';
  END IF;
END $$;

-- Check source column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profile_performance_metric_logs'
      AND column_name = 'source'
  ) THEN
    RAISE EXCEPTION 'Migration failed: source column not added';
  END IF;
END $$;

-- Verify indexes created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_profile_performance_metric_logs_metadata_gin'
  ) THEN
    RAISE EXCEPTION 'Migration failed: GIN index on metadata not created';
  END IF;
END $$;

-- ============================================================================
-- 5. SUCCESS MESSAGE
-- ============================================================================

RAISE NOTICE 'Migration 20260123140000_add_ci_metric_types.sql completed successfully';
RAISE NOTICE 'Added 5 new performance_metric_type enum values';
RAISE NOTICE 'Added metadata JSONB column with GIN index';
RAISE NOTICE 'Added source tracking column with metric_source enum';
RAISE NOTICE 'Total new indexes: 3';
```

### Migration 2: Optimize Indexes for CI Queries

**File:** `packages/supabase/migrations/20260123140100_optimize_ci_indexes.sql`

```sql
-- ============================================================================
-- Migration: Optimize Indexes for Critical Intensity Queries
-- Created: 2026-01-23 14:01:00
-- Description: Add specialized indexes for common CI query patterns
-- ============================================================================

-- ============================================================================
-- 1. CI MODEL LOOKUP INDEX
-- ============================================================================
-- Optimizes: "Get latest CI model for profile + category"

CREATE INDEX IF NOT EXISTS idx_ci_model_latest_lookup
  ON profile_performance_metric_logs(
    profile_id,
    category,
    recorded_at DESC
  )
  WHERE type IN ('critical_power', 'critical_speed', 'critical_pace');

-- ============================================================================
-- 2. TEMPORAL CI MODEL INDEX
-- ============================================================================
-- Optimizes: "Get CI model at specific date"

CREATE INDEX IF NOT EXISTS idx_ci_model_temporal
  ON profile_performance_metric_logs(
    profile_id,
    category,
    type,
    recorded_at DESC
  )
  WHERE type IN ('critical_power', 'critical_speed', 'critical_pace');

-- ============================================================================
-- 3. CAPACITY METRICS INDEX
-- ============================================================================
-- Optimizes: "Get W' or D' for profile"

CREATE INDEX IF NOT EXISTS idx_capacity_metrics
  ON profile_performance_metric_logs(
    profile_id,
    category,
    type,
    recorded_at DESC
  )
  WHERE type IN ('work_capacity', 'distance_capacity');

-- ============================================================================
-- 4. HIGH-QUALITY MODELS INDEX
-- ============================================================================
-- Optimizes: "Find high-confidence CI models"

CREATE INDEX IF NOT EXISTS idx_ci_high_quality
  ON profile_performance_metric_logs(
    profile_id,
    recorded_at DESC
  )
  WHERE type IN ('critical_power', 'critical_speed', 'critical_pace')
    AND metadata @> '{"quality": {"confidence_level": "high"}}';

-- ============================================================================
-- 5. CURVE MODEL SOURCE INDEX
-- ============================================================================
-- Optimizes: "Find all metrics generated from curve models"

CREATE INDEX IF NOT EXISTS idx_curve_model_source
  ON profile_performance_metric_logs(
    profile_id,
    source,
    recorded_at DESC
  )
  WHERE source = 'curve_model';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Count CI metrics
SELECT
  COUNT(*) as total_ci_metrics
FROM profile_performance_metric_logs
WHERE type IN ('critical_power', 'critical_speed', 'critical_pace');

-- Show index usage stats (run after production deployment)
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   idx_scan as index_scans,
--   idx_tup_read as tuples_read
-- FROM pg_stat_user_indexes
-- WHERE tablename = 'profile_performance_metric_logs'
--   AND indexname LIKE 'idx_ci%'
-- ORDER BY idx_scan DESC;

RAISE NOTICE 'Migration 20260123140100_optimize_ci_indexes.sql completed successfully';
RAISE NOTICE 'Added 5 specialized indexes for CI query patterns';
```

### Rollback Procedures

**Rollback Script:** `packages/supabase/migrations/rollback/20260123_rollback_ci_changes.sql`

```sql
-- ============================================================================
-- ROLLBACK: Remove Critical Intensity Schema Changes
-- Created: 2026-01-23
-- WARNING: This will delete all CI model data!
-- ============================================================================

-- Confirm rollback
DO $$
BEGIN
  RAISE WARNING 'Starting rollback of CI schema changes';
  RAISE WARNING 'This will delete all CI model data and cannot be undone';
END $$;

-- ============================================================================
-- 1. DROP INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_ci_model_latest_lookup;
DROP INDEX IF EXISTS idx_ci_model_temporal;
DROP INDEX IF EXISTS idx_capacity_metrics;
DROP INDEX IF EXISTS idx_ci_high_quality;
DROP INDEX IF EXISTS idx_curve_model_source;
DROP INDEX IF EXISTS idx_profile_performance_metric_logs_metadata_gin;
DROP INDEX IF EXISTS idx_profile_performance_metric_logs_metadata_quality;
DROP INDEX IF EXISTS idx_profile_performance_metric_logs_source;

-- ============================================================================
-- 2. DELETE CI DATA (OPTIONAL - COMMENT OUT TO PRESERVE DATA)
-- ============================================================================

-- Delete CI model records
-- WARNING: Uncomment only if you want to delete data
-- DELETE FROM profile_performance_metric_logs
-- WHERE type IN (
--   'critical_power',
--   'critical_speed',
--   'critical_pace',
--   'work_capacity',
--   'distance_capacity'
-- );

-- ============================================================================
-- 3. DROP COLUMNS
-- ============================================================================

-- Drop metadata column (WARNING: Deletes all metadata)
ALTER TABLE profile_performance_metric_logs DROP COLUMN IF EXISTS metadata;

-- Drop source column
ALTER TABLE profile_performance_metric_logs DROP COLUMN IF EXISTS source;

-- ============================================================================
-- 4. DROP ENUM TYPE
-- ============================================================================

DROP TYPE IF EXISTS metric_source;

-- ============================================================================
-- 5. REMOVE ENUM VALUES (CANNOT BE DONE SAFELY IN POSTGRESQL)
-- ============================================================================

-- NOTE: PostgreSQL does not support removing enum values directly.
-- You would need to:
-- 1. Create new enum without CI values
-- 2. Migrate data
-- 3. Drop old enum
-- 4. Rename new enum
--
-- This is complex and risky. Instead, leave the enum values in place.
-- They won't cause issues if unused.

RAISE WARNING 'Rollback partially complete';
RAISE WARNING 'Enum values (critical_power, etc.) cannot be safely removed';
RAISE WARNING 'They remain in performance_metric_type enum but are unused';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check columns dropped
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profile_performance_metric_logs'
      AND column_name = 'metadata'
  ) THEN
    RAISE EXCEPTION 'Rollback failed: metadata column still exists';
  END IF;
END $$;

RAISE NOTICE 'Rollback completed successfully';
```

---

## Query Patterns

### Pattern 1: Get Latest CI Model for Profile + Category

**Use Case:** Display current Critical Power on athlete dashboard

```sql
-- Get latest Critical Power model for a cyclist
SELECT
  id,
  value AS critical_power_watts,
  (metadata->>'capacity')::numeric AS w_prime_joules,
  metadata->'quality'->>'r_squared' AS r_squared,
  metadata->'quality'->>'confidence_level' AS confidence,
  metadata->>'phenotype' AS phenotype,
  metadata->>'ftp_estimate' AS ftp_watts,
  recorded_at,
  source
FROM profile_performance_metric_logs
WHERE profile_id = :profile_id
  AND category = 'bike'
  AND type = 'critical_power'
ORDER BY recorded_at DESC
LIMIT 1;

-- Index used: idx_ci_model_latest_lookup
```

**TypeScript:**

```typescript
export async function getLatestCIModel(
  supabase: SupabaseClient,
  profileId: string,
  category: ActivityCategory,
): Promise<CriticalIntensityModel | null> {
  const { data, error } = await supabase
    .from("profile_performance_metric_logs")
    .select("*")
    .eq("profile_id", profileId)
    .eq("category", category)
    .in("type", ["critical_power", "critical_speed", "critical_pace"])
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    criticalIntensity: data.value,
    anaerobicCapacity: data.metadata.capacity,
    quality: data.metadata.quality,
    phenotype: data.metadata.phenotype,
    // ... map other fields
  };
}
```

### Pattern 2: Get CI Model at Specific Date (Temporal Query)

**Use Case:** What was my Critical Power on 2026-01-15?

```sql
-- Get CI model that was active on a specific date
SELECT
  id,
  value AS critical_power_watts,
  metadata->>'capacity' AS w_prime_joules,
  recorded_at,
  source
FROM profile_performance_metric_logs
WHERE profile_id = :profile_id
  AND category = :category
  AND type = 'critical_power'
  AND recorded_at <= :target_date
ORDER BY recorded_at DESC
LIMIT 1;

-- Example: Get CP on 2026-01-15
WHERE recorded_at <= '2026-01-15 23:59:59+00'

-- Index used: idx_ci_model_temporal
```

**TypeScript:**

```typescript
export async function getCIModelAtDate(
  supabase: SupabaseClient,
  profileId: string,
  category: ActivityCategory,
  targetDate: Date,
): Promise<CriticalIntensityModel | null> {
  const { data, error } = await supabase
    .from("profile_performance_metric_logs")
    .select("*")
    .eq("profile_id", profileId)
    .eq("category", category)
    .in("type", ["critical_power", "critical_speed", "critical_pace"])
    .lte("recorded_at", targetDate.toISOString())
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  return parseCIModel(data);
}
```

### Pattern 3: Get CI Model History

**Use Case:** Show progression of Critical Power over time

```sql
-- Get CI model history for visualization
SELECT
  recorded_at,
  value AS critical_power_watts,
  (metadata->>'capacity')::numeric AS w_prime_joules,
  metadata->'quality'->>'r_squared' AS r_squared,
  metadata->>'phenotype' AS phenotype
FROM profile_performance_metric_logs
WHERE profile_id = :profile_id
  AND category = 'bike'
  AND type = 'critical_power'
  AND recorded_at >= :start_date
  AND recorded_at <= :end_date
ORDER BY recorded_at ASC;

-- Example: Get CP history for last 3 months
WHERE recorded_at >= NOW() - INTERVAL '3 months'

-- Index used: idx_ci_model_temporal
```

**TypeScript:**

```typescript
export async function getCIModelHistory(
  supabase: SupabaseClient,
  profileId: string,
  category: ActivityCategory,
  startDate: Date,
  endDate: Date,
): Promise<CriticalIntensityModel[]> {
  const { data, error } = await supabase
    .from("profile_performance_metric_logs")
    .select("*")
    .eq("profile_id", profileId)
    .eq("category", category)
    .in("type", ["critical_power", "critical_speed", "critical_pace"])
    .gte("recorded_at", startDate.toISOString())
    .lte("recorded_at", endDate.toISOString())
    .order("recorded_at", { ascending: true });

  if (error || !data) return [];

  return data.map(parseCIModel);
}
```

### Pattern 4: Find Profiles Needing Recalculation

**Use Case:** Background job to recalculate stale CI models

```sql
-- Find profiles with outdated CI models
-- (Haven't updated CP in > 30 days but have recent activities)

SELECT DISTINCT
  p.id AS profile_id,
  p.email,
  MAX(pm.recorded_at) AS last_ci_update,
  COUNT(a.id) AS recent_activities
FROM profiles p
  LEFT JOIN profile_performance_metric_logs pm ON (
    pm.profile_id = p.id
    AND pm.type IN ('critical_power', 'critical_speed', 'critical_pace')
  )
  LEFT JOIN activities a ON (
    a.profile_id = p.id
    AND a.category = 'bike'
    AND a.start_time >= NOW() - INTERVAL '30 days'
  )
GROUP BY p.id, p.email
HAVING
  MAX(pm.recorded_at) < NOW() - INTERVAL '30 days'
  AND COUNT(a.id) >= 5
ORDER BY last_ci_update ASC NULLS FIRST;

-- This finds athletes who:
-- 1. Haven't updated CP in 30+ days
-- 2. Have done 5+ recent activities
-- 3. Should recalculate CI model
```

**TypeScript:**

```typescript
export async function findProfilesNeedingCIRecalc(
  supabase: SupabaseClient,
  category: ActivityCategory,
  staleDays: number = 30,
  minActivities: number = 5,
): Promise<
  { profileId: string; lastUpdate: Date | null; activityCount: number }[]
> {
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - staleDays);

  // Complex query - use RPC function for better performance
  const { data, error } = await supabase.rpc("find_stale_ci_models", {
    p_category: category,
    p_stale_date: staleDate.toISOString(),
    p_min_activities: minActivities,
  });

  if (error) throw error;
  return data;
}
```

### Pattern 5: Find High-Quality CI Models

**Use Case:** Show athletes with reliable CI models

```sql
-- Find all high-confidence CI models
SELECT
  profile_id,
  category,
  value AS critical_intensity,
  unit,
  metadata->'quality'->>'r_squared' AS r_squared,
  metadata->'quality'->'effort_count' AS effort_count,
  metadata->>'phenotype' AS phenotype,
  recorded_at
FROM profile_performance_metric_logs
WHERE type IN ('critical_power', 'critical_speed', 'critical_pace')
  AND metadata @> '{"quality": {"confidence_level": "high"}}'
  AND recorded_at >= NOW() - INTERVAL '60 days'
ORDER BY recorded_at DESC;

-- Index used: idx_ci_high_quality
```

### Pattern 6: Get Power Curve Data Points

**Use Case:** Display athlete's power curve with CI model overlay

```sql
-- Get all power metrics for curve visualization
SELECT
  duration_seconds,
  value AS power_watts,
  recorded_at,
  source,
  reference_activity_id
FROM profile_performance_metric_logs
WHERE profile_id = :profile_id
  AND category = 'bike'
  AND type = 'power'
  AND duration_seconds IS NOT NULL
  AND recorded_at >= NOW() - INTERVAL '42 days'
ORDER BY duration_seconds ASC;

-- Combine with CI model to show:
-- 1. Actual best efforts (scatter points)
-- 2. CI model curve (hyperbola)
-- 3. Predicted power at any duration
```

---

## RLS Policies

### Current State: RLS Disabled

```sql
-- From packages/supabase/schemas/init.sql
ALTER TABLE public.profile_performance_metric_logs DISABLE ROW LEVEL SECURITY;
```

**Rationale:**

- Backend uses SERVICE ROLE KEY (bypasses RLS)
- Authorization handled at tRPC layer via `protectedProcedure`
- All queries explicitly filter by `profile_id = ctx.session.user.id`
- Simpler for MVP

### Future: Enable RLS (Optional)

If you need to enable RLS (e.g., for direct client access):

```sql
-- Enable RLS on table
ALTER TABLE profile_performance_metric_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICY 1: Users can view their own metrics
-- ============================================================================
CREATE POLICY "users_view_own_metrics"
  ON profile_performance_metric_logs FOR SELECT
  USING (auth.uid() = profile_id);

-- ============================================================================
-- POLICY 2: Users can insert their own metrics
-- ============================================================================
CREATE POLICY "users_insert_own_metrics"
  ON profile_performance_metric_logs FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

-- ============================================================================
-- POLICY 3: Users can update their own metrics
-- ============================================================================
CREATE POLICY "users_update_own_metrics"
  ON profile_performance_metric_logs FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- ============================================================================
-- POLICY 4: Users can delete their own metrics
-- ============================================================================
CREATE POLICY "users_delete_own_metrics"
  ON profile_performance_metric_logs FOR DELETE
  USING (auth.uid() = profile_id);

-- ============================================================================
-- POLICY 5: Service role can do anything (bypass policies)
-- ============================================================================
-- This is automatic for service_role, no policy needed

-- ============================================================================
-- POLICY 6: Coaches can view athlete metrics (if implementing coaching)
-- ============================================================================
CREATE POLICY "coaches_view_athlete_metrics"
  ON profile_performance_metric_logs FOR SELECT
  USING (
    profile_id IN (
      SELECT athlete_id FROM coach_athlete_relationships
      WHERE coach_id = auth.uid()
        AND status = 'active'
    )
  );
```

**Testing RLS Policies:**

```sql
-- Test as user
SET ROLE authenticated;
SET request.jwt.claim.sub = '550e8400-e29b-41d4-a716-446655440000';

-- Should return only user's metrics
SELECT * FROM profile_performance_metric_logs;

-- Should fail (different profile_id)
INSERT INTO profile_performance_metric_logs (profile_id, ...)
VALUES ('different-user-id', ...);

-- Reset role
RESET ROLE;
```

---

## Example Data

### Sample INSERT Statements

```sql
-- ============================================================================
-- Example 1: Critical Power Model (Cyclist)
-- ============================================================================

INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  source,
  metadata,
  recorded_at,
  notes
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',  -- Alice (cyclist)
  'bike',
  'critical_power',
  275.0,                                    -- CP = 275W
  'watts',
  'curve_model',
  '{
    "capacity": 22000,
    "capacity_unit": "joules",
    "quality": {
      "r_squared": 0.971,
      "standard_error": 6.8,
      "confidence_level": "high",
      "effort_count": 9
    },
    "phenotype": "time-trialist",
    "model_version": "2.0",
    "source_activity_ids": [
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "b2c3d4e5-f6a7-8901-bcde-f12345678901"
    ],
    "ftp_estimate": 261,
    "power_to_weight": 3.93,
    "calculation_params": {
      "regression_method": "least_squares",
      "duration_range": [5, 3600],
      "data_points": 9
    }
  }'::jsonb,
  '2026-01-20 08:00:00+00',
  'Updated after 20-min FTP test on 2026-01-20'
);

-- ============================================================================
-- Example 2: Critical Speed Model (Runner)
-- ============================================================================

INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  source,
  metadata,
  recorded_at,
  notes
) VALUES (
  '660f9511-f3ac-52e5-b827-557766551111',  -- Bob (runner)
  'run',
  'critical_speed',
  4.2,                                      -- CS = 4.2 m/s (3:58 min/km)
  'm/s',
  'curve_model',
  '{
    "capacity": 165,
    "capacity_unit": "meters",
    "quality": {
      "r_squared": 0.948,
      "standard_error": 0.09,
      "confidence_level": "high",
      "effort_count": 6
    },
    "phenotype": "all-rounder",
    "model_version": "2.0",
    "display_units": {
      "pace_min_per_km": 3.97,
      "pace_min_per_mi": 6.38,
      "speed_km_h": 15.12
    },
    "race_predictions": {
      "5k_seconds": 1185,
      "10k_seconds": 2490,
      "half_marathon_seconds": 5520,
      "marathon_seconds": 12180
    },
    "riegel_exponent": 1.09,
    "calculation_params": {
      "regression_method": "least_squares",
      "duration_range": [60, 3600],
      "data_points": 6
    }
  }'::jsonb,
  '2026-01-18 06:30:00+00',
  'Updated after track workout with 1500m and 5k efforts'
);

-- ============================================================================
-- Example 3: Critical Speed Model (Swimmer)
-- ============================================================================

INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  source,
  metadata,
  recorded_at
) VALUES (
  '770fa622-g4bd-63f6-c938-668877662222',  -- Carol (swimmer)
  'swim',
  'critical_speed',
  1.45,                                     -- CS = 1.45 m/s (1:08.97/100m)
  'm/s',
  'curve_model',
  '{
    "capacity": 48,
    "capacity_unit": "meters",
    "quality": {
      "r_squared": 0.936,
      "standard_error": 0.06,
      "confidence_level": "medium",
      "effort_count": 5
    },
    "phenotype": "all-rounder",
    "model_version": "2.0",
    "display_units": {
      "pace_sec_per_100m": 68.97,
      "pace_min_per_100m": 1.15
    },
    "distance_predictions": {
      "100m_seconds": 68,
      "200m_seconds": 145,
      "400m_seconds": 310,
      "1500m_seconds": 1210
    },
    "pool_vs_open_water": "pool",
    "calculation_params": {
      "regression_method": "least_squares",
      "duration_range": [50, 1500],
      "data_points": 5
    }
  }'::jsonb,
  '2026-01-19 17:00:00+00'
);

-- ============================================================================
-- Example 4: Low-Quality CI Model (Needs More Data)
-- ============================================================================

INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  source,
  metadata,
  recorded_at,
  notes
) VALUES (
  '880gb733-h5ce-74g7-d049-779988773333',  -- Dave (new cyclist)
  'bike',
  'critical_power',
  240.0,
  'watts',
  'curve_model',
  '{
    "capacity": 18000,
    "capacity_unit": "joules",
    "quality": {
      "r_squared": 0.812,
      "standard_error": 18.5,
      "confidence_level": "low",
      "effort_count": 3,
      "warnings": [
        "Only 3 efforts used - need at least 5 for reliable model",
        "Duration range too narrow (300-1200s) - add short and long efforts"
      ]
    },
    "phenotype": "all-rounder",
    "model_version": "2.0",
    "calculation_params": {
      "regression_method": "least_squares",
      "duration_range": [300, 1200],
      "data_points": 3
    }
  }'::jsonb,
  '2026-01-22 12:00:00+00',
  'Preliminary CI model - need more max efforts for accuracy'
);
```

### Sample SELECT Queries

```sql
-- ============================================================================
-- Query 1: Get Alice's current Critical Power
-- ============================================================================

SELECT
  value AS cp_watts,
  metadata->>'capacity' AS w_prime_joules,
  metadata->'quality'->>'r_squared' AS r_squared,
  metadata->>'phenotype' AS phenotype,
  recorded_at
FROM profile_performance_metric_logs
WHERE profile_id = '550e8400-e29b-41d4-a716-446655440000'
  AND category = 'bike'
  AND type = 'critical_power'
ORDER BY recorded_at DESC
LIMIT 1;

-- Result:
-- cp_watts | w_prime_joules | r_squared | phenotype      | recorded_at
-- ---------+----------------+-----------+----------------+-------------------
-- 275      | 22000          | 0.971     | time-trialist  | 2026-01-20 08:00

-- ============================================================================
-- Query 2: Get Bob's running race predictions
-- ============================================================================

SELECT
  metadata->'race_predictions'->>'5k_seconds' AS predicted_5k_time,
  metadata->'race_predictions'->>'10k_seconds' AS predicted_10k_time,
  metadata->'race_predictions'->>'marathon_seconds' AS predicted_marathon_time,
  metadata->'display_units'->>'pace_min_per_km' AS threshold_pace
FROM profile_performance_metric_logs
WHERE profile_id = '660f9511-f3ac-52e5-b827-557766551111'
  AND category = 'run'
  AND type = 'critical_speed'
ORDER BY recorded_at DESC
LIMIT 1;

-- Result:
-- predicted_5k_time | predicted_10k_time | predicted_marathon_time | threshold_pace
-- ------------------+--------------------+-------------------------+---------------
-- 1185              | 2490               | 12180                   | 3.97

-- ============================================================================
-- Query 3: Find all high-quality CI models across categories
-- ============================================================================

SELECT
  category,
  type,
  value,
  unit,
  metadata->'quality'->>'r_squared' AS r_squared,
  metadata->'quality'->'effort_count' AS effort_count,
  recorded_at
FROM profile_performance_metric_logs
WHERE type IN ('critical_power', 'critical_speed', 'critical_pace')
  AND metadata @> '{"quality": {"confidence_level": "high"}}'
  AND recorded_at >= NOW() - INTERVAL '30 days'
ORDER BY recorded_at DESC;

-- Result:
-- category | type            | value | unit  | r_squared | effort_count | recorded_at
-- ---------+-----------------+-------+-------+-----------+--------------+-------------------
-- bike     | critical_power  | 275   | watts | 0.971     | 9            | 2026-01-20 08:00
-- run      | critical_speed  | 4.2   | m/s   | 0.948     | 6            | 2026-01-18 06:30
```

### Sample UPDATE Patterns

```sql
-- ============================================================================
-- Update 1: Recalculate CI model with new data
-- ============================================================================

-- Insert new CI model (don't UPDATE old one - preserve history)
INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  source,
  metadata,
  recorded_at,
  notes
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'bike',
  'critical_power',
  280.0,                                    -- Updated CP
  'watts',
  'curve_model',
  '{
    "capacity": 23000,
    "capacity_unit": "joules",
    "quality": {
      "r_squared": 0.978,
      "standard_error": 5.2,
      "confidence_level": "high",
      "effort_count": 12
    },
    "phenotype": "time-trialist",
    "model_version": "2.0",
    "ftp_estimate": 266
  }'::jsonb,
  '2026-01-23 10:00:00+00',
  'Recalculated with 3 new max efforts'
);

-- Now Alice has 2 CI models:
-- - 2026-01-20: CP = 275W
-- - 2026-01-23: CP = 280W (current)

-- ============================================================================
-- Update 2: Add notes to existing CI model
-- ============================================================================

UPDATE profile_performance_metric_logs
SET
  notes = 'Confirmed with lab test - VO2max = 65 ml/kg/min',
  updated_at = NOW()
WHERE id = 'ci-model-id';

-- ============================================================================
-- Update 3: Correct metadata for CI model
-- ============================================================================

UPDATE profile_performance_metric_logs
SET
  metadata = metadata || '{"ftp_estimate": 266}'::jsonb,
  updated_at = NOW()
WHERE id = 'ci-model-id';

-- This merges new fields into existing JSONB
```

---

## Performance Optimization

### Index Strategy

**Priority 1: Temporal Lookups (Most Common)**

- `idx_profile_performance_metric_logs_temporal_lookup` - Already exists ✅
- Covers: profile_id, category, type, duration_seconds, recorded_at DESC

**Priority 2: CI Model Queries**

- `idx_ci_model_latest_lookup` - Get latest CI model
- `idx_ci_model_temporal` - Get CI model at date
- `idx_capacity_metrics` - Get W' or D'

**Priority 3: Quality Filtering**

- `idx_ci_high_quality` - Find high-confidence models
- `idx_profile_performance_metric_logs_metadata_gin` - JSONB queries

**Priority 4: Source Tracking**

- `idx_curve_model_source` - Find curve-generated metrics
- `idx_profile_performance_metric_logs_source` - Filter by source

### Query Performance Targets

| Query Type             | Target Latency | Index Used                   |
| ---------------------- | -------------- | ---------------------------- |
| Get latest CI model    | < 5ms          | `idx_ci_model_latest_lookup` |
| Get CI at date         | < 10ms         | `idx_ci_model_temporal`      |
| Get CI history (3mo)   | < 50ms         | `idx_ci_model_temporal`      |
| Find high-quality CIs  | < 100ms        | `idx_ci_high_quality`        |
| JSONB metadata queries | < 50ms         | `idx_metadata_gin`           |

### EXPLAIN ANALYZE Examples

```sql
-- Verify index usage for latest CI model query
EXPLAIN ANALYZE
SELECT value, metadata
FROM profile_performance_metric_logs
WHERE profile_id = '550e8400-e29b-41d4-a716-446655440000'
  AND category = 'bike'
  AND type = 'critical_power'
ORDER BY recorded_at DESC
LIMIT 1;

-- Expected plan:
-- Limit  (cost=X..Y rows=1 width=Z) (actual time=0.XX..0.XX rows=1 loops=1)
--   ->  Index Scan using idx_ci_model_latest_lookup on profile_performance_metric_logs
--         Index Cond: ((profile_id = '...') AND (category = 'bike'))
--         Filter: (type = 'critical_power')
```

### Caching Strategy

**Application-Level Caching:**

```typescript
// Cache latest CI model for 5 minutes
const CACHE_TTL = 300; // 5 minutes

export async function getCachedCIModel(
  redis: RedisClient,
  supabase: SupabaseClient,
  profileId: string,
  category: ActivityCategory,
): Promise<CriticalIntensityModel | null> {
  const cacheKey = `ci:${profileId}:${category}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss - fetch from DB
  const model = await getLatestCIModel(supabase, profileId, category);

  // Store in cache
  if (model) {
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(model));
  }

  return model;
}
```

**Cache Invalidation:**

```typescript
// Invalidate cache when new CI model created
export async function invalidateCICache(
  redis: RedisClient,
  profileId: string,
  category: ActivityCategory,
): Promise<void> {
  const cacheKey = `ci:${profileId}:${category}`;
  await redis.del(cacheKey);
}
```

---

## Testing & Validation

### Unit Tests for Migrations

```typescript
// packages/supabase/__tests__/migrations/ci-schema.test.ts

describe("CI Schema Migrations", () => {
  it("should add critical_power enum value", async () => {
    const { data } = await supabase.rpc("enum_values", {
      enum_name: "performance_metric_type",
    });

    expect(data).toContain("critical_power");
    expect(data).toContain("critical_speed");
    expect(data).toContain("work_capacity");
  });

  it("should add metadata column", async () => {
    const { data } = await supabase
      .from("profile_performance_metric_logs")
      .select("metadata")
      .limit(1);

    expect(data).toBeDefined();
  });

  it("should add source column with default", async () => {
    const { data } = await supabase
      .from("profile_performance_metric_logs")
      .insert({
        profile_id: testProfileId,
        category: "bike",
        type: "power",
        value: 250,
        unit: "watts",
      })
      .select("source")
      .single();

    expect(data.source).toBe("manual");
  });
});
```

### Integration Tests for Queries

```typescript
describe("CI Query Patterns", () => {
  beforeEach(async () => {
    // Seed test data
    await seedCIModel(testProfileId, "bike", {
      cp: 275,
      wPrime: 22000,
      quality: { r_squared: 0.971, confidence_level: "high", effort_count: 9 },
    });
  });

  it("should get latest CI model", async () => {
    const model = await getLatestCIModel(supabase, testProfileId, "bike");

    expect(model).toBeDefined();
    expect(model.value).toBe(275);
    expect(model.metadata.capacity).toBe(22000);
  });

  it("should get CI model at date", async () => {
    const targetDate = new Date("2026-01-20");
    const model = await getCIModelAtDate(
      supabase,
      testProfileId,
      "bike",
      targetDate,
    );

    expect(model).toBeDefined();
  });

  it("should handle missing CI model gracefully", async () => {
    const model = await getLatestCIModel(supabase, "non-existent-id", "bike");

    expect(model).toBeNull();
  });
});
```

### Data Validation Tests

```typescript
describe("CI Metadata Validation", () => {
  it("should validate metadata schema", () => {
    const metadata = {
      capacity: 22000,
      capacity_unit: "joules",
      quality: {
        r_squared: 0.971,
        standard_error: 6.8,
        confidence_level: "high",
        effort_count: 9,
      },
      phenotype: "time-trialist",
      model_version: "2.0",
    };

    const result = ciModelMetadataSchema.safeParse(metadata);

    expect(result.success).toBe(true);
  });

  it("should reject invalid metadata", () => {
    const metadata = {
      capacity: -1000, // Invalid: negative
      quality: {
        r_squared: 1.5, // Invalid: > 1
        confidence_level: "very-high", // Invalid: not in enum
      },
    };

    const result = ciModelMetadataSchema.safeParse(metadata);

    expect(result.success).toBe(false);
  });
});
```

### Performance Tests

```typescript
describe("CI Query Performance", () => {
  beforeEach(async () => {
    // Seed 1000 CI models across 100 profiles
    await seedLargeCIDataset(100, 10);
  });

  it("should get latest CI model in < 10ms", async () => {
    const start = performance.now();

    await getLatestCIModel(supabase, testProfileId, "bike");

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(10);
  });

  it("should get CI history (3mo) in < 50ms", async () => {
    const start = performance.now();

    await getCIModelHistory(
      supabase,
      testProfileId,
      "bike",
      new Date("2025-10-23"),
      new Date("2026-01-23"),
    );

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(50);
  });
});
```

---

## Summary

### What We've Designed

1. **Minimal Schema Changes**
   - ✅ Add 5 enum values to `performance_metric_type`
   - ✅ Add `metadata JSONB` column for model-specific data
   - ✅ Add `source metric_source` column for provenance
   - ✅ Add 5 specialized indexes for CI queries

2. **Universal Data Model**
   - ✅ Store CP, CS, and other CI values as performance metrics
   - ✅ Store W', D' as separate capacity metrics
   - ✅ Use JSONB for quality, phenotype, predictions
   - ✅ Support all activity categories

3. **Temporal Query Support**
   - ✅ Get latest CI model
   - ✅ Get CI model at specific date
   - ✅ Get CI model history
   - ✅ All using existing temporal index

4. **Performance Optimized**
   - ✅ Specialized indexes for common queries
   - ✅ Sub-10ms latency for critical queries
   - ✅ JSONB GIN index for metadata queries
   - ✅ Caching strategy defined

5. **Production Ready**
   - ✅ Migration files with rollback procedures
   - ✅ RLS policy templates (optional)
   - ✅ Comprehensive test suite
   - ✅ Example data and queries

### Next Steps

1. **Review & Approve** - Get team sign-off on schema design
2. **Apply Migrations** - Run migration files in development
3. **Test Queries** - Verify all query patterns work
4. **Update Types** - Regenerate TypeScript types from schema
5. **Implement Core** - Build CI calculation engine (see IMPLEMENTATION_GUIDE.md)
6. **Build UI** - Create CI model visualization components

---

**Document Version:** 1.0  
**Status:** Complete  
**Related Documents:**

- DESIGN.md - Overall smart metrics system
- ABSTRACTION.md - Universal CI model abstraction
- IMPLEMENTATION_GUIDE.md - Step-by-step implementation
