import { formatPace, paceToSpeed, speedToPace } from "../calculations/speed-curve";
import { formatSecondsToHms, parseHmsToSeconds, parseMmSsToSeconds } from "../forms/input-parsers";
import {
  type CanonicalGoalActivityCategory,
  type ProfileGoal,
  profileGoalCreateSchema,
} from "../schemas/goals/profile_goals";

export type GoalEditorGoalType =
  | "race_performance"
  | "completion"
  | "pace_threshold"
  | "power_threshold"
  | "hr_threshold"
  | "consistency";

export type GoalEditorRaceTargetMode = "time" | "pace";

export interface GoalEditorDraft {
  title: string;
  targetDate: string;
  importance: number;
  goalType: GoalEditorGoalType;
  activityCategory: CanonicalGoalActivityCategory;
  raceDistanceKm?: number | null;
  raceTargetMode?: GoalEditorRaceTargetMode;
  targetDuration?: string;
  targetPace?: string;
  targetWatts?: number | null;
  targetBpm?: number | null;
  thresholdTestDuration?: string;
  consistencySessionsPerWeek?: number | null;
  consistencyWeeks?: number | null;
}

const THRESHOLD_TEST_DURATION_DEFAULT = "0:20:00";

function toPositiveNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function toRoundedDistanceKm(distanceMeters: number | undefined): number | null {
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters)) {
    return null;
  }

  return Math.round((distanceMeters / 1000) * 10) / 10;
}

function formatFriendlyDuration(seconds: number): string {
  const normalized = formatSecondsToHms(seconds);
  if (seconds >= 3600) {
    return normalized;
  }

  return normalized.replace(/^0:/, "");
}

function formatFriendlyDistance(distanceMeters: number): string {
  const distanceKm = distanceMeters / 1000;
  const rounded = Number(distanceKm.toFixed(1));
  return `${rounded} km`;
}

function formatFriendlyPaceFromSpeed(speedMps: number): string {
  return `${formatPace(speedToPace(speedMps))}/km`;
}

function requirePositiveNumber(value: number | null | undefined, message: string): number {
  const resolved = toPositiveNumber(value);
  if (resolved === null) {
    throw new Error(message);
  }

  return resolved;
}

function requireDurationSeconds(value: string | undefined, message: string): number {
  const seconds = parseHmsToSeconds(value) ?? parseMmSsToSeconds(value);
  if (!seconds || seconds <= 0) {
    throw new Error(message);
  }

  return seconds;
}

function requirePaceSpeed(value: string | undefined, message: string): number {
  const paceSeconds = parseMmSsToSeconds(value);
  if (!paceSeconds || paceSeconds <= 0) {
    throw new Error(message);
  }

  return paceToSpeed(paceSeconds);
}

function resolveGoalActivityCategory(draft: GoalEditorDraft): CanonicalGoalActivityCategory {
  if (draft.goalType === "pace_threshold") {
    return "run";
  }

  if (draft.goalType === "power_threshold") {
    return "bike";
  }

  return draft.activityCategory;
}

function buildGoalTargetPayload(input: {
  draft: GoalEditorDraft;
  activityCategory: CanonicalGoalActivityCategory;
}) {
  switch (input.draft.goalType) {
    case "race_performance": {
      const distanceKm = requirePositiveNumber(
        input.draft.raceDistanceKm,
        "Choose a race distance before saving this goal.",
      );
      const distanceMeters = Math.round(distanceKm * 1000);

      if ((input.draft.raceTargetMode ?? "time") === "pace") {
        return {
          type: "event_performance" as const,
          activity_category: input.activityCategory,
          distance_m: distanceMeters,
          target_speed_mps: requirePaceSpeed(
            input.draft.targetPace,
            "Set a goal pace before saving this goal.",
          ),
        };
      }

      return {
        type: "event_performance" as const,
        activity_category: input.activityCategory,
        distance_m: distanceMeters,
        target_time_s: requireDurationSeconds(
          input.draft.targetDuration,
          "Set a goal time before saving this goal.",
        ),
      };
    }
    case "completion": {
      const distanceKm = toPositiveNumber(input.draft.raceDistanceKm);
      const durationSeconds =
        parseHmsToSeconds(input.draft.targetDuration) ??
        parseMmSsToSeconds(input.draft.targetDuration);

      if (!distanceKm && !durationSeconds) {
        throw new Error("Add a distance, a duration, or both before saving this goal.");
      }

      return {
        type: "completion" as const,
        activity_category: input.activityCategory,
        distance_m: distanceKm ? Math.round(distanceKm * 1000) : undefined,
        duration_s: durationSeconds,
      };
    }
    case "pace_threshold":
      return {
        type: "threshold" as const,
        metric: "pace" as const,
        activity_category: "run" as const,
        value: requirePaceSpeed(
          input.draft.targetPace,
          "Set a threshold pace before saving this goal.",
        ),
        test_duration_s: requireDurationSeconds(
          input.draft.thresholdTestDuration,
          "Set the test duration before saving this goal.",
        ),
      };
    case "power_threshold":
      return {
        type: "threshold" as const,
        metric: "power" as const,
        activity_category: "bike" as const,
        value: requirePositiveNumber(
          input.draft.targetWatts,
          "Set a target power before saving this goal.",
        ),
        test_duration_s: requireDurationSeconds(
          input.draft.thresholdTestDuration,
          "Set the test duration before saving this goal.",
        ),
      };
    case "hr_threshold":
      return {
        type: "threshold" as const,
        metric: "hr" as const,
        activity_category: input.activityCategory,
        value: requirePositiveNumber(
          input.draft.targetBpm,
          "Set a target heart rate before saving this goal.",
        ),
      };
    case "consistency": {
      const sessions = toPositiveNumber(input.draft.consistencySessionsPerWeek);
      const weeks = toPositiveNumber(input.draft.consistencyWeeks);

      if (!sessions && !weeks) {
        throw new Error("Set weekly sessions, planned weeks, or both before saving this goal.");
      }

      return {
        type: "consistency" as const,
        target_sessions_per_week: sessions ? Math.round(sessions) : undefined,
        target_weeks: weeks ? Math.round(weeks) : undefined,
      };
    }
  }
}

