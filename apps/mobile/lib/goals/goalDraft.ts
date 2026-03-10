import {
  profileGoalCreateSchema,
  type CanonicalGoalActivityCategory,
  type ProfileGoal,
} from "@repo/core";

export interface GoalEditorDraft {
  title: string;
  targetDate: string;
  importance: number;
  goalType: string;
  targetMetric?: string | null;
  targetValue?: number | null;
  raceDistanceKm?: number | null;
}

const thresholdTestDurationSeconds = 1200;

function toPositiveNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function inferActivityCategoryFromTitle(
  title: string,
): CanonicalGoalActivityCategory {
  const normalized = title.trim().toLowerCase();

  if (
    normalized.includes("swim") ||
    normalized.includes("pool") ||
    normalized.includes("open water")
  ) {
    return "swim";
  }

  if (
    normalized.includes("bike") ||
    normalized.includes("ride") ||
    normalized.includes("cycling") ||
    normalized.includes("century") ||
    normalized.includes("ftp")
  ) {
    return "bike";
  }

  if (normalized.includes("triathlon")) {
    return "other";
  }

  return "run";
}

function inferDefaultRaceDistanceMeters(title: string): number {
  const normalized = title.trim().toLowerCase();

  if (normalized.includes("half marathon")) return 21100;
  if (normalized.includes("marathon")) return 42200;
  if (/\b10k\b/.test(normalized)) return 10000;
  if (/\b5k\b/.test(normalized)) return 5000;
  if (normalized.includes("century")) return 160900;
  return 5000;
}

function inferDefaultRaceTargetSeconds(input: {
  activityCategory: CanonicalGoalActivityCategory;
  distanceMeters: number;
}): number {
  const distanceKm = input.distanceMeters / 1000;

  if (input.activityCategory === "bike") {
    if (distanceKm >= 150) return 6 * 3600;
    if (distanceKm >= 80) return 3.5 * 3600;
    return 2 * 3600;
  }

  if (input.activityCategory === "swim") {
    if (distanceKm >= 3.8) return 90 * 60;
    if (distanceKm >= 1.5) return 35 * 60;
    return 20 * 60;
  }

  if (distanceKm >= 42.2) return 4 * 3600;
  if (distanceKm >= 21.1) return 2 * 3600;
  if (distanceKm >= 10) return 50 * 60;
  return 30 * 60;
}

export function buildGoalDraftFromGoal(input: {
  goal: ProfileGoal;
  targetDate?: string | null;
}): GoalEditorDraft {
  const { goal, targetDate } = input;

  if (goal.objective.type === "event_performance") {
    return {
      title: goal.title,
      targetDate: targetDate ?? "",
      importance: goal.priority,
      goalType: "race_performance",
      targetMetric:
        typeof goal.objective.target_time_s === "number"
          ? "target_time_s"
          : typeof goal.objective.target_speed_mps === "number"
            ? "target_speed_mps"
            : null,
      targetValue:
        goal.objective.target_time_s ?? goal.objective.target_speed_mps ?? null,
      raceDistanceKm:
        typeof goal.objective.distance_m === "number"
          ? Math.round((goal.objective.distance_m / 1000) * 10) / 10
          : null,
    };
  }

  if (goal.objective.type === "threshold") {
    const goalTypeByMetric = {
      pace: "pace_threshold",
      power: "power_threshold",
      hr: "hr_threshold",
    } as const;
    const targetMetricByMetric = {
      pace: "target_speed_mps",
      power: "target_watts",
      hr: "target_lthr_bpm",
    } as const;

    return {
      title: goal.title,
      targetDate: targetDate ?? "",
      importance: goal.priority,
      goalType: goalTypeByMetric[goal.objective.metric],
      targetMetric: targetMetricByMetric[goal.objective.metric],
      targetValue: goal.objective.value,
      raceDistanceKm: null,
    };
  }

  return {
    title: goal.title,
    targetDate: targetDate ?? "",
    importance: goal.priority,
    goalType: "general",
    targetMetric:
      goal.objective.type === "completion" && goal.objective.duration_s
        ? "target_time_s"
        : null,
    targetValue:
      goal.objective.type === "completion"
        ? (goal.objective.duration_s ?? null)
        : goal.objective.type === "consistency"
          ? (goal.objective.target_sessions_per_week ?? null)
          : null,
    raceDistanceKm:
      goal.objective.type === "completion" && goal.objective.distance_m
        ? Math.round((goal.objective.distance_m / 1000) * 10) / 10
        : null,
  };
}

export function buildGoalCreatePayload(input: {
  draft: GoalEditorDraft;
  profileId: string;
  milestoneEventId: string;
}) {
  const activityCategory = resolveGoalActivityCategory(input.draft);
  const targetPayload = buildGoalTargetPayload({
    draft: input.draft,
    activityCategory,
  });

  return profileGoalCreateSchema.parse({
    profile_id: input.profileId,
    milestone_event_id: input.milestoneEventId,
    title: input.draft.title.trim(),
    priority: Math.max(0, Math.min(10, input.draft.importance)),
    activity_category: activityCategory,
    target_payload: targetPayload,
  });
}

export function buildGoalUpdatePayload(input: {
  draft: GoalEditorDraft;
  milestoneEventId: string;
}) {
  const createPayload = buildGoalCreatePayload({
    draft: input.draft,
    profileId: "00000000-0000-0000-0000-000000000000",
    milestoneEventId: input.milestoneEventId,
  });

  return {
    milestone_event_id: createPayload.milestone_event_id,
    title: createPayload.title,
    priority: createPayload.priority,
    activity_category: createPayload.activity_category,
    target_payload: createPayload.target_payload,
  };
}

