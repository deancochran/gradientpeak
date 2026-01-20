/**
 * TSS Estimation System
 *
 * Provides dynamic, user-specific estimation of Training Stress Score (TSS)
 * and related metrics for activity planning.
 *
 * All calculations are done on-the-fly based on current user profile,
 * making plans fully shareable while maintaining personalized accuracy.
 */

import { addDays } from "../calculations";
import { estimateWeeklyLoad, predictFatigue } from "./fatigue";
import { estimateMetrics as estimateMetricsInternal } from "./metrics";
import {
  estimateFromRoute,
  estimateFromStructure,
  estimateFromTemplate,
} from "./strategies";
import type {
  EstimationContext,
  EstimationResult,
  FatiguePrediction,
  FitnessState,
  MetricEstimations,
  PlannedActivity,
  WeeklyLoadEstimation,
} from "./types";

// Re-export types
export * from "./types";

// Re-export default estimation functions
export {
  estimateFTPFromWeight,
  estimateFTPFromRecentActivities,
  estimateMaxHR,
  estimateLTHR,
  estimateLTHRFromRecentActivities,
  estimateThresholdPaceFromFitnessLevel,
  estimateThresholdPaceFromRecentRuns,
  estimateCriticalVelocity,
} from "./defaults";

// Re-export functions
export {
  estimateMetricsInternal as estimateMetrics,
  estimateWeeklyLoad,
  predictFatigue,
};

/**
 * Main estimation function - automatically selects best strategy
 *
 * Strategy priority:
 * 1. Structure-based (highest accuracy) - if workout has steps
 * 2. Route-based (medium accuracy) - if outdoor activity with route
 * 3. Template-based (lowest accuracy) - fallback using activity type defaults
 *
 * @param context - User profile, activity details, and optional structure/route
 * @returns Estimation result with TSS, duration, IF, and metadata
 */
export function estimateActivity(context: EstimationContext): EstimationResult {
  // Validate context
  if (!context.profile) {
    throw new Error("User profile is required for estimation");
  }

  // Strategy 1: Structure-based (preferred)
  if (context.structure?.intervals && context.structure.intervals.length > 0) {
    try {
      return estimateFromStructure(context);
    } catch (error) {
      console.warn(
        "Structure-based estimation failed, falling back to route/template",
        error,
      );
    }
  }

  // Strategy 2: Route-based
  if (context.route && context.activityLocation === "outdoor") {
    try {
      return estimateFromRoute(context);
    } catch (error) {
      console.warn(
        "Route-based estimation failed, falling back to template",
        error,
      );
    }
  }

  // Strategy 3: Template-based (fallback)
  return estimateFromTemplate(context);
}

/**
 * Estimate all metrics for an activity
 * Combines TSS estimation with additional metrics (calories, distance, zones)
 *
 * @param context - User profile and activity details
 * @returns Complete estimation including TSS, metrics, and optional fatigue prediction
 */
export function estimateActivityComplete(context: EstimationContext): {
  estimation: EstimationResult;
  metrics: MetricEstimations;
  fatigue?: FatiguePrediction;
} {
  // Get base TSS estimation
  const estimation = estimateActivity(context);

  // Calculate additional metrics
  const metrics = estimateMetricsInternal(estimation, context);

  // Optionally predict fatigue impact
  let fatigue: FatiguePrediction | undefined;
  if (context.scheduledDate && context.fitnessState) {
    try {
      fatigue = predictFatigue(
        estimation.tss,
        context.scheduledDate,
        context.fitnessState,
        [], // Weekly activities can be passed from caller
      );
    } catch (error) {
      console.warn("Fatigue prediction failed", error);
    }
  }

  return {
    estimation,
    metrics,
    fatigue,
  };
}

/**
 * Estimate TSS for a batch of activity plans
 * Useful for displaying lists of plans with personalized TSS
 *
 * @param plans - Array of activity plans with structure
 * @param context - User profile (same for all plans)
 * @returns Map of plan ID to estimation result
 */
export function estimateActivityBatch(
  plans: Array<{
    id: string;
    structure?: any;
    route?: any;
    activity_category: string;
    activity_location: string;
  }>,
  context: Omit<
    EstimationContext,
    "structure" | "route" | "activityCategory" | "activityLocation"
  >,
): Map<string, EstimationResult> {
  const results = new Map<string, EstimationResult>();

  for (const plan of plans) {
    try {
      const planContext: EstimationContext = {
        ...context,
        structure: plan.structure,
        route: plan.route,
        activityCategory: plan.activity_category as any,
        activityLocation: plan.activity_location as any,
      };

      const estimation = estimateActivity(planContext);
      results.set(plan.id, estimation);
    } catch (error) {
      console.error(`Failed to estimate plan ${plan.id}:`, error);
      // Set default fallback
      results.set(plan.id, {
        tss: 50,
        duration: 3600,
        intensityFactor: 0.7,
        confidence: "low",
        confidenceScore: 0,
        factors: ["error-fallback"],
        warnings: ["Estimation failed - using default values"],
      });
    }
  }

  return results;
}

