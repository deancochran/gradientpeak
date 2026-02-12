import type { TrainingGoal } from "../schemas/training_plan_structure";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface DerivePlanTimelineInput {
  goals: Array<Pick<TrainingGoal, "target_date">>;
  plan_start_date?: string;
  today_date?: string;
}

export interface DerivedPlanTimeline {
  start_date: string;
  end_date: string;
}

/**
 * Derives the effective training plan timeline from goals and optional explicit start date.
 */
export function derivePlanTimeline(
  input: DerivePlanTimelineInput,
): DerivedPlanTimeline {
  const endDate = getLatestGoalDate(input.goals);
  const fallbackStartDate = resolveTodayDateOnly(input.today_date);
  const startDate = input.plan_start_date ?? fallbackStartDate;

  if (startDate > endDate) {
    throw new Error(
      `plan_start_date must be on or before the latest goal target_date (${endDate})`,
    );
  }

  return {
    start_date: startDate,
    end_date: endDate,
  };
}

export function getLatestGoalDate(
  goals: Array<Pick<TrainingGoal, "target_date">>,
): string {
  const sorted = [...goals].sort((a, b) =>
    a.target_date.localeCompare(b.target_date),
  );
  const latest = sorted[sorted.length - 1];
  if (!latest) {
    throw new Error("At least one goal is required");
  }

  return latest.target_date;
}

function resolveTodayDateOnly(todayDate?: string): string {
  if (todayDate !== undefined) {
    if (!DATE_ONLY_PATTERN.test(todayDate)) {
      throw new Error("today_date must be in YYYY-MM-DD format");
    }

    return todayDate;
  }

  return new Date().toISOString().slice(0, 10);
}
