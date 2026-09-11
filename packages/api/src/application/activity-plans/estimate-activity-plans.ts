import {
  type ActivityPlanDocument,
  activityPlanDocumentSchema,
  type ResolvedActivityPlanVariant,
  resolveActivityPlanVariant,
} from "@repo/core/activity-plan";
import type { CommonLoadResult } from "@repo/core/load";
import {
  type AthletePerformanceTargetFacts,
  createUnavailableAthletePerformanceTargetFacts,
} from "@repo/core/performance-model";
import {
  type ActivityPlanPlanningEstimate,
  createUnavailableActivityPlanPlanningEstimate,
  estimateActivityPlanForTrainingContext,
} from "@repo/core/plan";
import type { ActivityPlanRow } from "@repo/db";
import type { DrizzleQueryExecutor } from "../../db";
import { readPublishedAthletePerformanceTargets } from "../athlete-intelligence/published-athlete-state";

export type EstimatableActivityPlan = Pick<
  ActivityPlanRow,
  "id" | "profile_id" | "name" | "description" | "structure"
>;

export type SupportedActivityPlan = EstimatableActivityPlan &
  Pick<ActivityPlanRow, "gps_recording_enabled" | "structure" | "structure_hash"> & {
    updated_at: Date | string;
  };

export type ActivityPlanWithEstimate<TPlan extends EstimatableActivityPlan> = TPlan & {
  prescriptionQuantification: ActivityPlanPlanningEstimate["prescriptionQuantification"];
  planProjection: NonNullable<ActivityPlanPlanningEstimate["planProjection"]>;
  resolvedActivityPlanVariant: ResolvedActivityPlanVariant;
};

export type CurrentActivityPlanEstimateOptions = {
  /** Stable request time used to assess the published snapshot. */
  asOf?: Date;
  /** Opts into estimates derived from the authenticated viewer's current performance facts. */
  personalize?: boolean;
  /** Selects one exact variant; omission resolves the document default. */
  variantId?: string;
};

function buildEstimatedPlan<TPlan extends EstimatableActivityPlan>(
  plan: TPlan,
  planning: ActivityPlanPlanningEstimate,
  resolvedActivityPlanVariant: ResolvedActivityPlanVariant,
): ActivityPlanWithEstimate<TPlan> {
  if (!planning.planProjection) {
    throw new Error("Activity-plan estimator did not produce a plan projection");
  }
  return {
    ...plan,
    prescriptionQuantification: planning.prescriptionQuantification,
    planProjection: planning.planProjection,
    resolvedActivityPlanVariant,
  };
}

function estimatePlan(
  plan: EstimatableActivityPlan,
  resolvedActivityPlanVariant: ResolvedActivityPlanVariant,
  performanceTargets: AthletePerformanceTargetFacts,
): ActivityPlanPlanningEstimate {
  return estimateActivityPlanForTrainingContext({
    asOf: performanceTargets.asOf,
    structure: resolvedActivityPlanVariant.structure,
    performanceTargets,
    stage: "plan",
    planId: plan.id,
  });
}

function unavailablePlan<TPlan extends EstimatableActivityPlan>(
  plan: TPlan,
  resolvedActivityPlanVariant: ResolvedActivityPlanVariant,
  asOf: Date,
  reason: "source_missing" | "invalid_data" = "source_missing",
): ActivityPlanWithEstimate<TPlan> {
  const activityCategory: CommonLoadResult["activity_category"] =
    resolvedActivityPlanVariant.structure.activity_category;
  const planning = createUnavailableActivityPlanPlanningEstimate({
    asOf: asOf.toISOString(),
    stage: "plan",
    planId: plan.id,
    activityCategory,
    reason,
  });
  if (!planning.planProjection) {
    throw new Error("Unavailable activity-plan estimator did not produce a plan projection");
  }
  return {
    ...plan,
    prescriptionQuantification: planning.prescriptionQuantification,
    planProjection: planning.planProjection,
    resolvedActivityPlanVariant,
  };
}

function resolvePlanVariant(
  plan: EstimatableActivityPlan,
  variantId: string | undefined,
): { document: ActivityPlanDocument; variant: ResolvedActivityPlanVariant } {
  const document = activityPlanDocumentSchema.parse(plan.structure);
  return {
    document,
    variant: resolveActivityPlanVariant(
      document,
      variantId === undefined ? undefined : { variantId },
    ),
  };
}

export async function estimateActivityPlan<TPlan extends SupportedActivityPlan>(
  plan: TPlan,
  db: DrizzleQueryExecutor,
  profileId: string,
  options?: CurrentActivityPlanEstimateOptions,
): Promise<ActivityPlanWithEstimate<TPlan>> {
  const [estimated] = await estimateActivityPlans([plan], db, profileId, options);
  if (!estimated) throw new Error("Activity-plan estimator did not receive a plan");
  return estimated;
}

export async function estimateActivityPlans<TPlan extends SupportedActivityPlan>(
  plans: Array<TPlan | null | undefined>,
  db: DrizzleQueryExecutor,
  profileId: string,
  options?: CurrentActivityPlanEstimateOptions,
): Promise<Array<ActivityPlanWithEstimate<TPlan>>> {
  const normalizedPlans = plans.filter((plan): plan is TPlan => !!plan && typeof plan === "object");
  if (normalizedPlans.length === 0) return [];

  const asOf = options?.asOf ?? new Date();
  if (!options?.personalize) {
    const planIntentTargets = createUnavailableAthletePerformanceTargetFacts(
      asOf.toISOString(),
      profileId,
    );
    return normalizedPlans.map((plan) => {
      const { variant } = resolvePlanVariant(plan, options?.variantId);
      try {
        return buildEstimatedPlan(plan, estimatePlan(plan, variant, planIntentTargets), variant);
      } catch (error) {
        console.error(
          `Failed to estimate activity plan ${plan.id}: ${error instanceof Error ? error.message : "unknown estimation error"}`,
        );
        return unavailablePlan(plan, variant, asOf, "invalid_data");
      }
    });
  }
  let published: Awaited<ReturnType<typeof readPublishedAthletePerformanceTargets>>;
  try {
    published = await readPublishedAthletePerformanceTargets({ db, profileId, now: asOf });
  } catch {
    console.error("Failed to load the published activity-plan estimation snapshot.");
    return normalizedPlans.map((plan) => {
      const { variant } = resolvePlanVariant(plan, options?.variantId);
      return unavailablePlan(plan, variant, asOf);
    });
  }
  const memo = new Map<string, ActivityPlanPlanningEstimate>();
  return normalizedPlans.map((plan) => {
    const { variant } = resolvePlanVariant(plan, options?.variantId);
    const key = JSON.stringify({ id: plan.id, structure: variant.structure });
    const existing = memo.get(key);
    if (existing) return buildEstimatedPlan(plan, existing, variant);
    try {
      const planning = estimatePlan(plan, variant, published.targets);
      memo.set(key, planning);
      return buildEstimatedPlan(plan, planning, variant);
    } catch (error) {
      console.error(
        `Failed to estimate activity plan ${plan.id}: ${error instanceof Error ? error.message : "unknown estimation error"}`,
      );
      return unavailablePlan(plan, variant, asOf, "invalid_data");
    }
  });
}
