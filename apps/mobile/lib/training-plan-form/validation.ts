import type {
  CreationAvailabilityConfig,
  CreationFeasibilitySafetySummary,
} from "@repo/core";
import {
  parseDateOnly,
  parseDistanceKmToMeters,
  parseHmsToSeconds,
  parseMmSsToSeconds,
} from "./input-parsers";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_PREP_DAYS_BETWEEN_GOALS = 21;
export const MAX_SAFE_WEEKLY_TSS_RAMP_PCT = 20;
export const MAX_SAFE_CTL_RAMP_PER_WEEK = 8;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface GoalTargetForValidation {
  targetType:
    | "race_performance"
    | "pace_threshold"
    | "power_threshold"
    | "hr_threshold";
  activityCategory?: "run" | "bike" | "swim" | "other";
  distanceKm?: string;
  completionTimeHms?: string;
  paceMmSs?: string;
  testDurationHms?: string;
  targetWatts?: number;
  targetLthrBpm?: number;
}

interface GoalForValidation {
  name: string;
  targetDate: string;
  priority: number;
  targets: GoalTargetForValidation[];
}

interface TrainingPlanFormForValidation {
  planStartDate?: string;
  goals: GoalForValidation[];
}

export interface BlockingConflictLike {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  suggestions: string[];
}

export interface BlockingIssue {
  code: string;
  message: string;
  suggestions: string[];
}

const SUPPRESSED_OBSERVATION_CODES = new Set<string>([
  "required_tss_ramp_exceeds_cap",
  "required_ctl_ramp_exceeds_cap",
]);

export function validateTrainingPlanForm(
  formData: TrainingPlanFormForValidation,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!formData.goals.length) {
    errors.goals = "At least one goal is required";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  formData.goals.forEach((goal, goalIndex) => {
    if (!goal.name.trim()) {
      errors[`goals.${goalIndex}.name`] = "Goal name is required";
    }

    if (!goal.targetDate) {
      errors[`goals.${goalIndex}.targetDate`] = "Target date is required";
    } else {
      const targetDate = new Date(goal.targetDate);
      if (targetDate < today) {
        errors[`goals.${goalIndex}.targetDate`] =
          "Target date must be in the future";
      }
    }

    if (goal.priority < 0 || goal.priority > 10) {
      errors[`goals.${goalIndex}.priority`] =
        "Priority must be between 0 and 10";
    }

    if (!goal.targets.length) {
      errors[`goals.${goalIndex}.targets`] = "At least one target is required";
      return;
    }

    goal.targets.forEach((target, targetIndex) => {
      switch (target.targetType) {
        case "race_performance": {
          if (!target.activityCategory) {
            errors[
              `goals.${goalIndex}.targets.${targetIndex}.activityCategory`
            ] = "Select an activity for race performance";
          }
          const distanceM = parseDistanceKmToMeters(target.distanceKm);
          if (!distanceM) {
            errors[`goals.${goalIndex}.targets.${targetIndex}.distanceKm`] =
              "Distance (km) must be greater than 0";
          }
          const targetTimeS = parseHmsToSeconds(target.completionTimeHms ?? "");
          if (!targetTimeS) {
            errors[
              `goals.${goalIndex}.targets.${targetIndex}.completionTimeHms`
            ] = "Completion time must use h:mm:ss";
          }
          break;
        }
        case "pace_threshold": {
          const paceSeconds = parseMmSsToSeconds(target.paceMmSs ?? "");
          if (!paceSeconds) {
            errors[`goals.${goalIndex}.targets.${targetIndex}.paceMmSs`] =
              "Pace must use mm:ss";
          }
          if (!target.activityCategory) {
            errors[
              `goals.${goalIndex}.targets.${targetIndex}.activityCategory`
            ] = "Select an activity for pace threshold";
          }
          const testDurationS = parseHmsToSeconds(target.testDurationHms ?? "");
          if (!testDurationS) {
            errors[
              `goals.${goalIndex}.targets.${targetIndex}.testDurationHms`
            ] = "Test duration must use h:mm:ss";
          }
          break;
        }
        case "power_threshold": {
          if (!target.targetWatts || target.targetWatts <= 0) {
            errors[`goals.${goalIndex}.targets.${targetIndex}.targetWatts`] =
              "Target watts must be greater than 0";
          }
          if (!target.activityCategory) {
            errors[
              `goals.${goalIndex}.targets.${targetIndex}.activityCategory`
            ] = "Select an activity for power threshold";
          }
          const testDurationS = parseHmsToSeconds(target.testDurationHms ?? "");
          if (!testDurationS) {
            errors[
              `goals.${goalIndex}.targets.${targetIndex}.testDurationHms`
            ] = "Test duration must use h:mm:ss";
          }
          break;
        }
        case "hr_threshold": {
          if (!target.targetLthrBpm || target.targetLthrBpm <= 0) {
            errors[`goals.${goalIndex}.targets.${targetIndex}.targetLthrBpm`] =
              "LTHR must be greater than 0";
          }
          break;
        }
      }
    });
  });

  const normalizedPlanStartDate = parseDateOnly(formData.planStartDate);
  if (formData.planStartDate && !normalizedPlanStartDate) {
    errors.planStartDate = "Plan start date must use yyyy-mm-dd";
  }

  if (normalizedPlanStartDate) {
    const latestGoalDate = formData.goals
      .map((goal) => goal.targetDate)
      .filter((targetDate) => DATE_ONLY_PATTERN.test(targetDate))
      .reduce<string | undefined>((latest, targetDate) => {
        if (!latest || targetDate > latest) {
          return targetDate;
        }
        return latest;
      }, undefined);

    if (latestGoalDate && normalizedPlanStartDate > latestGoalDate) {
      errors.planStartDate =
        "Plan start date must be on or before the latest goal target date";
    }
  }

  if (Object.keys(errors).some((key) => key.includes(".targets"))) {
    errors.goals =
      errors.goals ?? "Each goal must include valid target details";
  }

  return errors;
}

