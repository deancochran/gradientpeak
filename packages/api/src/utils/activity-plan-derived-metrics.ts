import type { AthletePerformanceTargetFacts } from "@repo/core";
import type { ActivityPlanRow, DrizzleDbClient } from "@repo/db";
import {
  type ActivityPlanRouteSummary,
  type ActivityPlanWithEstimation,
  buildEstimatedPlan,
  buildFailedEstimationPlan,
  type EstimationActivityPlanInput,
  type EstimationReadStore,
  estimateUnifiedActivityPlanFacts,
  loadEstimationSnapshot,
  type UnifiedActivityPlanEstimate,
} from "./estimation-helpers";

export const ESTIMATOR_VERSION = "2026-05-estimated-provenance-v1";

export type SupportedActivityPlan = EstimationActivityPlanInput &
  Pick<ActivityPlanRow, "gps_recording_enabled" | "structure" | "structure_hash"> & {
    updated_at: Date | string;
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

function estimationMemoKey(plan: SupportedActivityPlan): string {
  return JSON.stringify({
    id: plan.id,
    structure: plan.structure,
  });
}

export async function getActivityPlanDerivedMetrics<TPlan extends SupportedActivityPlan>(
  plan: TPlan,
  db: DrizzleDbClient,
  estimationStore: EstimationReadStore,
  userId: string,
  options?: ActivityPlanDerivedMetricsOptions,
): Promise<ActivityPlanWithDerivedMetrics<TPlan>> {
  const asOf = options?.asOf ?? new Date();
  const [estimatedPlan] = await getActivityPlansDerivedMetrics(
    [plan],
    db,
    estimationStore,
    userId,
    { ...options, asOf },
  );
  if (estimatedPlan) return estimatedPlan;
  return toFailedResult(plan, asOf);
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
  const routeIds: string[] = [];
  // This is the sole persistence read for estimation inputs in this request. The immutable
  // snapshot is shared by every plan and its maps memoize repeated route lookups locally.
  let snapshot: Awaited<ReturnType<typeof loadEstimationSnapshot>>;
  try {
    snapshot = await loadEstimationSnapshot(estimationStore, userId, routeIds, asOf);
  } catch {
    console.error("Failed to load activity-plan derived-metric inputs.");
    return normalizedPlans.map((plan) => toFailedResult(plan, asOf));
  }
  const estimateMemo = new Map<string, UnifiedActivityPlanEstimate>();
  const asOfIso = asOf.toISOString();

  return normalizedPlans.map((plan) => {
    try {
      const memoKey = estimationMemoKey(plan);
      let estimated = estimateMemo.get(memoKey);
      if (!estimated) {
        estimated = estimateUnifiedActivityPlanFacts({
          plan,
          performanceTargets: snapshot.performanceTargets,
          asOf: asOfIso,
        });
        estimateMemo.set(memoKey, estimated);
      }
      const estimatedPlan = buildEstimatedPlan(plan, estimated, {
        route: null,
      });
      return {
        ...estimatedPlan,
        estimate_computed_at: asOfIso,
        estimate_last_accessed_at: asOfIso,
        estimate_source: "computed" as const,
        estimator_version: ESTIMATOR_VERSION,
      };
    } catch {
      console.error(`Failed to estimate activity plan ${plan.id}.`);
      return toFailedResult(plan, asOf, null, snapshot.performanceTargets);
    }
  });
}

function toFailedResult<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  asOf: Date,
  route: ActivityPlanRouteSummary | null = null,
  performanceTargets?: AthletePerformanceTargetFacts,
): ActivityPlanWithDerivedMetrics<TPlan> {
  return {
    ...buildFailedEstimationPlan(plan, { asOf, performanceTargets, route }),
    estimate_computed_at: null,
    estimate_last_accessed_at: null,
    estimate_source: "failed",
    estimator_version: ESTIMATOR_VERSION,
  };
}
