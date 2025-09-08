// ================================
// @turbofit/core/trainingPlan
// ================================

import { addDays } from "date-fns";
import { dbClient } from "../db"; // your database client (Supabase/Drizzle/Prisma)
import {
  plannedActivityStructureSchema,
  type PlannedActivityStructure,
} from "../schemas/planned_activity";
import {
  ProfilePlanConfig,
  type WeeklySchedule,
} from "../schemas/profile_plan";

// ================================
// Planned Activity Generator
// ================================
export function createPlannedActivity(
  name: string,
  modality: PlannedActivityStructure["modality"],
  steps: PlannedActivityStructure["steps"],
  notes?: string,
): PlannedActivityStructure {
  return plannedActivityStructureSchema.parse({
    name,
    modality,
    steps,
    notes,
  });
}

// ================================
// Weekly Schedule Generator
// ================================
export function createWeeklySchedule(
  weekNumber: number,
  workouts: PlannedActivityStructure[],
  weeklyTargets?: Partial<WeeklySchedule["targets"]>,
): WeeklySchedule {
  return {
    weekNumber,
    workouts: workouts.map((w, i) => ({
      dayOfWeek: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ][i % 7] as any,
      key: "standard",
      workoutTemplate: w,
    })),
    targets: weeklyTargets ?? { weeklyTSS: 0 },
  };
}

// ================================
// Full Plan Generator
// ================================
export function generateProfilePlan(
  startDate: string,
  numWeeks: number,
  workoutsPerWeek: PlannedActivityStructure[][],
  config?: Partial<ProfilePlanConfig>,
): ProfilePlanConfig {
  const schedule: WeeklySchedule[] = [];
  for (let i = 0; i < numWeeks; i++) {
    schedule.push(
      createWeeklySchedule(
        i + 1,
        workoutsPerWeek[i] || [],
        config?.weeklyTargets?.[i] || undefined,
      ),
    );
  }

  return profilePlanConfigSchema.parse({
    version: "1.0",
    startDate,
    schedule,
    ...config,
  });
}

// ================================
// Adaptive Scaling
// ================================
export function adaptWeeklyPlan(
  week: WeeklySchedule,
  profile: { intensityMultiplier?: number },
  locked: boolean = false,
): WeeklySchedule {
  if (locked) return week;

  const multiplier = profile.intensityMultiplier ?? 1;

  week.workouts.forEach((w) => {
    // Example: scale estimated TSS if present
    if ("estimated_tss" in w.workoutTemplate) {
      (w.workoutTemplate as any).estimated_tss =
        ((w.workoutTemplate as any).estimated_tss ?? 0) * multiplier;
    }
  });

  return week;
}

// ================================
// Database Integration
// ================================
export const trainingPlanDB = {
  async createPlannedActivity(
    profileId: string,
    planId: string | null,
    activity: PlannedActivityStructure,
    scheduledDate: string,
  ) {
    return dbClient.planned_activities.create({
      data: {
        profile_id: profileId,
        profile_plan_id: planId,
        scheduled_date: scheduledDate,
        name: activity.name,
        activity_type: activity.modality,
        structure: activity,
        structure_version: activity.version,
        requires_ftp: false,
        requires_threshold_hr: false,
      },
    });
  },

  async getUpcomingActivities(profileId: string) {
    return dbClient.planned_activities.findMany({
      where: { profile_id: profileId, scheduled_date: { gte: new Date() } },
      orderBy: { scheduled_date: "asc" },
    });
  },

  async getActivityHistory(profileId: string) {
    return dbClient.activity_results.findMany({
      where: { profile_id: profileId },
      orderBy: { started_at: "desc" },
    });
  },

  async getPlannedActivityDetails(activityId: string) {
    return dbClient.planned_activities.findUnique({
      where: { id: activityId },
    });
  },

  async lockWeekActivities(planId: string, weekNumber: number) {
    const weekActivities = await dbClient.planned_activities.findMany({
      where: {
        profile_plan_id: planId,
        scheduled_date: { gte: addDays(new Date(), (weekNumber - 1) * 7) },
      },
    });
    return Promise.all(
      weekActivities.map((a) =>
        dbClient.planned_activities.update({
          where: { id: a.id },
          data: { locked_at: new Date() },
        }),
      ),
    );
  },
};

// ================================
// Utility Functions
// ================================
export function estimateWeeklyTSS(week: WeeklySchedule): number {
  return week.workouts.reduce(
    (sum, w) => sum + ((w.workoutTemplate as any).estimated_tss ?? 0),
    0,
  );
}
