// ================================
// @turbofit/core/trainingPlan
// ================================
import {
  plannedActivityStructureSchema,
  type WeeklySchedule,
  type PlannedActivityStructure,
  type Step,
} from "@repo/core";
import { db } from "..";

// A type for more explicit day scheduling
type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
type ScheduledWorkout = {
  day: DayOfWeek;
  workout: PlannedActivityStructure;
  key?: "priority" | "standard" | "optional";
};

// ================================
// Planned Activity Generator
// ================================
export function createPlannedActivity(
  name: string,
  steps: PlannedActivityStructure["steps"],
  description?: string,
): PlannedActivityStructure {
  return plannedActivityStructureSchema.parse({
    name,
    steps,
    description,
  });
}

// ================================
// Weekly Schedule Generator (Refactored)
// ================================
export function createWeeklySchedule(
  weekNumber: number,
  scheduledWorkouts: ScheduledWorkout[],
  weeklyTargets?: Partial<WeeklySchedule["targets"]>,
): WeeklySchedule {
  return {
    weekNumber,
    workouts: scheduledWorkouts.map((sw) => ({
      dayOfWeek: sw.day,
      key: sw.key ?? "standard",
      workoutTemplate: sw.workout,
    })),
    targets: weeklyTargets ?? { tss: 0 },
  };
}

// =_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=
// TSS Estimation Logic (Refactored)
// =_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=_=

/**
 * Estimates the TSS for a single workout structure based on user's FTP.
 * Note: This is a simplified estimation. A true NP calculation is more complex.
 */
function estimateWorkoutTSS(
  workout: PlannedActivityStructure,
  ftp: number,
): number {
  if (!ftp || ftp <= 0) return 0;

  let totalTSS = 0;

  const calculateStepTSS = (step: Step) => {
    if (
      !step.intensity ||
      !step.intensity.target ||
      step.duration.type !== "time"
    ) {
      return 0;
    }

    const durationInSeconds = step.duration.value;
    let intensityInWatts = 0;

    if (step.intensity.type === "%FTP") {
      intensityInWatts = ftp * (step.intensity.target / 100);
    } else if (step.intensity.type === "watts") {
      intensityInWatts = step.intensity.target;
    } else {
      // Other intensity types (HR, RPE) are harder to estimate TSS from without more data.
      // For this estimation, we only consider FTP/watt-based targets.
      return 0;
    }

    const intensityFactor = intensityInWatts / ftp;
    const stepTSS =
      ((durationInSeconds * intensityFactor * intensityFactor) / (ftp * 3600)) *
      100;
    return isNaN(stepTSS) ? 0 : stepTSS;
  };

  for (const item of workout.steps) {
    // Check if it's a repetition block
    if ("repeat" in item && "steps" in item) {
      for (let i = 0; i < item.repeat; i++) {
        for (const subStep of item.steps) {
          totalTSS += calculateStepTSS(subStep);
        }
      }
    } else {
      // It's a single step
      totalTSS += calculateStepTSS(item as Step);
    }
  }

  return Math.round(totalTSS);
}

/**
 * Estimates the total weekly TSS by summing the estimated TSS of each workout.
 */
export function estimateWeeklyTSS(week: WeeklySchedule, ftp: number): number {
  return week.workouts.reduce(
    (sum, w) => sum + estimateWorkoutTSS(w.workoutTemplate, ftp),
    0,
  );
}

// ================================
// Adaptive Scaling (Refactored)
// ================================
export function adaptWeeklyPlan(
  week: WeeklySchedule,
  intensityMultiplier: number = 1.0,
): WeeklySchedule {
  // Deep copy the week to avoid mutating the original object
  const adaptedWeek = JSON.parse(JSON.stringify(week));

  adaptedWeek.workouts.forEach((w: any) => {
    w.workoutTemplate.steps.forEach((step: any) => {
      if (step.intensity && step.intensity.target) {
        // Only scale scalable intensity types
        if (["%FTP", "watts"].includes(step.intensity.type)) {
          step.intensity.target *= intensityMultiplier;
          if (step.intensity.min) step.intensity.min *= intensityMultiplier;
          if (step.intensity.max) step.intensity.max *= intensityMultiplier;
        }
      }
      // Also check within repetition blocks
      if (step.steps) {
        step.steps.forEach((subStep: any) => {
          if (subStep.intensity && subStep.intensity.target) {
            if (["%FTP", "watts"].includes(subStep.intensity.type)) {
              subStep.intensity.target *= intensityMultiplier;
              if (subStep.intensity.min)
                subStep.intensity.min *= intensityMultiplier;
              if (subStep.intensity.max)
                subStep.intensity.max *= intensityMultiplier;
            }
          }
        });
      }
    });
  });

  return adaptedWeek;
}

// ================================
// Database Integration (Refactored)
// ================================
export const trainingPlanDB = {
  async createPlannedActivity(
    profileId: string,
    planId: string | null,
    activity: PlannedActivityStructure,
    scheduledDate: string,
  ) {
    // Correctly determine requirements by inspecting the workout structure
    const requiresFtp = activity.steps.some((step) => {
      const steps = (step as any).steps || [step];
      return steps.some((s: any) => s.intensity?.type === "%FTP");
    });
    const requiresThresholdHr = activity.steps.some((step) => {
      const steps = (step as any).steps || [step];
      return steps.some((s: any) => s.intensity?.type === "%ThresholdHR");
    });

    // Here you would also call a function to get estimated TSS and duration
    // const estimated_tss = estimateWorkoutTSS(activity, user_ftp_from_db);
    // const estimated_duration = ...

    return db.planned_activities.create();
  },
