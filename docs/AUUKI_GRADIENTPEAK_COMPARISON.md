# Auuki vs GradientPeak: Architecture & Schema Comparison

**Purpose**: Identify opportunities to simplify and improve GradientPeak's data schemas, processes, and system architecture by comparing with Auuki's approach.

**Date**: 2025-12-11  
**Context**: Review for mobile and web platform improvements

---

## Executive Summary

### Key Findings

1. **Auuki's Simplicity**: Browser-based PWA with **zero dependencies**, custom reactive system, and local-first architecture
2. **GradientPeak's Complexity**: Enterprise-grade system with **comprehensive data models** but potential over-engineering in some areas
3. **Critical Gap**: Both documents (BLUETOOTH_CONTROL_GAP.md and FTMS_RECORDING_ENHANCEMENTS.md) correctly identify that **FTMS trainer control** is the major missing feature
4. **Schema Opportunities**: Significant simplification possible in activity recording, metrics calculation, and data persistence

### Recommended Actions

**High Priority:**
- Implement FTMS control (already documented in detail)
- Simplify LiveMetricsManager calculation approach
- Flatten activity plan structure
- Reduce database table complexity

**Medium Priority:**
- Adopt reactive patterns from Auuki for sensor data flow
- Simplify state management for recording service
- Consider model-based validation patterns

**Low Priority:**
- Explore zero-dependency approach for core calculations
- Consider IndexedDB for mobile offline storage

---

## 1. Architecture Comparison

### Auuki: Minimalist Browser PWA

```
┌──────────────────────────────────────┐
│         Browser Runtime              │
│  ┌────────────────────────────────┐  │
│  │   Single Reactive State (db)   │  │
│  │   - All metrics in one object  │  │
│  │   - No ORM, no framework       │  │
│  └────────────────────────────────┘  │
│             ▲         ▼               │
│  ┌──────────┴─────────┬──────────┐   │
│  │    Custom xf      │  Models   │   │
│  │    Pub/Sub        │  (Typed)  │   │
│  └──────────┬─────────┴──────────┘   │
│             ▼                         │
│  ┌──────────────────────────────┐    │
│  │   BLE Connectable Manager    │    │
│  │   - Protocol abstraction     │    │
│  │   - FTMS/FE-C/WCPS          │    │
│  └──────────────────────────────┘    │
│             ▼                         │
│  ┌──────────────────────────────┐    │
│  │    Web Bluetooth API         │    │
│  └──────────────────────────────┘    │
│             ▼                         │
│  ┌──────────────────────────────┐    │
│  │    IndexedDB (Local)         │    │
│  │    - Sessions                │    │
│  │    - Activities (last 7)     │    │
│  │    - Workouts                │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

**Key Characteristics:**
- **No framework** - Vanilla JavaScript with custom reactive system
- **Single state object** - All metrics in `db` object
- **Event-driven** - `xf` pub/sub for all data flow
- **Local-first** - IndexedDB for persistence, optional cloud sync
- **Zero dependencies** - Complete control, minimal bundle size
- **Protocol-first** - FTMS/FE-C control as core feature

### GradientPeak: Enterprise Full-Stack

```
┌─────────────────────────────────────────────┐
│         Mobile App (React Native)           │
│  ┌────────────────────────────────────────┐ │
│  │   ActivityRecorderService              │ │
│  │   ├─ LiveMetricsManager               │ │
│  │   ├─ SensorsManager                   │ │
│  │   ├─ LocationManager                  │ │
│  │   ├─ PlanManager                      │ │
│  │   └─ NotificationsManager             │ │
│  └────────────────────────────────────────┘ │
│             ▲         ▼                      │
│  ┌──────────┴─────────┬─────────────────┐   │
│  │   Zustand Stores  │  SQLite (Local) │   │
│  │   - Recording     │  - Activities   │   │
│  │   - Sensors       │  - Streams      │   │
│  │   - Plans         │  - Metrics      │   │
│  └──────────┬─────────┴─────────────────┘   │
│             ▼                                │
│  ┌──────────────────────────────────────┐   │
│  │   React Native BLE PLX               │   │
│  │   - Passive monitoring only          │   │
│  │   - No FTMS control (yet)           │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
            ▼ (Upload)
┌─────────────────────────────────────────────┐
│         Backend (tRPC + Supabase)           │
│  ┌────────────────────────────────────────┐ │
│  │   PostgreSQL (Supabase)                │ │
│  │   ├─ profiles                         │ │
│  │   ├─ activities (45+ columns)         │ │
│  │   ├─ activity_streams (compressed)    │ │
│  │   ├─ activity_plans                   │ │
│  │   ├─ planned_activities               │ │
│  │   ├─ training_plans                   │ │
│  │   ├─ activity_routes                  │ │
│  │   ├─ integrations                     │ │
│  │   └─ synced_planned_activities        │ │
│  └────────────────────────────────────────┘ │
│             ▲         ▼                      │
│  ┌──────────┴─────────┬─────────────────┐   │
│  │   Storage Bucket  │  Edge Functions │   │
│  │   - JSON files    │  - Processing   │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Key Characteristics:**
- **Framework-heavy** - React Native, Expo, tRPC, Zustand
- **Manager pattern** - Separate managers for each concern
- **Dual storage** - SQLite local + PostgreSQL cloud
- **Type-safe** - Zod schemas, TypeScript everywhere
- **Enterprise-grade** - Comprehensive validation, RLS-ready
- **Missing FTMS** - Bluetooth read-only, no trainer control

---

## 2. Data Schema Deep Dive

### 2.1 Sensor Data Models

#### Auuki: Model-Based with Validation

```javascript
// Base Model pattern - all metrics use this
class Model {
  constructor({ prop, default, parser, isValid, storage }) {
    this.prop = prop;
    this.default = default;
    this.state = default;
    this.parser = parser;
    this.isValid = isValid;
    this.storage = storage;
  }
  
  setState(value) {
    const parsed = this.parser(value);
    if (this.isValid(parsed)) {
      this.state = parsed;
      this.storage.backup(this.prop, parsed);
      return parsed;
    }
    return this.default;
  }
}

// Specific metric models
const power = new Model({
  prop: 'power',
  default: 0,
  parser: parseInt,
  isValid: (v) => v >= 0 && v <= 2500,
  storage: LocalStorage
});

const heartRate = new Model({
  prop: 'heartRate',
  default: 0,
  parser: parseInt,
  isValid: (v) => v >= 30 && v <= 255,
  storage: LocalStorage
});

// Usage
xf.reg('power', (value, db) => {
  db.power = power.setState(value);
  xf.dispatch('db:power', db.power);
});
```

