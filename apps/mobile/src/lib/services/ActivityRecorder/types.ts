import {
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityType,
} from "@repo/core";
import {
  Activity,
  Bike,
  Dumbbell,
  Footprints,
  Waves,
} from "lucide-react-native";

export const ACTIVITY_NAMES: Record<PublicActivityType, string> = {
  outdoor_run: "Run",
  outdoor_bike: "Bike",
  indoor_bike_trainer: "Trainer",
  indoor_treadmill: "Treadmill",
  indoor_strength: "Strength",
  indoor_swim: "Swim",
  other: "Other",
};

export const ACTIVITY_ICONS: Record<PublicActivityType, any> = {
  outdoor_run: Footprints,
  outdoor_bike: Bike,
  indoor_bike_trainer: Bike,
  indoor_treadmill: Footprints,
  indoor_strength: Dumbbell,
  indoor_swim: Waves,
  other: Activity,
};
// ================================
// Sensor Reading Types
// ================================

/**
 * Canonical SensorReading interface
 * Used across all sensor-related code (BLE, GPS, manual input)
 */
export interface SensorReading {
  metric: PublicActivityMetric;
  dataType: PublicActivityMetricDataType;
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

/**
 * Location reading from GPS
 */
export interface LocationReading {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  heading?: number;
  timestamp: number;
}

// ================================
// Live Metrics State
// ================================

/**
 * Complete live metrics state matching SQL schema
 */
export interface LiveMetricsState {
  // === Timing ===
  startedAt?: number; // Unix timestamp
  finishedAt?: number; // Unix timestamp
  elapsedTime: number; // seconds
  movingTime: number; // seconds (excludes pauses)

  // === Distance & Speed ===
  distance: number; // meters
  avgSpeed: number; // m/s
  maxSpeed: number; // m/s

  // === Elevation ===
  totalAscent: number; // meters
  totalDescent: number; // meters
  avgGrade: number; // percentage (-100 to 100)
  elevationGainPerKm: number; // meters per km

  // === Heart Rate ===
  avgHeartRate: number; // bpm
  maxHeartRate: number; // bpm
  maxHrPctThreshold: number; // percentage of threshold HR
  hrZone1Time: number; // seconds in zone 1
  hrZone2Time: number; // seconds in zone 2
  hrZone3Time: number; // seconds in zone 3
  hrZone4Time: number; // seconds in zone 4
  hrZone5Time: number; // seconds in zone 5

  // === Power ===
  avgPower: number; // watts
  maxPower: number; // watts
  totalWork: number; // joules
  powerZone1Time: number; // seconds in zone 1
  powerZone2Time: number; // seconds in zone 2
  powerZone3Time: number; // seconds in zone 3
  powerZone4Time: number; // seconds in zone 4
  powerZone5Time: number; // seconds in zone 5
  powerZone6Time: number; // seconds in zone 6
  powerZone7Time: number; // seconds in zone 7
  powerHeartRateRatio: number; // watts per bpm

  // === Cadence ===
  avgCadence: number; // rpm
  maxCadence: number; // rpm

  // === Environmental ===
  avgTemperature?: number; // celsius
  maxTemperature?: number; // celsius

  // === Calories ===
  calories: number; // kcal

  // === Tier 2 - Live Approximations ===
  normalizedPowerEst: number; // watts (estimated)
  intensityFactorEst: number; // decimal (0.85)
  trainingStressScoreEst: number; // points
  variabilityIndexEst: number; // ratio
  efficiencyFactorEst: number; // watts per bpm
  decouplingEst: number; // percentage

