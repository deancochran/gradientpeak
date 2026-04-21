import { formatPace } from "../calculations";
import { speedToPace } from "../calculations/speed-curve";
import type { ProfileGoal } from "../schemas";
import { formatSecondsToHms } from "../utils/fitness-inputs";
import type { GoalDraftFromGoalInput, GoalEditorDraft } from "./types";

const THRESHOLD_TEST_DURATION_DEFAULT = "0:20:00";

function toRoundedDistanceKm(distanceMeters: number | undefined): number | null {
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters)) return null;
  return Math.round((distanceMeters / 1000) * 10) / 10;
}

function formatFriendlyDuration(seconds: number): string {
  const normalized = formatSecondsToHms(seconds);
  return seconds >= 3600 ? normalized : normalized.replace(/^0:/, "");
}

function formatFriendlyDistance(distanceMeters: number): string {
  return `${Number((distanceMeters / 1000).toFixed(1))} km`;
}

function formatFriendlyPaceFromSpeed(speedMps: number): string {
  return `${formatPace(speedToPace(speedMps))}/km`;
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

export function buildGoalDraftFromGoal(input: GoalDraftFromGoalInput): GoalEditorDraft {
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

export function getGoalMetricSummary(goal: ProfileGoal): { label: string; value: string } {
  switch (goal.objective.type) {
    case "event_performance":
      if (typeof goal.objective.target_time_s === "number") {
        return { label: "Goal time", value: formatFriendlyDuration(goal.objective.target_time_s) };
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
        return { label: "Target pace", value: formatFriendlyPaceFromSpeed(goal.objective.value) };
      }
      if (goal.objective.metric === "power") {
        return { label: "Target power", value: `${Math.round(goal.objective.value)} W` };
      }
      return { label: "Target heart rate", value: `${Math.round(goal.objective.value)} bpm` };
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
      if (typeof goal.objective.target_sessions_per_week === "number")
        parts.push(`${goal.objective.target_sessions_per_week} sessions/week`);
      if (typeof goal.objective.target_weeks === "number")
        parts.push(`for ${goal.objective.target_weeks} weeks`);
      if (parts.length > 0) return { label: "Goal", value: parts.join(" ") };
    }
  }
  return { label: "Target", value: "Not set" };
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
