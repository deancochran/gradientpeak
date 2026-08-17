import {
  type ActivityPlanDetail,
  type ActivityPlanSummary,
  activityPlanDetailSchema,
  activityPlanStructureSchema,
  activityPlanSummarySchema,
  compileValidatedActivityPlan,
  createSemanticMetric,
  getNormalizedIntensity,
  type ScheduledActivityPlanSummary,
  type SemanticMetric,
  scheduledActivityPlanSummarySchema,
} from "@repo/core";
import { commonLoadAggregateSchema, commonLoadResultSchema } from "@repo/core/load";
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

function planMetrics(
  plan: PlanProjectionSource,
  structure: ReturnType<typeof activityPlanStructureSchema.parse>,
) {
  const compiled = compileValidatedActivityPlan(structure);
  const distanceMeters = compiled.occurrences.reduce(
    (total, occurrence) =>
      total + (occurrence.duration.type === "distance" ? occurrence.duration.meters : 0),
    0,
  );
  const repetitions = compiled.occurrences.reduce(
    (total, occurrence) =>
      total + (occurrence.duration.type === "repetitions" ? occurrence.duration.count : 0),
    0,
  );
  const metrics: SemanticMetric[] = [];
  if (compiled.explicitTimedDurationSeconds > 0) {
    metrics.push({
      key: "elapsed_duration",
      label: "Duration",
      status: "available",
      value: compiled.explicitTimedDurationSeconds,
      unit: "seconds",
      reason: null,
    });
  }
  if (distanceMeters > 0) {
    metrics.push({
      key: "distance",
      label: "Distance",
      status: "available",
      value: distanceMeters,
      unit: "meters",
      reason: null,
    });
  }
  if (repetitions > 0) {
    metrics.push({
      key: "repetitions",
      label: "Repetitions",
      status: "available",
      value: repetitions,
      unit: "count",
      reason: null,
    });
  }
  const quantification = z
    .looseObject({ summary: z.looseObject({ commonLoad: z.unknown() }) })
    .safeParse(plan.prescriptionQuantification);
  const commonLoad = z
    .union([commonLoadResultSchema, commonLoadAggregateSchema])
    .safeParse(quantification.success ? quantification.data.summary.commonLoad : undefined);
  if (
    commonLoad.success &&
    commonLoad.data.status !== "unavailable" &&
    typeof commonLoad.data.load === "number"
  ) {
    const partial = commonLoad.data.status === "partial";
    metrics.push(
      createSemanticMetric({
        key: "common_load",
        label: "Load",
        status: partial ? "partial" : "available",
        value: commonLoad.data.load,
        unit: "score",
        reason: partial ? "quantification_partial" : null,
      }),
    );
    const intensity = getNormalizedIntensity(commonLoad.data);
    if (intensity !== null)
      metrics.push(
        createSemanticMetric({
          key: "normalized_intensity",
          label: "Intensity",
          status: partial ? "partial" : "available",
          value: intensity,
          unit: "ratio",
          reason: partial ? "quantification_partial" : null,
        }),
      );
  }
  return metrics;
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
    prescriptionQuantification: plan.prescriptionQuantification ?? null,
    metrics: planMetrics(plan, structure),
    visibility: plan.content_visibility,
    isSystemTemplate: plan.is_system_template,
    engagement: { likes: plan.likes_count ?? 0, viewerHasLiked: plan.has_liked ?? false },
    capabilities: {
      canLike: true,
      canEdit: isOwner,
      canDelete: isOwner,
      canDuplicate: true,
      canSchedule: true,
      canRecord: true,
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
  return activityPlanDetailSchema.parse({
    ...summary,
    contractVersion: "activity-plan-detail-v1",
    notes: parsedPlan.notes ?? null,
    structureHash: parsedPlan.structure_hash,
    gpsRecordingEnabled: parsedPlan.gps_recording_enabled,
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
