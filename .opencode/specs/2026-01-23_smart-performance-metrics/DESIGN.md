# Smart Performance & Health Metrics Design

## Vision

The "Grander Ideal" is to create a holistic view of the athlete by combining:

1.  **Performance Output**: What the athlete can do (Power, Pace).
2.  **Biometric State**: The athlete's current physical state (Weight, HRV, Sleep, Stress).

By leveraging these datasets together, we can provide:

- **Estimations**: More accurate W' or CP calculations based on freshness.
- **Predictions**: Race performance predictions adjusted for current weight and stress.
- **Intentional Decisions**: Training recommendations that respect the athlete's current capacity.

## Database Schema

### 1. profile_metric_logs (Biometrics/Health)

**Purpose**: Store health, body composition, and recovery metrics.

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

CREATE TABLE profile_metric_logs (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- What was measured
  metric_type profile_metric_type NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,

  -- Provenance
  reference_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  notes TEXT,

  -- Temporal
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Examples of Data:**

- ✅ Daily weight (72.5 kg)
- ✅ Morning HRV (45 ms)
- ✅ Sleep duration (7.5 hours)
- ✅ Stress score (High/Low or numeric)

### 2. profile_performance_metric_logs (Performance Measurements)

**Purpose**: Store point-in-time performance outputs (what the athlete _did_).

```sql
CREATE TABLE profile_performance_metric_logs (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id),

  -- What was measured
  category activity_category NOT NULL,
  type performance_metric_type NOT NULL,  -- 'power', 'pace', 'heart_rate'
  duration_seconds INTEGER NOT NULL,      -- Required for metrics
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,

  -- Provenance
  source TEXT DEFAULT 'manual',  -- 'manual', 'activity_detection'
  reference_activity_id UUID REFERENCES activities(id),
  notes TEXT,

  -- Temporal
  recorded_at TIMESTAMPTZ NOT NULL,  -- When measurement was made
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Examples of Data:**

- ✅ FTP test results (265W @ 60min on Jan 23)
- ✅ Activity bests (450W @ 5min detected in ride #123)
- ✅ Manual entries (LTHR = 165 bpm)

### 3. profile_performance_models (Computed Models)

**Purpose**: Store mathematical models derived from performance data.

```sql
CREATE TABLE profile_performance_models (
  id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id),

  -- Model type
  category activity_category NOT NULL,
  model_type TEXT NOT NULL,  -- 'critical_power', 'critical_speed'

  -- Model parameters
  critical_value NUMERIC NOT NULL,    -- CP or CS
  capacity_value NUMERIC NOT NULL,    -- W' or D'
  critical_unit TEXT NOT NULL,        -- 'watts', 'm/s'
  capacity_unit TEXT NOT NULL,        -- 'joules', 'meters'

  -- Model quality
  r_squared NUMERIC,
  standard_error NUMERIC,
  confidence_level TEXT,  -- 'high', 'medium', 'low'

  -- Source data
  source_metric_ids UUID[],  -- Array of metric log IDs used
  effort_count INTEGER NOT NULL,
  date_range TSTZRANGE,  -- Date range of source data

  -- Temporal
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_from TIMESTAMPTZ NOT NULL,  -- Model is valid from this date
  valid_until TIMESTAMPTZ,          -- Model is valid until this date (nullable = current)

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_perf_models_profile_current
  ON profile_performance_models(profile_id, category, model_type, valid_from DESC)
  WHERE valid_until IS NULL;

-- Ensure only one "current" model per profile+category+type
CREATE UNIQUE INDEX idx_perf_models_current_unique
  ON profile_performance_models(profile_id, category, model_type)
  WHERE valid_until IS NULL;
```

**Examples of Data:**

- ✅ CP models (CP=279W, W'=20kJ, R²=0.963)
- ✅ CS models (CS=4.5m/s, D'=180m, R²=0.951)
- ✅ Model quality metrics
- ✅ References to source metric logs

## Data Flow

```mermaid
graph TD
    UserInput[User Input / Integrations]
    Biometrics[profile_metric_logs <br/>(Health/State)]
    PerfMetrics[profile_performance_metric_logs <br/>(Performance Output)]
    Models[profile_performance_models <br/>(Mathematical Models)]
    Features[Application Features]

    UserInput -->|Creates| Biometrics
    UserInput -->|Creates| PerfMetrics
    PerfMetrics -->|Used by model computation| Models
    Biometrics -->|Provides context/freshness| Features
    PerfMetrics -->|Provides historical data| Features
    Models -->|Used for predictions/suggestions| Features

    subgraph "Table 1: Input State"
    Biometrics
    end

    subgraph "Table 2: Performance Output"
    PerfMetrics
    end

    subgraph "Table 3: Computed Models"
    Models
    end

    subgraph "Application"
    Features
    end
```

### Application Features

- Power curve visualization
- FTP suggestions
- Training zones
- Race predictions (adjusted by weight/stress)
- Workout generation (adjusted by freshness)
