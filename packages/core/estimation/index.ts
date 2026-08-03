/**
 * Ancillary Activity Estimation
 *
 * This legacy surface may retain evidence-safe duration, distance, and route
 * facts. It deliberately abstains from numeric Load and intensity; canonical
 * Common Load is the sole authority for those values.
 */

import { unavailableActivityPlanDurationEstimate } from "../duration";
import { addDays } from "../utils/dates";
import { estimateWeeklyLoad, predictFatigue } from "./fatigue";
import { estimateMetrics as estimateMetricsInternal } from "./metrics";
import { estimateFromRoute, estimateFromStructure, estimateFromTemplate } from "./strategies";
import type {
  ActivityPlanEstimationInput,
  BuildEstimationContextParams,
  EstimationContext,
  EstimationResult,
  EstimationWarningHandler,
  FitnessState,
  MetricEstimations,
  PlannedActivity,
  WeeklyLoadEstimation,
} from "./types";

// Re-export default estimation functions
export { estimateMaxHR, estimateMaxHRFromDOB } from "./defaults";
// Re-export types
export * from "./types";

// Re-export functions
export { estimateMetricsInternal as estimateMetrics, estimateWeeklyLoad, predictFatigue };

const formatEstimationError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown estimation error";
};

export class InvalidActivityPlanStructureError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super(`Invalid activity-plan structure: ${formatEstimationError(cause)}`);
    this.cause = cause;
  }
}

const withWarnings = (result: EstimationResult, warnings: string[]): EstimationResult => {
  if (warnings.length === 0) return result;

  return {
    ...result,
    warnings: [...warnings, ...(result.warnings ?? [])],
  };
};

/**
 * Retain evidence-safe ancillary facts using the strongest available source.
 *
 * Strategy priority:
 * 1. Structure-based (highest accuracy) - if activity has steps
 * 2. Authored route distance - if route data is provided
 * 3. Explicitly unavailable - no generic template assumptions
 *
 * @param context - User profile, activity details, and optional structure/route
 * @returns Ancillary facts with numeric Load and intensity unavailable
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
  if (context.structure) {
    try {
      return estimateFromStructure(context);
    } catch (error) {
      const invalidStructureError = new InvalidActivityPlanStructureError(error);
      const message = invalidStructureError.message;
      onWarning?.({ error, message });
      throw invalidStructureError;
    }
  }

  // Strategy 2: Route-based
  if (context.route) {
    try {
      return withWarnings(estimateFromRoute(context), fallbackWarnings);
    } catch (error) {
      const message = `Route-based estimation failed; returning unavailable ancillary facts: ${formatEstimationError(error)}`;
      fallbackWarnings.push(message);
      onWarning?.({ error, message });
    }
  }

  // Strategy 3: Template-based (fallback)
  return withWarnings(estimateFromTemplate(context), fallbackWarnings);
}

/**
 * Retain all evidence-safe ancillary facts for an activity.
 *
 * @param context - User profile and activity details
 * @returns Ancillary estimation and metrics; Load and intensity remain unavailable
 */
export function estimateActivityComplete(
  context: EstimationContext,
  onWarning?: EstimationWarningHandler,
): {
  estimation: EstimationResult;
  metrics: MetricEstimations;
} {
  const estimation = estimateActivity(context, onWarning);
  const metrics = estimateMetricsInternal(estimation, context);

  return {
    estimation,
    metrics,
  };
}

/**
 * Retain ancillary facts for a batch of activity plans.
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
      const durationEstimate = unavailableActivityPlanDurationEstimate();
      results.set(plan.id, {
        load: null,
        durationEstimate,
        duration: null,
        confidence: null,
        confidenceScore: null,
        factors: [],
        warnings: ["Estimation failed; unsupported facts remain unavailable."],
      });
    }
  }

  return results;
}

/**
 * Estimate weekly training load
 * Aggregates planned activities and projects LongTermLoad/RecentLoad/LoadBalance
 *
 * @param weekStart - Start date of week (typically Monday)
 * @param plannedActivities - All activities scheduled for the week
 * @param currentState - Current fitness state (LongTermLoad/RecentLoad/LoadBalance)
 * @returns Weekly load summary with descriptive projections
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
      load: day.load,
      activities: dayActivities,
    };
  });

  // Generate recommendations
  const recommendations: string[] = [];

  if (baseEstimation.loadChangeState === "insufficient_data") {
    recommendations.push(
      "Planning comparison unavailable until a complete fitness state is provided",
    );
  } else if (baseEstimation.loadChangeState === "increasing") {
    recommendations.push(
      "Projected LongTermLoad is increasing; review the planned change with athlete context",
    );
  }

  if (baseEstimation.totalLoad < currentState.longTermLoad * 0.7) {
    recommendations.push("Consider adding volume - weekly load is below maintenance level");
  }

  if (baseEstimation.totalLoad > currentState.longTermLoad * 1.4) {
    recommendations.push("Weekly load is above the current LongTermLoad reference");
  }

  const projectedLoadBalance = currentState.longTermLoad - baseEstimation.projectedLongTermLoad;

  return {
    weekStart,
    weekEnd,
    totalLoad: baseEstimation.totalLoad,
    dailyBreakdown,
    projectedLongTermLoad: baseEstimation.projectedLongTermLoad,
    projectedRecentLoad: currentState.recentLoad, // Would need to track RecentLoad through week
    projectedLoadBalance,
    rampRate: baseEstimation.rampRate,
    loadChangeState: baseEstimation.loadChangeState,
    reasons: baseEstimation.reasons,
    recommendations,
  };
}

/**
 * Helper to build estimation context from common data sources
 */
export function buildEstimationContext(params: BuildEstimationContextParams): EstimationContext {
  const { asOf, userProfile, fitnessState, activityPlan, route, scheduledDate, weeklyPlannedLoad } =
    params;

  return {
    asOf,
    profile: {
      ...userProfile,
      dob: userProfile.dob ?? null,
    },
    maxHr: userProfile.max_hr ?? undefined,
    restingHr: userProfile.resting_hr ?? undefined,
    weightKg: userProfile.weight_kg ?? undefined,
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
    weeklyPlannedLoad,
  };
}