**Advantages:**
- Built-in validation at model level
- Automatic persistence via storage adapter
- DRY principle - validation logic in one place
- Type-safe state updates
- Storage abstraction (LocalStorage/IndexedDB)

#### GradientPeak: Interface-Based with Manual Validation

```typescript
// Sensor reading interface
export interface SensorReading {
  metric: PublicActivityMetric; // 'heartrate' | 'power' | 'cadence' | 'speed'
  dataType: PublicActivityMetricDataType; // 'float' | 'latlng' | 'boolean'
  value: number | [number, number];
  timestamp: number;
  metadata?: {
    deviceId?: string;
    accuracy?: number;
    source?: string;
    batteryLevel?: number;
    signalStrength?: number;
  };
}

// Validation happens in SensorsManager
class SensorsManager {
  validateSensorReading(reading: SensorReading): SensorReading | null {
    switch (reading.metric) {
      case 'heartrate':
        if (typeof reading.value === 'number' && 
            reading.value >= 30 && reading.value <= 250)
          return reading;
        break;
      case 'power':
        if (typeof reading.value === 'number' && 
            reading.value >= 0 && reading.value <= 4000)
          return reading;
        break;
      // ... repeated for each metric
    }
    return null;
  }
}
```

**Issues:**
- Validation scattered across codebase
- No automatic persistence
- Repeated validation logic
- Manual range checking
- No storage abstraction

**Improvement Opportunity:**
```typescript
// Adopt model-based pattern from Auuki
class SensorModel<T> {
  constructor(
    public metric: string,
    public validator: (value: T) => boolean,
    public defaultValue: T,
    public storage?: Storage
  ) {}
  
  validate(value: T): T | null {
    if (this.validator(value)) {
      this.storage?.persist(this.metric, value);
      return value;
    }
    console.warn(`Invalid ${this.metric}:`, value);
    return null;
  }
}

const powerModel = new SensorModel(
  'power',
  (v: number) => v >= 0 && v <= 4000,
  0
);

const hrModel = new SensorModel(
  'heartrate',
  (v: number) => v >= 30 && v <= 250,
  0
);

// Usage
const validatedPower = powerModel.validate(reading.value);
```

---

### 2.2 Live Metrics State

#### Auuki: Flat Reactive Object

```javascript
// Single global state object
let db = {
  // Current readings
  power: 0, heartRate: 0, cadence: 0, speed: 0,
  
  // Moving averages (PropAccumulator pattern)
  power1s: 0, power3s: 0, powerLap: 0, powerAvg: 0,
  
  // Totals
  distance: 0, kcal: 0, totalWork: 0,
  
  // Zones (arrays)
  powerInZone: [0, 0, 0, 0, 0, 0, 0],
  hrInZone: [0, 0, 0, 0, 0],
  
  // Workout state
  elapsed: 0, lapTime: 0, stepTime: 0,
  intervalIndex: 0, stepIndex: 0,
  
  // Targets
  powerTarget: 0, slopeTarget: 0, resistanceTarget: 0,
  
  // Profile
  ftp: 200, weight: 75,
  
  // UI state
  mode: 'erg', page: 'workout', lock: false,
};

// Update pattern (reactive)
xf.reg('power', (power, db) => {
  db.power = power;
  db.powerLap = models.powerLap.setState(power);
  db.powerAvg = models.powerAvg.setState(power);
  db.power3s = models.power3s.setState(power);
  db.totalWork += (power * 1); // 1 second intervals
});
```

**Advantages:**
- All state in one place
- Easy to inspect (console.log(db))
- Predictable updates
- No nested objects to traverse
- Simple serialization

#### GradientPeak: Nested Manager Architecture

```typescript
// LiveMetricsState interface (45+ fields)
export interface LiveMetricsState {
  // Timing
  startedAt?: number;
  finishedAt?: number;
  elapsedTime: number;
  movingTime: number;
  
  // Distance & Speed
  distance: number;
  avgSpeed: number;
  maxSpeed: number;
  
  // Elevation
  totalAscent: number;
  totalDescent: number;
  avgGrade: number;
  elevationGainPerKm: number;
  
  // Heart Rate (9 fields)
  avgHeartRate: number;
  maxHeartRate: number;
  maxHrPctThreshold: number;
  hrZone1Time: number;
  hrZone2Time: number;
  hrZone3Time: number;
  hrZone4Time: number;
  hrZone5Time: number;
  
  // Power (9 fields)
  avgPower: number;
  maxPower: number;
  totalWork: number;
  powerZone1Time: number;
  powerZone2Time: number;
  powerZone3Time: number;
  powerZone4Time: number;
  powerZone5Time: number;
  powerZone6Time: number;
  powerZone7Time: number;
  powerHeartRateRatio: number;
  
  // Cadence
  avgCadence: number;
  maxCadence: number;
  
  // Environmental
  avgTemperature?: number;
  maxTemperature?: number;
  
  // Calories
  calories: number;
  
  // Tier 2 - Estimations
  normalizedPowerEst: number;
  intensityFactorEst: number;
  trainingStressScoreEst: number;
  variabilityIndexEst: number;
  efficiencyFactorEst: number;
  decouplingEst: number;
  
  // Plan Adherence
  adherenceCurrentStep: number;
}

// Managed by LiveMetricsManager
class LiveMetricsManager {
  private metrics: LiveMetricsState;
  private buffer: DataBuffer;
  private streamBuffer: StreamBuffer;
  
  private updateTimer?: number;
  private persistenceTimer?: number;
  private sensorUpdateTimer?: number;
  
  // Complex update flow
  calculateAndEmitMetrics() {
    // 200+ lines of calculation logic
    this.calculateAverages();
    this.calculateMaxValues();
    this.calculateZoneTimes();
    this.calculateAdvancedMetrics();
    this.emit('statsUpdate', this.metrics);
  }
}
```

**Issues:**
- 45+ fields in interface (cognitive overload)
- Multiple timers (3+) for updates
- Complex manager pattern
- Separated zone times (should be arrays)
- Difficult to inspect full state
- No single source of truth

