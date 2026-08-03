/**
 * Helper functions for integrating Common Load estimation into tRPC endpoints.
 */

import { compileActivityPlan } from "@repo/core/activity-plan";
import type { ActivityPlanDurationEstimate } from "@repo/core/duration";
import type { CommonLoadAggregate, CommonLoadResult } from "@repo/core/load";
import {
  type AthletePerformanceTargetFacts,
  projectAthletePerformanceTargetFacts,
} from "@repo/core/performance-model";
import {
  type ActivityPlanPlanningEstimate,
  createUnavailableActivityPlanPlanningEstimate,
} from "@repo/core/plan";
import type { ActivityPlanRow } from "@repo/db";
import { resolvePlannedActivityQuantification } from "../application/activity-plans/resolve-planned-common-load";
import { getAthletePerformanceModelAsOf } from "../application/performance-model/get-athlete-performance-model-as-of";
import type { EventReadRepository } from "../repositories";

export type EstimationReadStore = Pick<
  EventReadRepository,
  "getEstimationInputs" | "readAthletePerformanceEvidenceSnapshot"
>;

export type EstimationActivityPlanInput = Pick<
  ActivityPlanRow,
  "id" | "profile_id" | "name" | "description" | "structure"
>;

type PlannedActivityEstimationStore = EstimationReadStore & {
  getActivityPlanById(input: { activityPlanId: string }): Promise<{
    structure: unknown;
  } | null>;
};

export function toEstimationActivityPlan(input: { structure: unknown }) {
  return {
    activity_category: compileActivityPlan(input.structure).activity_category,
    structure: input.structure,
  };
}

export type ActivityPlanRouteSummary = {
  distance?: number;
  ascent?: number;
  descent?: number;
};

export type EstimationSnapshot = Readonly<{
  /**
   * Fixes performance-evidence freshness and access-expiry evaluation for this request.
   * Route facts are current because route history is not versioned. The snapshot is internally
   * consistent for this load; it is not a reconstruction of historical route state.
   */
  asOf: Date;
  performanceTargets: AthletePerformanceTargetFacts;
  getRoute(id: string): Readonly<Record<string, unknown>> | undefined;
  getRouteSummary(id: string): Readonly<ActivityPlanRouteSummary> | undefined;
}>;

function buildRouteSummary(
  route:
    | {
        distanceMeters?: number;
        distance_meters?: number;
        totalAscent?: number;
        total_ascent?: number;
        totalDescent?: number;
        total_descent?: number;
      }
    | undefined,
): ActivityPlanRouteSummary | null {
  if (!route) return null;

  const distanceMeters = route.distanceMeters ?? route.distance_meters;
  const totalAscentMeters = route.totalAscent ?? route.total_ascent;
  const totalDescentMeters = route.totalDescent ?? route.total_descent;

  if (
    distanceMeters === undefined &&
    totalAscentMeters === undefined &&
    totalDescentMeters === undefined
  ) {
    return null;
  }

  return {
    distance: distanceMeters,
    ascent: totalAscentMeters,
    descent: totalDescentMeters,
  };
}

export async function loadEstimationSnapshot(
  store: EstimationReadStore,
  profileId: string,
  routeIds: string[],
  asOf: Date,
): Promise<EstimationSnapshot> {
  const [data, performanceModel] = await Promise.all([
    store.getEstimationInputs({
      asOfIso: asOf.toISOString(),
      profileId,
      routeIds: [...new Set(routeIds)],
    }),
    getAthletePerformanceModelAsOf({ athleteId: profileId, asOf }, store),
  ]);
  const performanceTargets = projectAthletePerformanceTargetFacts(performanceModel);
  const routes = new Map(
    data.routes.map((route) => [route.id, Object.freeze({ ...route })] as const),
  );
  const routeSummaries = new Map(
    data.routes.flatMap((route) => {
      const summary = buildRouteSummary({
        distance_meters: route.distance_meters ?? undefined,
        total_ascent: route.total_ascent ?? undefined,
        total_descent: route.total_descent ?? undefined,
      });
      return summary ? [[route.id, Object.freeze(summary)] as const] : [];
    }),
  );
  return Object.freeze({
    asOf: new Date(asOf),
    performanceTargets: Object.freeze(performanceTargets),
    getRoute: (id: string) => routes.get(id),
    getRouteSummary: (id: string) => routeSummaries.get(id),
  });
}

/**
 * Shared API-facing facts derived from Core's sole duration estimator.
 */
export type UnifiedActivityPlanEstimate = {
  planning: ActivityPlanPlanningEstimate;
  duration: ActivityPlanDurationEstimate;
  estimatedDistanceMeters: number | null;
  commonLoad: CommonLoadResult | CommonLoadAggregate;
};

