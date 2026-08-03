import { type EventRow, schema } from "@repo/db";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { type ActivityPlanExecutionDto, toActivityPlanExecutionDto } from "../../dto/activity-plan";
import {
  type ActivityPlanWithDerivedMetrics,
  getActivityPlansDerivedMetrics,
} from "../../utils/activity-plan-derived-metrics";

type HomeDb = ReturnType<typeof getRequiredDb>;
type EstimationStore = Parameters<typeof getActivityPlansDerivedMetrics>[2];
type HomeActivityPlan = typeof schema.activityPlans.$inferSelect & ActivityPlanExecutionDto;

export type PlannedActivityRow = Pick<EventRow, "id" | "notes"> & {
  activity_plan_id: string | null;
  starts_at: Date;
  activity_plan: HomeActivityPlan | null;
  scheduled_date: string;
};

export type PlannedActivityWithEstimation = Omit<PlannedActivityRow, "activity_plan"> & {
  activity_plan: ActivityPlanWithDerivedMetrics<HomeActivityPlan> | null;
};

export async function listPlannedActivitiesInRange(
  db: HomeDb,
  input: {
    profileId: string;
    scheduledDateGte: string;
    scheduledDateLt: string;
  },
): Promise<PlannedActivityRow[]> {
  const rows = await db
    .select({
      id: schema.events.id,
      starts_at: schema.events.starts_at,
      scheduled_date: schema.events.scheduled_date,
      notes: schema.events.notes,
      activity_plan_id: schema.events.activity_plan_id,
      activity_plan: schema.activityPlans,
    })
    .from(schema.events)

    .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
    .where(
      and(
        eq(schema.events.profile_id, input.profileId),
        eq(schema.events.event_type, "planned"),
        gte(schema.events.scheduled_date, input.scheduledDateGte),
        lt(schema.events.scheduled_date, input.scheduledDateLt),
      ),
    )
    .orderBy(asc(schema.events.scheduled_date), asc(schema.events.starts_at));

  return rows.map((row) => ({
    ...row,
    activity_plan: row.activity_plan ? toActivityPlanExecutionDto(row.activity_plan) : null,
    scheduled_date: row.scheduled_date,
  }));
}

export async function loadPlannedActivitiesWithEstimations(
  db: HomeDb,
  input: {
    estimationStore: EstimationStore;
    profileId: string;
    scheduledDateGte: string;
    scheduledDateLt: string;
  },
): Promise<{
  plannedActivities: PlannedActivityRow[];
  activitiesWithEstimations: PlannedActivityWithEstimation[];
}> {
  const plannedActivities = await listPlannedActivitiesInRange(db, input);

  const plans = plannedActivities
    .map((plannedActivity) => plannedActivity.activity_plan)
    .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));

  if (plans.length === 0) {
    return {
      plannedActivities,
      activitiesWithEstimations: plannedActivities.map((plannedActivity) => ({
        ...plannedActivity,
        activity_plan: null,
      })),
    };
  }

  const plansWithEstimation = await getActivityPlansDerivedMetrics(
    plans,
    db,
    input.estimationStore,
    input.profileId,
  );
  const plansMap = new Map(plansWithEstimation.map((plan) => [plan.id, plan]));

  const activitiesWithEstimations = plannedActivities.map((plannedActivity) => {
    const estimatedPlan = plannedActivity.activity_plan
      ? plansMap.get(plannedActivity.activity_plan.id)
      : undefined;
    return {
      ...plannedActivity,
      activity_plan: estimatedPlan ?? null,
    };
  });

  return { plannedActivities, activitiesWithEstimations };
}
