import {
  type ActivityPlanDetail,
  type ActivityPlanSummary,
  activityPlanDetailSchema,
  activityPlanPrescriptionQuantificationBundleSchema,
  activityPlanStructureSchema,
  activityPlanSummarySchema,
  createSemanticMetric,
  createUnavailableAthletePerformanceTargetFacts,
  estimateActivityPlanForTrainingContext,
  getPlannedEstimate,
  type PlannedEstimate,
  type ScheduledActivityPlanSummary,
  type SemanticMetric,
  scheduledActivityPlanSummarySchema,
} from "@repo/core";
import { z } from "zod";

const planProjectionSourceSchema = z.looseObject({
  id: z.string(),
  profile_id: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  structure: z.unknown(),
  structure_hash: z.string(),
  revision: z.number().int().positive(),
  gps_recording_enabled: z.boolean(),
  content_visibility: z.enum(["private", "followers", "public"]),
  is_system_template: z.boolean(),
  created_at: z.union([z.date(), z.string()]),
  updated_at: z.union([z.date(), z.string()]),
  likes_count: z.number().nullable().optional(),
  has_liked: z.boolean().nullable().optional(),
  owner: z
    .looseObject({
      id: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      avatar_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  prescriptionQuantification: z.unknown().nullable().optional(),
});
type PlanProjectionSource = z.infer<typeof planProjectionSourceSchema>;

export function canDuplicateFullActivityPlan(
  plan: Pick<PlanProjectionSource, "profile_id" | "is_system_template">,
  viewerId: string,
) {
  return plan.profile_id === viewerId || plan.is_system_template;
}

function planMetrics(
  plan: PlanProjectionSource,
  structure: ReturnType<typeof activityPlanStructureSchema.parse>,
  includePersonalizedQuantification: boolean,
): SemanticMetric[] {
  // Non-owner projections are recalculated from authored structure with an
  // intentionally empty, synthetic athlete context. The incoming bundle is
  // never inspected, so private thresholds and calibration evidence cannot
  // influence or cross this boundary.
  const quantification = activityPlanPrescriptionQuantificationBundleSchema.safeParse(
    includePersonalizedQuantification ? plan.prescriptionQuantification : null,
  );
  const estimate = quantification.success
    ? getPlannedEstimate(quantification.data)
    : getPlannedEstimate(
        estimateActivityPlanForTrainingContext({
          asOf: new Date(plan.updated_at).toISOString(),
          planId: plan.id,
          performanceTargets: createUnavailableAthletePerformanceTargetFacts(
            new Date(plan.updated_at).toISOString(),
            `authored-plan-projection:${plan.id}`,
          ),
          stage: "plan",
          structure,
        }).prescriptionQuantification,
      );

  const metric = (
    key: SemanticMetric["key"],
    label: string,
    unit: string,
    quantity:
      | PlannedEstimate["distanceMeters"]
      | PlannedEstimate["durationSeconds"]
      | PlannedEstimate["load"],
    provenance: SemanticMetric["provenance"],
  ): SemanticMetric =>
    quantity.status === "unavailable" || quantity.value === null
      ? createSemanticMetric({
          key,
          label,
          status: "unavailable",
          value: null,
          unit,
          reason: quantity.reason,
          provenance: null,
        })
      : createSemanticMetric({
          key,
          label,
          status: quantity.status === "partial" ? "partial" : "available",
          value: quantity.value,
          unit,
          reason: quantity.status === "partial" ? quantity.reason : null,
          provenance,
        });
  const authoredProvenance = (
    quantity: PlannedEstimate["distanceMeters"] | PlannedEstimate["durationSeconds"],
  ): SemanticMetric["provenance"] =>
    quantity.status === "unavailable"
      ? null
      : quantity.status === "estimated"
        ? "estimated"
        : "authored";
  const calculatedProvenance = (quantity: PlannedEstimate["load"]): SemanticMetric["provenance"] =>
    quantity.status === "unavailable" || quantity.basis === null
      ? null
      : quantity.basis === "plan_intent"
        ? "plan_intent"
        : "personalized";

  return [
    metric(
      "distance",
      "Distance",
      "meters",
      estimate.distanceMeters,
      authoredProvenance(estimate.distanceMeters),
    ),
    metric(
      "elapsed_duration",
      "Duration",
      "seconds",
      estimate.durationSeconds,
      authoredProvenance(estimate.durationSeconds),
    ),
    metric("common_load", "Load", "score", estimate.load, calculatedProvenance(estimate.load)),
    metric(
      "normalized_intensity",
      "Intensity",
      "ratio",
      estimate.normalizedIntensity,
      calculatedProvenance(estimate.normalizedIntensity),
    ),
  ];
}

export function createActivityPlanProjectionMetrics(input: {
  id: string;
  structure: unknown;
  updatedAt: Date | string;
}): SemanticMetric[] {
  const structure = activityPlanStructureSchema.parse(input.structure);
  return planMetrics(
    planProjectionSourceSchema.parse({
      id: input.id,
      profile_id: null,
      name: "Authored plan projection",
      description: null,
      structure,
      structure_hash: "public-projection",
      revision: 1,
      gps_recording_enabled: false,
      content_visibility: "public",
      is_system_template: false,
      created_at: input.updatedAt,
      updated_at: input.updatedAt,
      prescriptionQuantification: null,
    }),
    structure,
    false,
  );
}

function projectionOwner(plan: PlanProjectionSource) {
  if (!plan.profile_id) return null;
  const avatarUrl = z.string().url().safeParse(plan.owner?.avatar_url);
  return {
    id: plan.profile_id,
    username: plan.owner?.username?.trim() || null,
    avatarUrl: avatarUrl.success ? avatarUrl.data : null,
  };
}

function summaryValue(plan: PlanProjectionSource, viewerId: string) {
  const structure = activityPlanStructureSchema.parse(plan.structure);
  const isOwner = plan.profile_id === viewerId;
  return {
    contractVersion: "activity-plan-summary-v1" as const,
    id: plan.id,
    href: `/activity-plans/${plan.id}`,
    name: plan.name,
    description: plan.description ?? null,
    createdAt: new Date(plan.created_at).toISOString(),
    updatedAt: new Date(plan.updated_at).toISOString(),
    owner: projectionOwner(plan),
    activityCategory: structure.activity_category,
    activityPlanRevision: plan.revision,
    structure,
    ...(isOwner
      ? {
          prescriptionQuantification: plan.prescriptionQuantification ?? null,
        }
      : {}),
    metrics: planMetrics(plan, structure, isOwner),
    visibility: plan.content_visibility,
    isSystemTemplate: plan.is_system_template,
    engagement: { likes: plan.likes_count ?? 0, viewerHasLiked: plan.has_liked ?? false },
    capabilities: {
      canLike: true,
      canEdit: isOwner,
      canDelete: isOwner,
      canDuplicate: canDuplicateFullActivityPlan(plan, viewerId),
      canSchedule: true,
      canRecord: isOwner,
    },
  };
}

export function toActivityPlanSummary(plan: unknown, viewerId: string): ActivityPlanSummary {
  return activityPlanSummarySchema.parse(
    summaryValue(planProjectionSourceSchema.parse(plan), viewerId),
  );
}

export function toActivityPlanDetail(plan: unknown, viewerId: string): ActivityPlanDetail {
  const parsedPlan = planProjectionSourceSchema.parse(plan);
  const summary = summaryValue(parsedPlan, viewerId);
  const isOwner = parsedPlan.profile_id === viewerId;
  return activityPlanDetailSchema.parse({
    ...summary,
    contractVersion: "activity-plan-detail-v1",
    ...(isOwner
      ? {
          notes: parsedPlan.notes ?? null,
          structureHash: parsedPlan.structure_hash,
          gpsRecordingEnabled: parsedPlan.gps_recording_enabled,
        }
      : {}),
  });
}

export function toScheduledActivityPlanSummary(input: {
  plan: unknown;
  viewerId: string;
  eventId: string;
  calendarDate: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  status: "scheduled" | "completed" | "cancelled" | "expired";
  trainingPlanId: string | null;
}): ScheduledActivityPlanSummary {
  return scheduledActivityPlanSummarySchema.parse({
    ...summaryValue(planProjectionSourceSchema.parse(input.plan), input.viewerId),
    contractVersion: "scheduled-activity-plan-summary-v1",
    schedule: {
      eventId: input.eventId,
      calendarDate: input.calendarDate,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      status: input.status,
      trainingPlanId: input.trainingPlanId,
    },
  });
}
