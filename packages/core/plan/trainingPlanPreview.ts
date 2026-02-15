import type { MinimalTrainingPlanCreate } from "../schemas/training_plan_structure";
import { canonicalizeMinimalTrainingPlanCreate } from "./canonicalization";

const HMS_PATTERN = /^([0-9]+):([0-5][0-9]):([0-5][0-9])$/;
const MMS_PATTERN = /^([0-9]+):([0-5][0-9])$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type PreviewActivityCategory = "run" | "bike" | "swim" | "other";

export type PreviewGoalTargetInput = {
  targetType:
    | "race_performance"
    | "pace_threshold"
    | "power_threshold"
    | "hr_threshold";
  activityCategory?: PreviewActivityCategory;
  distanceKm?: string;
  completionTimeHms?: string;
  paceMmSs?: string;
  testDurationHms?: string;
  targetWatts?: number;
  targetLthrBpm?: number;
};

export type PreviewGoalInput = {
  name: string;
  targetDate: string;
  priority: number;
  targets: PreviewGoalTargetInput[];
};

export type PreviewFormInput = {
  planStartDate?: string;
  goals: PreviewGoalInput[];
};

export type PreviewState<TChart> = {
  projectionChart?: TChart;
  previewError?: string;
};

export type PreviewStateEvent<TChart> =
  | {
      status: "success";
      projectionChart: TChart;
    }
  | {
      status: "failure";
      errorMessage: string;
    };

export function buildPreviewMinimalPlanFromForm(
  input: PreviewFormInput,
): MinimalTrainingPlanCreate | null {
  const fallbackTarget = getFallbackPreviewTarget(input.goals);

  const goals = input.goals.flatMap((goal, goalIndex) => {
    const fallbackName = `Goal ${goalIndex + 1}`;
    const name = goal.name.trim() || fallbackName;
    if (!DATE_ONLY_PATTERN.test(goal.targetDate)) {
      return [];
    }

    const priority = clampInteger(goal.priority, 1, 10);
    const targets = goal.targets.flatMap((target) => {
      const converted = toPreviewTarget(target);
      return converted ? [converted] : [];
    });

    if (targets.length === 0 && fallbackTarget) {
      targets.push(fallbackTarget);
    }

    if (targets.length === 0) {
      return [];
    }

    return [
      {
        name,
        target_date: goal.targetDate,
        priority,
        targets,
      },
    ];
  });

  if (goals.length === 0) {
    return null;
  }

  const trimmedPlanStartDate = input.planStartDate?.trim();
  const planStartDate =
    trimmedPlanStartDate && DATE_ONLY_PATTERN.test(trimmedPlanStartDate)
      ? trimmedPlanStartDate
      : undefined;

  return canonicalizeMinimalTrainingPlanCreate({
    goals,
    plan_start_date: planStartDate,
  });
}

function getFallbackPreviewTarget(
  goals: PreviewGoalInput[],
): MinimalTrainingPlanCreate["goals"][number]["targets"][number] | null {
  for (const goal of goals) {
    for (const target of goal.targets) {
      const converted = toPreviewTarget(target);
      if (converted) {
        return converted;
      }
    }
  }

  return null;
}

export function reducePreviewState<TChart>(
  state: PreviewState<TChart>,
  event: PreviewStateEvent<TChart>,
): PreviewState<TChart> {
  if (event.status === "success") {
    return {
      projectionChart: event.projectionChart,
      previewError: undefined,
    };
  }

  return {
    projectionChart: state.projectionChart,
    previewError: event.errorMessage,
  };
}

function toPreviewTarget(
  target: PreviewGoalTargetInput,
): MinimalTrainingPlanCreate["goals"][number]["targets"][number] | null {
  switch (target.targetType) {
    case "race_performance": {
      const distanceM = parseDistanceKmToMeters(target.distanceKm);
      const targetTimeS = parseHmsToSeconds(target.completionTimeHms ?? "");
      if (!distanceM || !targetTimeS || !target.activityCategory) {
        return null;
      }

      return {
        target_type: "race_performance",
        distance_m: distanceM,
        target_time_s: targetTimeS,
        activity_category: target.activityCategory,
      };
    }
    case "pace_threshold": {
      const paceSeconds = parseMmSsToSeconds(target.paceMmSs ?? "");
      const testDurationS = parseHmsToSeconds(target.testDurationHms ?? "");
      if (!paceSeconds || !testDurationS || !target.activityCategory) {
        return null;
      }

      return {
        target_type: "pace_threshold",
        target_speed_mps: 1000 / paceSeconds,
        test_duration_s: testDurationS,
        activity_category: target.activityCategory,
      };
    }
    case "power_threshold": {
      const testDurationS = parseHmsToSeconds(target.testDurationHms ?? "");
      if (!target.targetWatts || !testDurationS || !target.activityCategory) {
        return null;
      }

      return {
        target_type: "power_threshold",
        target_watts: target.targetWatts,
        test_duration_s: testDurationS,
        activity_category: target.activityCategory,
      };
    }
    case "hr_threshold": {
      if (!target.targetLthrBpm) {
        return null;
      }

      return {
        target_type: "hr_threshold",
        target_lthr_bpm: Math.round(target.targetLthrBpm),
      };
    }
  }
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

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