  // === Plan Adherence ===
  adherenceCurrentStep: number; // decimal (0.95)
}

// === Zone Configuration ===
export interface ZoneConfig {
  hrZones: number[]; // 5 thresholds for HR zones
  powerZones: number[]; // 7 thresholds for power zones
}

// === Profile Information ===
export interface ProfileMetrics {
  ftp?: number; // Functional Threshold Power
  thresholdHr?: number; // Lactate Threshold Heart Rate
  weight?: number; // kg
  age?: number; // years
}

// === Update Events ===
export interface MetricUpdateEvent {
  metric: string;
  value: number;
  timestamp: number;
}

// === Calculation Results ===
export interface CalculationResult<T = number> {
  value: T;
  confidence: "high" | "medium" | "low";
  sampleSize: number;
  lastUpdated: number;
}

// === Performance Metrics ===
export interface PerformanceStats {
  uiUpdateRate: number; // actual Hz
  calculationTime: number; // ms
  memoryUsage: number; // bytes
  bufferUtilization: Record<string, number>; // 0-1
}

// === Recording States ===
export type LiveMetricsState_Recording =
  | "inactive"
  | "starting"
  | "active"
  | "paused"
  | "finishing"
  | "error";

// === Batch Processing ===
export interface BatchProcessingStats {
  pendingWrites: number;
  lastBatchSize: number;
  lastBatchTime: number;
  totalBatches: number;
  failedBatches: number;
}

// === Memory Usage ===
export interface MemoryUsageStats {
  totalBufferSize: number; // bytes
  powerBufferSize: number;
  hrBufferSize: number;
  locationBufferSize: number;
  utilizationPercent: number;
}

// === Heart Rate Metrics ===
export interface HeartRateMetrics {
  current?: number;
  avg: number;
  max: number;
  maxPctThreshold: number;
  zones: {
    z1: number;
    z2: number;
    z3: number;
    z4: number;
    z5: number;
  };
}

// === Power Metrics ===
export interface PowerMetrics {
  current?: number;
  avg: number;
  max: number;
  normalized: number;
  totalWork: number;
  zones: {
    z1: number;
    z2: number;
    z3: number;
    z4: number;
    z5: number;
    z6: number;
    z7: number;
  };
}

// === Analysis Metrics ===
export interface AnalysisMetrics {
  normalizedPower: number;
  intensityFactor: number;
  tss: number;
  variabilityIndex: number;
  efficiencyFactor: number;
  decoupling: number;
  adherence: number;
}

// === Distance Metrics ===
export interface DistanceMetrics {
  distance: number;
  avgSpeed: number;
  maxSpeed: number;
  elapsedTime: number;
  movingTime: number;
}

// === Elevation Metrics ===
export interface ElevationMetrics {
  totalAscent: number;
  totalDescent: number;
  avgGrade: number;
  elevationGainPerKm: number;
  current?: number;
}

// === Cadence & Environmental Metrics ===
export interface CadenceMetrics {
  current?: number;
  avg: number;
  max: number;
}

export interface EnvironmentalMetrics {
  avgTemperature?: number;
  maxTemperature?: number;
  currentTemperature?: number;
}

// === Live Recording Status ===
export interface LiveRecordingStatus {
  state: LiveMetricsState_Recording;
  startedAt?: number;
  elapsedTime: number;
  movingTime: number;
  isPaused: boolean;
  sensorCount: number;
  gpsAccuracy?: number;
  batteryOptimized: boolean;
}

// === Metrics Summary for UI Cards ===
export interface MetricsSummary {
  primary: {
    elapsedTime: number;
    distance: number;
    avgPower: number;
    avgHeartRate: number;
  };
  secondary: {
    calories: number;
    avgSpeed: number;
    maxPower: number;
    maxHeartRate: number;
  };
  analysis: {
    tss: number;
    intensityFactor: number;
    normalizedPower: number;
    adherence: number;
  };
}

// === Metric Formatting Options ===
export interface MetricDisplayOptions {
  precision: number;
  showUnit: boolean;
  abbreviated: boolean;
  colorCode: boolean;
  showZone?: boolean;
}

// === Tier Classifications ===
export interface TierMetrics {
  tier1: Partial<LiveMetricsState>; // Real-time metrics
  tier2: Partial<LiveMetricsState>; // Approximated metrics
}

// === Event Payload Types ===
export interface RecordingStartedPayload {
  timestamp: number;
  activityType: string;
  profile: ProfileMetrics;
}

export interface RecordingPausedPayload {
  timestamp: number;
  elapsedTime: number;
  reason?: "manual" | "automatic" | "system";
}

export interface RecordingResumedPayload {
  timestamp: number;
  pauseDuration: number;
}

export interface RecordingFinishedPayload {
  timestamp: number;
  finalMetrics: LiveMetricsState;
  totalDuration: number;
  summary: MetricsSummary;
}

// === Error Types ===
export interface LiveMetricsError {
  type:
    | "calculation"
    | "buffer_overflow"
    | "sensor_timeout"
    | "memory_limit"
    | "invalid_data";
  message: string;
  timestamp: number;
  metric?: string;
  severity: "low" | "medium" | "high" | "critical";
}

// === Configuration Overrides ===
export interface LiveMetricsConfig {
  enableTier2Calculations: boolean;
  bufferSizes: Record<string, number>;
  updateFrequencies: Record<string, number>;
  precisionSettings: Record<string, number>;
  memoryLimits: {
    maxBufferSizeMB: number;
    cleanupThreshold: number;
  };
}

// ================================
// Recording Metadata (replaces database recording)
// ================================

/**
 * Recording metadata stored in-memory during recording
 * Replaces the SQLite activityRecordings table
 */
export interface RecordingMetadata {
  startedAt: string; // ISO timestamp
  endedAt?: string; // ISO timestamp (set on finish)
  activityType: PublicActivityType;
  profileId: string;
  profile: ProfileMetrics & {
    id: string;
    dob: string | null;
    ftp: number | null;
    threshold_hr: number | null;
    weight_kg: number | null;
  };
  plannedActivityId?: string;
  activityPlan?: import("@repo/core").RecordingServiceActivityPlan;
}

// ================================
// NEW: Separated Data Models
// ================================

/**
 * Real-time sensor readings (truly "live" data)
 */
export interface CurrentReadings {
  heartRate?: number; // bpm
  power?: number; // watts
  cadence?: number; // rpm
  speed?: number; // m/s
  temperature?: number; // celsius
  position?: {
    lat: number;
    lng: number;
    altitude?: number; // meters
    heading?: number; // degrees
  };