**Improvement Opportunity:**
```typescript
// Flatten and simplify (inspired by Auuki)
interface SimplifiedMetrics {
  // Current readings
  current: {
    power?: number;
    heartRate?: number;
    cadence?: number;
    speed?: number;
    position?: { lat: number; lng: number; alt?: number };
  };
  
  // Session totals
  totals: {
    elapsed: number;
    moving: number;
    distance: number;
    work: number;
    ascent: number;
    descent: number;
    calories: number;
  };
  
  // Averages
  avg: {
    power: number;
    heartRate: number;
    speed: number;
    cadence: number;
    grade: number;
  };
  
  // Maximums
  max: {
    power: number;
    heartRate: number;
    speed: number;
    cadence: number;
  };
  
  // Zone distributions (arrays, not individual fields)
  zones: {
    hr: [number, number, number, number, number]; // seconds in each zone
    power: [number, number, number, number, number, number, number];
  };
  
  // Advanced (optional)
  advanced?: {
    normalizedPower: number;
    tss: number;
    intensityFactor: number;
    variabilityIndex: number;
    efficiencyFactor: number;
    decoupling: number;
  };
  
  // Plan
  plan?: {
    currentStep: number;
    adherence: number;
  };
}

// Single update function
function updateMetrics(reading: SensorReading, metrics: SimplifiedMetrics) {
  // Update current
  if (reading.metric === 'power') {
    metrics.current.power = reading.value as number;
  }
  
  // Update averages (moving window)
  metrics.avg.power = calculateMovingAverage(reading);
  
  // Update zones
  const zone = getPowerZone(reading.value as number, ftp);
  metrics.zones.power[zone] += 1; // 1 second increment
}
```

---

### 2.3 Activity Plan Structure

#### Auuki: Simple Interval/Step Model

```javascript
// ZWO (Zwift Workout) format
const workout = {
  id: uuid(),
  meta: {
    name: 'Sweet Spot Intervals',
    author: 'Coach',
    description: '4x10min @ 88-93% FTP',
    duration: 3600,
  },
  intervals: [
    {
      duration: 600, // seconds
      steps: [
        {
          duration: 600,
          power: 0.55, // 55% FTP (warmup)
          cadence: 90,
        }
      ]
    },
    {
      duration: 2400,
      steps: [
        { duration: 600, power: 0.90 }, // 10min @ 90%
        { duration: 180, power: 0.50 }, // 3min recovery
        // ... repeated 4 times
      ]
    },
  ]
};

// Flat execution model
const flattened = workout.intervals.flatMap(i => i.steps);
```

**Advantages:**
- Simple two-level hierarchy (intervals → steps)
- Easy to parse and execute
- Standard .ZWO format compatibility
- Minimal nesting
- Clear duration-based progression

#### GradientPeak: Complex Nested Structure

```typescript
// Discriminated union with repetitions
export type StepOrRepetition = Step | Repetition;

export interface Step {
  type: 'step';
  name: string;
  duration?: Duration | 'untilFinished';
  targets?: IntensityTarget[]; // Max 2 targets
  notes?: string;
}

export interface Repetition {
  type: 'repetition';
  repeat: number; // 1-50
  steps: Step[]; // 1-20 steps per repetition
}

export interface ActivityPlanStructure {
  steps: StepOrRepetition[]; // Max 50 items
}

// Complex duration types
export type Duration = 
  | { type: 'time'; value: number; unit: 'seconds' | 'minutes' }
  | { type: 'distance'; value: number; unit: 'meters' | 'km' }
  | { type: 'repetitions'; value: number; unit: 'reps' }
  | 'untilFinished';

// Complex intensity targets (8 variants)
export type IntensityTarget = 
  | { type: '%FTP'; intensity: number }
  | { type: '%MaxHR'; intensity: number }
  | { type: '%ThresholdHR'; intensity: number }
  | { type: 'watts'; intensity: number }
  | { type: 'bpm'; intensity: number }
  | { type: 'speed'; intensity: number }
  | { type: 'cadence'; intensity: number }
  | { type: 'RPE'; intensity: number };

// Flattening required before execution
export function flattenPlanSteps(
  steps: StepOrRepetition[],
  acc: FlattenedStep[] = [],
  parentRep?: number
): FlattenedStep[] {
  for (const step of steps) {
    if (step.type === 'step') {
      acc.push({ ...step, index: acc.length, fromRepetition: parentRep });
    } else if (step.type === 'repetition') {
      for (let i = 0; i < step.repeat; i++) {
        flattenPlanSteps(step.steps, acc, i);
      }
    }
  }
  return acc;
}
```

**Issues:**
- Overly complex nested structure
- Requires flattening before use
- 8 different intensity target types
- 3 duration types + literal
- Discriminated unions add type complexity
- Max limits scattered (50 items, 20 steps, 2 targets)

**Improvement Opportunity:**
```typescript
// Simplified structure (inspired by Auuki)
interface SimplifiedActivityPlan {
  name: string;
  description?: string;
  activityType: 'bike' | 'run' | 'swim';
  steps: SimplifiedStep[];
}

interface SimplifiedStep {
  name: string;
  durationSeconds: number; // Always in seconds, simplified
  power?: number; // Watts (absolute)
  powerPercent?: number; // % of FTP
  heartRate?: number; // BPM (absolute)
  cadence?: number; // RPM
  grade?: number; // % for slope mode
  notes?: string;
}

// Repetitions handled at creation time, not runtime
function createRepeatingSteps(
  baseSteps: SimplifiedStep[],
  repeats: number
): SimplifiedStep[] {
  return Array(repeats).fill(baseSteps).flat();
}

// Example usage
const plan = {
  name: 'Sweet Spot 4x10',
  activityType: 'bike',
  steps: [
    { name: 'Warmup', durationSeconds: 600, powerPercent: 55 },
    ...createRepeatingSteps([
      { name: 'Interval', durationSeconds: 600, powerPercent: 90 },
      { name: 'Recovery', durationSeconds: 180, powerPercent: 50 },
    ], 4),
    { name: 'Cooldown', durationSeconds: 600, powerPercent: 50 },
  ]
};
```

---

### 2.4 Database Schemas

#### Auuki: IndexedDB (Browser Local Storage)

