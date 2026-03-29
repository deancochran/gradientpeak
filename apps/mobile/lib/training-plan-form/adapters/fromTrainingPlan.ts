import {
  type CreationAvailabilityConfig,
  type CreationProvenance,
  type CreationValueSource,
  trainingPlanCalibrationConfigSchema,
} from "@repo/core";
import type {
  GoalFormData,
  GoalTargetFormData,
  TrainingPlanConfigFormData,
  TrainingPlanFormData,
} from "@/components/training-plan/create/SinglePageForm";
import { formatSecondsToHms, formatSecondsToMmSs } from "@/lib/training-plan-form/input-parsers";

const STABLE_PROVENANCE_TS = "1970-01-01T00:00:00.000Z";

type JsonRecord = Record<string, unknown>;

const weekDays: CreationAvailabilityConfig["days"][number]["day"][] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const asRecord = (value: unknown): JsonRecord | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as JsonRecord;
};

const asDateOnly = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
};

const asNumber = (value: unknown): number | undefined => {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value.filter((entry): entry is string => typeof entry === "string");
  return parsed.length > 0 ? parsed : undefined;
};

const createFallbackTargetDate = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 112);
  return date.toISOString().split("T")[0] ?? "";
};

const createProvenance = (
  source: CreationValueSource,
  rationale: string[],
): CreationProvenance => ({
  source,
  confidence: source === "user" ? 1 : 0,
  rationale,
  references: [],
  updated_at: STABLE_PROVENANCE_TS,
});

const createDefaultAvailability = (): CreationAvailabilityConfig => ({
  template: "custom",
  days: weekDays.map((day) => ({
    day,
    windows:
      day === "wednesday" || day === "friday" || day === "saturday" || day === "sunday"
        ? [{ start_minute_of_day: 360, end_minute_of_day: 450 }]
        : [],
    max_sessions:
      day === "wednesday" || day === "friday" || day === "saturday" || day === "sunday" ? 1 : 0,
  })),
});

const createDefaultConfigState = (): TrainingPlanConfigFormData => ({
  availabilityConfig: createDefaultAvailability(),
  availabilityProvenance: createProvenance("default", ["edit_fallback_default"]),
  recentInfluenceScore: 0,
  recentInfluenceAction: "disabled",
  recentInfluenceProvenance: createProvenance("default", ["edit_fallback_default"]),
  constraints: {
    hard_rest_days: ["monday", "tuesday", "thursday"],
    min_sessions_per_week: 3,
    max_sessions_per_week: 4,
    max_single_session_duration_minutes: 90,
    goal_difficulty_preference: "balanced",
  },
  optimizationProfile: "balanced",
  postGoalRecoveryDays: 5,
  behaviorControlsV1: {
    aggressiveness: 0.5,
    variability: 0.5,
    spike_frequency: 0.35,
    shape_target: 0,
    shape_strength: 0.35,
    recovery_priority: 0.6,
    starting_fitness_confidence: 0.6,
  },
  startingCtlAssumption: undefined,
  startingFatigueState: undefined,
  calibration: trainingPlanCalibrationConfigSchema.parse({}),
  calibrationCompositeLocks: {
    target_attainment_weight: false,
    envelope_weight: false,
    durability_weight: false,
    evidence_weight: false,
  },
  constraintsSource: "default",
  locks: {
    availability_config: { locked: false },
    recent_influence: { locked: false },
    hard_rest_days: { locked: false },
    min_sessions_per_week: { locked: false },
    max_sessions_per_week: { locked: false },
    max_single_session_duration_minutes: { locked: false },
    goal_difficulty_preference: { locked: false },
    optimization_profile: { locked: false },
    post_goal_recovery_days: { locked: false },
    behavior_controls_v1: { locked: false },
  },
});

const toDistanceKm = (distanceM: number): string => {
  const distanceKm = Number((distanceM / 1000).toFixed(3));
  return String(distanceKm);
};