export function createEmptyGoalDraft(): GoalEditorDraft {
  return {
    title: "",
    targetDate: "",
    importance: 5,
    goalType: "race_performance",
    activityCategory: "run",
    raceDistanceKm: 5,
    raceTargetMode: "time",
    targetDuration: "",
    targetPace: "",
    targetWatts: null,
    targetBpm: null,
    thresholdTestDuration: THRESHOLD_TEST_DURATION_DEFAULT,
    consistencySessionsPerWeek: 4,
    consistencyWeeks: 8,
  };
}

export function buildGoalDraftFromGoal(input: { goal: ProfileGoal }): GoalEditorDraft {
  const { goal } = input;

  if (goal.objective.type === "event_performance") {
    return {
      title: goal.title,
      targetDate: goal.target_date,
      importance: goal.priority,
      goalType: "race_performance",
      activityCategory: goal.activity_category,
      raceDistanceKm: toRoundedDistanceKm(goal.objective.distance_m),
      raceTargetMode: typeof goal.objective.target_time_s === "number" ? "time" : "pace",
      targetDuration:
        typeof goal.objective.target_time_s === "number"
          ? formatFriendlyDuration(goal.objective.target_time_s)
          : "",
      targetPace:
        typeof goal.objective.target_speed_mps === "number"
          ? formatPace(speedToPace(goal.objective.target_speed_mps))
          : "",
      thresholdTestDuration: THRESHOLD_TEST_DURATION_DEFAULT,
      targetWatts: null,
      targetBpm: null,
      consistencySessionsPerWeek: 4,
      consistencyWeeks: 8,
    };
  }

  if (goal.objective.type === "threshold") {
    if (goal.objective.metric === "pace") {
      return {
        title: goal.title,
        targetDate: goal.target_date,
        importance: goal.priority,
        goalType: "pace_threshold",
        activityCategory: "run",
        targetPace: formatPace(speedToPace(goal.objective.value)),
        thresholdTestDuration:
          typeof goal.objective.test_duration_s === "number"
            ? formatFriendlyDuration(goal.objective.test_duration_s)
            : THRESHOLD_TEST_DURATION_DEFAULT,
        raceDistanceKm: null,
        raceTargetMode: "time",
        targetDuration: "",
        targetWatts: null,
        targetBpm: null,
        consistencySessionsPerWeek: 4,
        consistencyWeeks: 8,
      };
    }

    if (goal.objective.metric === "power") {
      return {
        title: goal.title,
        targetDate: goal.target_date,
        importance: goal.priority,
        goalType: "power_threshold",
        activityCategory: "bike",
        targetWatts: goal.objective.value,
        thresholdTestDuration:
          typeof goal.objective.test_duration_s === "number"
            ? formatFriendlyDuration(goal.objective.test_duration_s)
            : THRESHOLD_TEST_DURATION_DEFAULT,
        raceDistanceKm: null,
        raceTargetMode: "time",
        targetDuration: "",
        targetPace: "",
        targetBpm: null,
        consistencySessionsPerWeek: 4,
        consistencyWeeks: 8,
      };
    }

    return {
      title: goal.title,
      targetDate: goal.target_date,
      importance: goal.priority,
      goalType: "hr_threshold",
      activityCategory: goal.activity_category,
      targetBpm: goal.objective.value,
      raceDistanceKm: null,
      raceTargetMode: "time",
      targetDuration: "",
      targetPace: "",
      targetWatts: null,
      thresholdTestDuration: THRESHOLD_TEST_DURATION_DEFAULT,
      consistencySessionsPerWeek: 4,
      consistencyWeeks: 8,
    };
  }

  if (goal.objective.type === "completion") {
    return {
      title: goal.title,
      targetDate: goal.target_date,
      importance: goal.priority,
      goalType: "completion",
      activityCategory: goal.activity_category,
      raceDistanceKm: toRoundedDistanceKm(goal.objective.distance_m),
      targetDuration:
        typeof goal.objective.duration_s === "number"
          ? formatFriendlyDuration(goal.objective.duration_s)
          : "",
      raceTargetMode: "time",
      targetPace: "",
      targetWatts: null,
      targetBpm: null,
      thresholdTestDuration: THRESHOLD_TEST_DURATION_DEFAULT,
      consistencySessionsPerWeek: 4,
      consistencyWeeks: 8,
    };
  }

  return {
    title: goal.title,
    targetDate: goal.target_date,
    importance: goal.priority,
    goalType: "consistency",
    activityCategory: goal.activity_category,
    consistencySessionsPerWeek: goal.objective.target_sessions_per_week ?? 4,
    consistencyWeeks: goal.objective.target_weeks ?? 8,
    raceDistanceKm: null,
    raceTargetMode: "time",
    targetDuration: "",
    targetPace: "",
    targetWatts: null,
    targetBpm: null,
    thresholdTestDuration: THRESHOLD_TEST_DURATION_DEFAULT,
  };
}

