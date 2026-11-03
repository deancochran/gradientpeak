import { formatPace, paceToSpeed, speedToPace } from "../calculations/speed-curve";
import { dateOnlySchema } from "../schemas/date-only";
import {
  type CanonicalGoalActivityCategory,
  type ProfileGoal,
  profileGoalCreateSchema,
} from "../schemas/goals/profile_goals";
import { formatSecondsToHms, parseHmsToSeconds, parseMmSsToSeconds } from "../utils/fitness-inputs";

export type GoalEditorGoalType =
  | "race_performance"
  | "completion"
  | "pace_threshold"
  | "power_threshold"
  | "hr_threshold"
  | "consistency";

export type GoalEditorRaceTargetMode = "time" | "pace";

export interface GoalEditorDraft {
  /** Retains canonical precision and unexposed optional fields for unchanged objectives. */
  originalGoal?: ProfileGoal | undefined;
  title: string;
  targetDate: string;
  importance: number;
  goalType: GoalEditorGoalType;
  activityCategory: CanonicalGoalActivityCategory;
  raceDistanceKm?: number | null | undefined;
  raceTargetMode?: GoalEditorRaceTargetMode | undefined;
  targetDuration?: string | undefined;
  targetPace?: string | undefined;
  targetWatts?: number | null | undefined;
  targetBpm?: number | null | undefined;
  thresholdTestDuration?: string | undefined;
  consistencySessionsPerWeek?: number | null | undefined;
  consistencyWeeks?: number | null | undefined;
}

const THRESHOLD_TEST_DURATION_DEFAULT = "0:20:00";

function toPositiveNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function toDistanceKm(distanceMeters: number | undefined): number | null {
  if (typeof distanceMeters !== "number" || !Number.isFinite(distanceMeters)) {
    return null;
  }

  return distanceMeters / 1000;
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
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(message);
  }

  return seconds;
}

function requirePaceSpeed(value: string | undefined, message: string): number {
  const paceSeconds = parseMmSsToSeconds(value);
  if (!paceSeconds || !Number.isFinite(paceSeconds) || paceSeconds <= 0) {
    throw new Error(message);
  }

  return paceToSpeed(paceSeconds);
}

function optionalDurationSeconds(value: string | undefined, message: string): number | undefined {
  return value?.trim() ? requireDurationSeconds(value, message) : undefined;
}

export function resolveGoalActivityCategory(draft: GoalEditorDraft): CanonicalGoalActivityCategory {
  // Category is explicit domain data. UI creation presets choose run/bike defaults.
  return draft.activityCategory;
}