const mapTarget = (
  target: JsonRecord,
  goalIndex: number,
  targetIndex: number,
): GoalTargetFormData | undefined => {
  const targetType = target.target_type;
  const baseTarget = {
    id: typeof target.id === "string" ? target.id : `goal-${goalIndex}-target-${targetIndex}`,
  };

  if (targetType === "race_performance") {
    const distanceM = asNumber(target.distance_m);
    const targetTimeS = asNumber(target.target_time_s);
    const category = target.activity_category;
    if (!distanceM || !targetTimeS || typeof category !== "string") {
      return undefined;
    }

    return {
      ...baseTarget,
      targetType,
      activityCategory: category as GoalTargetFormData["activityCategory"],
      distanceKm: toDistanceKm(distanceM),
      completionTimeHms: formatSecondsToHms(targetTimeS),
    };
  }

  if (targetType === "pace_threshold") {
    const speedMps = asNumber(target.target_speed_mps);
    const testDurationS = asNumber(target.test_duration_s);
    const category = target.activity_category;
    if (!speedMps || !testDurationS || typeof category !== "string") {
      return undefined;
    }

    return {
      ...baseTarget,
      targetType,
      activityCategory: category as GoalTargetFormData["activityCategory"],
      paceMmSs: formatSecondsToMmSs(Math.round(1000 / speedMps)),
      testDurationHms: formatSecondsToHms(testDurationS),
    };
  }

  if (targetType === "power_threshold") {
    const watts = asNumber(target.target_watts);
    const testDurationS = asNumber(target.test_duration_s);
    const category = target.activity_category;
    if (!watts || !testDurationS || typeof category !== "string") {
      return undefined;
    }

    return {
      ...baseTarget,
      targetType,
      activityCategory: category as GoalTargetFormData["activityCategory"],
      targetWatts: watts,
      testDurationHms: formatSecondsToHms(testDurationS),
    };
  }

  if (targetType === "hr_threshold") {
    const lthr = asNumber(target.target_lthr_bpm);
    if (!lthr) {
      return undefined;
    }

    return {
      ...baseTarget,
      targetType,
      targetLthrBpm: Math.round(lthr),
    };
  }

  return undefined;
};

function resolveMetadataSnapshots(structure: JsonRecord): {
  metadata: JsonRecord;
  creationConfigSnapshot?: JsonRecord;
  formSnapshot?: JsonRecord;
} {
  const metadata = asRecord(structure.metadata) ?? {};
  const creationSummary = asRecord(metadata.creation_summary);

  return {
    metadata,
    creationConfigSnapshot:
      asRecord(metadata.creation_config_snapshot) ??
      asRecord(creationSummary?.normalized_creation_config),
    formSnapshot: asRecord(metadata.creation_form_snapshot),
  };
}

export function toTrainingPlanFormDataFromStructure(input: {
  structure: unknown;
}): TrainingPlanFormData {
  const parsedStructure = asRecord(input.structure) ?? {};
  const { formSnapshot } = resolveMetadataSnapshots(parsedStructure);
  const fallbackTargetDate = createFallbackTargetDate();
  const goalsSource = Array.isArray(parsedStructure.goals) ? parsedStructure.goals : [];

  const mappedGoals = goalsSource
    .map((goalValue, goalIndex): GoalFormData | undefined => {
      const goal = asRecord(goalValue);
      if (!goal) {
        return undefined;
      }

      const goalTargets = Array.isArray(goal.targets)
        ? goal.targets
            .map((target, targetIndex) => mapTarget(asRecord(target) ?? {}, goalIndex, targetIndex))
            .filter((target): target is GoalTargetFormData => Boolean(target))
        : [];

      if (goalTargets.length === 0) {
        return undefined;
      }

      return {
        id: typeof goal.id === "string" ? goal.id : `goal-${goalIndex + 1}`,
        name: typeof goal.name === "string" ? goal.name : "",
        targetDate: asDateOnly(goal.target_date) ?? fallbackTargetDate,
        priority: asNumber(goal.priority) ?? goalIndex + 1,
        targets: goalTargets,
      };
    })
    .filter((goal): goal is GoalFormData => Boolean(goal));

  const planStartDateFromSnapshot = asDateOnly(formSnapshot?.plan_start_date);
  const planStartDateFromStructure = asDateOnly(parsedStructure.start_date);

  return {
    planStartDate: planStartDateFromSnapshot ?? planStartDateFromStructure,
    goals:
      mappedGoals.length > 0
        ? mappedGoals
        : [
            {
              id: "goal-1",
              name: "",
              targetDate: fallbackTargetDate,
              priority: 1,
              targets: [
                {
                  id: "goal-1-target-1",
                  targetType: "race_performance",
                  activityCategory: "run",
                },
              ],
            },
          ],
  };
}

