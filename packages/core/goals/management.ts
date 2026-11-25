import { formatDeviceCalendarDate } from "../calendar";
import { dateOnlySchema } from "../schemas/date-only";
import type { ProfileGoal } from "../schemas/goals/profile_goals";
import type { GoalEditorDraft } from "./draft";

export type GoalLifecycleStatus = "draft" | "ready" | "in_progress" | "completed" | "needs_update";

export type GoalQualityFeedback = {
  status: GoalLifecycleStatus;
  label: string;
  message: string;
  missing: string[];
  canGuidePlan: boolean;
};

function getTodayKey(input: { today?: Date; todayDate?: string }) {
  // UI dates are device-calendar dates. Planning callers can inject their own
  // already-resolved calendar day, without relying on the process timezone.
  return dateOnlySchema.parse(
    input.todayDate ?? formatDeviceCalendarDate(input.today ?? new Date()),
  );
}

function isFutureOrToday(dateKey: string, todayKey: string) {
  return dateKey >= todayKey;
}

function hasDraftTarget(draft: GoalEditorDraft): boolean {
  switch (draft.goalType) {
    case "race_performance":
      return (
        typeof draft.raceDistanceKm === "number" &&
        draft.raceDistanceKm > 0 &&
        ((draft.raceTargetMode ?? "time") === "time"
          ? !!draft.targetDuration?.trim()
          : !!draft.targetPace?.trim())
      );
    case "completion":
      return (
        (typeof draft.raceDistanceKm === "number" && draft.raceDistanceKm > 0) ||
        !!draft.targetDuration?.trim()
      );
    case "pace_threshold":
      return !!draft.targetPace?.trim();
    case "power_threshold":
      return typeof draft.targetWatts === "number" && draft.targetWatts > 0;
    case "hr_threshold":
      return typeof draft.targetBpm === "number" && draft.targetBpm > 0;
    case "consistency":
      return (
        (typeof draft.consistencySessionsPerWeek === "number" &&
          draft.consistencySessionsPerWeek > 0) ||
        (typeof draft.consistencyWeeks === "number" && draft.consistencyWeeks > 0)
      );
  }
}

export function getGoalDraftQualityFeedback(input: {
  draft: GoalEditorDraft;
  today?: Date;
  todayDate?: string;
}): GoalQualityFeedback {
  const { draft } = input;
  const todayKey = getTodayKey(input);
  const missing: string[] = [];

  if (!draft.title.trim()) missing.push("name");
  if (!dateOnlySchema.safeParse(draft.targetDate).success) missing.push("date");
  if (!hasDraftTarget(draft)) missing.push("target");

  if (
    dateOnlySchema.safeParse(draft.targetDate).success &&
    !isFutureOrToday(draft.targetDate, todayKey)
  ) {
    return {
      status: "needs_update",
      label: "Needs update",
      message: "Move the date forward before this goal guides your plan.",
      missing,
      canGuidePlan: false,
    };
  }

  if (missing.length > 0) {
    return {
      status: "draft",
      label: "Draft",
      message: `Add ${missing.join(", ")} to make this goal plan-ready.`,
      missing,
      canGuidePlan: false,
    };
  }

  return {
    status: "ready",
    label: "Plan-ready",
    message: "This goal has enough detail to guide training.",
    missing,
    canGuidePlan: true,
  };
}

export function getProfileGoalLifecycleStatus(input: {
  goal: ProfileGoal;
  today?: Date;
  todayDate?: string;
}): GoalQualityFeedback {
  const { goal } = input;
  const todayKey = getTodayKey(input);

  if (goal.target_date < todayKey) {
    return {
      status: "completed",
      label: "Completed",
      message: "This goal date has passed.",
      missing: [],
      canGuidePlan: false,
    };
  }

  return {
    status: "in_progress",
    label: "In progress",
    message: "This goal is active in your planning window.",
    missing: [],
    canGuidePlan: true,
  };
}
