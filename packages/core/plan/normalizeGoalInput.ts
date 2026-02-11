import { z } from "zod";
import {
  trainingGoalSchema,
  type GoalTargetV2,
  type TrainingGoal,
} from "../schemas/training_plan_structure";
import {
  completionTimeHmsToSecondsSchema,
  distanceKmToMetersSchema,
  paceMmSsToMpsSchema,
} from "../schemas/form-schemas";

type RacePerformanceTargetInput =
  | {
      target_type: "race_performance";
      distance_m: number;
      target_time_s: number;
      activity_category?: "run" | "bike" | "swim" | "other";
    }
  | {
      target_type: "race_performance";
      distance_km: number | string;
      completion_time: string;
      activity_category?: "run" | "bike" | "swim" | "other";
    }
  | {
      target_type: "race_performance";
      distance_km: number | string;
      pace: string;
      activity_category?: "run" | "bike" | "swim" | "other";
    }
  | {
      target_type: "race_performance";
      completion_time: string;
      pace: string;
      activity_category?: "run" | "bike" | "swim" | "other";
    };

type PaceThresholdTargetInput = {
  target_type: "pace_threshold";
  target_speed_mps?: number | string;
  pace?: string;
  test_duration_s?: number | string;
  test_duration?: string;
  activity_category?: "run" | "bike" | "swim" | "other";
};

type PowerThresholdTargetInput = {
  target_type: "power_threshold";
  target_watts: number | string;
  test_duration_s?: number | string;
  test_duration?: string;
  activity_category?: "run" | "bike" | "swim" | "other";
};

type HrThresholdTargetInput = {
  target_type: "hr_threshold";
  target_lthr_bpm: number | string;
};

export interface GoalInputLike {
  id?: string;
  name: string;
  target_date: string;
  priority?: number;
  targets: Array<
    | GoalTargetV2
    | RacePerformanceTargetInput
    | PaceThresholdTargetInput
    | PowerThresholdTargetInput
    | HrThresholdTargetInput
  >;
}

export interface NormalizeGoalInputOptions {
  idSeed?: string;
}

