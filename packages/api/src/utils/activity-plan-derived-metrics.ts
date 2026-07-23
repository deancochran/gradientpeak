import { createHash } from "node:crypto";
import { compileActivityPlanV3 } from "@repo/core/activity-plan";
import { buildEstimationContext, estimateActivity, estimateMetrics } from "@repo/core/estimation";
import {
  adaptPlannedCommonLoadDoses,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadAggregate,
  type CommonLoadResult,
  type CommonThresholdEvidence,
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
    common_load: CommonLoadResult | CommonLoadAggregate;
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

type PlannedCommonLoadThresholds = Awaited<ReturnType<typeof loadEstimationSnapshot>>["thresholds"];

function fingerprint(kind: string, values: readonly unknown[]): string {
  const digest = createHash("sha256").update(JSON.stringify(values)).digest("hex");
  return `${kind}:v1:sha256:${digest}`;
}

function plannedCommonLoad(input: {
  asOf: Date;
  planId: string;
  structure: unknown;
  thresholds: PlannedCommonLoadThresholds;
}): CommonLoadResult | CommonLoadAggregate {
  const computedAsOf = input.asOf.toISOString();
  const compiled = compileActivityPlanV3(input.structure);
  const thresholdForSport = (sport: "bike" | "run" | "swim") => {
    const threshold =
      sport === "bike"
        ? input.thresholds.cycling_ftp
        : sport === "run"
          ? input.thresholds.running_threshold_pace
          : input.thresholds.swimming_css;
    const value =
      threshold.value === null
        ? null
        : sport === "bike"
          ? threshold.value
          : sport === "run"
            ? 1000 / threshold.value
            : 100 / threshold.value;
    const method =
      sport === "bike"
        ? ("power_threshold" as const)
        : sport === "run"
          ? ("run_pace_threshold" as const)
          : ("swim_pace_threshold" as const);
    if (value === null || threshold.observedAt === null) {
      return { method, quality: null, thresholdEvidence: null };
    }
    const sourceFingerprint = fingerprint("planned-threshold", [
      threshold.threshold,
      threshold.value,
      threshold.unit,
      threshold.source,
      threshold.observedAt,
      threshold.calculationVersion,
    ]);
    const thresholdEvidence = {
      type:
        sport === "bike"
          ? ("ftp_watts" as const)
          : sport === "run"
            ? ("threshold_speed_mps" as const)
            : ("swim_threshold_speed_mps" as const),
      value,
      unit: sport === "bike" ? ("watts" as const) : ("meters_per_second" as const),
      source: threshold.source,
      observedAt: threshold.observedAt,
      validAt: threshold.observedAt,
      freshness: threshold.stale ? ("stale" as const) : ("current" as const),
      calculationVersion: threshold.calculationVersion,
      sourceFingerprint,
    } as CommonThresholdEvidence;
    return {
      method,
      thresholdEvidence,
      quality: {
        source: threshold.source,
        observed_at: threshold.observedAt,
        valid_at: threshold.observedAt,
        confidence: threshold.confidence,
        stale: threshold.stale,
        estimate: threshold.estimate,
        calculation_version: threshold.calculationVersion,
        evidence_fingerprint: sourceFingerprint,
      },
    };
  };
  const doses = compiled.occurrences.flatMap((occurrence) => {
    if (occurrence.role !== "activity") return [];
    const sport = occurrence.category;
    const provenance =
      sport === "bike" || sport === "run" || sport === "swim"
        ? thresholdForSport(sport)
        : { method: null, quality: null, thresholdEvidence: null };
    const supportedTarget = occurrence.targets.find((target) =>
      sport === "bike"
        ? target.type === "%FTP" || target.type === "watts"
        : sport === "run" || sport === "swim"
          ? target.type === "speed"
          : false,
    );
    const target =
      supportedTarget?.type === "%FTP"
        ? ({ type: "percent_threshold", value: supportedTarget.intensity / 100 } as const)
        : supportedTarget?.type === "watts"
          ? ({ type: "power_watts", value: supportedTarget.intensity } as const)
          : supportedTarget?.type === "speed"
            ? ({ type: "speed_mps", value: supportedTarget.intensity / 3.6 } as const)
            : null;
    const durationSeconds =
      occurrence.duration.type === "time" ? occurrence.duration.seconds : null;
    return [
      {
        sport,
        durationSeconds,
        target,
        ...provenance,
        evidenceFingerprint:
          provenance.thresholdEvidence === null
            ? null
            : fingerprint("planned-common-load", [
                input.planId,
                occurrence.occurrenceId,
                durationSeconds,
                target,
                provenance.thresholdEvidence.sourceFingerprint,
              ]),
      },
    ];
  });
  const envelope = adaptPlannedCommonLoadDoses({ computedAsOf, doses });
  return envelope.doses.length === 1
    ? (envelope.doses[0] ?? envelope.aggregate)
    : envelope.aggregate;
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
          planId: plan.id,
          structure: plan.structure,
          thresholds: snapshot.thresholds,
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
