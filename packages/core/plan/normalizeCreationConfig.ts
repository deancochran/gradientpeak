import {
  creationAvailabilityConfigSchema,
  creationBehaviorControlsV1Schema,
  creationConfigLocksSchema,
  creationConstraintsSchema,
  creationOptimizationProfileEnum,
  creationProvenanceSchema,
  creationRecentInfluenceActionEnum,
  creationValueSourceEnum,
  trainingPlanCreationConfigSchema,
  type CreationAvailabilityConfig,
  type CreationBehaviorControlsV1,
  type CreationConfigLocks,
  type CreationConstraints,
  type CreationProvenance,
  type CreationRecentInfluence,
  type CreationRecentInfluenceAction,
  type CreationValueSource,
  type TrainingPlanCalibrationConfig,
  type TrainingPlanCreationConfig,
  trainingPlanCalibrationConfigSchema,
} from "../schemas/training_plan_structure";

const WEEK_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type CreationConfigValues = {
  availability_config: CreationAvailabilityConfig;
  recent_influence: CreationRecentInfluence;
  recent_influence_action: CreationRecentInfluenceAction;
  constraints: CreationConstraints;
  optimization_profile: "outcome_first" | "balanced" | "sustainable";
  post_goal_recovery_days: number;
  behavior_controls_v1: CreationBehaviorControlsV1;
  calibration: TrainingPlanCalibrationConfig;
};

type PartialCalibrationInput = {
  version?: 1;
  readiness_composite?: Partial<
    TrainingPlanCalibrationConfig["readiness_composite"]
  >;
  readiness_timeline?: Partial<
    TrainingPlanCalibrationConfig["readiness_timeline"]
  >;
  envelope_penalties?: Partial<
    TrainingPlanCalibrationConfig["envelope_penalties"]
  >;
  durability_penalties?: Partial<
    TrainingPlanCalibrationConfig["durability_penalties"]
  >;
  no_history?: Partial<TrainingPlanCalibrationConfig["no_history"]>;
  optimizer?: Partial<TrainingPlanCalibrationConfig["optimizer"]>;
};

type CreationConfigInputValues = Omit<CreationConfigValues, "calibration"> & {
  calibration: PartialCalibrationInput;
};

export interface NormalizeCreationConfigInput {
  user_values?: Partial<CreationConfigInputValues> & {
    locks?: Partial<CreationConfigLocks>;
  };
  confirmed_suggestions?: Partial<CreationConfigInputValues>;
  defaults?: Partial<CreationConfigInputValues>;
  provenance_overrides?: {
    availability_provenance?: Partial<CreationProvenance>;
    recent_influence_provenance?: Partial<CreationProvenance>;
  };
  now_iso?: string;
}

const CONSERVATIVE_DEFAULT_AVAILABILITY: CreationAvailabilityConfig =
  creationAvailabilityConfigSchema.parse({
    template: "moderate",
    days: [
      {
        day: "monday",
        windows: [{ start_minute_of_day: 360, end_minute_of_day: 450 }],
        max_sessions: 1,
      },
      {
        day: "tuesday",
        windows: [{ start_minute_of_day: 360, end_minute_of_day: 450 }],
        max_sessions: 1,
      },
      { day: "wednesday", windows: [], max_sessions: 0 },
      {
        day: "thursday",
        windows: [{ start_minute_of_day: 360, end_minute_of_day: 450 }],
        max_sessions: 1,
      },
      { day: "friday", windows: [], max_sessions: 0 },
      {
        day: "saturday",
        windows: [{ start_minute_of_day: 450, end_minute_of_day: 570 }],
        max_sessions: 1,
      },
      { day: "sunday", windows: [], max_sessions: 0 },
    ],
  });

const CONSERVATIVE_DEFAULT_CONSTRAINTS: CreationConstraints =
  creationConstraintsSchema.parse({
    hard_rest_days: ["wednesday", "friday", "sunday"],
    min_sessions_per_week: 3,
    max_sessions_per_week: 4,
    max_single_session_duration_minutes: 90,
    goal_difficulty_preference: "conservative",
  });

const DEFAULT_VALUES: CreationConfigValues = {
  availability_config: CONSERVATIVE_DEFAULT_AVAILABILITY,
  recent_influence: { influence_score: 0 },
  recent_influence_action: "disabled",
  constraints: CONSERVATIVE_DEFAULT_CONSTRAINTS,
  optimization_profile: "balanced",
  post_goal_recovery_days: 5,
  behavior_controls_v1: {
    aggressiveness: 0.5,
    variability: 0.5,
    spike_frequency: 0.35,
    shape_target: 0,
    shape_strength: 0.35,
    recovery_priority: 0.6,
    starting_fitness_confidence: 0.6,
  },
  calibration: trainingPlanCalibrationConfigSchema.parse({}),
};