```javascript
// Three simple stores
const stores = {
  session: {
    // Current workout data (auto-backup every 60s)
    key: 'current',
    value: {
      records: [], // Time-series sensor data
      laps: [],
      events: [],
      workout: {},
      elapsed: 0,
    }
  },
  
  workouts: {
    // User-created workouts
    key: 'uuid',
    value: {
      id: uuid(),
      meta: { name, author, description },
      intervals: []
    }
  },
  
  activity: {
    // Last 7 activities only
    key: 'uuid',
    value: {
      id: uuid(),
      blob: fitFileBlob, // Binary FIT file
      summary: {
        timestamp,
        name,
        duration,
        status: { strava: 'none', intervals: 'none' }
      }
    }
  }
};

// Simple API
await idb.put('activity', { id, blob, summary });
const activities = await idb.getAll('activity');
```

**Advantages:**
- Minimal schema
- Binary FIT storage (efficient)
- Auto-cleanup (last 7 activities)
- Browser-native API
- No migrations needed

#### GradientPeak: PostgreSQL (Supabase)

```sql
-- 9 main tables with complex relationships

CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  idx serial UNIQUE,
  dob date,
  username text UNIQUE,
  threshold_hr integer,
  ftp integer,
  weight_kg integer,
  -- 10+ more fields
);

CREATE TABLE activities (
  id uuid PRIMARY KEY,
  idx serial UNIQUE,
  profile_id uuid REFERENCES profiles,
  name text NOT NULL,
  activity_location activity_location, -- enum
  activity_category activity_category, -- enum
  
  -- 45+ metric columns
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  elapsed_time integer,
  moving_time integer,
  distance integer,
  avg_speed numeric(5,2),
  max_speed numeric(5,2),
  avg_heart_rate integer,
  max_heart_rate integer,
  max_hr_pct_threshold numeric(5,2),
  hr_zone_1_time integer,
  hr_zone_2_time integer,
  hr_zone_3_time integer,
  hr_zone_4_time integer,
  hr_zone_5_time integer,
  avg_power integer,
  max_power integer,
  normalized_power integer,
  power_zone_1_time integer,
  power_zone_2_time integer,
  power_zone_3_time integer,
  power_zone_4_time integer,
  power_zone_5_time integer,
  power_zone_6_time integer,
  power_zone_7_time integer,
  total_work integer,
  avg_cadence integer,
  max_cadence integer,
  total_ascent integer,
  total_descent integer,
  avg_grade numeric(5,2),
  elevation_gain_per_km numeric(5,2),
  avg_temperature numeric(5,2),
  max_temperature numeric(5,2),
  calories integer,
  intensity_factor integer,
  training_stress_score integer,
  variability_index integer,
  efficiency_factor integer,
  power_weight_ratio numeric(5,2),
  decoupling integer,
  power_heart_rate_ratio numeric(5,2),
  
  -- Profile snapshot
  profile_age integer,
  profile_weight_kg integer,
  profile_ftp integer,
  profile_threshold_hr integer,
  profile_recovery_time integer,
  profile_training_load integer,
  
  -- External integrations
  provider integration_provider,
  external_id text,
  
  -- Plan reference
  planned_activity_id uuid REFERENCES planned_activities,
  
  created_at timestamptz,
  updated_at timestamptz
);

CREATE TABLE activity_streams (
  id uuid PRIMARY KEY,
  activity_id uuid REFERENCES activities,
  type activity_metric, -- enum
  data_type activity_metric_data_type,
  compressed_values bytea NOT NULL,
  compressed_timestamps bytea NOT NULL,
  sample_count integer,
  min_value numeric(10,4),
  max_value numeric(10,4),
  avg_value numeric(10,4)
);

CREATE TABLE activity_plans (
  id uuid PRIMARY KEY,
  profile_id uuid REFERENCES profiles,
  name text,
  activity_location activity_location,
  activity_category activity_category,
  description text,
  structure jsonb NOT NULL, -- Complex nested JSON
  route_id uuid REFERENCES activity_routes,
  estimated_tss integer,
  estimated_duration integer,
  -- More fields
);

CREATE TABLE planned_activities (
  id uuid PRIMARY KEY,
  profile_id uuid REFERENCES profiles,
  activity_plan_id uuid REFERENCES activity_plans,
  scheduled_date date,
  notes text
);

CREATE TABLE training_plans (
  id uuid PRIMARY KEY,
  profile_id uuid REFERENCES profiles,
  name text,
  structure jsonb NOT NULL,
  is_active boolean
);

CREATE TABLE activity_routes (
  id uuid PRIMARY KEY,
  profile_id uuid REFERENCES profiles,
  name text,
  activity_category activity_category,
  file_path text,
  total_distance integer,
  total_ascent integer,
  polyline text,
  elevation_polyline text
);

CREATE TABLE integrations (
  id uuid PRIMARY KEY,
  profile_id uuid REFERENCES profiles,
  provider integration_provider,
  external_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz
);

CREATE TABLE synced_planned_activities (
  id uuid PRIMARY KEY,
  profile_id uuid REFERENCES profiles,
  planned_activity_id uuid REFERENCES planned_activities,
  provider integration_provider,
  external_id text,
  synced_at timestamptz
);

CREATE TABLE oauth_states (
  id uuid PRIMARY KEY,
  state text,
  profile_id uuid REFERENCES profiles,
  provider integration_provider,
  mobile_redirect_uri text,
  expires_at timestamptz
);
```

**Issues:**
- 45+ columns in activities table (wide table anti-pattern)
- Zone times as individual columns (should be array)
- Profile snapshot duplication
- Complex foreign key relationships
- JSONB for structure (loses type safety at DB level)
- Multiple integration-related tables

**Improvement Opportunity:**
```sql
-- Simplified schema (3 core tables)

CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  username text UNIQUE,
  dob date,
  threshold_hr integer,
  ftp integer,
  weight_kg integer,
  preferences jsonb, -- Non-critical settings
  created_at timestamptz
);

CREATE TABLE activities (
  id uuid PRIMARY KEY,
  profile_id uuid REFERENCES profiles,
  name text,
  type text, -- 'bike', 'run', etc.
  
  -- Core metrics only
  started_at timestamptz,
  finished_at timestamptz,
  duration_seconds integer,
  distance_meters integer,
  
  -- Aggregates (denormalized for query performance)
  metrics jsonb, -- { avg_power, max_power, avg_hr, ... }
  
  -- Zone times as arrays
  hr_zone_seconds integer[], -- [z1, z2, z3, z4, z5]
  power_zone_seconds integer[], -- [z1, z2, z3, z4, z5, z6, z7]
  
  -- Profile snapshot
  profile_snapshot jsonb, -- { ftp, weight, threshold_hr }
  
  -- References
  planned_activity_id uuid,
  route_id uuid,
  
  created_at timestamptz
);

CREATE TABLE activity_streams (
  id uuid PRIMARY KEY,
  activity_id uuid REFERENCES activities,
  metric text, -- 'power', 'heartrate', 'latlng'
  compressed_data bytea, -- Efficient binary storage
  sample_count integer,
  stats jsonb -- { min, max, avg }
);

-- Plans stored as simple JSON (no separate tables)
-- Integrations handled via Edge Functions (not DB tables)
```