export function getAvailableTrainingDays(config: {
  availabilityConfig: CreationAvailabilityConfig;
  constraints: {
    hard_rest_days: CreationAvailabilityConfig["days"][number]["day"][];
  };
}): number {
  const availableDays = new Set(
    config.availabilityConfig.days
      .filter((day) => day.windows.length > 0 && (day.max_sessions ?? 0) > 0)
      .map((day) => day.day),
  );
  for (const day of config.constraints.hard_rest_days) {
    availableDays.delete(day);
  }
  return availableDays.size;
}

export function getMinimumGoalGapDays(
  goals: Array<{ targetDate: string }>,
): number | undefined {
  const sortedGoalDates = goals
    .map((goal) => goal.targetDate)
    .filter((targetDate) => DATE_ONLY_PATTERN.test(targetDate))
    .sort((a, b) => a.localeCompare(b));

  if (sortedGoalDates.length < 2) {
    return undefined;
  }

  let minimumGapDays = Number.POSITIVE_INFINITY;

  for (let index = 0; index < sortedGoalDates.length - 1; index += 1) {
    const currentDate = sortedGoalDates[index];
    const nextDate = sortedGoalDates[index + 1];
    if (!currentDate || !nextDate) {
      continue;
    }

    const currentDateUtc = new Date(`${currentDate}T00:00:00Z`);
    const nextDateUtc = new Date(`${nextDate}T00:00:00Z`);
    const gapDays = Math.floor(
      (nextDateUtc.getTime() - currentDateUtc.getTime()) / DAY_MS,
    );

    if (gapDays < minimumGapDays) {
      minimumGapDays = gapDays;
    }
  }

  return Number.isFinite(minimumGapDays) ? minimumGapDays : undefined;
}

export function getTopBlockingIssues(input: {
  conflictItems: BlockingConflictLike[];
  feasibilitySafetySummary?: CreationFeasibilitySafetySummary;
  limit?: number;
}): BlockingIssue[] {
  const limit = input.limit ?? 3;
  const dedupe = new Set<string>();
  const merged: BlockingIssue[] = [];

  for (const conflict of input.conflictItems) {
    if (conflict.severity !== "blocking") {
      continue;
    }
    if (SUPPRESSED_OBSERVATION_CODES.has(conflict.code)) {
      continue;
    }
    const key = `${conflict.code}:${conflict.message.trim().toLowerCase()}`;
    if (dedupe.has(key)) {
      continue;
    }
    dedupe.add(key);
    merged.push({
      code: conflict.code,
      message: conflict.message,
      suggestions: conflict.suggestions,
    });
  }

  const blockers = input.feasibilitySafetySummary?.blockers ?? [];
  for (const blocker of blockers) {
    if (SUPPRESSED_OBSERVATION_CODES.has(blocker.code)) {
      continue;
    }
    const key = `${blocker.code}:${blocker.message.trim().toLowerCase()}`;
    if (dedupe.has(key)) {
      continue;
    }
    dedupe.add(key);
    merged.push({
      code: blocker.code,
      message: blocker.message,
      suggestions: [],
    });
  }

  return merged.slice(0, limit);
}

export function getCreateDisabledReason(
  blockingIssues: BlockingIssue[],
): string | undefined {
  if (blockingIssues.length === 0) {
    return undefined;
  }

  if (blockingIssues.length === 1) {
    return "Create is disabled until 1 blocking conflict is resolved.";
  }

  return `Create is disabled until ${blockingIssues.length} blocking conflicts are resolved.`;
}
