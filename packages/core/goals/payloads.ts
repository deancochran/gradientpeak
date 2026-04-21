import { type CanonicalGoalActivityCategory, profileGoalCreateSchema } from "../schemas";
import {
  normalizeGoalActivityCategory,
  parseGoalDurationSeconds,
  parseGoalPaceSpeed,
} from "./parsers";
import type { GoalEditorDraft } from "./types";

const THRESHOLD_TEST_DURATION_DEFAULT = "0:20:00";

function toPositiveNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function requirePositiveNumber(value: number | null | undefined, message: string): number {
  const resolved = toPositiveNumber(value);
  if (resolved === null) throw new Error(message);
  return resolved;
}

function requireDurationSeconds(value: string | undefined, message: string): number {
  const seconds = parseGoalDurationSeconds(value);
  if (!seconds || seconds <= 0) throw new Error(message);
  return seconds;
}

function requirePaceSpeed(value: string | undefined, message: string): number {
  const speed = parseGoalPaceSpeed(value);
  if (!speed || speed <= 0) throw new Error(message);
  return speed;
}

export function resolveGoalActivityCategory(draft: GoalEditorDraft): CanonicalGoalActivityCategory {
  return normalizeGoalActivityCategory(draft.goalType, draft.activityCategory);
}

export function buildGoalTargetPayload(input: {
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
      const durationSeconds = parseGoalDurationSeconds(input.draft.targetDuration);
      if (!distanceKm && !durationSeconds) {
        throw new Error("Add a distance, a duration, or both before saving this goal.");
      }
      return {
        type: "completion" as const,
        activity_category: input.activityCategory,
        distance_m: distanceKm ? Math.round(distanceKm * 1000) : undefined,
        duration_s: durationSeconds ?? undefined,
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
          input.draft.thresholdTestDuration ?? THRESHOLD_TEST_DURATION_DEFAULT,
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
          input.draft.thresholdTestDuration ?? THRESHOLD_TEST_DURATION_DEFAULT,
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

export function buildGoalCreatePayload(input: { draft: GoalEditorDraft; profileId: string }) {
  const activityCategory = resolveGoalActivityCategory(input.draft);
  return profileGoalCreateSchema.parse({
    profile_id: input.profileId,
    target_date: input.draft.targetDate,
    title: input.draft.title.trim(),
    priority: Math.max(0, Math.min(10, input.draft.importance)),
    activity_category: activityCategory,
    target_payload: buildGoalTargetPayload({
      draft: input.draft,
      activityCategory,
    }),
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

export function buildMilestoneEventCreateInput(input: {
  draft: GoalEditorDraft;
  trainingPlanId?: string | null;
}) {
  const eventType =
    input.draft.goalType === "race_performance" ? ("race_target" as const) : ("custom" as const);

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
    input.draft.goalType === "race_performance" ? ("race_target" as const) : ("custom" as const);

  return {
    title: input.draft.title.trim(),
    starts_at: `${input.draft.targetDate}T12:00:00.000Z`,
    all_day: true,
    timezone: "UTC",
    training_plan_id: input.trainingPlanId ?? null,
    event_type: eventType,
  };
}
