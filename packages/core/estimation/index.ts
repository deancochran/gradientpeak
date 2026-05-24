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
import { estimateFromRoute, estimateFromStructure, estimateFromTemplate } from "./strategies";
import type {
  ActivityPlanEstimationInput,
  BuildEstimationContextParams,
  EstimationContext,
  EstimationResult,
  EstimationWarningHandler,
  FatiguePrediction,
  FitnessState,
  MetricEstimations,
  PlannedActivity,
  WeeklyLoadEstimation,
} from "./types";

export * from "./baselines";
// Re-export default estimation functions
export {
  estimateConservativeFTPFromWeight,
  estimateCriticalVelocity,
  estimateFTPFromRecentActivities,
  estimateFTPFromWeight,
  estimateLTHR,
  estimateLTHRFromRecentActivities,
  estimateMaxHR,
  estimateMaxHRFromDOB,
  estimateThresholdPaceFromFitnessLevel,
  estimateThresholdPaceFromRecentRuns,
} from "./defaults";
// Re-export types
export * from "./types";

// Re-export functions
export { estimateMetricsInternal as estimateMetrics, estimateWeeklyLoad, predictFatigue };

const formatEstimationError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown estimation error";
};

const withWarnings = (result: EstimationResult, warnings: string[]): EstimationResult => {
  if (warnings.length === 0) return result;

  return {
    ...result,
    warnings: [...warnings, ...(result.warnings ?? [])],
  };
};

/**
 * Main estimation function - automatically selects best strategy
 *
 * Strategy priority:
 * 1. Structure-based (highest accuracy) - if activity has steps
 * 2. Route-based (medium accuracy) - if route data is provided
 * 3. Template-based (lowest accuracy) - fallback using activity type defaults
 *
 * @param context - User profile, activity details, and optional structure/route
 * @returns Estimation result with TSS, duration, IF, and metadata
 */
export function estimateActivity(
  context: EstimationContext,
  onWarning?: EstimationWarningHandler,
): EstimationResult {
  // Validate context
  if (!context.profile) {
    throw new Error("User profile is required for estimation");
  }

  const fallbackWarnings: string[] = [];

  // Strategy 1: Structure-based (preferred)
  if (context.structure?.intervals && context.structure.intervals.length > 0) {
    try {
      return estimateFromStructure(context);
    } catch (error) {
      const message = `Structure-based estimation failed, falling back to route/template: ${formatEstimationError(error)}`;
      fallbackWarnings.push(message);
      onWarning?.({ error, message });
    }
  }

  // Strategy 2: Route-based
  if (context.route) {
    try {
      return withWarnings(estimateFromRoute(context), fallbackWarnings);
    } catch (error) {
      const message = `Route-based estimation failed, falling back to template: ${formatEstimationError(error)}`;
      fallbackWarnings.push(message);
      onWarning?.({ error, message });
    }
  }

  // Strategy 3: Template-based (fallback)
  return withWarnings(estimateFromTemplate(context), fallbackWarnings);
}

/**
 * Estimate all metrics for an activity
 * Combines TSS estimation with additional metrics (calories, distance, zones)
 *
 * @param context - User profile and activity details
 * @returns Complete estimation including TSS, metrics, and optional fatigue prediction
 */
export function estimateActivityComplete(
  context: EstimationContext,
  onWarning?: EstimationWarningHandler,
): {
  estimation: EstimationResult;
  metrics: MetricEstimations;
  fatigue?: FatiguePrediction;
} {
  // Get base TSS estimation
  const estimation = estimateActivity(context, onWarning);

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
      onWarning?.({
        error,
        message: `Fatigue prediction failed: ${formatEstimationError(error)}`,
      });
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
  plans: ActivityPlanEstimationInput[],
  context: Omit<EstimationContext, "structure" | "route" | "activityCategory">,
  onWarning?: EstimationWarningHandler,
): Map<string, EstimationResult> {
  const results = new Map<string, EstimationResult>();

  for (const plan of plans) {
    try {
      const planContext: EstimationContext = {
        ...context,
        structure: plan.structure,
        route: plan.route,
        activityCategory: plan.activity_category,
      };

      const estimation = estimateActivity(planContext, onWarning);
      results.set(plan.id, estimation);
    } catch (error) {
      onWarning?.({
        error,
        message: `Failed to estimate plan ${plan.id}: ${formatEstimationError(error)}`,
        planId: plan.id,
      });
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
  const baseEstimation = estimateWeeklyLoad(weekStart, plannedActivities, currentState);

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
    recommendations.push("⚠️ Reduce training load - ramp rate exceeds safe limits");
  }

  if (baseEstimation.totalTSS < currentState.ctl * 0.7) {
    recommendations.push("Consider adding volume - weekly load is below maintenance level");
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
export function buildEstimationContext(params: BuildEstimationContextParams): EstimationContext {
  const { userProfile, fitnessState, activityPlan, route, scheduledDate, weeklyPlannedTSS } =
    params;

  return {
    profile: {
      ...userProfile,
      dob: userProfile.dob ?? null,
    },
    ftp: userProfile.ftp ?? undefined,
    thresholdHr: userProfile.threshold_hr ?? undefined,
    weightKg: userProfile.weight_kg ?? undefined,
    thresholdPaceSecondsPerKm: userProfile.threshold_pace_seconds_per_km ?? undefined,
    fitnessState,
    activityCategory: activityPlan.activity_category,
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
