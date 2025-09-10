import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { plannedActivities, profilePlans } from "../schemas";

export async function createProfilePlan(
  planData: Omit<
    typeof profilePlans.$inferInsert,
    "id" | "idx" | "createdAt" | "updatedAt"
  >,
) {
  const [plan] = await db.insert(profilePlans).values(planData).returning();
  return plan;
}

export async function getProfilePlanById(planId: string) {
  const [plan] = await db
    .select()
    .from(profilePlans)
    .where(eq(profilePlans.id, planId));
  return plan;
}

export async function getProfilePlansByProfile(
  profileId: string,
  limit = 10,
  offset = 0,
) {
  return await db
    .select()
    .from(profilePlans)
    .where(eq(profilePlans.profileId, profileId))
    .orderBy(desc(profilePlans.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getActiveProfilePlans(profileId: string) {
  return await db
    .select()
    .from(profilePlans)
    .where(
      and(eq(profilePlans.profileId, profileId), eq(profilePlans.active, true)),
    )
    .orderBy(desc(profilePlans.createdAt));
}

export async function updateProfilePlan(
  planId: string,
  updates: Partial<typeof profilePlans.$inferInsert>,
) {
  const [updatedPlan] = await db
    .update(profilePlans)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(profilePlans.id, planId))
    .returning();
  return updatedPlan;
}

export async function activateProfilePlan(planId: string) {
  // First, deactivate all other plans for this profile
  const [plan] = await db
    .select()
    .from(profilePlans)
    .where(eq(profilePlans.id, planId));
  if (!plan) {
    throw new Error("Profile plan not found");
  }

  return await db.transaction(async (tx) => {
    // Deactivate all other plans for this profile
    await tx
      .update(profilePlans)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(profilePlans.profileId, plan.profileId),
          eq(profilePlans.active, true),
        ),
      );

    // Activate the selected plan
    const [activatedPlan] = await tx
      .update(profilePlans)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(profilePlans.id, planId))
      .returning();

    return activatedPlan;
  });
}

export async function deactivateProfilePlan(planId: string) {
  const [deactivatedPlan] = await db
    .update(profilePlans)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(profilePlans.id, planId))
    .returning();
  return deactivatedPlan;
}

export async function deleteProfilePlan(planId: string) {
  const [deletedPlan] = await db
    .delete(profilePlans)
    .where(eq(profilePlans.id, planId))
    .returning();
  return deletedPlan;
}

export async function getProfilePlanWithActivities(planId: string) {
  const plan = await db
    .select()
    .from(profilePlans)
    .where(eq(profilePlans.id, planId));

  if (!plan[0]) {
    return null;
  }

  const activities = await db
    .select()
    .from(plannedActivities)
    .where(eq(plannedActivities.profilePlanId, planId))
    .orderBy(plannedActivities.plannedDate);

  return {
    plan: plan[0],
    activities,
  };
}

export async function getCurrentActivePlan(profileId: string) {
  const [activePlan] = await db
    .select()
    .from(profilePlans)
    .where(
      and(eq(profilePlans.profileId, profileId), eq(profilePlans.active, true)),
    );

  return activePlan;
}

export async function getProfilePlansByDateRange(
  profileId: string,
  startDate: Date,
  endDate: Date,
) {
  return await db
    .select()
    .from(profilePlans)
    .where(
      and(
        eq(profilePlans.profileId, profileId),
        gte(profilePlans.startDate, startDate),
        lte(profilePlans.endDate, endDate),
      ),
    )
    .orderBy(profilePlans.startDate);
}

export async function duplicateProfilePlan(planId: string, newName?: string) {
  return await db.transaction(async (tx) => {
    // Get the original plan
    const [originalPlan] = await tx
      .select()
      .from(profilePlans)
      .where(eq(profilePlans.id, planId));

    if (!originalPlan) {
      throw new Error("Profile plan not found");
    }

    // Create new plan
    const planData = {
      ...originalPlan,
      name: newName || `${originalPlan.name} (Copy)`,
      active: false,
    };
    delete (planData as any).id;
    delete (planData as any).idx;
    delete (planData as any).createdAt;
    delete (planData as any).updatedAt;

    const [newPlan] = await tx
      .insert(profilePlans)
      .values(planData)
      .returning();

    // Get original planned activities
    const originalActivities = await tx
      .select()
      .from(plannedActivities)
      .where(eq(plannedActivities.profilePlanId, planId));

    // Duplicate planned activities
    if (originalActivities.length > 0) {
      const activitiesData = originalActivities.map((activity) => {
        const activityData = { ...activity };
        delete (activityData as any).id;
        delete (activityData as any).idx;
        delete (activityData as any).createdAt;
        delete (activityData as any).updatedAt;
        activityData.profilePlanId = newPlan.id;
        return activityData;
      });

      await tx.insert(plannedActivities).values(activitiesData);
    }

    return newPlan;
  });
}