---

## 3. Process & Flow Comparison

### 3.1 Sensor Data Flow

#### Auuki: Direct Reactive Flow

```javascript
// 1. BLE notification arrives
characteristic.addEventListener('characteristicvaluechanged', (e) => {
  const data = e.target.value;
  const parsed = indoorBikeDataParser.decode(data);
  
  // 2. Dispatch to reactive system
  xf.dispatch('power', parsed.power);
  xf.dispatch('heartRate', parsed.heartRate);
  xf.dispatch('cadence', parsed.cadence);
});

// 3. Update handlers (registered globally)
xf.reg('power', (power, db) => {
  db.power = power;
  db.powerAvg = models.powerAvg.setState(power);
  db.totalWork += power * 1; // 1 second
  
  // Update zones
  const zone = getZone(power, db.ftp);
  db.powerInZone[zone] += 1;
});

// 4. UI updates automatically (single data binding)
function PowerDisplay() {
  return html`<div>${db.power}W</div>`;
}

// Total: ~50ms from BLE to UI update
```

**Flow Characteristics:**
- **Direct**: BLE → dispatch → state → UI
- **Fast**: Single-pass updates, no queuing
- **Simple**: No intermediate managers
- **Predictable**: Same flow every time

#### GradientPeak: Multi-Layer Processing

```typescript
// 1. BLE notification arrives
characteristic.monitor((error, char) => {
  const data = Buffer.from(char.value, 'base64');
  
  // 2. Parse in SensorsManager
  const reading = this.parsePower(data, deviceId);
  
  // 3. Validate
  const validated = this.validateSensorReading(reading);
  
  // 4. Update sensor timestamp
  this.updateSensorDataTimestamp(deviceId);
  
  // 5. Emit to callbacks
  this.dataCallbacks.forEach(cb => cb(validated));
});

// 6. ActivityRecorderService receives callback
private handleSensorData(reading: SensorReading) {
  if (this.state !== 'recording') return;
  
  // 7. Forward to LiveMetricsManager
  this.liveMetricsManager.ingestSensorData(reading);
}

// 8. LiveMetricsManager queues update
public ingestSensorData(reading: SensorReading) {
  // Queue updates (debounced)
  this.pendingSensorUpdates.set(reading.metric, reading.value);
  
  if (!this.sensorUpdateTimer) {
    this.sensorUpdateTimer = setTimeout(() => {
      this.processPendingSensorUpdates();
    }, 100); // 100ms delay
  }
  
  // Also add to stream buffer
  this.streamBuffer.add(reading);
}

// 9. Process on timer (every 1 second)
private calculateAndEmitMetrics() {
  // 200+ lines of calculation
  const power = this.buffer.getLatestPower();
  const avgPower = this.buffer.getAveragePower();
  const maxPower = Math.max(this.maxPower, power);
  
  // Calculate zones
  const zone = this.getPowerZone(power);
  this.powerZoneTimes[zone] += 1;
  
  // Calculate advanced metrics
  const np = this.calculateNormalizedPower();
  const tss = this.calculateTSS(np);
  
  // Update metrics object
  this.metrics.avgPower = avgPower;
  this.metrics.maxPower = maxPower;
  // ... 40+ more field updates
  
  // Emit to subscribers
  this.emit('statsUpdate', this.metrics);
}

// 10. UI receives update via hook
const metrics = useMetrics(service.liveMetricsManager);

// Total: ~100-1100ms from BLE to UI update (1s timer)
```

**Flow Characteristics:**
- **Layered**: BLE → Manager → Service → MetricsManager → Buffer → Calculate → Emit → Hook → UI
- **Delayed**: 100ms debounce + 1s calculation timer
- **Complex**: Multiple queues and timers
- **Unpredictable**: Timing varies based on load

**Improvement Opportunity:**
```typescript
// Simplified reactive flow (inspired by Auuki)
class SimplifiedRecordingService {
  private metrics: SimplifiedMetrics;
  private listeners = new Set<(metrics: SimplifiedMetrics) => void>();
  
  // Direct sensor handling
  onSensorData(reading: SensorReading) {
    // 1. Validate
    const model = this.getModel(reading.metric);
    const validated = model.validate(reading.value);
    if (!validated) return;
    
    // 2. Update current
    this.metrics.current[reading.metric] = validated;
    
    // 3. Update calculations (immediate)
    this.updateAverages(reading);
    this.updateZones(reading);
    this.updateTotals(reading);
    
    // 4. Notify listeners (React will batch)
    this.notifyListeners();
  }
  
  private notifyListeners() {
    this.listeners.forEach(fn => fn(this.metrics));
  }
  
  subscribe(fn: (metrics: SimplifiedMetrics) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

// Usage in component (auto-updates)
const metrics = useRecordingMetrics(service);
```

---

### 3.2 Workout Execution

#### Auuki: Timer-Based Automatic Progression

```javascript
// Watch manages workout progression
class Watch {
  state: 'stopped' | 'started' | 'paused' = 'stopped';
  stateWorkout: 'stopped' | 'started' | 'done' = 'stopped';
  
  elapsed: 0;
  stepTime: 0;
  stepIndex: 0;
  
  onTick() {
    if (this.state !== 'started') return;
    
    this.elapsed += 1;
    this.stepTime -= 1;
    
    // Auto-advance on step completion
    if (this.stepTime <= 0) {
      this.step(); // Advance to next step
    }
    
    // Audio cue before transition
    if (this.stepTime === 4) {
      xf.dispatch('watch:beep', 'interval');
    }
  }
  
  step() {
    this.stepIndex += 1;
    
    if (this.stepIndex >= this.steps.length) {
      this.stateWorkout = 'done';
      return;
    }
    
    const step = this.steps[this.stepIndex];
    this.stepTime = step.duration;
    
    // Update trainer target automatically
    xf.dispatch('ui:power-target-set', step.power);
  }
}

// Reactive trainer control (automatic)
xf.sub('ui:power-target-set', (powerTarget) => {
  if (connectable.services.trainer) {
    connectable.services.trainer.setPowerTarget({ power: powerTarget });
  }
});
```

