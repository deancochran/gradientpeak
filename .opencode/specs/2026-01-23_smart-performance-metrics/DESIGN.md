# Smart Performance & Health Metrics Design

## Vision

The "Grander Ideal" is to create a holistic view of the athlete by combining:

1.  **Performance Output**: What the athlete can do (Power, Pace).
2.  **Biometric State**: The athlete's current physical state (Weight, HRV, Sleep, Stress).

By leveraging these datasets together, we can provide:

- **Estimations**: More accurate W' or CP calculations based on freshness.
- **Predictions**: Race performance predictions adjusted for current weight and stress.
- **Intentional Decisions**: Training recommendations that respect the athlete's current capacity.

## User Interaction Rules

To maintain data integrity and model accuracy, the following strict rules apply:

1.  **Strict Update Restrictions**: Users can _only_ manually update their information (metrics) in the **Settings** page or during **Onboarding**. Random editing elsewhere is prohibited.
2.  **No Direct Curve Manipulation**: Users cannot manually edit the `profile_performance_models` (the computed curves). These are read-only for the user and are computed automatically based on logged inputs.
3.  **Allowed Inputs**: Users _can_ log new "Bests" (FTP, Pace, Weight, Stress, etc.) as inputs. These inputs trigger the model update logic.
4.  **Onboarding Gate**: The `profiles.onboarded` boolean flag is used to explicitly gate access. It must be set to `true` only after initial metrics are successfully gathered.

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

**MVP Schema Strategy**:
This table uses a "Slim" schema focused on the essential curve parameters. It relies on a **Rolling Window Strategy** (e.g., best efforts from the last 90 days) to handle performance decay.

- **Freshness**: `valid_from` represents the date of the _most recent_ activity used in the model. If this is old, the model is stale.
- **Decay**: As high-performance efforts slide out of the rolling window, new models are calculated using only recent data, naturally reflecting decreased capabilities.

````sql
CREATE TABLE profile_performance_models (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Model type
  category activity_category NOT NULL,
  model_type TEXT NOT NULL,  -- 'critical_power', 'critical_speed'

  -- Model parameters
  critical_value NUMERIC NOT NULL,    -- CP (Watts) or CS (m/s)
  capacity_value NUMERIC NOT NULL,    -- W' (Joules) or D' (Meters)

  -- Provenance & Quality
  effort_count INTEGER NOT NULL,      -- Number of data points used (detects low data)
  max_effort_duration INTEGER,        -- Max duration used (detects lack of endurance data)

  -- Temporal
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_from TIMESTAMPTZ NOT NULL,  -- Date of the *latest* data point used (Freshness)
  valid_until TIMESTAMPTZ           -- Model is valid until this date (nullable = current)
);

CREATE INDEX idx_perf_models_profile_current
  ON profile_performance_models(profile_id, category, model_type, valid_from DESC)
  WHERE valid_until IS NULL;

-- Ensure only one "current" model per profile+category+type
CREATE UNIQUE INDEX idx_perf_models_current_unique
  ON profile_performance_models(profile_id, category, model_type)
  WHERE valid_until IS NULL;

### 4. profile_performance_proposals (Autonomous Detection)

**Purpose**: Store detected performance improvements from activity analysis that require user confirmation before being applied. This prevents "bad data" (e.g., driving in a car) from corrupting the model.

```sql
CREATE TYPE proposal_status AS ENUM ('pending', 'accepted', 'rejected', 'ignored');

CREATE TABLE profile_performance_proposals (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Source
  activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,

  -- The Proposal
  metrics JSONB NOT NULL,       -- e.g., { "5min_power": 350, "20min_power": 280 }
  reason TEXT NOT NULL,         -- e.g., "New 20min Power Record detected (+15W)"

  -- Workflow
  status proposal_status NOT NULL DEFAULT 'pending',

  -- Temporal
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
````

**Examples of Data:**

- ✅ Pending Proposal: "New 5min Power Record: 350W" (derived from Activity #123)

````

**Examples of Data:**

- ✅ CP models (CP=279W, W'=20kJ, 5 efforts used)
- ✅ CS models (CS=4.5m/s, D'=180m, 3 efforts used)

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

    Analysis[Activity Analysis] -->|Detects Improvements| Proposals[profile_performance_proposals]
    Proposals -->|User Accepts| PerfMetrics

    subgraph "Table 1: Input State"
    Biometrics
    end

    subgraph "Table 2: Performance Output"
    PerfMetrics
    end

    subgraph "Table 3: Computed Models"
    Models
    end

    subgraph "Table 4: Proposals"
    Proposals
    end

    subgraph "Application"
    Features
    end
````

### Application Features

_Note: The following features utilize the computed models for **visualization** and **prediction**. Users do not manually tweak the model parameters directly._

- Power curve visualization
- FTP suggestions
- Training zones
- Race predictions (adjusted by weight/stress)
- Workout generation (adjusted by freshness)