export function buildGoalCreatePayload(input: { draft: GoalEditorDraft; profileId: string }) {
  const activityCategory = resolveGoalActivityCategory(input.draft);
  const targetPayload = buildGoalTargetPayload({
    draft: input.draft,
    activityCategory,
  });

  return profileGoalCreateSchema.parse({
    profile_id: input.profileId,
    target_date: input.draft.targetDate,
    title: input.draft.title.trim(),
    priority: Math.max(0, Math.min(10, input.draft.importance)),
    activity_category: activityCategory,
    target_payload: targetPayload,
  });
}

export function buildGoalUpdatePayload(input: { draft: GoalEditorDraft }) {
  const createPayload = buildGoalCreatePayload({
    draft: input.draft,
    profileId: "00000000-0000-0000-0000-000000000000",
  });

  return {
    target_date: createPayload.target_date,
    title: createPayload.title,
    priority: createPayload.priority,
    activity_category: createPayload.activity_category,
    target_payload: createPayload.target_payload,
  };
}

export function formatGoalTypeLabel(goal: ProfileGoal): string {
  switch (goal.objective.type) {
    case "event_performance":
      return "Race Day";
    case "threshold":
      if (goal.objective.metric === "pace") return "Run Pace";
      if (goal.objective.metric === "power") return "Bike Power";
      return "Threshold HR";
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
          label: "Goal time",
          value: formatFriendlyDuration(goal.objective.target_time_s),
        };
      }
      if (typeof goal.objective.target_speed_mps === "number") {
        return {
          label: "Goal pace",
          value: formatFriendlyPaceFromSpeed(goal.objective.target_speed_mps),
        };
      }
      break;
    case "threshold":
      if (goal.objective.metric === "pace") {
        return {
          label: "Target pace",
          value: formatFriendlyPaceFromSpeed(goal.objective.value),
        };
      }
      if (goal.objective.metric === "power") {
        return {
          label: "Target power",
          value: `${Math.round(goal.objective.value)} W`,
        };
      }
      return {
        label: "Target heart rate",
        value: `${Math.round(goal.objective.value)} bpm`,
      };
    case "completion":
      if (
        typeof goal.objective.distance_m === "number" &&
        typeof goal.objective.duration_s === "number"
      ) {
        return {
          label: "Goal",
          value: `${formatFriendlyDistance(goal.objective.distance_m)} in ${formatFriendlyDuration(goal.objective.duration_s)}`,
        };
      }
      if (typeof goal.objective.duration_s === "number") {
        return {
          label: "Target duration",
          value: formatFriendlyDuration(goal.objective.duration_s),
        };
      }
      if (typeof goal.objective.distance_m === "number") {
        return {
          label: "Target distance",
          value: formatFriendlyDistance(goal.objective.distance_m),
        };
      }
      break;
    case "consistency": {
      const parts: string[] = [];
      if (typeof goal.objective.target_sessions_per_week === "number") {
        parts.push(`${goal.objective.target_sessions_per_week} sessions/week`);
      }
      if (typeof goal.objective.target_weeks === "number") {
        parts.push(`for ${goal.objective.target_weeks} weeks`);
      }

      if (parts.length > 0) {
        return {
          label: "Goal",
          value: parts.join(" "),
        };
      }
      break;
    }
  }

  return {
    label: "Target",
    value: "Not set",
  };
}

export function getGoalObjectiveSummary(goal: ProfileGoal): string {
  switch (goal.objective.type) {
    case "event_performance": {
      const distance =
        typeof goal.objective.distance_m === "number"
          ? formatFriendlyDistance(goal.objective.distance_m)
          : null;
      const metric = getGoalMetricSummary(goal).value;
      return distance ? `${distance} · ${metric}` : metric;
    }
    case "completion":
    case "threshold":
    case "consistency":
      return getGoalMetricSummary(goal).value;
  }
}

export function getGoalDistanceBadge(goal: ProfileGoal): string | null {
  if (
    (goal.objective.type === "event_performance" || goal.objective.type === "completion") &&
    typeof goal.objective.distance_m === "number"
  ) {
    return formatFriendlyDistance(goal.objective.distance_m);
  }

  return null;
}
