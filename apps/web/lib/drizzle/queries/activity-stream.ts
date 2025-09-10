import { db } from "@/lib/drizzle";
import { activityStreams } from "@repo/drizzle/schemas";
import { and, eq } from "drizzle-orm";

export async function createActivityStream(
  streamData: Omit<
    typeof activityStreams.$inferInsert,
    "id" | "idx" | "createdAt" | "updatedAt"
  >,
) {
  const [stream] = await db
    .insert(activityStreams)
    .values(streamData)
    .returning();
  return stream;
}

export async function getActivityStream(
  activityId: string,
  streamType: string,
) {
  const [stream] = await db
    .select()
    .from(activityStreams)
    .where(
      and(
        eq(activityStreams.activityId, activityId),
        eq(activityStreams.type, streamType),
      ),
    );
  return stream;
}

export async function getActivityStreams(activityId: string) {
  return await db
    .select()
    .from(activityStreams)
    .where(eq(activityStreams.activityId, activityId));
}

export async function createMultipleStreams(
  streamDataArray: Array<
    Omit<
      typeof activityStreams.$inferInsert,
      "id" | "idx" | "createdAt" | "updatedAt"
    >
  >,
) {
  if (streamDataArray.length === 0) return [];

  return await db.insert(activityStreams).values(streamDataArray).returning();
}

export async function getPowerStream(activityId: string) {
  return await getActivityStream(activityId, "power");
}

export async function getHeartRateStream(activityId: string) {
  return await getActivityStream(activityId, "heartrate");
}

export async function getLocationStream(activityId: string) {
  return await getActivityStream(activityId, "latlng");
}

export async function getDistanceStream(activityId: string) {
  return await getActivityStream(activityId, "distance");
}

export async function getCadenceStream(activityId: string) {
  return await getActivityStream(activityId, "cadence");
}

export async function getSpeedStream(activityId: string) {
  return await getActivityStream(activityId, "velocity_smooth");
}

export async function getAltitudeStream(activityId: string) {
  return await getActivityStream(activityId, "altitude");
}

export async function getTemperatureStream(activityId: string) {
  return await getActivityStream(activityId, "temp");
}

export async function updateActivityStream(
  activityId: string,
  streamType: string,
  updates: Partial<typeof activityStreams.$inferInsert>,
) {
  const [updatedStream] = await db
    .update(activityStreams)
    .set({ ...updates, updatedAt: new Date() })
    .where(
      and(
        eq(activityStreams.activityId, activityId),
        eq(activityStreams.type, streamType),
      ),
    )
    .returning();
  return updatedStream;
}

export async function deleteActivityStream(
  activityId: string,
  streamType: string,
) {
  const [deletedStream] = await db
    .delete(activityStreams)
    .where(
      and(
        eq(activityStreams.activityId, activityId),
        eq(activityStreams.type, streamType),
      ),
    )
    .returning();
  return deletedStream;
}

export async function deleteAllActivityStreams(activityId: string) {
  return await db
    .delete(activityStreams)
    .where(eq(activityStreams.activityId, activityId))
    .returning();
}

export async function getStreamTypes(activityId: string) {
  return await db
    .select({ type: activityStreams.type })
    .from(activityStreams)
    .where(eq(activityStreams.activityId, activityId));
}

export async function getStreamDataSize(activityId: string) {
  return await db
    .select({
      type: activityStreams.type,
      originalSize: activityStreams.originalSize,
      resolution: activityStreams.resolution,
    })
    .from(activityStreams)
    .where(eq(activityStreams.activityId, activityId));
}