export function estimateUnifiedActivityPlanFacts(input: {
  plan: { id?: string; structure: unknown };
  performanceTargets: AthletePerformanceTargetFacts;
  asOf: string;
  stage?: "template" | "plan" | "scheduled";
  scheduledEventId?: string;
}): UnifiedActivityPlanEstimate {
  const planning = resolvePlannedActivityQuantification({
    asOf: new Date(input.asOf),
    planId: input.plan.id,
    structure: input.plan.structure,
    performanceTargets: input.performanceTargets,
    stage: input.stage,
    scheduledEventId: input.scheduledEventId,
  });
  const summary = planning.prescriptionQuantification.summary;
  return {
    planning,
    duration: planning.durationEstimate,
    estimatedDistanceMeters: summary.distance.status === "complete" ? summary.distance.value : null,
    commonLoad: summary.commonLoad,
  };
}

type PlannedCommonLoad = CommonLoadResult | CommonLoadAggregate;

/** Activity plan with provenance-bearing duration and canonical Common Load. */
export type ActivityPlanWithEstimation<
  TPlan extends EstimationActivityPlanInput = EstimationActivityPlanInput,
> = TPlan & {
  duration_estimate: ActivityPlanDurationEstimate;
  prescriptionQuantification: ActivityPlanPlanningEstimate["prescriptionQuantification"];
  common_load: PlannedCommonLoad;
  estimated_calories?: number;
  estimated_zones?: string[];
  confidence: Exclude<ActivityPlanDurationEstimate["confidence"], null>;
  confidence_score: number;
  estimation_status: "estimated" | "partial" | "failed";
  estimation_warnings: string[];
  route: ActivityPlanRouteSummary | null;
};

/** Compatibility-only ordinal projection; it never supplies independent confidence evidence. */
function confidenceScore(confidence: ActivityPlanDurationEstimate["confidence"]): number {
  switch (confidence) {
    case "high":
      return 100;
    case "medium":
      return 75;
    case "low":
      return 50;
    case null:
      return 0;
  }
}

export function buildEstimatedPlan<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  estimate: UnifiedActivityPlanEstimate,
  options: {
    route?: ActivityPlanRouteSummary | null;
  },
): ActivityPlanWithEstimation<TPlan> {
  const available = estimate.duration.status !== "unavailable";

  return {
    ...plan,
    duration_estimate: estimate.duration,
    prescriptionQuantification: estimate.planning.prescriptionQuantification,
    common_load: estimate.commonLoad,
    estimated_zones: [],
    confidence: estimate.duration.confidence ?? "low",
    confidence_score: confidenceScore(estimate.duration.confidence),
    estimation_status: available ? "estimated" : "partial",
    estimation_warnings:
      estimate.planning.warnings.length > 0
        ? estimate.planning.warnings
        : available
          ? []
          : ["Duration evidence is unavailable."],
    route: options.route ?? null,
  };
}

export function buildFailedEstimationPlan<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  options: {
    asOf: Date;
    performanceTargets?: AthletePerformanceTargetFacts;
    route?: ActivityPlanRouteSummary | null;
  },
): ActivityPlanWithEstimation<TPlan> {
  let activityCategory: CommonLoadResult["activity_category"] = "other";
  try {
    activityCategory = compileActivityPlan(plan.structure).activity_category;
  } catch {
    // Invalid structures cannot provide an activity category at this failed boundary.
  }
  const planning = createUnavailableActivityPlanPlanningEstimate({
    asOf: options.asOf.toISOString(),
    stage: "plan",
    planId: plan.id,
    activityCategory,
    reason: "invalid_data",
  });
  const duration = planning.durationEstimate;
  const preservedDuration = duration.status !== "unavailable";
  const summary = planning.prescriptionQuantification.summary;
  return {
    ...plan,
    duration_estimate: duration,
    prescriptionQuantification: planning.prescriptionQuantification,
    common_load: summary.commonLoad,
    estimated_zones: [],
    confidence: duration.confidence ?? "low",
    confidence_score: confidenceScore(duration.confidence),
    estimation_status: "failed",
    estimation_warnings: [
      preservedDuration ? "Estimation failed; retained duration evidence." : "Estimation failed.",
    ],
    route: options.route ?? null,
  };
}

/**
 * Calculate Common Load and metrics for a single activity plan.
 */
export async function addEstimationToPlan<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  estimationReader: EstimationReadStore,
  userId: string,
  asOf = new Date(),
): Promise<ActivityPlanWithEstimation<TPlan>> {
  const [result] = await addEstimationToPlans([plan], estimationReader, userId, asOf);
  return result ?? buildFailedEstimationPlan(plan, { asOf });
}