function mergeCalibration(
  base: TrainingPlanCalibrationConfig,
  override: PartialCalibrationInput | undefined,
): TrainingPlanCalibrationConfig {
  if (!override) {
    return base;
  }

  return trainingPlanCalibrationConfigSchema.parse({
    ...base,
    ...override,
    version: 1,
    readiness_composite: {
      ...base.readiness_composite,
      ...override.readiness_composite,
    },
    readiness_timeline: {
      ...base.readiness_timeline,
      ...override.readiness_timeline,
    },
    envelope_penalties: {
      ...base.envelope_penalties,
      ...override.envelope_penalties,
    },
    durability_penalties: {
      ...base.durability_penalties,
      ...override.durability_penalties,
    },
    no_history: {
      ...base.no_history,
      ...override.no_history,
    },
    optimizer: {
      ...base.optimizer,
      ...override.optimizer,
    },
  });
}

function pickByPrecedence<T>(
  userValue: T | undefined,
  suggestionValue: T | undefined,
  defaultValue: T,
  isLocked: boolean,
): { value: T; source: CreationValueSource } {
  if (isLocked && userValue !== undefined) {
    return { value: userValue, source: creationValueSourceEnum.enum.user };
  }

  if (userValue !== undefined) {
    return { value: userValue, source: creationValueSourceEnum.enum.user };
  }

  if (suggestionValue !== undefined) {
    return {
      value: suggestionValue,
      source: creationValueSourceEnum.enum.suggested,
    };
  }

  return { value: defaultValue, source: creationValueSourceEnum.enum.default };
}

function toCreationProvenance(
  source: CreationValueSource,
  nowIso: string,
  override?: Partial<CreationProvenance>,
): CreationProvenance {
  const base: CreationProvenance = {
    source,
    confidence:
      source === creationValueSourceEnum.enum.user
        ? null
        : source === creationValueSourceEnum.enum.suggested
          ? 0.65
          : 0.25,
    rationale:
      source === creationValueSourceEnum.enum.user
        ? ["user_confirmed"]
        : source === creationValueSourceEnum.enum.suggested
          ? ["profile_derived_suggestion"]
          : ["conservative_default"],
    references:
      source === creationValueSourceEnum.enum.user
        ? [{ type: "user_input", id: "creation_form" }]
        : source === creationValueSourceEnum.enum.suggested
          ? [{ type: "default_heuristic", id: "creation_suggestion" }]
          : [{ type: "default_heuristic", id: "creation_default" }],
    updated_at: nowIso,
  };

  return creationProvenanceSchema.parse({
    ...base,
    ...override,
    source,
    updated_at: override?.updated_at ?? nowIso,
  });
}

function normalizeAvailabilityOrFallback(
  value: CreationAvailabilityConfig | undefined,
): CreationAvailabilityConfig {
  if (!value) return CONSERVATIVE_DEFAULT_AVAILABILITY;
  return creationAvailabilityConfigSchema.parse(value);
}

function normalizeConstraintWithPrecedence(
  userConstraints: Partial<CreationConstraints> | undefined,
  suggestedConstraints: Partial<CreationConstraints> | undefined,
  defaultConstraints: CreationConstraints,
  locks: CreationConfigLocks,
): CreationConstraints {
  return creationConstraintsSchema.parse({
    ...defaultConstraints,
    hard_rest_days: pickByPrecedence(
      userConstraints?.hard_rest_days,
      suggestedConstraints?.hard_rest_days,
      defaultConstraints.hard_rest_days,
      locks.hard_rest_days.locked,
    ).value,
    min_sessions_per_week: pickByPrecedence(
      userConstraints?.min_sessions_per_week,
      suggestedConstraints?.min_sessions_per_week,
      defaultConstraints.min_sessions_per_week,
      locks.min_sessions_per_week.locked,
    ).value,
    max_sessions_per_week: pickByPrecedence(
      userConstraints?.max_sessions_per_week,
      suggestedConstraints?.max_sessions_per_week,
      defaultConstraints.max_sessions_per_week,
      locks.max_sessions_per_week.locked,
    ).value,
    max_single_session_duration_minutes: pickByPrecedence(
      userConstraints?.max_single_session_duration_minutes,
      suggestedConstraints?.max_single_session_duration_minutes,
      defaultConstraints.max_single_session_duration_minutes,
      locks.max_single_session_duration_minutes.locked,
    ).value,
    goal_difficulty_preference: pickByPrecedence(
      userConstraints?.goal_difficulty_preference,
      suggestedConstraints?.goal_difficulty_preference,
      defaultConstraints.goal_difficulty_preference,
      locks.goal_difficulty_preference.locked,
    ).value,
  });
}