export function buildGoalTargetPayload(input: {
  draft: GoalEditorDraft;
  activityCategory: CanonicalGoalActivityCategory;
}) {
  const { draft, activityCategory } = input;
  const baseline = draft.originalGoal ? hydrateGoalDraft({ goal: draft.originalGoal }) : undefined;
  const original =
    baseline?.goalType === draft.goalType &&
    draft.originalGoal?.activity_category === activityCategory
      ? draft.originalGoal.objective
      : undefined;
  // Each domain field explicitly maps to its editor input. A presentation conversion
  // must never rewrite a different, untouched canonical field.
  function retain<T>(field: keyof GoalEditorDraft, value: T, edited: () => T): T {
    return original && baseline && draft[field] === baseline[field] ? value : edited();
  }

  switch (input.draft.goalType) {
    case "race_performance": {
      const source = original?.type === "event_performance" ? original : undefined;
      const distance = retain(
        "raceDistanceKm",
        source?.distance_m,
        () =>
          requirePositiveNumber(
            draft.raceDistanceKm,
            "Choose a race distance before saving this goal.",
          ) * 1000,
      );
      const sameMode = source && draft.raceTargetMode === baseline?.raceTargetMode;
      const time =
        (draft.raceTargetMode ?? "time") === "time"
          ? sameMode && draft.targetDuration === baseline?.targetDuration
            ? source.target_time_s
            : requireDurationSeconds(
                draft.targetDuration,
                "Set a goal time before saving this goal.",
              )
          : sameMode
            ? source.target_time_s
            : undefined;
      const speed =
        draft.raceTargetMode === "pace"
          ? sameMode && draft.targetPace === baseline?.targetPace
            ? source.target_speed_mps
            : requirePaceSpeed(draft.targetPace, "Set a goal pace before saving this goal.")
          : sameMode
            ? source.target_speed_mps
            : undefined;
      return {
        ...(source?.environment === undefined ? {} : { environment: source.environment }),
        ...(source?.tolerance_pct === undefined ? {} : { tolerance_pct: source.tolerance_pct }),
        type: "event_performance" as const,
        activity_category: activityCategory,
        distance_m: distance,
        ...(time === undefined ? {} : { target_time_s: time }),
        ...(speed === undefined ? {} : { target_speed_mps: speed }),
      };
    }
    case "completion": {
      const source = original?.type === "completion" ? original : undefined;
      const distance = retain("raceDistanceKm", source?.distance_m, () =>
        draft.raceDistanceKm == null
          ? undefined
          : requirePositiveNumber(draft.raceDistanceKm, "Set a positive distance or clear it.") *
            1000,
      );
      const duration = retain("targetDuration", source?.duration_s, () =>
        optionalDurationSeconds(
          draft.targetDuration,
          "Set a valid duration before saving this goal.",
        ),
      );
      if (distance === undefined && duration === undefined) {
        throw new Error("Add a distance, a duration, or both before saving this goal.");
      }

      return {
        type: "completion" as const,
        ...(source
          ? source.activity_category === undefined
            ? {}
            : { activity_category: source.activity_category }
          : { activity_category: activityCategory }),
        ...(distance === undefined ? {} : { distance_m: distance }),
        ...(duration === undefined ? {} : { duration_s: duration }),
      };
    }
    case "pace_threshold":
    case "power_threshold":
    case "hr_threshold": {
      const source = original?.type === "threshold" ? original : undefined;
      const metric =
        draft.goalType === "pace_threshold"
          ? "pace"
          : draft.goalType === "power_threshold"
            ? "power"
            : "hr";
      const value =
        metric === "pace"
          ? retain("targetPace", source?.value, () =>
              requirePaceSpeed(draft.targetPace, "Set a threshold pace before saving this goal."),
            )
          : metric === "power"
            ? retain("targetWatts", source?.value, () =>
                requirePositiveNumber(
                  draft.targetWatts,
                  "Set a target power before saving this goal.",
                ),
              )
            : retain("targetBpm", source?.value, () =>
                requirePositiveNumber(
                  draft.targetBpm,
                  "Set a target heart rate before saving this goal.",
                ),
              );
      const duration = retain("thresholdTestDuration", source?.test_duration_s, () =>
        optionalDurationSeconds(
          draft.thresholdTestDuration,
          "Set a valid test duration or clear it before saving this goal.",
        ),
      );
      return {
        ...(source?.tolerance_pct === undefined ? {} : { tolerance_pct: source.tolerance_pct }),
        type: "threshold" as const,
        metric,
        ...(source
          ? source.activity_category === undefined
            ? {}
            : { activity_category: source.activity_category }
          : { activity_category: activityCategory }),
        value,
        ...(duration === undefined ? {} : { test_duration_s: duration }),
      };
    }
    case "consistency": {
      const sessions =
        draft.consistencySessionsPerWeek == null
          ? null
          : requirePositiveNumber(
              draft.consistencySessionsPerWeek,
              "Set positive weekly sessions or clear the field.",
            );
      const weeks =
        draft.consistencyWeeks == null
          ? null
          : requirePositiveNumber(
              draft.consistencyWeeks,
              "Set positive planned weeks or clear the field.",
            );

      if (!sessions && !weeks) {
        throw new Error("Set weekly sessions, planned weeks, or both before saving this goal.");
      }
      if (sessions !== null && !Number.isInteger(sessions)) {
        throw new Error("Weekly sessions must be a positive whole number or empty.");
      }
      if (weeks !== null && !Number.isInteger(weeks)) {
        throw new Error("Planned weeks must be a positive whole number or empty.");
      }

      return {
        type: "consistency" as const,
        ...(sessions === null ? {} : { target_sessions_per_week: sessions }),
        ...(weeks === null ? {} : { target_weeks: weeks }),
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
  return { ...hydrateGoalDraft(input), originalGoal: input.goal };
}

function hydrateGoalDraft(input: { goal: ProfileGoal }): GoalEditorDraft {
  const { goal } = input;

  if (goal.objective.type === "event_performance") {
    return {
      title: goal.title,
      targetDate: goal.target_date,
      importance: goal.priority,
      goalType: "race_performance",
      activityCategory: goal.activity_category,
      raceDistanceKm: toDistanceKm(goal.objective.distance_m),
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
        activityCategory: goal.activity_category,
        targetPace: formatPace(speedToPace(goal.objective.value)),
        thresholdTestDuration:
          typeof goal.objective.test_duration_s === "number"
            ? formatFriendlyDuration(goal.objective.test_duration_s)
            : "",
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
        activityCategory: goal.activity_category,
        targetWatts: goal.objective.value,
        thresholdTestDuration:
          typeof goal.objective.test_duration_s === "number"
            ? formatFriendlyDuration(goal.objective.test_duration_s)
            : "",
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
      thresholdTestDuration:
        typeof goal.objective.test_duration_s === "number"
          ? formatFriendlyDuration(goal.objective.test_duration_s)
          : "",
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
      raceDistanceKm: toDistanceKm(goal.objective.distance_m),
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
    consistencySessionsPerWeek: goal.objective.target_sessions_per_week ?? null,
    consistencyWeeks: goal.objective.target_weeks ?? null,
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
  if (!input.draft.title.trim()) throw new Error("Enter a goal title.");
  if (input.draft.title.trim().length > 100)
    throw new Error("Goal title must be 100 characters or fewer.");
  if (!dateOnlySchema.safeParse(input.draft.targetDate).success)
    throw new Error("Choose a valid target date.");
  if (
    !Number.isInteger(input.draft.importance) ||
    input.draft.importance < 0 ||
    input.draft.importance > 10
  ) {
    throw new Error("Priority must be a whole number from 0 to 10.");
  }
  const activityCategory = resolveGoalActivityCategory(input.draft);
  const targetPayload = buildGoalTargetPayload({
    draft: input.draft,
    activityCategory,
  });

  return profileGoalCreateSchema.parse({
    profile_id: input.profileId,
    target_date: input.draft.targetDate,
    title: input.draft.title.trim(),
    priority: input.draft.importance,
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