**Advantages:**
- Fully automatic progression
- Seamless trainer control
- Audio cues for transitions
- Simple state machine
- No user intervention needed

#### GradientPeak: Manual or Semi-Automatic

```typescript
// PlanManager in ActivityRecorderService
get stepProgress(): StepProgress {
  const step = this.currentStep;
  const movingTime = this.getMovingTime() - this._stepStartMovingTime;
  let durationMs = getDurationMs(step.duration);
  
  // Manual advancement required for "untilFinished"
  if (step.duration === 'untilFinished') {
    return {
      movingTime,
      duration: 0,
      progress: 0,
      requiresManualAdvance: true,
      canAdvance: this._stepIndex < this._steps.length - 1,
    };
  }
  
  const progress = Math.min(1, movingTime / durationMs);
  
  return {
    movingTime,
    duration: durationMs,
    progress,
    requiresManualAdvance: false,
    canAdvance: progress >= 1,
  };
}

// Auto-advance in timer callback
private updateElapsedTime() {
  // ... timing updates
  
  // Check for auto-advance
  if (this.state === 'recording' && this.hasPlan && this.currentStep) {
    const progress = this.stepProgress;
    if (progress && !progress.requiresManualAdvance && progress.progress >= 1) {
      this.advanceStep();
    }
  }
}

// Manual advance (user action required for some steps)
advanceStep(): void {
  const progress = this.stepProgress;
  if (!progress?.canAdvance) {
    console.warn('[Service] Cannot advance step');
    return;
  }
  
  this._stepIndex++;
  this._stepStartMovingTime = this.getMovingTime();
  this.emit('stepChanged', this.getStepInfo());
}

// NO automatic trainer control integration
```

**Issues:**
- Mixed manual/automatic progression
- No trainer control integration
- Complex progress calculation
- User must tap to advance some steps
- No audio cues

**Improvement Opportunity:**
```typescript
// Unified automatic progression
class SimplifiedPlanExecutor {
  private steps: Step[];
  private currentIndex = 0;
  private stepStartTime = 0;
  
  onTick(movingTime: number) {
    const step = this.steps[this.currentIndex];
    const stepElapsed = movingTime - this.stepStartTime;
    
    // Auto-advance when step duration reached
    if (stepElapsed >= step.durationSeconds) {
      this.advanceStep(movingTime);
    }
    
    // Audio cue 5 seconds before transition
    if (step.durationSeconds - stepElapsed === 5) {
      this.playTransitionCue();
    }
  }
  
  private advanceStep(movingTime: number) {
    this.currentIndex++;
    this.stepStartTime = movingTime;
    
    if (this.currentIndex >= this.steps.length) {
      this.emit('planCompleted');
      return;
    }
    
    // Apply trainer target automatically
    const nextStep = this.steps[this.currentIndex];
    if (nextStep.power && this.trainer) {
      this.trainer.setPowerTarget(nextStep.power);
    }
    
    this.emit('stepChanged', this.currentIndex);
  }
}
```

---

## 4. Significant Improvement Opportunities

### 4.1 HIGH PRIORITY: Implement FTMS Control

**Status**: Already documented in BLUETOOTH_CONTROL_GAP.md and FTMS_RECORDING_ENHANCEMENTS.md

**Summary**: This is your #1 priority and is well-documented. The implementation path is clear:
1. Extend SensorsManager with FTMS characteristics
2. Add trainer control methods (setPowerTarget, setSimulation, setResistanceTarget)
3. Integrate with PlanManager for automatic target application
4. Handle protocol negotiation and status monitoring

**Estimated Effort**: 4-6 weeks MVP, 2-3 weeks enhanced control

**Impact**: **CRITICAL** - Transforms GradientPeak from passive recording to active training partner

---

### 4.2 HIGH PRIORITY: Simplify LiveMetrics Architecture

**Current Complexity:**
- 3 separate timers (update, persistence, sensor debounce)
- 45+ field interface
- Complex manager pattern
- Separate DataBuffer and StreamBuffer

**Recommended Simplification:**
```typescript
// Single metrics object (flat structure)
interface FlatMetrics {
  // Current readings
  power: number;
  hr: number;
  cadence: number;
  speed: number;
  
  // Totals
  elapsed: number;
  moving: number;
  distance: number;
  work: number;
  ascent: number;
  calories: number;
  
  // Averages (rolling window)
  avgPower: number;
  avgHr: number;
  avgSpeed: number;
  avgCadence: number;
  
  // Maximums
  maxPower: number;
  maxHr: number;
  maxSpeed: number;
  maxCadence: number;
  
  // Zones (arrays, not individual fields)
  hrZones: number[]; // [z1, z2, z3, z4, z5] seconds
  powerZones: number[]; // [z1, z2, z3, z4, z5, z6, z7] seconds
  
  // Advanced (computed)
  np: number;
  tss: number;
  if: number;
  vi: number;
}

// Single update function (no separate manager)
class SimplifiedRecorder {
  private metrics: FlatMetrics;
  private buffer: RollingBuffer; // 60-second window
  
  // Sensor data arrives
  onSensorReading(metric: string, value: number) {
    // 1. Update current
    this.metrics[metric] = value;
    
    // 2. Add to buffer
    this.buffer.add(metric, value, Date.now());
    
    // 3. Update calculations (immediate)
    this.metrics.avgPower = this.buffer.getAverage('power');
    this.metrics.maxPower = Math.max(this.metrics.maxPower, value);
    
    // 4. Update zone
    const zone = this.getPowerZone(value);
    this.metrics.powerZones[zone] += 1;
    
    // 5. Notify UI (React batches updates)
    this.emit('update', this.metrics);
  }
  
  // Single timer for persistence (60s)
  private persistTimer = setInterval(() => {
    this.saveToFile(this.buffer.getData());
  }, 60000);
}
```