export function buildMilestoneEventCreateInput(input: {
  draft: GoalEditorDraft;
  trainingPlanId?: string | null;
}) {
  const eventType =
    input.draft.goalType === "race_performance"
      ? ("race_target" as const)
      : ("custom" as const);

  return {
    title: input.draft.title.trim(),
    starts_at: `${input.draft.targetDate}T12:00:00.000Z`,
    all_day: true,
    timezone: "UTC",
    training_plan_id: input.trainingPlanId ?? undefined,
    event_type: eventType,
  };
}

export function buildMilestoneEventUpdatePatch(input: {
  draft: GoalEditorDraft;
  trainingPlanId?: string | null;
}) {
  const eventType =
    input.draft.goalType === "race_performance"
      ? ("race_target" as const)
      : ("custom" as const);

  return {
    title: input.draft.title.trim(),
    starts_at: `${input.draft.targetDate}T12:00:00.000Z`,
    all_day: true,
    timezone: "UTC",
    training_plan_id: input.trainingPlanId ?? null,
    event_type: eventType,
  };
}

export function formatGoalTypeLabel(goal: ProfileGoal): string {
  switch (goal.objective.type) {
    case "event_performance":
      return "Race";
    case "threshold":
      if (goal.objective.metric === "pace") return "Pace";
      if (goal.objective.metric === "power") return "Power";
      return "Heart Rate";
    case "completion":
      return "Completion";
    case "consistency":
      return "Consistency";
  }
}

export function getGoalMetricSummary(goal: ProfileGoal): {
  label: string;
  value: string;
} {
  switch (goal.objective.type) {
    case "event_performance":
      if (typeof goal.objective.target_time_s === "number") {
        return {
          label: "Target time",
          value: `${goal.objective.target_time_s} sec`,
        };
      }
      if (typeof goal.objective.target_speed_mps === "number") {
        return {
          label: "Target speed",
          value: `${goal.objective.target_speed_mps} m/s`,
        };
      }
      break;
    case "threshold":
      return {
        label:
          goal.objective.metric === "pace"
            ? "Target speed"
            : goal.objective.metric === "power"
              ? "Target watts"
              : "Target threshold HR",
        value: String(goal.objective.value),
      };
    case "completion":
      if (typeof goal.objective.duration_s === "number") {
        return {
          label: "Target duration",
          value: `${goal.objective.duration_s} sec`,
        };
      }
      if (typeof goal.objective.distance_m === "number") {
        return {
          label: "Target distance",
          value: `${Math.round((goal.objective.distance_m / 1000) * 10) / 10} km`,
        };
      }
      break;
    case "consistency":
      if (typeof goal.objective.target_sessions_per_week === "number") {
        return {
          label: "Sessions per week",
          value: String(goal.objective.target_sessions_per_week),
        };
      }
      break;
  }

  return {
    label: "Target",
    value: "Not set",
  };
}

function resolveGoalActivityCategory(
  draft: GoalEditorDraft,
): CanonicalGoalActivityCategory {
  if (draft.goalType === "pace_threshold") {
    return "run";
  }

  if (draft.goalType === "power_threshold") {
    return "bike";
  }

  if (draft.goalType === "hr_threshold") {
    return inferActivityCategoryFromTitle(draft.title);
  }

  return inferActivityCategoryFromTitle(draft.title);
}

function buildGoalTargetPayload(input: {
  draft: GoalEditorDraft;
  activityCategory: CanonicalGoalActivityCategory;
}) {
  const targetValue = toPositiveNumber(input.draft.targetValue);
  const raceDistanceMeters = toPositiveNumber(input.draft.raceDistanceKm)
    ? Math.round((input.draft.raceDistanceKm ?? 0) * 1000)
    : inferDefaultRaceDistanceMeters(input.draft.title);

  switch (input.draft.goalType) {
    case "race_performance":
      return {
        type: "event_performance" as const,
        activity_category: input.activityCategory,
        distance_m: raceDistanceMeters,
        target_time_s:
          input.draft.targetMetric === "target_time_s"
            ? (targetValue ??
              inferDefaultRaceTargetSeconds({
                activityCategory: input.activityCategory,
                distanceMeters: raceDistanceMeters,
              }))
            : undefined,
        target_speed_mps:
          input.draft.targetMetric === "target_speed_mps"
            ? (targetValue ?? undefined)
            : undefined,
      };
    case "pace_threshold":
      return {
        type: "threshold" as const,
        metric: "pace" as const,
        activity_category: "run" as const,
        value: targetValue ?? 3.5,
        test_duration_s: thresholdTestDurationSeconds,
      };
    case "power_threshold":
      return {
        type: "threshold" as const,
        metric: "power" as const,
        activity_category: "bike" as const,
        value: targetValue ?? 220,
        test_duration_s: thresholdTestDurationSeconds,
      };
    case "hr_threshold":
      return {
        type: "threshold" as const,
        metric: "hr" as const,
        activity_category: input.activityCategory,
        value: targetValue ?? 160,
      };
    default:
      return {
        type: "completion" as const,
        activity_category: input.activityCategory,
        distance_m: toPositiveNumber(input.draft.raceDistanceKm)
          ? Math.round((input.draft.raceDistanceKm ?? 0) * 1000)
          : undefined,
        duration_s:
          input.draft.targetMetric === "target_time_s"
            ? (targetValue ?? 3600)
            : 3600,
      };
  }
}