export function deterministicUuidFromSeed(seed: string): string {
  const bytes = new Uint8Array(16);
  const seeds = [
    `${seed}:0`,
    `${seed}:1`,
    `${seed}:2`,
    `${seed}:3`,
    `${seed}:4`,
    `${seed}:5`,
    `${seed}:6`,
    `${seed}:7`,
    `${seed}:8`,
    `${seed}:9`,
    `${seed}:10`,
    `${seed}:11`,
    `${seed}:12`,
    `${seed}:13`,
    `${seed}:14`,
    `${seed}:15`,
  ];

  for (let i = 0; i < seeds.length; i++) {
    bytes[i] = fnv1a32(seeds[i] ?? "") & 0xff;
  }

  const byte6 = bytes[6] ?? 0;
  const byte8 = bytes[8] ?? 0;
  bytes[6] = (byte6 & 0x0f) | 0x40;
  bytes[8] = (byte8 & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function normalizeGoalInput(
  input: GoalInputLike,
  options?: NormalizeGoalInputOptions,
): TrainingGoal {
  const priority = input.priority ?? 1;
  const normalizedTargets = input.targets.map((target) =>
    normalizeGoalTargetInput(target),
  );
  const seedParts = [
    options?.idSeed ?? "goal",
    input.id ?? "",
    input.name,
    input.target_date,
    String(priority),
    JSON.stringify(normalizedTargets),
  ];

  const candidate: z.input<typeof trainingGoalSchema> = {
    id: input.id ?? deterministicUuidFromSeed(seedParts.join("|")),
    name: input.name,
    target_date: input.target_date,
    priority,
    targets: normalizedTargets,
  };

  return trainingGoalSchema.parse(candidate);
}

function normalizeGoalTargetInput(
  target: GoalInputLike["targets"][number],
): GoalTargetV2 {
  switch (target.target_type) {
    case "race_performance": {
      const activityCategory =
        target.activity_category === "run" ||
        target.activity_category === "bike" ||
        target.activity_category === "swim" ||
        target.activity_category === "other"
          ? target.activity_category
          : null;

      if (activityCategory === null) {
        throw new Error(
          "race_performance target requires activity_category (run|bike|swim|other)",
        );
      }

      const directDistance = getPositiveNumber(
        (target as { distance_m?: number }).distance_m,
      );
      const directTime = getPositiveInteger(
        (target as { target_time_s?: number }).target_time_s,
      );

      if (directDistance !== null && directTime !== null) {
        return {
          target_type: "race_performance",
          distance_m: directDistance,
          target_time_s: directTime,
          activity_category: activityCategory,
        };
      }

      const distanceMeters =
        "distance_km" in target
          ? distanceKmToMetersSchema.parse(target.distance_km)
          : directDistance;
      const targetTimeSeconds =
        "completion_time" in target
          ? completionTimeHmsToSecondsSchema.parse(target.completion_time)
          : directTime;
      const paceMps =
        "pace" in target ? paceMmSsToMpsSchema.parse(target.pace) : null;

      if (
        distanceMeters !== null &&
        targetTimeSeconds !== null &&
        distanceMeters > 0 &&
        targetTimeSeconds > 0
      ) {
        return {
          target_type: "race_performance",
          distance_m: distanceMeters,
          target_time_s: targetTimeSeconds,
          activity_category: activityCategory,
        };
      }

      if (distanceMeters !== null && paceMps !== null && paceMps > 0) {
        return {
          target_type: "race_performance",
          distance_m: distanceMeters,
          target_time_s: Math.round(distanceMeters / paceMps),
          activity_category: activityCategory,
        };
      }

      if (targetTimeSeconds !== null && paceMps !== null && paceMps > 0) {
        return {
          target_type: "race_performance",
          distance_m: Math.round(targetTimeSeconds * paceMps),
          target_time_s: targetTimeSeconds,
          activity_category: activityCategory,
        };
      }

      throw new Error(
        "race_performance target requires any two of: distance_km|distance_m, completion_time|target_time_s, pace",
      );
    }
    case "pace_threshold": {
      const pace = "pace" in target ? target.pace : undefined;
      const testDuration =
        "test_duration" in target ? target.test_duration : undefined;

      const speedMps =
        getPositiveNumber(target.target_speed_mps) ??
        (pace ? paceMmSsToMpsSchema.parse(pace) : null);

      const testDurationSeconds =
        getPositiveInteger(target.test_duration_s) ??
        (testDuration
          ? completionTimeHmsToSecondsSchema.parse(testDuration)
          : null);

      if (speedMps === null || testDurationSeconds === null) {
        throw new Error(
          "pace_threshold target requires target_speed_mps or pace and required test_duration_s",
        );
      }

      const activityCategory =
        target.activity_category === "run" ||
        target.activity_category === "bike" ||
        target.activity_category === "swim" ||
        target.activity_category === "other"
          ? target.activity_category
          : null;

      if (activityCategory === null) {
        throw new Error(
          "pace_threshold target requires activity_category (run|bike|swim|other)",
        );
      }

      return {
        target_type: "pace_threshold",
        target_speed_mps: speedMps,
        test_duration_s: testDurationSeconds,
        activity_category: activityCategory,
      };
    }
    case "power_threshold": {
      const testDuration =
        "test_duration" in target ? target.test_duration : undefined;

      const watts = getPositiveNumber(target.target_watts);
      const testDurationSeconds =
        getPositiveInteger(target.test_duration_s) ??
        (testDuration
          ? completionTimeHmsToSecondsSchema.parse(testDuration)
          : null);

      if (watts === null || testDurationSeconds === null) {
        throw new Error(
          "power_threshold target requires target_watts and required test_duration_s",
        );
      }

      const activityCategory =
        target.activity_category === "run" ||
        target.activity_category === "bike" ||
        target.activity_category === "swim" ||
        target.activity_category === "other"
          ? target.activity_category
          : null;

      if (activityCategory === null) {
        throw new Error(
          "power_threshold target requires activity_category (run|bike|swim|other)",
        );
      }

      return {
        target_type: "power_threshold",
        target_watts: watts,
        test_duration_s: testDurationSeconds,
        activity_category: activityCategory,
      };
    }
    case "hr_threshold": {
      const lthr = getPositiveInteger(target.target_lthr_bpm);
      if (lthr === null) {
        throw new Error("hr_threshold target requires target_lthr_bpm");
      }

      return {
        target_type: "hr_threshold",
        target_lthr_bpm: lthr,
      };
    }
  }
}

export function deriveActivityCategoriesFromGoalTargets(
  goals: Array<Pick<TrainingGoal, "targets">>,
): string[] {
  const categories = new Set<string>();

  for (const goal of goals) {
    for (const target of goal.targets) {
      if (target.target_type === "race_performance") {
        categories.add(target.activity_category);
      }

      if (target.target_type === "hr_threshold") {
        categories.add("run");
      }

      if (target.target_type === "pace_threshold") {
        categories.add(target.activity_category);
      }

      if (target.target_type === "power_threshold") {
        categories.add(target.activity_category);
      }
    }
  }

  if (categories.size === 0) {
    return ["run"];
  }

  const order = ["run", "bike", "swim", "strength", "other"];
  return Array.from(categories).sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  );
}

function getPositiveNumber(value: unknown): number | null {
  const numericValue =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (
    typeof numericValue !== "number" ||
    !Number.isFinite(numericValue) ||
    numericValue <= 0
  ) {
    return null;
  }

  return numericValue;
}

function getPositiveInteger(value: unknown): number | null {
  const numericValue =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (
    typeof numericValue !== "number" ||
    !Number.isFinite(numericValue) ||
    !Number.isInteger(numericValue) ||
    numericValue <= 0
  ) {
    return null;
  }

  return numericValue;
}
