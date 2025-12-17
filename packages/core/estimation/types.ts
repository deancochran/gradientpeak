<<<<<<< HEAD
=======
import type { PublicProfilesRow } from "@repo/supabase";
import type { ActivityCategory, ActivityLocation } from "../constants";
>>>>>>> e8b2c4e (ftms working)
import type { ActivityPlanStructure } from "../schemas/activity_plan_structure";

// ==============================
// User Profile & Context Types
// ==============================

<<<<<<< HEAD
export interface UserProfile {
  ftp?: number; // Functional Threshold Power (watts)
  thresholdHR?: number; // Lactate Threshold HR (bpm)
  maxHR?: number; // Maximum HR (bpm)
  restingHR?: number; // Resting HR (bpm)
  weightKg?: number; // Body weight
  age?: number; // User age
}

=======
>>>>>>> e8b2c4e (ftms working)
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

<<<<<<< HEAD
export type ActivityType = "bike" | "run" | "swim" | "strength" | "other";
export type ActivityLocation = "indoor" | "outdoor";

=======
>>>>>>> e8b2c4e (ftms working)
// ==============================
// Estimation Context
// ==============================

export interface EstimationContext {
  // User profile data
<<<<<<< HEAD
  profile: UserProfile;
=======
  profile: PublicProfilesRow;
>>>>>>> e8b2c4e (ftms working)

  // Current fitness state
  fitnessState?: FitnessState;

  // Activity details
<<<<<<< HEAD
  activityType: ActivityType;
  location: ActivityLocation;
=======
  activityCategory: ActivityCategory;
  activityLocation: ActivityLocation;
>>>>>>> e8b2c4e (ftms working)

  // Optional route data
  route?: Route;

  // Plan structure
  structure?: ActivityPlanStructure;

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

<<<<<<< HEAD
export type FormStatus = "fresh" | "optimal" | "neutral" | "tired" | "overreaching";
=======
export type FormStatus =
  | "fresh"
  | "optimal"
  | "neutral"
  | "tired"
  | "overreaching";
>>>>>>> e8b2c4e (ftms working)

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
