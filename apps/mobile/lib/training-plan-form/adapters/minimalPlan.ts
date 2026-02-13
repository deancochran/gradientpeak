import type {
  GoalFormData,
  GoalTargetFormData,
} from "@/components/training-plan/create/SinglePageForm";
import type { MinimalTrainingPlanCreate } from "@repo/core";

const HMS_PATTERN = /^([0-9]+):([0-5][0-9]):([0-5][0-9])$/;
const MMS_PATTERN = /^([0-9]+):([0-5][0-9])$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseHmsToSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  const match = HMS_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseMmSsToSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  const match = MMS_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return minutes * 60 + seconds;
}

function parseDistanceKmToMeters(
  value: string | undefined,
): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const distanceKm = Number(value);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return undefined;
  }

  return Math.round(distanceKm * 1000);
}

function normalizePlanStartDate(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return DATE_ONLY_PATTERN.test(trimmed) ? trimmed : undefined;
}

function toPayloadTarget(
  target: GoalTargetFormData,
): MinimalTrainingPlanCreate["goals"][number]["targets"][number] {
  switch (target.targetType) {
    case "race_performance": {
      const distanceM = parseDistanceKmToMeters(target.distanceKm);
      const targetTimeS = parseHmsToSeconds(target.completionTimeHms ?? "");
      const activityCategory = target.activityCategory;

      if (!distanceM || !targetTimeS || !activityCategory) {
        throw new Error(
          "race_performance target requires activity, distance, and time",
        );
      }

      return {
        target_type: "race_performance",
        distance_m: distanceM,
        target_time_s: targetTimeS,
        activity_category: activityCategory,
      };
    }
    case "pace_threshold": {
      const paceSeconds = parseMmSsToSeconds(target.paceMmSs ?? "");
      const testDurationS = parseHmsToSeconds(target.testDurationHms ?? "");
      const activityCategory = target.activityCategory;

      if (!paceSeconds || !testDurationS || !activityCategory) {
        throw new Error(
          "pace_threshold target requires pace, activity, and test duration",
        );
      }

      return {
        target_type: "pace_threshold",
        target_speed_mps: 1000 / paceSeconds,
        test_duration_s: testDurationS,
        activity_category: activityCategory,
      };
    }
    case "power_threshold": {
      const testDurationS = parseHmsToSeconds(target.testDurationHms ?? "");
      const activityCategory = target.activityCategory;

      if (!target.targetWatts || !testDurationS || !activityCategory) {
        throw new Error(
          "power_threshold target requires watts, activity, and test duration",
        );
      }

      return {
        target_type: "power_threshold",
        target_watts: target.targetWatts,
        test_duration_s: testDurationS,
        activity_category: activityCategory,
      };
    }
    case "hr_threshold": {
      if (!target.targetLthrBpm) {
        throw new Error("hr_threshold target requires lthr bpm");
      }

      return {
        target_type: "hr_threshold",
        target_lthr_bpm: Math.round(target.targetLthrBpm),
      };
    }
  }
}

export function buildMinimalTrainingPlanPayload(input: {
  planStartDate?: string;
  goals: GoalFormData[];
}): MinimalTrainingPlanCreate {
  const planStartDate = normalizePlanStartDate(input.planStartDate);

  return {
    plan_start_date: planStartDate,
    goals: input.goals.map((goal) => ({
      name: goal.name.trim(),
      target_date: goal.targetDate,
      priority: goal.priority,
      targets: goal.targets.map(toPayloadTarget),
    })),
  };
}
