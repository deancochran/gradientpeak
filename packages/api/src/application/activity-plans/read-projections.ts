import {
  type ActivityPlanDetail,
  type ActivityPlanMetric,
  type ActivityPlanPlanningEstimate,
  type ActivityPlanSummary,
  activityPlanDetailSchema,
  activityPlanPrescriptionQuantificationBundleSchema,
  activityPlanProjectionSchema,
  activityPlanStructureSchema,
  activityPlanSummarySchema,
  createActivityPlanMetric,
  createActivityPlanQuantificationIdentities,
  createUnavailableAthletePerformanceTargetFacts,
  estimateActivityPlanForTrainingContext,
  getPlannedEstimate,
  type PlannedEstimate,
  type ScheduledActivityPlanSummary,
  scheduledActivityPlanSummarySchema,
} from "@repo/core";
import { z } from "zod";
import { resolveProfileMediaUrl } from "../storage/profile-media-url";

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
  planProjection: z.unknown().nullable().optional(),
});
type PlanProjectionSource = z.infer<typeof planProjectionSourceSchema>;
type ResolvedProjectionEvidence = {
  prescriptionQuantification: ActivityPlanPlanningEstimate["prescriptionQuantification"];
  planProjection: NonNullable<ActivityPlanPlanningEstimate["planProjection"]>;
};

export function canDuplicateFullActivityPlan(
  plan: Pick<PlanProjectionSource, "profile_id" | "is_system_template">,
  viewerId: string,
) {
  return plan.profile_id === viewerId || plan.is_system_template;
}

function planPresentation(evidence: ResolvedProjectionEvidence): ActivityPlanMetric[] {
  const estimate = getPlannedEstimate(evidence.prescriptionQuantification);

  const metric = (
    key: ActivityPlanMetric["key"],
    label: string,
    unit: string,
    quantity:
      | PlannedEstimate["distanceMeters"]
      | PlannedEstimate["durationSeconds"]
      | PlannedEstimate["load"],
    provenance: ActivityPlanMetric["provenance"],
  ): ActivityPlanMetric =>
    quantity.status === "unavailable" || quantity.value === null || quantity.status === "partial"
      ? createActivityPlanMetric({
          key,
          label,
          status: "unavailable",
          value: null,
          unit,
          reason: quantity.status === "partial" ? "incomplete_members" : quantity.reason,
          provenance: null,
        })
      : createActivityPlanMetric({
          key,
          label,
          status: "available",
          value: quantity.value,
          unit,
          reason: null,
          provenance,
        });
  const authoredProvenance = (
    quantity: PlannedEstimate["distanceMeters"] | PlannedEstimate["durationSeconds"],
  ): ActivityPlanMetric["provenance"] =>
    quantity.status === "unavailable"
      ? null
      : quantity.status === "estimated"
        ? "estimated"
        : "authored";
  const calculatedProvenance = (
    quantity: PlannedEstimate["load"],
  ): ActivityPlanMetric["provenance"] =>
    quantity.status === "unavailable" || quantity.basis === null ? null : "estimated";
  const distanceProjection = evidence.planProjection.distance;
  const distanceMetric =
    distanceProjection.status === "unavailable" || distanceProjection.value === null
      ? createActivityPlanMetric({
          key: "distance",
          label: "Distance",
          status: "unavailable",
          value: null,
          unit: "meters",
          reason: distanceProjection.reason,
          provenance: null,
        })
      : distanceProjection.status === "partial"
        ? createActivityPlanMetric({
            key: "distance",
            label: "Distance",
            status: "unavailable",
            value: null,
            unit: "meters",
            reason: distanceProjection.reason,
            provenance: null,
          })
        : createActivityPlanMetric({
            key: "distance",
            label: "Distance",
            status: "available",
            value: distanceProjection.value,
            unit: "meters",
            reason: null,
            provenance: distanceProjection.provenance === "authored" ? "authored" : "estimated",
          });
  const projectedIntensity = evidence.planProjection.objectiveIntensity;
  const objectiveIntensity: ActivityPlanMetric =
    projectedIntensity.status === "unavailable"
      ? createActivityPlanMetric({
          key: "objective_intensity",
          label: "Intensity",
          status: "unavailable",
          value: null,
          unit: "ratio",
          reason: projectedIntensity.reason,
          provenance: null,
        })
      : createActivityPlanMetric({
          key: "objective_intensity",
          label: "Intensity",
          status: "available",
          value: projectedIntensity.value,
          unit: "ratio",
          reason: null,
          provenance: "estimated",
        });

  return [
    distanceMetric,
    metric(
      "elapsed_duration",
      "Duration",
      "seconds",
      estimate.durationSeconds,
      authoredProvenance(estimate.durationSeconds),
    ),
    metric("common_load", "Load", "score", estimate.load, calculatedProvenance(estimate.load)),
    objectiveIntensity,
  ];
}