/**
 * Compute metrics for a plan before saving to database
 */
export async function computePlanMetrics(
  planInput: {
    structure: unknown;
  },
  estimationReader: EstimationReadStore,
  userId: string,
  asOf = new Date(),
): Promise<{
  prescriptionQuantification: ActivityPlanPlanningEstimate["prescriptionQuantification"];
  common_load: PlannedCommonLoad;
  duration_estimate: ActivityPlanDurationEstimate;
  estimated_duration_seconds: number | null;
  estimated_distance_meters: number | null;
}> {
  const snapshot = await loadEstimationSnapshot(estimationReader, userId, [], asOf);
  const estimate = estimateUnifiedActivityPlanFacts({
    plan: planInput,
    performanceTargets: snapshot.performanceTargets,
    asOf: asOf.toISOString(),
  });
  return {
    prescriptionQuantification: estimate.planning.prescriptionQuantification,
    common_load: estimate.commonLoad,
    duration_estimate: estimate.duration,
    estimated_duration_seconds: estimate.duration.valueSeconds,
    estimated_distance_meters: estimate.estimatedDistanceMeters,
  };
}

/**
 * Calculate Common Load and metrics for multiple activity plans.
 * More efficient than calling addEstimationToPlan repeatedly
 */
export async function addEstimationToPlans<TPlan extends EstimationActivityPlanInput>(
  plans: Array<TPlan | null | undefined>,
  estimationReader: EstimationReadStore,
  userId: string,
  asOf = new Date(),
): Promise<ActivityPlanWithEstimation<TPlan>[]> {
  const normalizedPlans = plans.filter((plan): plan is TPlan => !!plan && typeof plan === "object");

  if (normalizedPlans.length === 0) return [];

  // Collect all route IDs
  const routeIds: string[] = [];

  let snapshot: EstimationSnapshot;
  try {
    snapshot = await loadEstimationSnapshot(estimationReader, userId, routeIds, asOf);
  } catch {
    console.error("Failed to load activity-plan estimation inputs.");
    return normalizedPlans.map((plan) => buildFailedEstimationPlan(plan, { asOf, route: null }));
  }
  const results: ActivityPlanWithEstimation<TPlan>[] = [];
  const estimateMemo = new Map<string, UnifiedActivityPlanEstimate>();
  const asOfIso = asOf.toISOString();

  for (const plan of normalizedPlans) {
    try {
      const memoKey = JSON.stringify({
        id: plan.id,
        structure: plan.structure,
      });
      let estimated = estimateMemo.get(memoKey);
      if (!estimated) {
        estimated = estimateUnifiedActivityPlanFacts({
          plan,
          performanceTargets: snapshot.performanceTargets,
          asOf: asOfIso,
        });
        estimateMemo.set(memoKey, estimated);
      }
      const result = buildEstimatedPlan(plan, estimated, {
        route: null,
      });
      results.push(result);
    } catch {
      console.error(`Failed to estimate plan ${plan.id}.`);
      results.push(
        buildFailedEstimationPlan(plan, {
          asOf,
          performanceTargets: snapshot.performanceTargets,
          route: null,
        }),
      );
    }
  }

  return results;
}

/**
 * Calculate Common Load for a planned activity.
 * Used when creating/viewing planned activities in the calendar
 */
export async function estimatePlannedActivity(
  activityPlanId: string,
  scheduledDate: Date,
  estimationStore: PlannedActivityEstimationStore,
  userId: string,
  asOf = new Date(),
): Promise<{
  prescriptionQuantification: ActivityPlanPlanningEstimate["prescriptionQuantification"];
  common_load: PlannedCommonLoad;
  duration_estimate: ActivityPlanDurationEstimate;
  estimated_duration: number | null;
}> {
  // Fetch activity plan
  const plan = await estimationStore.getActivityPlanById({ activityPlanId });

  if (!plan) {
    throw new Error("Activity plan not found");
  }

  const snapshot = await loadEstimationSnapshot(estimationStore, userId, [], asOf);
  const estimate = estimateUnifiedActivityPlanFacts({
    plan: { ...plan, id: activityPlanId },
    performanceTargets: snapshot.performanceTargets,
    asOf: asOf.toISOString(),
    stage: "scheduled",
    scheduledEventId: `activity-plan-preview:${activityPlanId}:${scheduledDate.toISOString()}`,
  });

  return {
    prescriptionQuantification: estimate.planning.prescriptionQuantification,
    common_load: estimate.commonLoad,
    duration_estimate: estimate.duration,
    estimated_duration: estimate.duration.valueSeconds,
  };
}
