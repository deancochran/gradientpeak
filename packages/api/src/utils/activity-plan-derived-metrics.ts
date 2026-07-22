import { createHash } from "node:crypto";
import { buildEstimationContext, estimateActivity, estimateMetrics } from "@repo/core/estimation";
import {
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadResult,
  calculateAvailableCommonLoad,
} from "@repo/core/load";
import type { ActivityPlanRow, DrizzleDbClient } from "@repo/db";
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

type SupportedActivityPlan = EstimationActivityPlanInput &
  Pick<ActivityPlanRow, "gps_recording_enabled" | "structure" | "structure_hash"> & {
    updated_at: Date | string;
  };

export type ActivityPlanWithDerivedMetrics<TPlan extends EstimationActivityPlanInput> =
  ActivityPlanWithEstimation<TPlan> & {
    common_load: CommonLoadResult;
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

type PlannedCommonLoadThreshold = Awaited<
  ReturnType<typeof loadEstimationSnapshot>
>["thresholds"]["cycling_ftp"];

function fingerprint(kind: string, values: readonly unknown[]): string {
  const digest = createHash("sha256").update(JSON.stringify(values)).digest("hex");
  return `${kind}:v1:sha256:${digest}`;
}

function plannedCommonLoad(input: {
  asOf: Date;
  estimation: ReturnType<typeof estimateActivity>;
  planId: string;
  threshold: PlannedCommonLoadThreshold;
}): CommonLoadResult {
  const computedAsOf = input.asOf.toISOString();
  const soleDose =
    input.estimation.categoryDoses?.length === 1
      ? (input.estimation.categoryDoses[0] ?? null)
      : null;
  const sport = soleDose?.category ?? "other";
  const durationSeconds = soleDose?.timedActiveSeconds ?? input.estimation.duration;
  const unavailable = (
    reason: Extract<CommonLoadResult, { status: "unavailable" }>["reason"],
    options: Partial<
      Pick<
        Extract<CommonLoadResult, { status: "unavailable" }>,
        "method" | "quality" | "thresholdEvidence" | "evidenceFingerprint"
      >
    > = {},
  ): CommonLoadResult => ({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    sport,
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf,
    contributingDurationSeconds:
      typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : null,
    reason,
    ...options,
  });

  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return unavailable("duration_missing");
  }
  if (sport !== "bike" || soleDose === null) return unavailable("unsupported_modality");
  if (
    soleDose.tss === null ||
    soleDose.intensityFactor === null ||
    soleDose.cyclingPowerEvidenceCoverage !== 1
  ) {
    return unavailable("activity_data_missing");
  }
  if (input.threshold.value === null || input.threshold.observedAt === null) {
    return unavailable("threshold_missing", { method: "power_threshold" });
  }

  const sourceFingerprint = fingerprint("planned-threshold", [
    input.threshold.threshold,
    input.threshold.value,
    input.threshold.unit,
    input.threshold.source,
    input.threshold.observedAt,
    input.threshold.calculationVersion,
  ]);
  const thresholdEvidence = {
    type: "ftp_watts" as const,
    value: input.threshold.value,
    unit: "watts" as const,
    source: input.threshold.source,
    observedAt: input.threshold.observedAt,
    validAt: input.threshold.observedAt,
    freshness: input.threshold.stale ? ("stale" as const) : ("current" as const),
    calculationVersion: input.threshold.calculationVersion,
    sourceFingerprint,
  };
  const quality = {
    source: input.threshold.source,
    observed_at: input.threshold.observedAt,
    valid_at: input.threshold.observedAt,
    confidence: input.threshold.confidence,
    stale: input.threshold.stale,
    estimate: input.threshold.estimate,
    calculation_version: input.threshold.calculationVersion,
    evidence_fingerprint: sourceFingerprint,
  };
  const evidenceFingerprint = fingerprint("planned-common-load", [
    input.planId,
    sourceFingerprint,
    durationSeconds,
    soleDose.intensityFactor,
  ]);
  const provenance = {
    method: "power_threshold" as const,
    quality,
    thresholdEvidence,
    evidenceFingerprint,
  };
  if (input.threshold.stale) return unavailable("stale_threshold", provenance);
  if (soleDose.intensityFactor < 0 || soleDose.intensityFactor > 1.5) {
    return unavailable("intensity_out_of_range", provenance);
  }

  return calculateAvailableCommonLoad({
    sport: "bike",
    ...provenance,
    computedAsOf,
    estimated: true,
    contributingDurationSeconds: durationSeconds,
    intensity: soleDose.intensityFactor,
  });
}

function estimationMemoKey(plan: SupportedActivityPlan, route: unknown): string {
  return JSON.stringify({
    structure: plan.structure,
    route,
  });
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
  return toFailedResult(plan, null, options?.asOf);
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
  const snapshot = await loadEstimationSnapshot(estimationStore, userId, routeIds, asOf);
  const estimateMemo = new Map<string, MemoizedEstimate>();

  return normalizedPlans.map((plan) => {
    try {
      const route = undefined;
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
          route: null,
        }),
        common_load: plannedCommonLoad({
          asOf,
          estimation: estimated.estimation,
          planId: plan.id,
          threshold: snapshot.thresholds.cycling_ftp,
        }),
        estimate_computed_at: asOf.toISOString(),
        estimate_last_accessed_at: asOf.toISOString(),
        estimate_source: "computed" as const,
        estimator_version: ESTIMATOR_VERSION,
      };
    } catch (error) {
      console.error(`Failed to estimate activity plan ${plan.id}:`, error);
      return toFailedResult(plan, null, asOf);
    }
  });
}

function toFailedResult<TPlan extends EstimationActivityPlanInput>(
  plan: TPlan,
  route: ActivityPlanRouteSummary | null = null,
  asOf = new Date(),
): ActivityPlanWithDerivedMetrics<TPlan> {
  let sport: CommonLoadResult["sport"] = "other";
  try {
    sport = toEstimationActivityPlan(plan).activity_category ?? "other";
  } catch {
    // The failed estimate remains unavailable without inventing a modality.
  }
  return {
    ...buildFailedEstimationPlan(plan, { route }),
    common_load: {
      status: "unavailable",
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      sport,
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf: asOf.toISOString(),
      contributingDurationSeconds: null,
      reason: "activity_data_missing",
    },
    estimate_computed_at: null,
    estimate_last_accessed_at: null,
    estimate_source: "failed",
    estimator_version: ESTIMATOR_VERSION,
  };
}
