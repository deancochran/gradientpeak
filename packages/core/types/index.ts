/**
 * Core type definitions for fitness calculations and training analytics
 */

import type {
  PlannedActivityStructure,
  Step,
  WeeklySchedule,
} from "@repo/drizzle/schemas";

// ================================
// Training Zone Types
// ================================

/**
 * Heart rate training zones
 */
export interface HRZones {
  zone1: number; // Recovery (50-60% of threshold HR)
  zone2: number; // Endurance (60-70% of threshold HR)
  zone3: number; // Tempo (70-80% of threshold HR)
  zone4: number; // Lactate Threshold (80-90% of threshold HR)
  zone5: number; // VO2 Max (90-100% of threshold HR)
}

/**
 * Power training zones
 */
export interface PowerZones {
  zone1: number; // Active Recovery (55% of FTP)
  zone2: number; // Endurance (75% of FTP)
  zone3: number; // Tempo (90% of FTP)
  zone4: number; // Lactate Threshold (105% of FTP)
  zone5: number; // VO2 Max (120% of FTP)
}

/**
 * Pace training zones (in seconds per kilometer)
 */
export interface PaceZones {
  zone1: number; // Recovery pace
  zone2: number; // Endurance pace
  zone3: number; // Tempo pace
  zone4: number; // Lactate threshold pace
  zone5: number; // VO2 max pace
}

/**
 * Generic training zone definition
 */
export interface TrainingZone {
  zone: number;
  name: string;
  description: string;
  minValue: number;
  maxValue: number;
  color?: string;
}

// ================================
// Activity Stream Types
// ================================

/**
 * Activity stream data types
 */
export type StreamDataType =
  | "time"
  | "distance"
  | "altitude"
  | "velocity"
  | "heartrate"
  | "power"
  | "cadence"
  | "temperature"
  | "coordinates";

/**
 * Activity stream containing time-series data
 */
export interface ActivityStream {
  type: StreamDataType;
  data: number[] | Array<{ latitude: number; longitude: number }>;
  /** Original length before any processing */
  originalSize: number;
  /** Indicates if data has been smoothed or processed */
  processed?: boolean;
}

/**
 * GPS coordinate point
 */
export interface GPSPoint {
  latitude: number;
  longitude: number;
  elevation?: number;
  timestamp?: Date;
}

/**
 * Activity data point with multiple streams
 */
export interface ActivityDataPoint {
  time: number; // seconds from start
  distance?: number; // meters
  heartRate?: number; // bpm
  power?: number; // watts
  cadence?: number; // rpm
  speed?: number; // m/s
  elevation?: number; // meters
  temperature?: number; // celsius
  coordinates?: GPSPoint;
}

// ================================
// Training Load Types
// ================================

/**
 * Training Stress Score history entry
 */
export interface TSSHistoryEntry {
  date: Date;
  tss: number;
  sport?: string;
  activityType?: string;
}

/**
 * Training load metrics (CTL, ATL, TSB)
 */
export interface TrainingLoad {
  /** Chronic Training Load (fitness) */
  ctl: number;
  /** Acute Training Load (fatigue) */
  atl: number;
  /** Training Stress Balance (form) */
  tsb: number;
}

/**
 * Extended training load analysis
 */
export interface TrainingLoadAnalysis extends TrainingLoad {
  /** Current fitness level category */
  fitnessLevel: "low" | "moderate" | "high" | "very_high";
  /** Current fatigue level category */
  fatigueLevel: "low" | "moderate" | "high" | "very_high";
  /** Current form/readiness category */
  form: "optimal" | "good" | "tired" | "very_tired";
  /** Weekly ramp rate (TSS/week) */
  rampRate: number;
  /** Recommendation message */
  recommendation: string;
  /** Historical data used for calculation */
  history: TSSHistoryEntry[];
  /** Current values */
  currentCTL: number;
  currentATL: number;
  currentTSB: number;
}

// ================================
// Performance Analysis Types
// ================================

/**
 * Power analysis metrics
 */
export interface PowerAnalysis {
  averagePower: number;
  normalizedPower: number;
  intensityFactor: number;
  variabilityIndex: number;
  tss: number;
  /** Power distribution across zones */
  powerZoneDistribution: Record<string, number>;
}

/**
 * Heart rate analysis metrics
 */