  // Track freshness of each reading
  lastUpdated?: {
    heartRate?: number;
    power?: number;
    cadence?: number;
    speed?: number;
    temperature?: number;
    position?: number;
  };
}

/**
 * Computed session statistics (derived from sensor data)
 */
export interface SessionStats {
  // Timing
  duration: number; // seconds
  movingTime: number; // seconds
  pausedTime: number; // seconds

  // Totals
  distance: number; // meters
  calories: number; // kcal
  work: number; // joules
  ascent: number; // meters
  descent: number; // meters

  // Averages
  avgHeartRate: number; // bpm
  avgPower: number; // watts
  avgSpeed: number; // m/s
  avgCadence: number; // rpm
  avgTemperature?: number; // celsius

  // Maximums
  maxHeartRate: number; // bpm
  maxPower: number; // watts
  maxSpeed: number; // m/s
  maxCadence: number; // rpm

  // Zone distributions (seconds in each zone)
  hrZones: [number, number, number, number, number];
  powerZones: [number, number, number, number, number, number, number];

  // Advanced metrics (optional based on data availability)
  normalizedPower?: number;
  trainingStressScore?: number;
  intensityFactor?: number;
  variabilityIndex?: number;
  efficiencyFactor?: number;
  aerobicDecoupling?: number;

  // Elevation metrics
  avgGrade?: number; // percentage
  elevationGainPerKm?: number; // meters per km

  // Plan execution
  planAdherence?: number; // 0-1
}

/**
 * Event for sensor updates
 */
export interface SensorUpdateEvent {
  readings: CurrentReadings;
  timestamp: number;
}

/**
 * Event for stats updates
 */
export interface StatsUpdateEvent {
  stats: SessionStats;
  timestamp: number;
}

export interface UseMetricsBatchReturn {
  metrics: Record<string, number | undefined>;
  isStale: boolean;
  lastUpdate: number;
}

// === Database Persistence Types ===
export interface MetricsPersistenceState {
  lastSaved: number;
  pendingUpdates: number;
  compressionEnabled: boolean;
  storageUsed: number;
}

// === Activity Plan Integration ===
export interface PlanAdherenceMetrics {
  currentStep: number;
  totalSteps: number;
  stepProgress: number;
  stepAdherence: number;
  overallAdherence: number;
  targetMetric: string;
  targetValue: number;
  currentValue: number;
  timeInTarget: number;
  timeOutOfTarget: number;
}

// === Type Guards ===
export function isLiveMetricsState(obj: any): obj is LiveMetricsState {
  return (
    typeof obj === "object" &&
    typeof obj.elapsedTime === "number" &&
    typeof obj.distance === "number"
  );
}

export function isMetricUpdateEvent(obj: any): obj is MetricUpdateEvent {
  return (
    typeof obj === "object" &&
    typeof obj.metric === "string" &&
    typeof obj.value === "number" &&
    typeof obj.timestamp === "number"
  );
}

// === Utility Types ===
export type MetricKey = keyof LiveMetricsState;
export type NumericMetricKey = {
  [K in MetricKey]: LiveMetricsState[K] extends number ? K : never;
}[MetricKey];

export type OptionalMetricKey = {
  [K in MetricKey]: LiveMetricsState[K] extends number | undefined ? K : never;
}[MetricKey];
