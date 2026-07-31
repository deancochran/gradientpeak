import { createHash } from "node:crypto";
import { compileActivityPlan } from "@repo/core/activity-plan";
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

export type SupportedActivityPlan = EstimationActivityPlanInput &
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
type PlannedCommonLoadLthrByActivityCategory = Awaited<
  ReturnType<typeof loadEstimationSnapshot>
>["lthrByActivityCategory"];

function fingerprint(kind: string, values: readonly unknown[]): string {
  const digest = createHash("sha256").update(JSON.stringify(values)).digest("hex");
  return `${kind}:v1:sha256:${digest}`;
}

function plannedCommonLoad(input: {
  asOf: Date;
  planId: string;
  structure: unknown;
  thresholds: PlannedCommonLoadThresholds;
  lthrByActivityCategory: PlannedCommonLoadLthrByActivityCategory;
}): CommonLoadResult | CommonLoadAggregate {
  const computedAsOf = input.asOf.toISOString();
  const compiled = compileActivityPlan(input.structure);
  const thresholdForActivityCategory = (activity_category: "bike" | "run" | "swim") => {
    const threshold =
      activity_category === "bike"
        ? input.thresholds.cycling_ftp
        : activity_category === "run"
          ? input.thresholds.running_threshold_pace
          : input.thresholds.swimming_css;
    const value =
      threshold.value === null
        ? null
        : activity_category === "bike"
          ? threshold.value
          : activity_category === "run"
            ? 1000 / threshold.value
            : 100 / threshold.value;
    const method =
      activity_category === "bike"
        ? ("power_threshold" as const)
        : activity_category === "run"
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
        activity_category === "bike"
          ? ("ftp_watts" as const)
          : activity_category === "run"
            ? ("threshold_speed_mps" as const)
            : ("swim_threshold_speed_mps" as const),
      value,
      unit: activity_category === "bike" ? ("watts" as const) : ("meters_per_second" as const),
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
  const lthrForActivityCategory = (activity_category: "bike" | "run" | "swim") => {
    const lthr = input.lthrByActivityCategory[activity_category];
    if (!lthr?.quality.observed_at || !lthr.quality.evidence_fingerprint) {
      return { method: "heart_rate_zones" as const, quality: null, thresholdEvidence: null };
    }
    const thresholdEvidence = {
      type: "lthr_bpm" as const,
      value: lthr.value,
      unit: "beats_per_minute" as const,
      source: lthr.quality.source,
      observedAt: lthr.quality.observed_at,
      validAt: lthr.quality.valid_at ?? lthr.quality.observed_at,
      freshness: lthr.quality.stale ? ("stale" as const) : ("current" as const),
      calculationVersion: lthr.quality.calculation_version ?? null,
      sourceFingerprint: lthr.quality.evidence_fingerprint,
    } satisfies CommonThresholdEvidence;
    return {
      method: "heart_rate_zones" as const,
      quality: lthr.quality,
      thresholdEvidence,
    };
  };
  const doses = compiled.occurrences.flatMap((occurrence) => {
    if (occurrence.role !== "activity") return [];
    const activity_category = occurrence.activity_category;
    const supportedTarget = occurrence.targets.find((target) =>
      activity_category === "bike"
        ? target.type === "%FTP" || target.type === "watts" || target.type === "%ThresholdHR"
        : activity_category === "run" || activity_category === "swim"
          ? target.type === "speed" || target.type === "%ThresholdHR"
          : false,
    );
    const provenance =
      activity_category === "bike" || activity_category === "run" || activity_category === "swim"
        ? supportedTarget?.type === "%ThresholdHR"
          ? lthrForActivityCategory(activity_category)
          : thresholdForActivityCategory(activity_category)
        : { method: null, quality: null, thresholdEvidence: null };
    const target =
      supportedTarget?.type === "%FTP" || supportedTarget?.type === "%ThresholdHR"
        ? // Activity-plan threshold percentages are authored in points; Core receives a ratio.
          ({ type: "percent_threshold", thresholdRatio: supportedTarget.intensity / 100 } as const)
        : supportedTarget?.type === "watts"
          ? ({ type: "power_watts", value: supportedTarget.intensity } as const)
          : supportedTarget?.type === "speed"
            ? ({ type: "speed_mps", value: supportedTarget.intensity / 3.6 } as const)
            : null;
    const durationSeconds =
      occurrence.duration.type === "time" ? occurrence.duration.seconds : null;
    return [
      {
        activity_category,
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
          lthrByActivityCategory: snapshot.lthrByActivityCategory,
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
  let activity_category: CommonLoadResult["activity_category"] = "other";
  try {
    activity_category = toEstimationActivityPlan(plan).activity_category;
  } catch {
    // The failed estimate remains unavailable without inventing a modality.
  }
  return {
    ...buildFailedEstimationPlan(plan, { route }),
    common_load: {
      status: "unavailable",
      model: COMMON_RELATIVE_LOAD_MODEL,
      version: COMMON_RELATIVE_LOAD_VERSION,
      activity_category,
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
