import { db } from "@/lib/drizzle";
import { plannedActivities } from "@repo/drizzle/schemas";
import { and, desc, eq, gte, lte } from "drizzle-orm";

export async function createPlannedActivity(
  activityData: Omit<
    typeof plannedActivities.$inferInsert,
    "id" | "idx" | "createdAt" | "updatedAt"
  >,
) {
  const [activity] = await db
    .insert(plannedActivities)
    .values(activityData)
    .returning();
  return activity;
}

export async function getPlannedActivityById(activityId: string) {
  const [activity] = await db
    .select()
    .from(plannedActivities)
    .where(eq(plannedActivities.id, activityId));
  return activity;
}

export async function getPlannedActivitiesByProfile(
  profileId: string,
  limit = 50,
  offset = 0,
) {
  return await db
    .select()
    .from(plannedActivities)
    .where(eq(plannedActivities.profileId, profileId))
    .orderBy(desc(plannedActivities.plannedDate))
    .limit(limit)
    .offset(offset);
}

export async function getPlannedActivitiesInDateRange(
  profileId: string,
  startDate: Date,
  endDate: Date,
) {
  return await db
    .select()
    .from(plannedActivities)
    .where(
      and(
        eq(plannedActivities.profileId, profileId),
        gte(plannedActivities.plannedDate, startDate),
        lte(plannedActivities.plannedDate, endDate),
      ),
    )
    .orderBy(plannedActivities.plannedDate);
}

export async function getPlannedActivitiesForWeek(
  profileId: string,
  weekStartDate: Date,
) {
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);

  return await getPlannedActivitiesInDateRange(
    profileId,
    weekStartDate,
    weekEndDate,
  );
}

export async function getPlannedActivitiesForMonth(
  profileId: string,
  year: number,
  month: number,
) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  return await getPlannedActivitiesInDateRange(profileId, startDate, endDate);
}

export async function updatePlannedActivity(
  activityId: string,
  updates: Partial<typeof plannedActivities.$inferInsert>,
) {
  const [updatedActivity] = await db
    .update(plannedActivities)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(plannedActivities.id, activityId))
    .returning();
  return updatedActivity;
}

export async function markPlannedActivityCompleted(
  activityId: string,
  actualActivityId?: string,
) {
  const updateData: any = {
    completed: true,
    completedAt: new Date(),
    updatedAt: new Date(),
  };

  if (actualActivityId) {
    updateData.actualActivityId = actualActivityId;
  }

  const [updatedActivity] = await db
    .update(plannedActivities)
    .set(updateData)
    .where(eq(plannedActivities.id, activityId))
    .returning();
  return updatedActivity;
}

export async function markPlannedActivitySkipped(
  activityId: string,
  reason?: string,
) {
  const updateData: any = {
    skipped: true,
    skippedAt: new Date(),
    updatedAt: new Date(),
  };

  if (reason) {
    updateData.skipReason = reason;
  }

  const [updatedActivity] = await db
    .update(plannedActivities)
    .set(updateData)
    .where(eq(plannedActivities.id, activityId))
    .returning();
  return updatedActivity;
}

export async function deletePlannedActivity(activityId: string) {
  const [deletedActivity] = await db
    .delete(plannedActivities)
    .where(eq(plannedActivities.id, activityId))
    .returning();
  return deletedActivity;
}

export async function getUpcomingPlannedActivities(
  profileId: string,
  days = 7,
) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + days);

  return await db
    .select()
    .from(plannedActivities)
    .where(
      and(
        eq(plannedActivities.profileId, profileId),
        gte(plannedActivities.plannedDate, startDate),
        lte(plannedActivities.plannedDate, endDate),
        eq(plannedActivities.completed, false),
        eq(plannedActivities.skipped, false),
      ),
    )
    .orderBy(plannedActivities.plannedDate);
}

export async function getOverduePlannedActivities(profileId: string) {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // End of today

  return await db
    .select()
    .from(plannedActivities)
    .where(
      and(
        eq(plannedActivities.profileId, profileId),
        lte(plannedActivities.plannedDate, today),
        eq(plannedActivities.completed, false),
        eq(plannedActivities.skipped, false),
      ),
    )
    .orderBy(plannedActivities.plannedDate);
}

export async function getCompletionRate(profileId: string, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const totalActivities = await db
    .select()
    .from(plannedActivities)
    .where(
      and(
        eq(plannedActivities.profileId, profileId),
        gte(plannedActivities.plannedDate, startDate),
      ),
    );

  const completedActivities = await db
    .select()
    .from(plannedActivities)
    .where(
      and(
        eq(plannedActivities.profileId, profileId),
        gte(plannedActivities.plannedDate, startDate),
        eq(plannedActivities.completed, true),
      ),
    );

  const total = totalActivities.length;
  const completed = completedActivities.length;

  return {
    total,
    completed,
    completionRate: total > 0 ? (completed / total) * 100 : 0,
  };
}

export async function getPlannedTSSByDateRange(
  profileId: string,
  startDate: Date,
  endDate: Date,
) {
  return await db
    .select({
      date: plannedActivities.plannedDate,
      targetTss: plannedActivities.targetTss,
      name: plannedActivities.name,
      completed: plannedActivities.completed,
    })
    .from(plannedActivities)
    .where(
      and(
        eq(plannedActivities.profileId, profileId),
        gte(plannedActivities.plannedDate, startDate),
        lte(plannedActivities.plannedDate, endDate),
        plannedActivities.targetTss.isNotNull(),
      ),
    )
    .orderBy(plannedActivities.plannedDate);
}

export async function bulkCreatePlannedActivities(
  activitiesData: Array<
    Omit<
      typeof plannedActivities.$inferInsert,
      "id" | "idx" | "createdAt" | "updatedAt"
    >
  >,
) {
  if (activitiesData.length === 0) return [];

  return await db.insert(plannedActivities).values(activitiesData).returning();
}