**Benefits:**
- 70% less code
- Easier to debug (single state object)
- Better performance (no multi-layer updates)
- Predictable timing
- Simpler testing

**Estimated Effort**: 1-2 weeks

**Impact**: **HIGH** - Reduces complexity, improves maintainability

---

### 4.3 MEDIUM PRIORITY: Flatten Activity Plan Structure

**Current Issues:**
- Nested Step/Repetition discriminated union
- Requires flattening before use
- Complex duration types (3 variants + literal)
- 8 intensity target types

**Recommended Approach:**
```typescript
// Flat structure (pre-flattened at creation)
interface SimplifiedPlan {
  name: string;
  activityType: 'bike' | 'run' | 'swim';
  steps: PlanStep[];
}

interface PlanStep {
  name: string;
  durationSeconds: number; // Always seconds (simplified)
  
  // Targets (simplified - pick one)
  powerWatts?: number; // Absolute watts
  powerPercent?: number; // % FTP
  heartRate?: number; // BPM
  cadence?: number; // RPM
  grade?: number; // % for slope
  
  notes?: string;
}

// Repetitions handled at creation time
function addRepeatingSteps(
  plan: SimplifiedPlan,
  baseSteps: PlanStep[],
  count: number
) {
  for (let i = 0; i < count; i++) {
    plan.steps.push(...baseSteps);
  }
}

// Example
const plan: SimplifiedPlan = {
  name: 'Sweet Spot 4x10',
  activityType: 'bike',
  steps: [
    { name: 'Warmup', durationSeconds: 600, powerPercent: 55 },
  ]
};

addRepeatingSteps(plan, [
  { name: 'Interval', durationSeconds: 600, powerPercent: 90 },
  { name: 'Recovery', durationSeconds: 180, powerPercent: 50 },
], 4);

plan.steps.push(
  { name: 'Cooldown', durationSeconds: 600, powerPercent: 50 }
);
```

**Benefits:**
- No runtime flattening needed
- Simpler execution logic
- Easier to validate
- Better UI representation
- Compatible with .ZWO import

**Migration Strategy:**
1. Create simplified schema alongside existing
2. Add converter from old to new format
3. Deprecate complex structure in v2

**Estimated Effort**: 1 week

**Impact**: **MEDIUM** - Easier plan creation and execution

---

### 4.4 MEDIUM PRIORITY: Simplify Database Schema

**Current Issues:**
- 45+ columns in activities table
- Individual zone time columns (should be array)
- Profile snapshot duplication
- 9 interconnected tables

**Recommended Changes:**
```sql
-- Simplified activities table
CREATE TABLE activities (
  id uuid PRIMARY KEY,
  profile_id uuid REFERENCES profiles,
  name text NOT NULL,
  type text NOT NULL, -- 'bike', 'run', etc.
  
  -- Core timing
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL,
  moving_seconds integer NOT NULL,
  
  -- Core distance
  distance_meters integer DEFAULT 0,
  
  -- All other metrics as JSONB
  metrics jsonb NOT NULL,
  -- Example structure:
  -- {
  --   "avg_power": 250,
  --   "max_power": 400,
  --   "avg_hr": 145,
  --   "max_hr": 178,
  --   "total_work": 900000,
  --   "calories": 600,
  --   "avg_cadence": 90,
  --   "avg_speed": 8.5,
  --   "ascent": 450,
  --   "descent": 430,
  --   "np": 265,
  --   "tss": 85,
  --   "if": 0.82
  -- }
  
  -- Zone times as arrays
  hr_zone_seconds integer[5], -- [z1, z2, z3, z4, z5]
  power_zone_seconds integer[7], -- [z1-z7]
  
  -- Profile snapshot at recording time
  profile_snapshot jsonb,
  -- { "ftp": 250, "weight_kg": 75, "threshold_hr": 165 }
  
  -- References
  planned_activity_id uuid,
  route_id uuid,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_activities_profile_started 
  ON activities(profile_id, started_at DESC);
CREATE INDEX idx_activities_type 
  ON activities(type) WHERE type IS NOT NULL;

-- Query examples
SELECT 
  name,
  duration_seconds / 60 as duration_minutes,
  metrics->>'avg_power' as avg_power,
  hr_zone_seconds[3] as hr_zone3_time
FROM activities
WHERE profile_id = $1
ORDER BY started_at DESC;
```

**Benefits:**
- Flexible schema (add metrics without migrations)
- Easier to query common metrics
- Better indexing (fewer columns)
- Type-safe at app layer (not DB)
- Natural fit for JSONB

**Migration Path:**
1. Create new schema alongside existing
2. Dual-write during transition period
3. Migrate historical data
4. Drop old tables

**Estimated Effort**: 2-3 weeks

**Impact**: **MEDIUM** - Long-term maintainability

---

### 4.5 LOW PRIORITY: Adopt Model-Based Validation

**Current Approach:**
- Scattered validation across managers
- Manual range checking
- No persistence coupling

**Auuki's Pattern:**
```typescript
class SensorModel<T> {
  constructor(
    public name: string,
    public defaultValue: T,
    public validator: (value: T) => boolean,
    public storage?: Storage
  ) {}
  
  validate(value: T): T | null {
    if (this.validator(value)) {
      this.storage?.set(this.name, value);
      return value;
    }
    console.warn(`Invalid ${this.name}:`, value);
    return null;
  }
}

// Define models once
const powerModel = new SensorModel(
  'power',
  0,
  (v: number) => v >= 0 && v <= 4000,
  localStorage
);

const hrModel = new SensorModel(
  'heartrate',
  0,
  (v: number) => v >= 30 && v <= 250,
  localStorage
);

// Use everywhere
const validPower = powerModel.validate(reading.value);
```

**Benefits:**
- DRY validation logic
- Automatic persistence
- Type-safe models
- Easy testing
- Clear contracts

**Estimated Effort**: 1 week

**Impact**: **LOW** - Code quality improvement

---

## 5. Mobile-Specific Enhancements from Auuki

### 5.1 Progressive Web App Considerations

**Auuki's Approach:**
- Works entirely in browser
- No app store approval
- Instant updates
- Service Worker for offline
- Web Bluetooth API

**GradientPeak's Reality:**
- Native mobile app (React Native)
- App store distribution
- Better native integration
- Offline-first already

**Recommendation**: Keep native app, but consider web companion for:
- Workout planning (desktop)
- Data analysis (big screen)
- Quick access without install