/**
 * Normalizes training plan creation config with deterministic precedence.
 *
 * Precedence order (highest -> lowest):
 * 1) locked user values
 * 2) unlocked user values
 * 3) confirmed suggestions
 * 4) defaults
 */
export function normalizeCreationConfig(
  input: NormalizeCreationConfigInput,
): TrainingPlanCreationConfig {
  const nowIso = input.now_iso ?? new Date().toISOString();

  const locks = creationConfigLocksSchema.parse({
    ...input.user_values?.locks,
  });

  const defaultValues: CreationConfigValues = {
    ...DEFAULT_VALUES,
    ...input.defaults,
    availability_config: normalizeAvailabilityOrFallback(
      input.defaults?.availability_config,
    ),
    constraints: creationConstraintsSchema.parse({
      ...CONSERVATIVE_DEFAULT_CONSTRAINTS,
      ...input.defaults?.constraints,
    }),
    calibration: mergeCalibration(
      DEFAULT_VALUES.calibration,
      input.defaults?.calibration,
    ),
    behavior_controls_v1: creationBehaviorControlsV1Schema.parse(
      input.defaults?.behavior_controls_v1 ??
        DEFAULT_VALUES.behavior_controls_v1,
    ),
  };

  const availabilityPick = pickByPrecedence(
    input.user_values?.availability_config,
    input.confirmed_suggestions?.availability_config,
    defaultValues.availability_config,
    locks.availability_config.locked,
  );

  const influencePick = pickByPrecedence(
    input.user_values?.recent_influence,
    input.confirmed_suggestions?.recent_influence,
    defaultValues.recent_influence,
    locks.recent_influence.locked,
  );

  const actionPick = pickByPrecedence(
    input.user_values?.recent_influence_action,
    input.confirmed_suggestions?.recent_influence_action,
    defaultValues.recent_influence_action,
    locks.recent_influence.locked,
  );

  const constraints = normalizeConstraintWithPrecedence(
    input.user_values?.constraints,
    input.confirmed_suggestions?.constraints,
    defaultValues.constraints,
    locks,
  );

  const optimizationProfilePick = pickByPrecedence(
    input.user_values?.optimization_profile,
    input.confirmed_suggestions?.optimization_profile,
    defaultValues.optimization_profile,
    locks.optimization_profile.locked,
  );

  const postGoalRecoveryDaysPick = pickByPrecedence(
    input.user_values?.post_goal_recovery_days,
    input.confirmed_suggestions?.post_goal_recovery_days,
    defaultValues.post_goal_recovery_days,
    locks.post_goal_recovery_days.locked,
  );

  const behaviorControlsPick = pickByPrecedence(
    input.user_values?.behavior_controls_v1,
    input.confirmed_suggestions?.behavior_controls_v1,
    defaultValues.behavior_controls_v1,
    locks.behavior_controls_v1.locked,
  );

  const calibrationPick = pickByPrecedence(
    input.user_values?.calibration,
    input.confirmed_suggestions?.calibration,
    defaultValues.calibration,
    false,
  );

  const normalizedDays = WEEK_DAYS.map((day) => {
    return (
      availabilityPick.value.days.find((entry) => entry.day === day) ?? {
        day,
        windows: [],
        max_sessions: 0,
      }
    );
  });

  const availabilityConfig = creationAvailabilityConfigSchema.parse({
    ...availabilityPick.value,
    days: normalizedDays,
  });

  return trainingPlanCreationConfigSchema.parse({
    availability_config: availabilityConfig,
    availability_provenance: toCreationProvenance(
      availabilityPick.source,
      nowIso,
      input.provenance_overrides?.availability_provenance,
    ),
    recent_influence: influencePick.value,
    recent_influence_action: creationRecentInfluenceActionEnum.parse(
      actionPick.value,
    ),
    recent_influence_provenance: toCreationProvenance(
      influencePick.source,
      nowIso,
      input.provenance_overrides?.recent_influence_provenance,
    ),
    constraints,
    optimization_profile: creationOptimizationProfileEnum.parse(
      optimizationProfilePick.value,
    ),
    post_goal_recovery_days: postGoalRecoveryDaysPick.value,
    behavior_controls_v1: creationBehaviorControlsV1Schema.parse(
      behaviorControlsPick.value,
    ),
    calibration: mergeCalibration(
      DEFAULT_VALUES.calibration,
      calibrationPick.value,
    ),
    locks,
  });
}
