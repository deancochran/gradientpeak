import { z } from "zod";
import { parseMmSsToSeconds } from "../utils/fitness-inputs";
import { parseDateOnly, parseDistanceKmToMeters, parseGoalDurationSeconds } from "./parsers";
import type {
  GoalForValidation,
  GoalTargetForValidation,
  TrainingPlanFormForValidation,
} from "./types";

export const MIN_PREP_DAYS_BETWEEN_GOALS = 21;
export const MAX_SAFE_WEEKLY_TSS_RAMP_PCT = 20;
export const MAX_SAFE_CTL_RAMP_PER_WEEK = 8;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const goalTargetValidationSchema = z
  .object({
    id: z.string().min(1),
    targetType: z.enum(["race_performance", "pace_threshold", "power_threshold", "hr_threshold"]),
    activityCategory: z.enum(["run", "bike", "swim", "other"]).optional(),
    distanceKm: z.string().optional(),
    completionTimeHms: z.string().optional(),
    paceMmSs: z.string().optional(),
    testDurationHms: z.string().optional(),
    targetWatts: z.number().optional(),
    targetLthrBpm: z.number().optional(),
  })
  .superRefine((target, ctx) => {
    switch (target.targetType) {
      case "race_performance": {
        if (!target.activityCategory) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["activityCategory"],
            message: "Select an activity for race performance",
          });
        }
        if (!parseDistanceKmToMeters(target.distanceKm)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["distanceKm"],
            message: "Distance (km) must be greater than 0",
          });
        }
        if (!parseGoalDurationSeconds(target.completionTimeHms)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["completionTimeHms"],
            message: "Completion time must use h:mm:ss",
          });
        }
        break;
      }
      case "pace_threshold": {
        if (!target.activityCategory) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["activityCategory"],
            message: "Select an activity for pace threshold",
          });
        }
        if (!parseMmSsToSeconds(target.paceMmSs)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["paceMmSs"],
            message: "Pace must use mm:ss",
          });
        }
        if (!parseGoalDurationSeconds(target.testDurationHms)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["testDurationHms"],
            message: "Test duration must use h:mm:ss",
          });
        }
        break;
      }
      case "power_threshold": {
        if (!target.activityCategory) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["activityCategory"],
            message: "Select an activity for power threshold",
          });
        }
        if (!target.targetWatts || target.targetWatts <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["targetWatts"],
            message: "Target watts must be greater than 0",
          });
        }
        if (!parseGoalDurationSeconds(target.testDurationHms)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["testDurationHms"],
            message: "Test duration must use h:mm:ss",
          });
        }
        break;
      }
      case "hr_threshold": {
        if (!target.targetLthrBpm || target.targetLthrBpm <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["targetLthrBpm"],
            message: "LTHR must be greater than 0",
          });
        }
        break;
      }
    }
  });

export const goalValidationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    targetDate: z.string(),
    priority: z.number(),
    targets: z.array(goalTargetValidationSchema).min(1, "At least one target is required"),
  })
  .superRefine((goal, ctx) => {
    if (!goal.name.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "Goal name is required",
      });
    }
    if (!goal.targetDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetDate"],
        message: "Target date is required",
      });
    } else {
      const targetDate = new Date(goal.targetDate);
      if (!Number.isNaN(targetDate.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (targetDate < today) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["targetDate"],
            message: "Target date must be in the future",
          });
        }
      }
    }
    if (goal.priority < 0 || goal.priority > 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priority"],
        message: "Priority must be between 0 and 10",
      });
    }
  });

function hasTargetDetailIssue(target: GoalTargetForValidation): boolean {
  if (target.targetType === "race_performance") {
    return (
      !target.activityCategory ||
      !parseDistanceKmToMeters(target.distanceKm) ||
      !parseGoalDurationSeconds(target.completionTimeHms)
    );
  }
  if (target.targetType === "pace_threshold") {
    return (
      !target.activityCategory ||
      !parseMmSsToSeconds(target.paceMmSs) ||
      !parseGoalDurationSeconds(target.testDurationHms)
    );
  }
  if (target.targetType === "power_threshold") {
    return (
      !target.activityCategory ||
      !target.targetWatts ||
      target.targetWatts <= 0 ||
      !parseGoalDurationSeconds(target.testDurationHms)
    );
  }
  return !target.targetLthrBpm || target.targetLthrBpm <= 0;
}

export const trainingPlanFormGoalValidationSchema = z
  .object({
    planStartDate: z.string().optional(),
    goals: z.array(goalValidationSchema).min(1, "At least one goal is required"),
  })
  .superRefine((formData, ctx) => {
    const normalizedPlanStartDate = parseDateOnly(formData.planStartDate);
    if (formData.planStartDate && !normalizedPlanStartDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["planStartDate"],
        message: "Plan start date must use yyyy-mm-dd",
      });
    }

    if (normalizedPlanStartDate) {
      const latestGoalDate = formData.goals
        .map((goal) => goal.targetDate)
        .filter((targetDate) => DATE_ONLY_PATTERN.test(targetDate))
        .reduce<string | undefined>(
          (latest, targetDate) => (!latest || targetDate > latest ? targetDate : latest),
          undefined,
        );

      if (latestGoalDate && normalizedPlanStartDate > latestGoalDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["planStartDate"],
          message: "Plan start date must be on or before the latest goal target date",
        });
      }
    }

    if (
      formData.goals.some(
        (goal) =>
          goal.targets.length === 0 || goal.targets.some((target) => hasTargetDetailIssue(target)),
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["goals"],
        message: "Each goal must include valid target details",
      });
    }
  });

export type TrainingPlanFormGoalValidationData = z.infer<
  typeof trainingPlanFormGoalValidationSchema
>;

export function validateTrainingPlanFormGoals(
  formData: TrainingPlanFormForValidation,
): Record<string, string> {
  const parsed = trainingPlanFormGoalValidationSchema.safeParse(formData);
  if (parsed.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".");
    if (!path || errors[path]) continue;
    errors[path] = issue.message;
  }
  return errors;
}
