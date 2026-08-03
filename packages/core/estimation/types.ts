import type { ActivityPlanDurationEstimate } from "../duration";
import type { LoadBalanceStatus } from "../load/form";
import type { ProfileWithDob } from "../profile";
import type { CanonicalActivityCategory } from "../schemas/activity-category";

// ==============================
// User Profile & Context Types
// ==============================

export interface FitnessState {
  longTermLoad: number; // 42-day fitness response
  recentLoad: number; // 7-day fatigue response
  loadBalance: number; // fitness minus fatigue
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

  // Non-threshold heart-rate context selected for this estimate.
  maxHr?: number | null;
  restingHr?: number | null;

  // Profile metrics (from profile_metric_logs)
  weightKg?: number | null; // Weight in kilograms

  // Current fitness state
  fitnessState?: FitnessState;

  // Activity details used only for unstructured route/template estimation.
  activityCategory?: CanonicalActivityCategory;

  // Optional route data
  route?: Route;

  // Strict modern plan structure; segment activity_categories own structured calculations.
  structure?: unknown;

  // Scheduling context
  scheduledDate?: Date;
  weeklyPlannedLoad?: number; // Common Load already planned for the week
}

export type EstimationWarningHandler = (warning: {
  error?: unknown;
  message: string;
  planId?: string;
}) => void;

export interface ActivityPlanEstimationInput {
  id: string;
  structure?: EstimationContext["structure"];
  activity_category: CanonicalActivityCategory;
}

export interface EstimationProfileInput {
  max_hr?: number | null;
  resting_hr?: number | null;
  weight_kg?: number | null;
  dob?: string | null;
}

export interface EstimationActivityPlanInput {
  activity_category: CanonicalActivityCategory;
  structure?: EstimationContext["structure"];
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
  weeklyPlannedLoad?: number;
}

// ==============================
// Estimation Results
// ==============================

export type ConfidenceLevel = "high" | "medium" | "low";

export interface EstimationResult {
  /**
   * Deprecated compatibility slot. Exported estimators always return null;
   * callers must use canonical Common Load for a numeric observation.
   */
  load: number | null;
  /** Sole provenance-bearing duration authority for this result. */
  durationEstimate: ActivityPlanDurationEstimate;
  /** Compatibility projection of `durationEstimate.valueSeconds`. */
  duration: number | null;

  categoryDoses?: Array<{
    activity_category: CanonicalActivityCategory;
    timedActiveSeconds: number;
    distanceMeters: number;
    repetitionCount: number;
    openOccurrenceCount: number;
    load: null;
  }>;

  estimatedDistance?: number; // meters

  // Estimation metadata
  confidence: ConfidenceLevel | null;
  confidenceScore: number | null; // 0-100 when supported by evidence
  factors: string[]; // What influenced the estimate
  warnings?: string[];
}

// ==============================
// Fatigue Prediction
// ==============================

export type LoadChangeState = "insufficient_data" | "decreasing" | "stable" | "increasing";

export type PlanningReasonCode =
  | "MISSING_FITNESS_STATE"
  | "LOAD_CHANGE_DECREASING"
  | "LOAD_CHANGE_STABLE"
  | "LOAD_CHANGE_INCREASING"
  | "WEEKLY_LOAD_ABOVE_CURRENT_LongTermLoad"
  | "SINGLE_ACTIVITY_ABOVE_CURRENT_LongTermLoad";

export interface FatiguePrediction {
  afterActivity: {
    longTermLoad: number;
    recentLoad: number;
    loadBalance: number;
    loadBalanceStatus: LoadBalanceStatus;
  };

  weeklyProjection: {
    totalLoad: number;
    averageDailyLoad: number;
    rampRate: number; // Weekly LongTermLoad change
    loadChangeState: LoadChangeState;
    reasons: PlanningReasonCode[];
    recommendation: string;
  };

  warnings: string[];
}

// ==============================
// Additional Metrics
// ==============================

export interface MetricEstimations {
  distance?: number; // meters
  elevationGain?: number; // meters
  avgSpeed?: number; // m/s
}

// ==============================
// Weekly Load Estimation
// ==============================

export interface PlannedActivity {
  id: string;
  scheduledDate: Date;
  estimatedCommonLoad: number;
  name: string;
}

export interface WeeklyLoadEstimation {
  weekStart: Date;
  weekEnd: Date;
  totalLoad: number;
  dailyBreakdown: Array<{
    date: Date;
    load: number;
    activities: PlannedActivity[];
  }>;
  projectedLongTermLoad: number;
  projectedRecentLoad: number;
  projectedLoadBalance: number;
  rampRate: number;
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
