import { db } from "@/lib/drizzle";
import { activities, activityResults } from "@repo/drizzle/schemas";
import { and, avg, desc, eq, gte, sum } from "drizzle-orm";

export async function createActivityResult(
  resultData: Omit<
    typeof activityResults.$inferInsert,
    "id" | "idx" | "createdAt" | "updatedAt"
  >,
) {
  const [result] = await db
    .insert(activityResults)
    .values(resultData)
    .returning();
  return result;
}

export async function getActivityResult(activityId: string) {
  const [result] = await db
    .select()
    .from(activityResults)
    .where(eq(activityResults.activityId, activityId));
  return result;
}

export async function updateActivityResult(
  activityId: string,
  updates: Partial<typeof activityResults.$inferInsert>,
) {
  const [updatedResult] = await db
    .update(activityResults)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(activityResults.activityId, activityId))
    .returning();
  return updatedResult;
}

export async function getRecentActivities(profileId: string, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await db
    .select()
    .from(activityResults)
    .innerJoin(activities, eq(activityResults.activityId, activities.id))
    .where(
      and(
        eq(activities.profileId, profileId),
        gte(activityResults.startedAt, startDate),
      ),
    )
    .orderBy(desc(activityResults.startedAt));
}

export async function getTrainingLoadData(profileId: string, days = 90) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await db
    .select({
      date: activityResults.startedAt,
      tss: activityResults.tss,
    })
    .from(activityResults)
    .innerJoin(activities, eq(activityResults.activityId, activities.id))
    .where(
      and(
        eq(activities.profileId, profileId),
        gte(activityResults.startedAt, startDate),
        activityResults.tss.isNotNull(),
      ),
    )
    .orderBy(desc(activityResults.startedAt));
}

export async function getActivityResultsByDateRange(
  profileId: string,
  startDate: Date,
  endDate: Date,
) {
  return await db
    .select()
    .from(activityResults)
    .innerJoin(activities, eq(activityResults.activityId, activities.id))
    .where(
      and(
        eq(activities.profileId, profileId),
        gte(activityResults.startedAt, startDate),
        gte(activityResults.startedAt, endDate),
      ),
    )
    .orderBy(desc(activityResults.startedAt));
}

export async function getProfileAverages(profileId: string, days = 90) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [result] = await db
    .select({
      avgTss: avg(activityResults.tss),
      avgNormalizedPower: avg(activityResults.normalizedPower),
      avgHeartRate: avg(activityResults.avgHeartRate),
      totalActivities: sum(activityResults.activityId),
    })
    .from(activityResults)
    .innerJoin(activities, eq(activityResults.activityId, activities.id))
    .where(
      and(
        eq(activities.profileId, profileId),
        gte(activityResults.startedAt, startDate),
      ),
    );

  return result;
}

export async function deleteActivityResult(activityId: string) {
  const [deletedResult] = await db
    .delete(activityResults)
    .where(eq(activityResults.activityId, activityId))
    .returning();
  return deletedResult;
}

export async function getHighestTSSActivities(profileId: string, limit = 10) {
  return await db
    .select()
    .from(activityResults)
    .innerJoin(activities, eq(activityResults.activityId, activities.id))
    .where(
      and(eq(activities.profileId, profileId), activityResults.tss.isNotNull()),
    )
    .orderBy(desc(activityResults.tss))
    .limit(limit);
}

export async function getLongestActivities(profileId: string, limit = 10) {
  return await db
    .select()
    .from(activityResults)
    .innerJoin(activities, eq(activityResults.activityId, activities.id))
    .where(
      and(
        eq(activities.profileId, profileId),
        activityResults.movingTime.isNotNull(),
      ),
    )
    .orderBy(desc(activityResults.movingTime))
    .limit(limit);
}

export async function getPersonalBests(profileId: string) {
  const [powerBest] = await db
    .select()
    .from(activityResults)
    .innerJoin(activities, eq(activityResults.activityId, activities.id))
    .where(
      and(
        eq(activities.profileId, profileId),
        activityResults.peakPower.isNotNull(),
      ),
    )
    .orderBy(desc(activityResults.peakPower))
    .limit(1);

  const [speedBest] = await db
    .select()
    .from(activityResults)
    .innerJoin(activities, eq(activityResults.activityId, activities.id))
    .where(
      and(
        eq(activities.profileId, profileId),
        activityResults.maxSpeed.isNotNull(),
      ),
    )
    .orderBy(desc(activityResults.maxSpeed))
    .limit(1);

  const [distanceBest] = await db
    .select()
    .from(activityResults)
    .innerJoin(activities, eq(activityResults.activityId, activities.id))
    .where(
      and(
        eq(activities.profileId, profileId),
        activityResults.distance.isNotNull(),
      ),
    )
    .orderBy(desc(activityResults.distance))
    .limit(1);

  return {
    maxPower: powerBest,
    maxSpeed: speedBest,
    maxDistance: distanceBest,
  };
}
