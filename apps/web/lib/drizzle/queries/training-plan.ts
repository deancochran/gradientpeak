// ================================
// Training Plan Database Operations
// ================================

import { eq } from "drizzle-orm";

import { db } from "@/lib/drizzle";
import { plannedActivities } from "@repo/drizzle/schemas";

// ================================
// Database Integration
// ================================
export const trainingPlanDB = {
  async createPlannedActivity(
    profileId: string,
    planId: string | null,
    activity: PlannedActivityStructure,
    scheduledDate: string,
    activityType: "bike" | "run" | "swim" | "strength" | "other" = "bike",
    userFtp?: number,
  ) {
    // Use core logic to determine requirements
    const requiresFtp = requiresFTP(activity);
    const requiresThresholdHr = requiresThresholdHR(activity);

    // Calculate estimates using core functions
    const estimatedDuration = estimateActivityDuration(activity);
    const estimatedTss = userFtp ? estimateActivityTSS(activity, userFtp) : null;

    const [createdActivity] = await db
      .insert(plannedActivities)
      .values({
        profileId: profileId,
        profilePlanId: planId,
        name: activity.name,
        activityType: activityType,
        description: activity.description || null,
        structure: activity,
        scheduledDate: scheduledDate,
        requiresFtp: requiresFtp,
        requiresThresholdHr: requiresThresholdHr,
        estimatedDuration: estimatedDuration,
        estimatedTss: estimatedTss?.toString(),
        completionStatus: "pending",
      })
      .returning();

    return createdActivity;
  },

  async getPlannedActivitiesByPlan(planId: string) {
    return await db
      .select()
      .from(plannedActivities)
      .where(eq(plannedActivities.profilePlanId, planId))
      .orderBy(plannedActivities.scheduledDate);
  },

  async updatePlannedActivity(
    id: string,
    updates: Partial<
      PlannedActivityStructure & {
        scheduledDate?: string;
        activityType?: "bike" | "run" | "swim" | "strength" | "other";
      }
    >,
  ) {
    const updateData: any = {};

    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.steps) updateData.structure = { ...updates };
    if ((updates as any).scheduledDate)
      updateData.scheduledDate = (updates as any).scheduledDate;
    if ((updates as any).activityType)
      updateData.activityType = (updates as any).activityType;

    const [updatedActivity] = await db
      .update(plannedActivities)
      .set(updateData)
      .where(eq(plannedActivities.id, id))
      .returning();

    return updatedActivity;
  },

  async deletePlannedActivity(id: string) {
    const [deletedActivity] = await db
      .delete(plannedActivities)
      .where(eq(plannedActivities.id, id))
      .returning();

    return deletedActivity;
  },
};
