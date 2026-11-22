import { schema } from "@repo/db";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

type HomeDb = ReturnType<typeof getRequiredDb>;
export type PlannedActivityRow = {
  id: string;
  linked_activity_id: string | null;
  scheduled_date: string;
  status: "scheduled" | "completed" | "cancelled";
};

export type PlannedActivityWithEstimation = PlannedActivityRow;

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
      id: schema.plannedSessions.id,
      linked_activity_id: schema.plannedSessions.completed_activity_id,
      scheduled_date: schema.plannedSessions.planning_date,
      status: schema.plannedSessions.status,
    })
    .from(schema.plannedSessions)
    .where(
      and(
        eq(schema.plannedSessions.profile_id, input.profileId),
        gte(schema.plannedSessions.planning_date, input.scheduledDateGte),
        lt(schema.plannedSessions.planning_date, input.scheduledDateLt),
      ),
    )
    .orderBy(asc(schema.plannedSessions.planning_date), asc(schema.plannedSessions.id));

  return rows;
}

export async function loadPlannedActivitiesWithEstimations(
  db: HomeDb,
  input: {
    profileId: string;
    scheduledDateGte: string;
    scheduledDateLt: string;
  },
): Promise<{
  plannedActivities: PlannedActivityRow[];
  activitiesWithEstimations: PlannedActivityWithEstimation[];
}> {
  const plannedActivities = await listPlannedActivitiesInRange(db, input);

  return { plannedActivities, activitiesWithEstimations: plannedActivities };
}