/**
 * Estimate weekly training load
 * Aggregates planned activities and projects CTL/ATL/TSB
 *
 * @param weekStart - Start date of week (typically Monday)
 * @param plannedActivities - All activities scheduled for the week
 * @param currentState - Current fitness state (CTL/ATL/TSB)
 * @returns Weekly load summary with projections and safety checks
 */
export function estimateWeeklyLoadComplete(
  weekStart: Date,
  plannedActivities: PlannedActivity[],
  currentState: FitnessState,
): WeeklyLoadEstimation {
  const weekEnd = addDays(weekStart, 6);

  // Get base weekly estimation
  const baseEstimation = estimateWeeklyLoad(
    weekStart,
    plannedActivities,
    currentState,
  );

  // Create daily breakdown with activity details
  const dailyBreakdown = baseEstimation.dailyBreakdown.map((day) => {
    const dayActivities = plannedActivities.filter((activity) => {
      const activityDate = new Date(activity.scheduledDate);
      return activityDate.toDateString() === day.date.toDateString();
    });

    return {
      date: day.date,
      tss: day.tss,
      activities: dayActivities,
    };
  });

  // Generate recommendations
  const recommendations: string[] = [];

  if (!baseEstimation.isSafe) {
    recommendations.push(
      "⚠️ Reduce training load - ramp rate exceeds safe limits",
    );
  }

  if (baseEstimation.totalTSS < currentState.ctl * 0.7) {
    recommendations.push(
      "Consider adding volume - weekly load is below maintenance level",
    );
  }

  if (baseEstimation.totalTSS > currentState.ctl * 1.4) {
    recommendations.push("High training load - ensure adequate recovery");
  }

  const projectedTSB = currentState.ctl - baseEstimation.projectedCTL;
  if (projectedTSB < -30) {
    recommendations.push("Plan a recovery week - accumulated fatigue is high");
  }

  return {
    weekStart,
    weekEnd,
    totalTSS: baseEstimation.totalTSS,
    dailyBreakdown,
    projectedCTL: baseEstimation.projectedCTL,
    projectedATL: currentState.atl, // Would need to track ATL through week
    projectedTSB,
    rampRate: baseEstimation.rampRate,
    isSafe: baseEstimation.isSafe,
    recommendations,
  };
}

/**
 * Calculate confidence-adjusted TSS range
 * Useful for showing "Expected TSS: 60-70" to users
 *
 * @param estimation - Estimation result
 * @returns TSS range [min, max]
 */
export function getTSSRange(estimation: EstimationResult): [number, number] {
  const { tss, confidenceScore } = estimation;

  // Higher confidence = narrower range
  // Low confidence (50): ±20%
  // Medium confidence (75): ±10%
  // High confidence (95): ±5%

  const variability = 1 - confidenceScore / 100;
  const range = tss * variability * 0.2;

  const minTSS = Math.max(0, Math.round(tss - range));
  const maxTSS = Math.round(tss + range);

  return [minTSS, maxTSS];
}

/**
 * Helper to build estimation context from common data sources
 */
export function buildEstimationContext(params: {
  // User data (from database/profile)
  userProfile: {
    ftp?: number | null;
    threshold_hr?: number | null;
    max_hr?: number | null;
    resting_hr?: number | null;
    weight_kg?: number | null;
    dob?: string | null;
  };

  // Current fitness (from trends calculation)
  fitnessState?: {
    ctl: number;
    atl: number;
    tsb: number;
    lastActivityDate?: Date;
  };

  // Activity plan data
  activityPlan: {
    activity_category: string;
    activity_location: string;
    structure?: any;
    route_id?: string;
  };

  // Optional route data
  route?: {
    distance_meters: number;
    total_ascent: number;
    total_descent: number;
    average_grade?: number;
  };

  // Optional scheduling
  scheduledDate?: Date;
  weeklyPlannedTSS?: number;
}): EstimationContext {
  const {
    userProfile,
    fitnessState,
    activityPlan,
    route,
    scheduledDate,
    weeklyPlannedTSS,
  } = params;

  // Calculate age from date of birth
  const age = userProfile.dob ? calculateAge(userProfile.dob) : undefined;

  // Note: This function builds a context but needs proper profile type
  // The profile parameter should match PublicProfilesRow from the database
  return {
    profile: userProfile as any, // Cast to match PublicProfilesRow
    fitnessState,
    activityCategory: activityPlan.activity_category as any,
    activityLocation: activityPlan.activity_location as any,
    structure: activityPlan.structure,
    route: route
      ? {
          distanceMeters: route.distance_meters,
          totalAscent: route.total_ascent,
          totalDescent: route.total_descent,
          averageGrade: route.average_grade,
        }
      : undefined,
    scheduledDate,
    weeklyPlannedTSS,
  };
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}