export function toTrainingPlanConfigFormDataFromStructure(input: {
  structure: unknown;
}): TrainingPlanConfigFormData {
  const parsedStructure = asRecord(input.structure) ?? {};
  const { metadata, creationConfigSnapshot } = resolveMetadataSnapshots(parsedStructure);
  const defaults = createDefaultConfigState();

  const calibrationSnapshot = asRecord(asRecord(metadata.creation_calibration)?.snapshot);
  const merged = {
    ...defaults,
    availabilityConfig:
      (creationConfigSnapshot?.availability_config as CreationAvailabilityConfig | undefined) ??
      defaults.availabilityConfig,
    recentInfluenceScore:
      asNumber(asRecord(creationConfigSnapshot?.recent_influence)?.influence_score) ??
      defaults.recentInfluenceScore,
    recentInfluenceAction:
      (creationConfigSnapshot?.recent_influence_action as
        | TrainingPlanConfigFormData["recentInfluenceAction"]
        | undefined) ?? defaults.recentInfluenceAction,
    constraints:
      (creationConfigSnapshot?.constraints as
        | TrainingPlanConfigFormData["constraints"]
        | undefined) ?? defaults.constraints,
    optimizationProfile:
      (creationConfigSnapshot?.optimization_profile as
        | TrainingPlanConfigFormData["optimizationProfile"]
        | undefined) ?? defaults.optimizationProfile,
    postGoalRecoveryDays:
      asNumber(creationConfigSnapshot?.post_goal_recovery_days) ?? defaults.postGoalRecoveryDays,
    behaviorControlsV1:
      (creationConfigSnapshot?.behavior_controls_v1 as
        | TrainingPlanConfigFormData["behaviorControlsV1"]
        | undefined) ?? defaults.behaviorControlsV1,
    calibrationCompositeLocks:
      (creationConfigSnapshot?.calibration_composite_locks as
        | TrainingPlanConfigFormData["calibrationCompositeLocks"]
        | undefined) ?? defaults.calibrationCompositeLocks,
    startingCtlAssumption:
      asNumber(asRecord(parsedStructure.fitness_progression)?.starting_ctl) ??
      defaults.startingCtlAssumption,
    calibration: trainingPlanCalibrationConfigSchema.parse(
      calibrationSnapshot ?? creationConfigSnapshot?.calibration ?? {},
    ),
    constraintsSource: (creationConfigSnapshot?.constraints
      ? "user"
      : defaults.constraintsSource) as TrainingPlanConfigFormData["constraintsSource"],
    locks:
      (creationConfigSnapshot?.locks as TrainingPlanConfigFormData["locks"] | undefined) ??
      defaults.locks,
  };

  const lockedKeys = asStringArray(metadata.user_locked_fields) ?? [];
  if (lockedKeys.length > 0) {
    merged.locks = {
      ...merged.locks,
      ...Object.fromEntries(lockedKeys.map((key) => [key, { locked: true, locked_by: "user" }])),
    } as TrainingPlanConfigFormData["locks"];
  }

  return merged;
}
