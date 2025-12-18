import type {
  PublicActivityCategory,
  PublicActivityLocation,
  PublicProfilesRow,
} from "@repo/supabase";

import type { ActivityPlanStructureV2 } from "../schemas/activity_plan_v2";

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
  // User profile data
  profile: PublicProfilesRow;

  // Current fitness state
  fitnessState?: FitnessState;

  // Activity details
  activityCategory: PublicActivityCategory;
  activityLocation: PublicActivityLocation;

  // Optional route data
  route?: Route;

  // Plan structure (V2)
  structure?: ActivityPlanStructureV2;

  // Scheduling context
  scheduledDate?: Date;
  weeklyPlannedTSS?: number; // TSS already planned for the week
}

// ==============================
// Estimation Results
// ==============================

export type ConfidenceLevel = "high" | "medium" | "low";

export interface EstimationResult {
  // Primary metrics
  tss: number;
  duration: number; // seconds
  intensityFactor: number; // 0.0-2.0

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
  recoveryDaysNeeded: number;
}

// ==============================
// Fatigue Prediction
// ==============================

export type FormStatus =
  | "fresh"
  | "optimal"
  | "neutral"
  | "tired"
  | "overreaching";

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
    isSafe: boolean; // Ramp rate < 5-8 TSS/week
    recommendation: string;
  };

  recoveryPlan: {
    daysToRecover: number;
    nextHardWorkoutDate: Date;
    suggestedRestDays: number;
  };

  warnings: string[];
}

// ==============================
// Additional Metrics
// ==============================

export interface MetricEstimations {
  calories: number;
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
  isSafe: boolean;
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
