import { getScheduledDateKey } from "@repo/core";
import { type EventRow, type PublicActivityPlansRow, schema } from "@repo/db";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../../db";
import { getActivityPlansDerivedMetrics } from "../../utils/activity-plan-derived-metrics";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const activityPlanBoundarySchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().optional(),
    activity_category: z.string().nullable().optional(),
    estimated_distance: z.number().nullable().optional(),
    estimated_duration: z.number().nullable().optional(),
    estimated_tss: z.number().nullable().optional(),
  })
  .passthrough();

const plannedActivityRowSchema = z
  .object({
    id: z.string(),
    starts_at: z.date(),
    notes: z.string().nullable(),
    activity_plan: activityPlanBoundarySchema.nullable(),
    scheduled_date: isoDateSchema,
  })
  .strict();

type HomeDb = ReturnType<typeof getRequiredDb>;
type EstimationStore = Parameters<typeof getActivityPlansDerivedMetrics>[2];

export type PlannedActivityRow = Pick<EventRow, "id" | "notes"> & {
  starts_at: Date;
  activity_plan: PublicActivityPlansRow | null;
  scheduled_date: string;
};

export async function listPlannedActivitiesInRange(
  db: HomeDb,
  input: {
    profileId: string;
    startsAtGte: Date;
    startsAtLt: Date;
  },
): Promise<PlannedActivityRow[]> {
  const rows = await db
    .select({
      id: schema.events.id,
      starts_at: schema.events.starts_at,
      scheduled_date: schema.events.scheduled_date,
      notes: schema.events.notes,
      activity_plan: schema.activityPlans,
    })
    .from(schema.events)

    .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
    .where(
      and(
        eq(schema.events.profile_id, input.profileId),
        eq(schema.events.event_type, "planned"),
        gte(schema.events.starts_at, input.startsAtGte),
        lt(schema.events.starts_at, input.startsAtLt),
      ),
    )
    .orderBy(asc(schema.events.starts_at));

  return rows.map(
    (row) =>
      plannedActivityRowSchema.parse({
        ...row,
        activity_plan: (row.activity_plan as PublicActivityPlansRow | null) ?? null,
        scheduled_date:
          row.scheduled_date ?? getScheduledDateKey(row.starts_at.toISOString(), "UTC"),
      }) as PlannedActivityRow,
  );
}

export async function loadPlannedActivitiesWithEstimations(
  db: HomeDb,
  input: {
    estimationStore: EstimationStore;
    profileId: string;
    startsAtGte: Date;
    startsAtLt: Date;
  },
): Promise<{
  plannedActivities: PlannedActivityRow[];
  activitiesWithEstimations: PlannedActivityRow[];
}> {
  const plannedActivities = await listPlannedActivitiesInRange(db, input);

  const plans = plannedActivities
    .map((plannedActivity) => plannedActivity.activity_plan)
    .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));

  if (plans.length === 0) {
    return { plannedActivities, activitiesWithEstimations: plannedActivities };
  }

  const plansWithEstimation = await getActivityPlansDerivedMetrics(
    plans,
    db,
    input.estimationStore,
    input.profileId,
  );
  const plansMap = new Map(plansWithEstimation.map((plan) => [plan.id, plan]));

  const activitiesWithEstimations = plannedActivities.map((plannedActivity) => ({
    ...plannedActivity,
    activity_plan:
      plannedActivity.activity_plan && plansMap.get(plannedActivity.activity_plan.id)
        ? (plansMap.get(
            plannedActivity.activity_plan.id,
          )! as unknown as typeof plannedActivity.activity_plan)
        : plannedActivity.activity_plan,
  }));

  return { plannedActivities, activitiesWithEstimations };
}