export interface HeartRateAnalysis {
  averageHR: number;
  maxHR: number;
  hrReserve: number;
  /** Time spent in each HR zone (seconds) */
  hrZoneDistribution: Record<string, number>;
  averageZone: number;
}

/**
 * Performance trends over time
 */
export interface PerformanceTrend {
  metric: string;
  values: number[];
  dates: Date[];
  movingAverage: number[];
  trend: "improving" | "declining" | "stable";
  overallChange: number; // percentage
  confidence: number; // 0-1
}

// ================================
// Training Plan Types
// ================================

/**
 * Workout step duration
 */
export interface StepDuration {
  type: "time" | "distance" | "calories" | "open";
  value: number; // seconds for time, meters for distance, etc.
}

/**
 * Workout step intensity target
 */
export interface StepIntensity {
  type: "%FTP" | "%ThresholdHR" | "watts" | "bpm" | "zone" | "pace" | "RPE";
  target: number;
  min?: number;
  max?: number;
}

/**
 * Repetition block within a workout
 */
export interface RepetitionBlock {
  repeat: number;
  steps: Step[];
}

/**
 * Scheduled workout with timing
 */
export interface ScheduledWorkout {
  day: number; // 0-6 (Sunday-Saturday)
  workout: PlannedActivityStructure;
  key?: string;
  notes?: string;
  completed?: boolean;
  scheduledDate?: Date;
}

/**
 * Training phase definition
 */
export interface TrainingPhase {
  name: string;
  description: string;
  startWeek: number;
  endWeek: number;
  focus: string[];
  intensity: "recovery" | "base" | "build" | "peak" | "race";
  weeklySchedules: WeeklySchedule[];
}

/**
 * Complete training plan
 */
export interface TrainingPlan {
  id: string;
  name: string;
  description: string;
  sport: string;
  duration: number; // weeks
  phases: TrainingPhase[];
  targetEvent?: {
    name: string;
    date: Date;
    priority: "A" | "B" | "C";
  };
  createdAt: Date;
  updatedAt: Date;
}

// ================================
// Analytics Types
// ================================

/**
 * Activity summary metrics
 */
export interface ActivitySummary {
  duration: number; // seconds
  distance: number; // meters
  elevation: number; // meters
  calories: number;
  tss?: number;
  averagePower?: number;
  normalizedPower?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averageSpeed: number; // m/s
  maxSpeed: number; // m/s
}

/**
 * Period-based statistics
 */
export interface PeriodStats {
  period: {
    startDate: Date;
    endDate: Date;
    days: number;
  };
  totals: {
    activities: number;
    duration: number; // seconds
    distance: number; // meters
    elevation: number; // meters
    tss: number;
  };
  averages: {
    activitiesPerWeek: number;
    durationPerActivity: number; // seconds
    distancePerActivity: number; // meters
    tssPerActivity: number;
  };
  bySport: Record<string, Partial<ActivitySummary>>;
}

/**
 * Fitness progression metrics
 */
export interface FitnessProgression {
  timestamp: Date;
  ctl: number;
  atl: number;
  tsb: number;
  fitness: number; // normalized fitness score
  fatigue: number; // normalized fatigue score
  form: number; // normalized form score
}

// ================================
// Unit System Types
// ================================

/**
 * Supported unit systems
 */
export type UnitSystem = "metric" | "imperial";

/**
 * Distance units
 */
export type DistanceUnit = "meters" | "kilometers" | "feet" | "miles";

/**
 * Speed units
 */
export type SpeedUnit = "mps" | "kph" | "mph";

/**
 * Weight units
 */
export type WeightUnit = "kg" | "lbs";

/**
 * Temperature units
 */
export type TemperatureUnit = "celsius" | "fahrenheit";

// ================================
// Error and Validation Types
// ================================

/**
 * Calculation error with context
 */
export interface CalculationError extends Error {
  code: string;
  context?: Record<string, any>;
}

/**
 * Data validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Range validation
 */
export interface ValueRange {
  min: number;
  max: number;
  unit?: string;
}

// ================================
// Export Collections
// ================================

/**
 * All zone-related types
 */
export type ZoneTypes = HRZones | PowerZones | PaceZones;

/**
 * All analysis types
 */
export type AnalysisTypes =
  | PowerAnalysis
  | HeartRateAnalysis
  | TrainingLoadAnalysis;

/**
 * All plan-related types
 */
export type PlanTypes =
  | TrainingPlan
  | TrainingPhase
  | WeeklySchedule
  | ScheduledWorkout;
