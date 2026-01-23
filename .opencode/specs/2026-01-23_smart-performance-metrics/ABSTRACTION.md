# Universal Critical Intensity Abstraction - Complete Specification

**Created:** 2026-01-23  
**Status:** Design Complete  
**Related:** DESIGN.md, DATABASE_SCHEMA.md, IMPLEMENTATION_GUIDE.md

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Universal Model Concept](#universal-model-concept)
3. [Mathematical Foundation](#mathematical-foundation)
4. [Category-Specific Implementations](#category-specific-implementations)
5. [TypeScript Interface Design](#typescript-interface-design)
6. [Unit Conversion System](#unit-conversion-system)
7. [Quality Assessment Framework](#quality-assessment-framework)
8. [Integration Architecture](#integration-architecture)

---

## Executive Summary

This document specifies the **Universal Critical Intensity (CI) Model** - an abstraction layer that applies the Critical Power concept across all activity categories in GradientPeak.

### Core Principle

The hyperbolic power-duration relationship is **universal** across:

- All sports (cycling, running, swimming, rowing, etc.)
- All species (humans, animals)
- All exercise modalities (whole-body, single muscle groups)

**Mathematical form:**

```
Intensity(t) = CI + Capacity/t
```

Where:

- **CI** = Critical Intensity (sustainable threshold)
- **Capacity** = Anaerobic work capacity above CI
- **t** = Duration

### Category Manifestations

| Category     | CI Name             | Capacity Name | Primary Unit | Display Units  |
| ------------ | ------------------- | ------------- | ------------ | -------------- |
| **Bike**     | Critical Power (CP) | W'            | watts        | W, W/kg        |
| **Run**      | Critical Speed (CS) | D'            | m/s          | min/km, min/mi |
| **Swim**     | Critical Speed (CS) | D'            | m/s          | sec/100m       |
| **Strength** | Critical RPE        | Volume'       | RPE          | RPE scale      |
| **Other**    | Critical Intensity  | Capacity      | varies       | varies         |

---

## Universal Model Concept

### The Hyperbolic Relationship

**Research Foundation** (Poole et al., 2016):

> "The hyperbolic form of the power-duration relationship is rigorous and highly conserved across species, forms of exercise and individual muscles/muscle groups."

**Key Properties:**

1. **Asymptote (CI)**: The highest sustainable intensity without continuous fatigue
2. **Curvature (Capacity)**: Finite work capacity above the asymptote
3. **Predictive**: Time to exhaustion = Capacity / (Intensity - CI)

### Why Universal Abstraction?

**Benefits:**

- ✅ **Code Reuse**: Single regression engine for all sports
- ✅ **Consistency**: Same mathematical model, different units
- ✅ **Extensibility**: Easy to add new sports (rowing, skiing, etc.)
- ✅ **Maintainability**: One source of truth for calculations
- ✅ **Testing**: Test core algorithm once, validate per category

**Trade-offs:**

- ⚠️ **Complexity**: Generic types can be harder to understand
- ⚠️ **Category Nuances**: Must handle sport-specific adjustments

**Decision**: Use universal abstraction with category-specific strategies (Strategy Pattern)

---

## Mathematical Foundation

### 2-Parameter Hyperbolic Model

**Formula:**

```
I(t) = CI + W'/t

Where:
  I(t) = Sustainable intensity for duration t
  CI = Critical Intensity (asymptote)
  W' = Work capacity (curvature constant)
  t = Duration
```

**Linear Transformation** (for regression):

```
Work = CI × Time + W'

This is a linear equation: y = mx + b
Where:
  y = Work (intensity × duration)
  x = Time (duration)
  m = CI (slope)
  b = W' (intercept)
```

### Least-Squares Regression

**Algorithm:**

```typescript
function linearRegression(
  x: number[],
  y: number[],
): {
  slope: number; // CI
  intercept: number; // W'
  r2: number; // Quality metric
} {
  const n = x.length;
  const xMean = sum(x) / n;
  const yMean = sum(y) / n;

  // Calculate slope (CI)
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - xMean) * (y[i] - yMean);
    denominator += (x[i] - xMean) ** 2;
  }
  const slope = numerator / denominator;

  // Calculate intercept (W')
  const intercept = yMean - slope * xMean;

  // Calculate R² (quality)
  let ssRes = 0,
    ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * x[i] + intercept;
    ssRes += (y[i] - predicted) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  const r2 = 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}
```

### Data Requirements

**Minimum Efforts:**

- 3 efforts: Poor reliability (R² < 0.85)
- 4 efforts: Fair reliability (R² 0.85-0.92)
- 5+ efforts: Good reliability (R² > 0.92)

**Duration Spread:**

- Must span 2+ orders of magnitude (e.g., 1min to 60min)
- Include short effort (< 5min) and long effort (> 15min)

**Cycling Example:**

```
Recommended: 1min, 5min, 20min, 60min
Ideal: 30s, 1min, 3min, 5min, 8min, 12min, 20min, 40min, 60min
```

**Running Example:**

```
Recommended: 800m, 1500m, 5km, 10km
Ideal: 400m, 800m, 1500m, 3km, 5km, 10km, half-marathon
```

---

## Category-Specific Implementations

### Cycling (Power-Based)

**Model:**

```
Power(t) = CP + W'/t

Where:
  CP = Critical Power (watts)
  W' = Anaerobic Work Capacity (joules)
```

**Standard Durations:**

- 5s (neuromuscular power)
- 1min (anaerobic capacity)
- 5min (VO2max power)
- 20min (FTP proxy: 20min × 0.95)
- 60min (FTP / CP)

**Derived Metrics:**

- FTP = CP × 0.95 (rule of thumb)
- Power-to-weight = CP / weight_kg
- Power zones (7-zone model from CP)

**Phenotype Classification:**

```typescript
function classifyPhenotype(cp: number, wPrime: number): string {
  const p5s = cp + wPrime / 5;
  const p5min = cp + wPrime / 300;

  const sprintRatio = p5s / cp;
  const enduranceRatio = cp / p5min;

  if (sprintRatio > 3.5 && enduranceRatio < 0.85) {
    return "sprinter";
  } else if (sprintRatio < 2.8 && enduranceRatio > 0.92) {
    return "time-trialist";
  } else {
    return "all-rounder";
  }
}
```

### Running (Speed-Based)

**Model:**

```
Speed(t) = CS + D'/t

Where:
  CS = Critical Speed (m/s)
  D' = Distance Capacity (meters)
```

**Standard Distances:**

- 400m (sprint endurance)
- 1500m (VO2max)
- 5km (lactate threshold proxy)
- 10km (CS proxy)
- Half-marathon, Marathon

**Grade Adjustment (Normalized Graded Pace):**

Running on hills requires adjustment using Minetti formula:

```typescript
function adjustForGrade(speedMps: number, gradePercent: number): number {
  // Uphill: each 1% adds ~3.5% to effort
  // Downhill: each -1% reduces effort by ~2%
  const factor =
    gradePercent >= 0 ? 1 + gradePercent * 0.035 : 1 + gradePercent * 0.02;

  return speedMps / factor; // Normalized speed
}
```

**Pace Conversions:**

```typescript
// m/s → min/km
function speedToMinPerKm(mps: number): number {
  return 1000 / (mps * 60);
}

// min/km → m/s
function minPerKmToSpeed(minPerKm: number): number {
  return 1000 / (minPerKm * 60);
}

// Example: 4.5 m/s = 3:42 min/km = 5:57 min/mi
```

**Race Predictions:**

Use Riegel formula:

```
Time2 = Time1 × (Distance2 / Distance1)^n

Where n is Riegel exponent:
  1.06-1.07: Endurance runner (marathoner)
  1.08-1.09: Balanced runner
  1.10-1.12: Speed-oriented (miler/5k)
```

### Swimming (Speed-Based, Different Units)

**Model:**

```
Speed(t) = CS + D'/t

Where:
  CS = Critical Speed (m/s)
  D' = Distance Capacity (meters)
```

**Standard Distances:**

- 50m (sprint)
- 100m (anaerobic)
- 200m (VO2max)
- 400m (threshold)
- 800m (CS proxy)
- 1500m (endurance)

**Pace Conversion (Swimming Convention):**

Swimming uses pace per 100m instead of speed:

```typescript
// m/s → sec/100m
function speedToSecPer100m(mps: number): number {
  return 100 / mps;
}

// sec/100m → m/s
function secPer100mToSpeed(secPer100m: number): number {
  return 100 / secPer100m;
}

// Example: 1.5 m/s = 66.7 sec/100m = 1:06.7 per 100m
```

**Pool vs. Open Water:**

- Pool times typically 5-10% faster
- Account for turns in pool (faster for shorter distances)
- Open water: add 5-10% to pace for equivalent effort

### Strength (RPE-Based, Non-Hyperbolic)

**Challenge:** Hyperbolic model does NOT apply to strength training

**Why:**

- Discrete sets, not continuous effort
- Recovery between sets complicates model
- RPE is subjective, not objective power/speed

**Alternative Approach: Volume-Load Tracking**

```typescript
interface StrengthMetrics {
  criticalRPE: number; // Sustainable RPE (~7/10)
  volumeCapacity: number; // Max volume at different RPE levels

  volumeByRPE: {
    rpe_7: number; // Sets × Reps × Weight at RPE 7
    rpe_8: number;
    rpe_9: number;
  };

  oneRepMaxEstimate?: number; // Estimated 1RM
}

function calculateVolumeLoad(
  sets: number,
  reps: number,
  weight: number,
): number {
  return sets * reps * weight;
}
```

**Recommendation:** Track volume at different RPE levels, NOT hyperbolic model

---

## TypeScript Interface Design

### Core Abstractions

```typescript
/**
 * Universal Critical Intensity Model
 * Generic across all activity categories
 */
export interface CriticalIntensityModel<
  TIntensity = number,
  TCapacity = number,
  TDuration = number,
> {
  /** Activity category */
  category: PublicActivityCategory;

  /** Critical Intensity - sustainable threshold */
  criticalIntensity: TIntensity;

  /** Anaerobic Capacity - work above threshold */
  anaerobicCapacity: TCapacity;

  /** Units for display and conversion */
  units: {
    intensity: IntensityUnit;
    capacity: CapacityUnit;
    duration: DurationUnit;
  };

  /** Model quality metrics */
  quality: ModelQuality;

  /** Athlete phenotype */
  phenotype: "sprinter" | "time-trialist" | "all-rounder";

  /** Calculation metadata */
  calculatedAt: Date;
  sourceEfforts: EffortPoint<TIntensity, TDuration>[];
}

/**
 * Effort data point
 */
export interface EffortPoint<TIntensity = number, TDuration = number> {
  intensity: TIntensity;
  duration: TDuration;
  timestamp?: Date;
  activityId?: string;
}

/**
 * Model quality assessment
 */
export interface ModelQuality {
  rSquared: number; // 0-1, higher is better
  standardError: number; // Prediction error
  confidenceLevel: "high" | "medium" | "low";
  effortCount: number;
  warnings: string[];
}

/**
 * Unit types
 */
export type IntensityUnit =
  | "watts" // Bike power
  | "m/s" // Run/Swim speed (storage)
  | "min/km" // Run pace (display)
  | "min/mi" // Run pace (display)
  | "sec/100m" // Swim pace (display)
  | "rpe"; // Strength RPE

export type CapacityUnit =
  | "joules" // Bike W'
  | "meters" // Run/Swim D'
  | "volume_units"; // Strength Volume'

export type DurationUnit = "seconds" | "meters";
```

### Category-Specific Models

```typescript
/**
 * Bike Critical Power Model
 */
export interface BikeCIModel extends CriticalIntensityModel<
  number,
  number,
  number
> {
  category: "bike";

  // Aliases for clarity
  criticalPower: number; // = criticalIntensity
  wPrime: number; // = anaerobicCapacity

  // Extended bike-specific metrics
  extended: {
    ftp: number; // FTP = CP × 0.95
    powerToWeight: number; // W/kg
    maxAerobicPower: number; // 5-min power
    neuromuscularPower: number; // 5-sec power
    powerZones: PowerZone[]; // 7-zone model
  };
}

/**
 * Run Critical Speed Model
 */
export interface RunCIModel extends CriticalIntensityModel<
  number,
  number,
  number
> {
  category: "run";

  // Aliases
  criticalSpeed: number; // = criticalIntensity (m/s)
  dPrime: number; // = anaerobicCapacity (meters)

  // Extended run-specific metrics
  extended: {
    criticalPace: number; // min/km (converted from CS)
    thresholdPace: number; // Lactate threshold pace
    riegelExponent: number; // Distance decay factor
    vo2maxSpeed: number; // 5-min speed
    racePredictions: {
      "5k": number; // Seconds
      "10k": number;
      half_marathon: number;
      marathon: number;
    };
    paceZones: PaceZone[]; // 5-zone model
  };
}

/**
 * Swim Critical Speed Model
 */
export interface SwimCIModel extends CriticalIntensityModel<
  number,
  number,
  number
> {
  category: "swim";

  // Aliases
  criticalSpeed: number; // = criticalIntensity (m/s)
  dPrime: number; // = anaerobicCapacity (meters)

  // Extended swim-specific metrics
  extended: {
    criticalPace: number; // sec/100m
    thresholdPace: number; // CSS pace
    distancePredictions: {
      "100m": number; // Seconds
      "200m": number;
      "400m": number;
      "1500m": number;
    };
  };
}

/**
 * Strength Volume Model (NOT hyperbolic)
 */
export interface StrengthCIModel extends CriticalIntensityModel<
  number,
  number,
  number
> {
  category: "strength";

  // Different interpretation
  criticalRPE: number; // Sustainable RPE (~7)
  volumePrime: number; // Volume capacity

  // Extended strength-specific metrics
  extended: {
    oneRepMaxEstimate?: number;
    workCapacity: number;
    volumeByRPE: Record<number, number>; // RPE → Volume
  };
}
```

### Strategy Pattern Interface

```typescript
/**
 * Strategy for calculating CI models
 */
export interface CIModelStrategy<TModel extends CriticalIntensityModel> {
  /**
   * Calculate CI model from activity data
   */
  calculate(activityData: ActivityData): TModel | null;

  /**
   * Extract effort points from activity
   */
  extractEfforts(activityData: ActivityData): EffortPoint[];

  /**
   * Validate model quality
   */
  validate(model: TModel): ValidationResult;

  /**
   * Derive phenotype from model
   */
  derivePhenotype(model: TModel): "sprinter" | "time-trialist" | "all-rounder";
}

/**
 * Factory for creating strategies
 */
export class CIModelFactory {
  private strategies: Map<PublicActivityCategory, CIModelStrategy<any>>;

  constructor(
    private regressionEngine: HyperbolicRegressionEngine,
    private converter: UnitConverter,
  ) {
    this.strategies = new Map([
      ["bike", new BikeCIStrategy(regressionEngine, converter)],
      ["run", new RunCIStrategy(regressionEngine, converter)],
      ["swim", new SwimCIStrategy(regressionEngine, converter)],
      ["strength", new StrengthCIStrategy(regressionEngine, converter)],
    ]);
  }

  getStrategy(category: PublicActivityCategory): CIModelStrategy<any> | null {
    return this.strategies.get(category) || null;
  }

  createModel(activityData: ActivityData): CriticalIntensityModel | null {
    const strategy = this.getStrategy(activityData.category);
    return strategy?.calculate(activityData) || null;
  }

  // Extensibility: register custom strategies
  registerStrategy(
    category: PublicActivityCategory,
    strategy: CIModelStrategy<any>,
  ): void {
    this.strategies.set(category, strategy);
  }
}
```

---

## Unit Conversion System

### Flexible Unit Storage

**Design Decision:** Store in standard units, convert for display

**Standard Units:**

- Bike: watts (power), joules (W')
- Run: m/s (speed), meters (D')
- Swim: m/s (speed), meters (D')
- Strength: RPE (0-10), volume units

**Display Units:**

- Bike: watts, W/kg, kJ
- Run: min/km, min/mi, km/h, mph
- Swim: sec/100m, min/100m
- Strength: RPE, sets × reps × weight

### Conversion Utilities

```typescript
export class UnitConverter {
  /**
   * Convert speed between units
   */
  convertSpeed(
    value: number,
    from: "m/s" | "min/km" | "min/mi" | "km/h" | "mph",
    to: "m/s" | "min/km" | "min/mi" | "km/h" | "mph",
  ): number {
    // Convert to m/s first (canonical form)
    let mps: number;

    switch (from) {
      case "m/s":
        mps = value;
        break;
      case "min/km":
        mps = 1000 / (value * 60);
        break;
      case "min/mi":
        mps = 1609.34 / (value * 60);
        break;
      case "km/h":
        mps = value / 3.6;
        break;
      case "mph":
        mps = value * 0.44704;
        break;
    }

    // Convert from m/s to target unit
    switch (to) {
      case "m/s":
        return mps;
      case "min/km":
        return 1000 / (mps * 60);
      case "min/mi":
        return 1609.34 / (mps * 60);
      case "km/h":
        return mps * 3.6;
      case "mph":
        return mps / 0.44704;
    }
  }

  /**
   * Convert swimming pace
   */
  convertSwimPace(
    value: number,
    from: "m/s" | "sec/100m",
    to: "m/s" | "sec/100m",
  ): number {
    if (from === to) return value;

    if (from === "m/s") {
      return 100 / value; // → sec/100m
    } else {
      return 100 / value; // → m/s
    }
  }

  /**
   * Get display configuration for category
   */
  getDisplayConfig(category: PublicActivityCategory): {
    intensityUnit: string;
    capacityUnit: string;
    precision: number;
  } {
    const configs = {
      bike: {
        intensityUnit: "W",
        capacityUnit: "kJ",
        precision: 0,
      },
      run: {
        intensityUnit: "min/km",
        capacityUnit: "m",
        precision: 2,
      },
      swim: {
        intensityUnit: "sec/100m",
        capacityUnit: "m",
        precision: 1,
      },
      strength: {
        intensityUnit: "RPE",
        capacityUnit: "volume",
        precision: 1,
      },
    };

    return configs[category] || configs.bike;
  }
}
```

### Example Conversions

**Running:**

```
4.5 m/s = 3:42 min/km = 5:57 min/mi = 16.2 km/h = 10.1 mph
```

**Swimming:**

```
1.5 m/s = 66.7 sec/100m = 1:06.7 per 100m
```

**Cycling:**

```
250W at 70kg = 3.57 W/kg
20,000 J = 20 kJ
```

---

## Quality Assessment Framework

### R² (Coefficient of Determination)

**Formula:**

```
R² = 1 - (SS_res / SS_tot)

Where:
  SS_res = Σ(observed - predicted)²
  SS_tot = Σ(observed - mean)²
```

**Thresholds:**

| R² Range    | Quality   | Use Case                              |
| ----------- | --------- | ------------------------------------- |
| ≥ 0.96      | Excellent | High confidence, use for all purposes |
| 0.92 - 0.96 | Good      | Reliable for training, acceptable     |
| 0.85 - 0.92 | Fair      | Use with caution, add more efforts    |
| < 0.85      | Poor      | Do not use, insufficient data         |

### Confidence Levels

```typescript
function assessConfidence(
  r2: number,
  effortCount: number,
  standardError: number,
  ciWidth: number,
): "high" | "medium" | "low" {
  if (r2 >= 0.96 && effortCount >= 5 && ciWidth < 15) {
    return "high";
  } else if (r2 >= 0.9 && effortCount >= 4 && ciWidth < 25) {
    return "medium";
  } else {
    return "low";
  }
}
```

### User-Facing Messages

```typescript
function getQualityMessage(quality: ModelQuality): string {
  const { confidenceLevel, effortCount, rSquared } = quality;

  switch (confidenceLevel) {
    case "high":
      return `Excellent model fit (${effortCount} efforts, R²=${rSquared.toFixed(3)}). Results are highly reliable.`;

    case "medium":
      return `Good model fit (${effortCount} efforts, R²=${rSquared.toFixed(3)}). Add more efforts to improve accuracy.`;

    case "low":
      return `Fair model (${effortCount} efforts, R²=${rSquared.toFixed(3)}). Results may be inaccurate. Record more max efforts.`;
  }
}
```

---

## Integration Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  Application Layer                      │
│  (tRPC Routers, Web Dashboard, Mobile App)             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Universal CI Abstraction Layer                │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │      CIModelFactory                            │    │
│  │  - getStrategy(category)                       │    │
│  │  - createModel(activityData)                   │    │
│  └────────────────────────────────────────────────┘    │
│                     │                                    │
│         ┌───────────┼───────────┐                       │
│         ▼           ▼           ▼                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │  Bike    │ │   Run    │ │   Swim   │  ...          │
│  │ Strategy │ │ Strategy │ │ Strategy │               │
│  └──────────┘ └──────────┘ └──────────┘               │
└─────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Core Calculation Engine                     │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  HyperbolicRegressionEngine                    │    │
│  │  - fitTwoParameter()                           │    │
│  │  - calculateQuality()                          │    │
│  │  - predict()                                   │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  UnitConverter                                 │    │
│  │  - convertSpeed()                              │    │
│  │  - convertPace()                               │    │
│  │  - getDisplayConfig()                          │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Data Persistence Layer                         │
│  (profile_performance_metric_logs)                       │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Activity Upload
   │
   ▼
2. Extract Efforts (Strategy Pattern)
   - Bike: Power-duration curve
   - Run: Speed-distance curve
   - Swim: Pace-distance curve
   │
   ▼
3. Transform to Work-Time Space
   - Work/Distance = Intensity × Duration
   │
   ▼
4. Hyperbolic Regression
   - Linear regression on transformed data
   - Calculate CI and Capacity
   │
   ▼
5. Quality Assessment
   - Calculate R², SEE, confidence intervals
   - Classify confidence level
   │
   ▼
6. Unit Conversion
   - Convert to display units
   - Format for UI
   │
   ▼
7. Persistence
   - Save to performance metrics table
   - Store metadata in JSONB
   │
   ▼
8. UI Display
   - Show CI, Capacity, Quality
   - Display category-specific extended metrics
```

### Integration Points

**1. Performance Metrics Table**

```sql
-- Store CI as performance metric
INSERT INTO profile_performance_metric_logs (
  profile_id,
  category,
  type,
  value,
  unit,
  metadata
) VALUES (
  :profile_id,
  'bike',
  'critical_power',
  250,  -- CP in watts
  'watts',
  '{
    "capacity": 20000,
    "capacity_unit": "joules",
    "quality": {"r_squared": 0.96, "confidence_level": "high"},
    "phenotype": "time-trialist",
    "model_version": "2.0"
  }'
);
```

**2. TSS Calculation**

```typescript
// Enhanced TSS using CI model
const tss = calculateTSSWithCIModel({
  activityData,
  ciModel: bikeCIModel,
});

// Accounts for W' depletion
console.log(`TSS: ${tss.tss}`);
console.log(`W' Depletion: ${tss.metadata.wPrimeDepletion}J`);
```

**3. Metric Suggestions**

```typescript
// Derive related metrics from CI model
const suggestions = deriveMetricsFromCIModel(ciModel);

// Example suggestions:
// - FTP = CP × 0.95
// - 5-min power from power curve
// - Power zones from CP
```

**4. UI Components**

```tsx
<CIModelCard model={bikeCIModel} />
// Displays: CP, W', phenotype, quality, power curve
```

---

## Summary

This abstraction layer provides:

1. **Universal Model**: Single mathematical framework for all sports
2. **Category Flexibility**: Sport-specific implementations via Strategy Pattern
3. **Unit Agnostic**: Store in standard units, display in user-preferred units
4. **Quality Assurance**: Comprehensive quality metrics and user messaging
5. **Extensibility**: Easy to add new sports (rowing, skiing, etc.)
6. **Integration**: Seamless integration with existing GradientPeak architecture

**Next Steps:**

1. Review DATABASE_SCHEMA.md for persistence design
2. Review IMPLEMENTATION_GUIDE.md for step-by-step implementation
3. Prototype core regression engine with real data
4. Build UI components for CI model display

---

**Document Version:** 1.0  
**Status:** Complete  
**Related Documents:**

- DESIGN.md - Overall smart metrics system design
- DATABASE_SCHEMA.md - Database schema for CI models
- IMPLEMENTATION_GUIDE.md - Step-by-step implementation guide
