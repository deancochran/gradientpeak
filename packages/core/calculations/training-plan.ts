// Note: Schema validation can be added later if needed
import type {
  PlannedActivityStructure,
  Step,
  WeeklySchedule,
} from "../schemas";

// ================================
// TSS Estimation Logic
// ================================

/**
 * Estimates the TSS for a single activity structure based on user's FTP.
 * Note: This is a simplified estimation. A true NP calculation is more complex.
 */
export function estimateActivityTSS(
  activity: PlannedActivityStructure,
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

  for (const item of activity.steps) {
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
 * Estimates the total weekly TSS by summing the estimated TSS of each activity.
 */
export function estimateWeeklyTSS(week: WeeklySchedule, ftp: number): number {
  return week.activities.reduce(
    (sum, w) => sum + estimateActivityTSS(w.activityTemplate, ftp),
    0,
  );
}

// ================================
// Adaptive Scaling
// ================================
export function adaptWeeklyPlan(
  week: WeeklySchedule,
  intensityMultiplier: number = 1.0,
): WeeklySchedule {
  // Deep copy the week to avoid mutating the original object
  const adaptedWeek = JSON.parse(JSON.stringify(week));

  adaptedWeek.activities.forEach((w: any) => {
    w.activityTemplate.steps.forEach((step: any) => {
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
// Utility Functions
// ================================

/**
 * Determines if a activity requires FTP for intensity calculations
 */
export function requiresFTP(activity: PlannedActivityStructure): boolean {
  return activity.steps.some((step) => {
    const steps = (step as any).steps || [step];
    return steps.some((s: any) => s.intensity?.type === "%FTP");
  });
}

/**
 * Determines if a activity requires threshold HR for intensity calculations
 */
export function requiresThresholdHR(
  activity: PlannedActivityStructure,
): boolean {
  return activity.steps.some((step) => {
    const steps = (step as any).steps || [step];
    return steps.some((s: any) => s.intensity?.type === "%ThresholdHR");
  });
}

/**
 * Calculates estimated duration of a activity in seconds
 */
export function estimateActivityDuration(
  activity: PlannedActivityStructure,
): number {
  let totalDuration = 0;

  for (const item of activity.steps) {
    if ("repeat" in item && "steps" in item) {
      // Repetition block
      for (let i = 0; i < item.repeat; i++) {
        for (const step of item.steps) {
          if (step.duration.type === "time") {
            totalDuration += step.duration.value;
          }
        }
      }
    } else {
      // Single step
      const step = item as Step;
      if (step.duration.type === "time") {
        totalDuration += step.duration.value;
      }
    }
  }

  return totalDuration;
}

// ================================
// Missing Exports (placeholders)
// ================================

/**
 * Creates a new planned activity structure
 */
export function createNewPlannedActivity(
  name: string,
  modality: "endurance" | "strength" | "swim" | "other" = "endurance",
): PlannedActivityStructure {
  return {
    version: "1.0",
    name,
    modality,
    steps: [],
  };
}

/**
 * Creates a new weekly schedule
 */
export function createWeeklySchedule(week: number): WeeklySchedule {
  return {
    week,
    activities: [],
  };
}
