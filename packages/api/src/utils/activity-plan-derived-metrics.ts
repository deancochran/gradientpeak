import { buildEstimationContext, estimateActivity, estimateMetrics } from "@repo/core/estimation";
import type { DrizzleDbClient } from "@repo/db";
import {
  type ActivityPlanRouteSummary,
  type ActivityPlanWithEstimation,
  buildEstimatedPlan,
  buildFailedEstimationPlan,
  type EstimationActivityPlanInput,
  type EstimationReadStore,
  loadEstimationSnapshot,
  toEstimationActivityPlan,
} from "./estimation-helpers";

export const ESTIMATOR_VERSION = "2026-05-estimated-provenance-v1";

type SupportedActivityPlan = EstimationActivityPlanInput & {
  updated_at: Date | string;
  version: string;
};

export type ActivityPlanWithDerivedMetrics<TPlan extends EstimationActivityPlanInput> =
  ActivityPlanWithEstimation<TPlan> & {
    estimate_computed_at: string | null;
    estimate_last_accessed_at: string | null;
    estimate_source: "cache" | "computed" | "failed";
    estimator_version: string;
  };

export type ActivityPlanDerivedMetricsOptions = {
  /** Stable request time used for all freshness and age calculations. */
  asOf?: Date;
};

type MemoizedEstimate = {
  estimation: ReturnType<typeof estimateActivity>;
  metrics: ReturnType<typeof estimateMetrics>;
};

function estimationMemoKey(plan: SupportedActivityPlan, route: unknown): string {
  return JSON.stringify({
    activity_category: plan.activity_category,
    structure: plan.structure,
    route,
  });
}

function shouldUseRouteForSavedPlanMetrics(structure: unknown): boolean {
  if (!structure || typeof structure !== "object") return true;
  const intervals = (structure as { intervals?: unknown }).intervals;
  return !Array.isArray(intervals) || intervals.length === 0;
}

export async function getActivityPlanDerivedMetrics<TPlan extends SupportedActivityPlan>(
  plan: TPlan,
  db: DrizzleDbClient,
  estimationStore: EstimationReadStore,
  userId: string,
  options?: ActivityPlanDerivedMetricsOptions,
): Promise<ActivityPlanWithDerivedMetrics<TPlan>> {
  const [estimatedPlan] = await getActivityPlansDerivedMetrics(
    [plan],
    db,
    estimationStore,
    userId,
    options,
  );
  if (estimatedPlan) return estimatedPlan;
  return toFailedResult(plan);
}

export async function getActivityPlansDerivedMetrics<TPlan extends SupportedActivityPlan>(
  plans: Array<TPlan | null | undefined>,
  _db: DrizzleDbClient,
  estimationStore: EstimationReadStore,
  userId: string,
  options?: ActivityPlanDerivedMetricsOptions,
): Promise<Array<ActivityPlanWithDerivedMetrics<TPlan>>> {
  const normalizedPlans = plans.filter((plan): plan is TPlan => !!plan && typeof plan === "object");
  if (normalizedPlans.length === 0) return [];

  const asOf = options?.asOf ?? new Date();
  const routeIds = [
    ...new Set(normalizedPlans.flatMap((plan) => (plan.route_id ? [plan.route_id] : []))),
  ];
  // This is the sole persistence read for estimation inputs in this request. The immutable
  // snapshot is shared by every plan and its maps memoize repeated route lookups locally.
  const snapshot = await loadEstimationSnapshot(estimationStore, userId, routeIds, asOf);
  const estimateMemo = new Map<string, MemoizedEstimate>();

  return normalizedPlans.map((plan) => {
    const routeFacts = plan.route_id ? snapshot.getRoute(plan.route_id) : undefined;
    try {
      const route =
        routeFacts && shouldUseRouteForSavedPlanMetrics(plan.structure)
          ? {
              distance_meters: routeFacts.distance_meters ?? 0,
              total_ascent: routeFacts.total_ascent ?? 0,
              total_descent: routeFacts.total_descent ?? 0,
            }
          : undefined;
      const memoKey = estimationMemoKey(plan, route);
      let estimated = estimateMemo.get(memoKey);
      if (!estimated) {
        const context = buildEstimationContext({
          asOf,
          userProfile: snapshot.profile,
          activityPlan: toEstimationActivityPlan(plan),
          route,
        });
        const estimation = estimateActivity(context);
        estimated = { estimation, metrics: estimateMetrics(estimation, context) };
        estimateMemo.set(memoKey, estimated);
      }
      return {
        ...buildEstimatedPlan(plan, estimated.estimation, estimated.metrics, {
          route: snapshot.getRouteSummary(plan.route_id ?? "") ?? null,
        }),
        estimate_computed_at: asOf.toISOString(),
        estimate_last_accessed_at: asOf.toISOString(),
        estimate_source: "computed" as const,
        estimator_version: ESTIMATOR_VERSION,
      };
    } catch (error) {
      console.error(`Failed to estimate activity plan ${plan.id}:`, error);
      return toFailedResult(plan, snapshot.getRouteSummary(plan.route_id ?? "") ?? null);
    }
  });
}

function toFailedResult<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  route: ActivityPlanRouteSummary | null = null,
): ActivityPlanWithDerivedMetrics<TPlan> {
  return {
    ...buildFailedEstimationPlan(plan, { route }),
    estimate_computed_at: null,
    estimate_last_accessed_at: null,
    estimate_source: "failed",
    estimator_version: ESTIMATOR_VERSION,
  };
}