function authoredPlanning(
  plan: PlanProjectionSource,
  structure: ReturnType<typeof activityPlanStructureSchema.parse>,
): ActivityPlanPlanningEstimate {
  const asOf = new Date(plan.updated_at).toISOString();
  return estimateActivityPlanForTrainingContext({
    asOf,
    planId: plan.id,
    performanceTargets: createUnavailableAthletePerformanceTargetFacts(
      asOf,
      `authored-plan-projection:${plan.id}`,
    ),
    stage: "plan",
    structure,
  });
}

function resolveProjectionEvidence(
  plan: PlanProjectionSource,
  structure: ReturnType<typeof activityPlanStructureSchema.parse>,
  allowPersonalized: boolean,
): ResolvedProjectionEvidence {
  const authored = authoredPlanning(plan, structure);
  if (!authored.planProjection) {
    throw new Error("Authored activity-plan estimation did not produce a plan projection");
  }
  const currentRevisionFingerprint = createActivityPlanQuantificationIdentities({
    structure,
    stage: "plan",
    planId: plan.id,
  }).evidenceIdentity.revisionFingerprint;
  if (currentRevisionFingerprint === null) {
    throw new Error("Current activity-plan revision did not produce a fingerprint");
  }
  const quantification = activityPlanPrescriptionQuantificationBundleSchema.safeParse(
    allowPersonalized ? plan.prescriptionQuantification : null,
  );
  const projection = activityPlanProjectionSchema.safeParse(
    allowPersonalized ? plan.planProjection : null,
  );
  const currentQuantification =
    quantification.success &&
    quantification.data.summary.subjectIdentity.subjectType === "plan" &&
    quantification.data.summary.subjectIdentity.planId === plan.id &&
    quantification.data.members.every(
      (member) => member.evidenceIdentity.revisionFingerprint === currentRevisionFingerprint,
    );
  const currentProjection =
    projection.success && projection.data.revisionFingerprint === currentRevisionFingerprint;
  return {
    prescriptionQuantification: currentQuantification
      ? quantification.data
      : authored.prescriptionQuantification,
    planProjection: currentProjection ? projection.data : authored.planProjection,
  };
}

export function createActivityPlanProjectionMetrics(input: {
  id: string;
  structure: unknown;
  updatedAt: Date | string;
}): ActivityPlanMetric[] {
  const structure = activityPlanStructureSchema.parse(input.structure);
  const plan = planProjectionSourceSchema.parse({
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
    planProjection: null,
  });
  return planPresentation(resolveProjectionEvidence(plan, structure, false));
}

function projectionOwner(plan: PlanProjectionSource) {
  if (!plan.profile_id) return null;
  return {
    id: plan.profile_id,
    username: plan.owner?.username?.trim() || null,
    avatarUrl: resolveProfileMediaUrl(plan.owner?.avatar_url ?? null, plan.profile_id),
  };
}

function summaryValue(plan: PlanProjectionSource, viewerId: string) {
  const structure = activityPlanStructureSchema.parse(plan.structure);
  const isOwner = plan.profile_id === viewerId;
  const allowPersonalized =
    isOwner && !plan.is_system_template && plan.content_visibility !== "public";
  const evidence = resolveProjectionEvidence(plan, structure, allowPersonalized);
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
    planProjection: evidence.planProjection,
    ...(isOwner ? { prescriptionQuantification: evidence.prescriptionQuantification } : {}),
    metrics: planPresentation(evidence),
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