---

### 5.2 Zero-Dependency Philosophy

**Auuki**: No runtime dependencies (~200KB bundle)
**GradientPeak**: Heavy framework stack (Expo, React Native, Zustand, etc.)

**Consideration**: For core calculations package (`@repo/core`), consider:
- Removing Zod dependency (use TypeScript types)
- Pure functions only
- Tree-shakeable exports
- Works in browser and Node

**Example:**
```typescript
// Current (with Zod)
export const activityPlanSchema = z.object({
  name: z.string().min(3).max(100),
  // ... complex validation
});

// Alternative (zero-dependency)
export interface ActivityPlan {
  name: string;
  description?: string;
  steps: Step[];
}

export function validateActivityPlan(plan: unknown): plan is ActivityPlan {
  const p = plan as ActivityPlan;
  return (
    typeof p?.name === 'string' &&
    p.name.length >= 3 &&
    p.name.length <= 100 &&
    Array.isArray(p.steps)
  );
}
```

**Benefits:**
- Smaller bundle size
- Faster parsing
- Framework-agnostic
- Easier to port

---

## 6. Web Platform Opportunities

### 6.1 Data Analysis Dashboard

**Current**: Web app exists but underutilized
**Auuki Pattern**: Minimal web UI, focuses on workout execution

**Opportunity**: GradientPeak's web platform could focus on:
- **Training load charts** (CTL/ATL/TSB over time)
- **Power curve analysis** (best efforts across durations)
- **Workout library** (plan creation and management)
- **Calendar view** (training plan visualization)
- **Integration management** (Strava, TrainingPeaks)

This complements mobile's focus on recording/execution.

---

### 6.2 Collaborative Features

**Auuki**: Single-user only
**GradientPeak**: Multi-user database already

**Opportunities:**
- Coach/athlete relationships
- Shared workout libraries
- Training plan templates (community)
- Segment leaderboards (route-based)
- Team training challenges

---

## 7. Summary of Recommendations

### Immediate Actions (Next Sprint)

1. **[CRITICAL] Begin FTMS implementation** (already documented)
   - Week 1-2: Core infrastructure
   - Week 3-4: ERG mode
   - Week 5-6: Plan integration

2. **[HIGH] Simplify LiveMetricsManager**
   - Flatten metrics interface
   - Remove unnecessary timers
   - Adopt reactive pattern
   - Estimated: 1-2 weeks

3. **[MEDIUM] Create simplified plan format**
   - Design flat structure
   - Add conversion from current format
   - Update UI to use new format
   - Estimated: 1 week

### Mid-Term Improvements (1-2 Months)

4. **[MEDIUM] Database schema migration**
   - Design JSONB-based schema
   - Create migration scripts
   - Dual-write period
   - Cutover
   - Estimated: 2-3 weeks

5. **[LOW] Model-based validation**
   - Extract validation patterns
   - Create model classes
   - Refactor sensor handling
   - Estimated: 1 week

### Long-Term Enhancements (3-6 Months)

6. **[LOW] Zero-dependency core package**
   - Remove Zod from @repo/core
   - Pure TypeScript interfaces
   - Manual validation functions
   - Estimated: 1-2 weeks

7. **[LOW] Web companion features**
   - Desktop workout builder
   - Advanced analytics dashboard
   - Community workout library
   - Estimated: Ongoing

---

## 8. Conclusion

### What Auuki Does Better

1. **Simplicity**: Flat data structures, minimal nesting
2. **Reactivity**: Direct event-driven updates, no intermediaries
3. **FTMS Control**: Full trainer integration from day one
4. **Performance**: Zero dependencies, optimized bundle
5. **Debuggability**: Single state object, easy inspection

### What GradientPeak Does Better

1. **Comprehensive Data Model**: Detailed activity tracking
2. **Cloud Sync**: Automatic backup and cross-device access
3. **Native Experience**: Better iOS/Android integration
4. **Enterprise Features**: Integrations, training plans, routes
5. **Type Safety**: Full TypeScript, validated schemas
6. **Multi-User**: Database designed for social/coaching features

### The Path Forward

**GradientPeak should:**
1. **Adopt** Auuki's simplicity in data structures and reactive patterns
2. **Keep** its comprehensive feature set and cloud architecture
3. **Add** FTMS control to close the critical gap
4. **Simplify** metrics calculation and state management
5. **Maintain** type safety and enterprise-grade quality

**The goal is not to become Auuki**, but to learn from its elegance while preserving GradientPeak's unique strengths as a comprehensive training platform.

---

## Appendix A: Side-by-Side Code Comparison

### Sensor Reading Validation

**Auuki:**
```javascript
class Power extends Model {
  constructor() {
    super({
      prop: 'power',
      default: 0,
      parser: parseInt,
      isValid: (v) => v >= 0 && v <= 2500,
      storage: LocalStorage
    });
  }
}

const power = new Power();
const valid = power.setState(reading);
```

**GradientPeak:**
```typescript
interface SensorReading {
  metric: 'power';
  value: number;
  timestamp: number;
  metadata?: { deviceId?: string };
}

validateSensorReading(reading: SensorReading): SensorReading | null {
  if (reading.metric === 'power') {
    if (typeof reading.value === 'number' &&
        reading.value >= 0 && reading.value <= 4000) {
      return reading;
    }
  }
  return null;
}
```

### Reactive Updates

**Auuki:**
```javascript
xf.reg('power', (power, db) => {
  db.power = power;
  db.powerAvg = models.powerAvg.setState(power);
  db.totalWork += power * 1;
});

xf.dispatch('power', 250);
```

**GradientPeak:**
```typescript
this.sensorsManager.subscribe((reading) => {
  this.handleSensorData(reading);
});

private handleSensorData(reading: SensorReading) {
  if (this.state !== 'recording') return;
  this.liveMetricsManager.ingestSensorData(reading);
}

public ingestSensorData(reading: SensorReading) {
  this.pendingSensorUpdates.set(reading.metric, reading.value);
  if (!this.sensorUpdateTimer) {
    this.sensorUpdateTimer = setTimeout(() => {
      this.processPendingSensorUpdates();
    }, 100);
  }
}
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-12-11  
**Related Documents**: 
- BLUETOOTH_CONTROL_GAP.md
- FTMS_RECORDING_ENHANCEMENTS.md
