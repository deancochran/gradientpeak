import type { ProfileWithDob } from "../profile";
import type { CanonicalSport } from "../schemas/sport";

// ==============================
// User Profile & Context Types
// ==============================

export interface FitnessState {
  ctl: number; // Chronic Training Load (42-day fitness)
  atl: number; // Acute Training Load (7-day fatigue)
  tsb: number; // Training Stress Balance (form)
  lastActivityDate?: Date;
}

export interface Route {
  distanceMeters: number;
  totalAscent: number;
  totalDescent: number;
  averageGrade?: number;
}

// ==============================
// Estimation Context
// ==============================

export interface EstimationContext {
  /** Stable instant for age and other date-sensitive calculations. */
  asOf?: Date;
  // User profile data
  profile: ProfileWithDob;

  // Performance metrics (from profile_performance_metric_logs)
  ftp?: number | null; // Functional Threshold Power (watts)
  thresholdHr?: number | null; // Threshold Heart Rate (bpm)

  // Profile metrics (from profile_metric_logs)
  weightKg?: number | null; // Weight in kilograms

  // Running performance anchors
  thresholdPaceSecondsPerKm?: number | null;

  // Current fitness state
  fitnessState?: FitnessState;

  // Activity details used only for unstructured route/template estimation.
  activityCategory?: CanonicalSport;

  // Optional route data
  route?: Route;

  // Strict modern plan structure; segment categories own structured calculations.
  structure?: unknown;

  // Scheduling context
  scheduledDate?: Date;
  weeklyPlannedTSS?: number; // TSS already planned for the week
}

export type EstimationWarningHandler = (warning: {
  error?: unknown;
  message: string;
  planId?: string;
}) => void;

export interface ActivityPlanEstimationInput {
  id: string;
  structure?: EstimationContext["structure"];
  route?: EstimationContext["route"];
  activity_category: CanonicalSport;
}

export interface EstimationProfileInput {
  ftp?: number | null;
  threshold_hr?: number | null;
  max_hr?: number | null;
  resting_hr?: number | null;
  weight_kg?: number | null;
  dob?: string | null;
  threshold_pace_seconds_per_km?: number | null;
}

export interface EstimationActivityPlanInput {
  activity_category: CanonicalSport;
  structure?: EstimationContext["structure"];
  route_id?: string;
}

export interface EstimationRouteInput {
  distance_meters: number;
  total_ascent: number;
  total_descent: number;
  average_grade?: number;
}

export interface BuildEstimationContextParams {
  asOf?: Date;
  userProfile: EstimationProfileInput;
  fitnessState?: FitnessState;
  activityPlan: EstimationActivityPlanInput;
  route?: EstimationRouteInput;
  scheduledDate?: Date;
  weeklyPlannedTSS?: number;
}

// ==============================
// Estimation Results
// ==============================

export type ConfidenceLevel = "high" | "medium" | "low";

export interface EstimationResult {
  // Primary metrics
  tss: number | null;
  /** Exact elapsed seconds, or null when the prescription is distance/open/otherwise partial. */
  duration: number | null;
  intensityFactor: number | null;

  categoryDoses?: Array<{
    category: CanonicalSport;
    timedActiveSeconds: number;
    distanceMeters: number;
    repetitionCount: number;
    openOccurrenceCount: number;
    tss: number | null;
    intensityFactor: number | null;
    cyclingPowerEvidenceCoverage: number | null;
  }>;

  // Secondary metrics
  estimatedCalories?: number;
  estimatedDistance?: number; // meters
  estimatedWork?: number; // kJ (for power-based)

  // Zone predictions
  estimatedHRZones?: number[]; // [z1, z2, z3, z4, z5] seconds
  estimatedPowerZones?: number[]; // [z1-z7] seconds

  // Fatigue impact
  fatigueImpact?: FatigueImpact;

  // Estimation metadata
  confidence: ConfidenceLevel;
  confidenceScore: number; // 0-100
  factors: string[]; // What influenced the estimate
  warnings?: string[]; // e.g., "Missing FTP, using default"
}

export interface FatigueImpact {
  projectedATL: number; // After this activity
  projectedCTL: number; // After this activity
  projectedTSB: number; // After this activity
  formChange: "improving" | "maintaining" | "declining";
  /** @deprecated A training-load estimate cannot determine physiological recovery time. */
  recoveryDaysNeeded: number | null;
}

// ==============================
// Fatigue Prediction
// ==============================

export type FormStatus = "fresh" | "optimal" | "neutral" | "tired" | "overreaching";

export type LoadChangeState = "insufficient_data" | "decreasing" | "stable" | "increasing";

export type PlanningReasonCode =
  | "MISSING_FITNESS_STATE"
  | "LOAD_CHANGE_DECREASING"
  | "LOAD_CHANGE_STABLE"
  | "LOAD_CHANGE_INCREASING"
  | "WEEKLY_LOAD_ABOVE_CURRENT_CTL"
  | "SINGLE_ACTIVITY_ABOVE_CURRENT_CTL";

export interface FatiguePrediction {
  afterActivity: {
    ctl: number;
    atl: number;
    tsb: number;
    form: FormStatus;
  };

  weeklyProjection: {
    totalTSS: number;
    averageDailyTSS: number;
    rampRate: number; // Weekly CTL change
    /** @deprecated No binary clearance is inferred from training-load projections. */
    isSafe: boolean | null;
    loadChangeState: LoadChangeState;
    reasons: PlanningReasonCode[];
    recommendation: string;
  };

  recoveryPlan: {
    /** @deprecated Exact physiological recovery cannot be inferred from TSS/TSB. */
    daysToRecover: number | null;
    /** @deprecated This estimator does not clear an athlete for a hard workout. */
    nextHardWorkoutDate: Date | null;
    /** @deprecated This estimator does not prescribe exact rest duration. */
    suggestedRestDays: number | null;
  };

  warnings: string[];
}

// ==============================
// Additional Metrics
// ==============================

export interface MetricEstimations {
  calories?: number;
  distance?: number; // meters
  elevationGain?: number; // meters
  avgPower?: number; // watts
  avgHeartRate?: number; // bpm
  avgSpeed?: number; // m/s
  movingTime?: number; // seconds (< duration)
}

// ==============================
// Weekly Load Estimation
// ==============================

export interface PlannedActivity {
  id: string;
  scheduledDate: Date;
  estimatedTSS: number;
  name: string;
}

export interface WeeklyLoadEstimation {
  weekStart: Date;
  weekEnd: Date;
  totalTSS: number;
  dailyBreakdown: Array<{
    date: Date;
    tss: number;
    activities: PlannedActivity[];
  }>;
  projectedCTL: number;
  projectedATL: number;
  projectedTSB: number;
  rampRate: number;
  /** @deprecated No binary clearance is inferred from training-load projections. */
  isSafe: boolean | null;
  loadChangeState: LoadChangeState;
  reasons: PlanningReasonCode[];
  recommendations: string[];
}

// ==============================
// Estimation Strategy
// ==============================

export type EstimationStrategy = "structure" | "route" | "template";

export interface StrategyResult {
  strategy: EstimationStrategy;
  result: EstimationResult;
}
