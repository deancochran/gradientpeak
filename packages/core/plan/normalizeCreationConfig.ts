import {
  creationAvailabilityConfigSchema,
  creationConfigLocksSchema,
  creationConstraintsSchema,
  creationOptimizationProfileEnum,
  projectionControlOwnershipMapV2Schema,
  projectionControlV2Schema,
  creationProvenanceSchema,
  creationRecentInfluenceActionEnum,
  creationValueSourceEnum,
  trainingPlanCreationConfigSchema,
  type CreationAvailabilityConfig,
  type CreationConfigLocks,
  type CreationConstraints,
  type CreationProvenance,
  type CreationRecentInfluence,
  type CreationRecentInfluenceAction,
  type CreationValueSource,
  type ProjectionControlOwnershipMapV2,
  type ProjectionControlV2,
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
  max_weekly_tss_ramp_pct: number;
  max_ctl_ramp_per_week: number;
  projection_control_v2: ProjectionControlV2;
  calibration: TrainingPlanCalibrationConfig;
};

type PartialProjectionControlInput = {
  mode?: ProjectionControlV2["mode"];
  ambition?: number;
  risk_tolerance?: number;
  curvature?: number;
  curvature_strength?: number;
  user_owned?: Partial<ProjectionControlOwnershipMapV2>;
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

type CreationConfigInputValues = Omit<
  CreationConfigValues,
  "calibration" | "projection_control_v2"
> & {
  projection_control_v2: PartialProjectionControlInput;
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
  max_weekly_tss_ramp_pct: 7,
  max_ctl_ramp_per_week: 3,
  projection_control_v2: projectionControlV2Schema.parse({}),
  calibration: trainingPlanCalibrationConfigSchema.parse({}),
};

function normalizeProjectionControlWithPrecedence(
  userValue: PartialProjectionControlInput | undefined,
  suggestionValue: PartialProjectionControlInput | undefined,
  defaultValue: ProjectionControlV2,
): ProjectionControlV2 {
  return projectionControlV2Schema.parse({
    mode: pickByPrecedence(
      userValue?.mode,
      suggestionValue?.mode,
      defaultValue.mode,
      false,
    ).value,
    ambition: pickByPrecedence(
      userValue?.ambition,
      suggestionValue?.ambition,
      defaultValue.ambition,
      false,
    ).value,
    risk_tolerance: pickByPrecedence(
      userValue?.risk_tolerance,
      suggestionValue?.risk_tolerance,
      defaultValue.risk_tolerance,
      false,
    ).value,
    curvature: pickByPrecedence(
      userValue?.curvature,
      suggestionValue?.curvature,
      defaultValue.curvature,
      false,
    ).value,
    curvature_strength: pickByPrecedence(
      userValue?.curvature_strength,
      suggestionValue?.curvature_strength,
      defaultValue.curvature_strength,
      false,
    ).value,
    user_owned: projectionControlOwnershipMapV2Schema.parse({
      mode: pickByPrecedence(
        userValue?.user_owned?.mode,
        suggestionValue?.user_owned?.mode,
        defaultValue.user_owned.mode,
        false,
      ).value,
      ambition: pickByPrecedence(
        userValue?.user_owned?.ambition,
        suggestionValue?.user_owned?.ambition,
        defaultValue.user_owned.ambition,
        false,
      ).value,
      risk_tolerance: pickByPrecedence(
        userValue?.user_owned?.risk_tolerance,
        suggestionValue?.user_owned?.risk_tolerance,
        defaultValue.user_owned.risk_tolerance,
        false,
      ).value,
      curvature: pickByPrecedence(
        userValue?.user_owned?.curvature,
        suggestionValue?.user_owned?.curvature,
        defaultValue.user_owned.curvature,
        false,
      ).value,
      curvature_strength: pickByPrecedence(
        userValue?.user_owned?.curvature_strength,
        suggestionValue?.user_owned?.curvature_strength,
        defaultValue.user_owned.curvature_strength,
        false,
      ).value,
    }),
  });
}

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
    projection_control_v2: projectionControlV2Schema.parse({
      ...DEFAULT_VALUES.projection_control_v2,
      ...input.defaults?.projection_control_v2,
      user_owned: {
        ...DEFAULT_VALUES.projection_control_v2.user_owned,
        ...input.defaults?.projection_control_v2?.user_owned,
      },
    }),
    calibration: mergeCalibration(
      DEFAULT_VALUES.calibration,
      input.defaults?.calibration,
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

  const maxWeeklyTssRampPctPick = pickByPrecedence(
    input.user_values?.max_weekly_tss_ramp_pct,
    input.confirmed_suggestions?.max_weekly_tss_ramp_pct,
    defaultValues.max_weekly_tss_ramp_pct,
    locks.max_weekly_tss_ramp_pct.locked,
  );

  const maxCtlRampPerWeekPick = pickByPrecedence(
    input.user_values?.max_ctl_ramp_per_week,
    input.confirmed_suggestions?.max_ctl_ramp_per_week,
    defaultValues.max_ctl_ramp_per_week,
    locks.max_ctl_ramp_per_week.locked,
  );

  const projectionControl = normalizeProjectionControlWithPrecedence(
    input.user_values?.projection_control_v2,
    input.confirmed_suggestions?.projection_control_v2,
    defaultValues.projection_control_v2,
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
    max_weekly_tss_ramp_pct: maxWeeklyTssRampPctPick.value,
    max_ctl_ramp_per_week: maxCtlRampPerWeekPick.value,
    projection_control_v2: projectionControl,
    calibration: mergeCalibration(
      DEFAULT_VALUES.calibration,
      calibrationPick.value,
    ),
    locks,
  });
}
