import { z } from "zod";
import { canonicalSportSchema } from "../sport";
import {
  creationOptimizationProfileEnum,
  creationWeekDayEnum,
  trainingPlanCalibrationConfigSchema,
} from "../training_plan_structure";

const capabilityBoundedNumber = z.number().min(0).max(1);

function buildUniqueDayRefinement(path: string[]) {
  return (days: string[], ctx: z.RefinementCtx) => {
    const seenDays = new Set<string>();

    for (const [index, day] of days.entries()) {
      if (seenDays.has(day)) {
        ctx.addIssue({
          code: "custom",
          path: [...path, index],
          message: "Weekdays must be unique",
        });
      }

      seenDays.add(day);
    }
  };
}

export const athletePreferenceWindowSchema = z
  .object({
    start_minute_of_day: z.number().int().min(0).max(1439),
    end_minute_of_day: z.number().int().min(1).max(1440),
  })
  .strict()
  .refine((value) => value.end_minute_of_day > value.start_minute_of_day, {
    path: ["end_minute_of_day"],
    message: "Availability window end must be after start",
  });

export const athletePreferenceAvailabilityDaySchema = z
  .object({
    day: creationWeekDayEnum,
    windows: z.array(athletePreferenceWindowSchema).max(4).default([]),
    max_sessions: z.number().int().min(0).max(3).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const sortedWindows = [...value.windows].sort(
      (left, right) => left.start_minute_of_day - right.start_minute_of_day,
    );

    for (let index = 1; index < sortedWindows.length; index += 1) {
      const previousWindow = sortedWindows[index - 1];
      const currentWindow = sortedWindows[index];

      if (
        previousWindow &&
        currentWindow &&
        currentWindow.start_minute_of_day < previousWindow.end_minute_of_day
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["windows", index],
          message: "Availability windows cannot overlap",
        });
      }
    }
  });

export const athletePreferenceAvailabilitySchema = z
  .object({
    weekly_windows: z.array(athletePreferenceAvailabilityDaySchema).max(7).default([]),
    hard_rest_days: z.array(creationWeekDayEnum).max(7).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    buildUniqueDayRefinement(["hard_rest_days"])(value.hard_rest_days, ctx);

    const seenDays = new Set<string>();

    for (const [index, dayConfig] of value.weekly_windows.entries()) {
      if (seenDays.has(dayConfig.day)) {
        ctx.addIssue({
          code: "custom",
          path: ["weekly_windows", index, "day"],
          message: "Each weekday can only appear once in weekly_windows",
        });
      }
      seenDays.add(dayConfig.day);
    }
  });

const athletePreferenceSportDoseLimitOverrideSchema = z
  .object({
    min_sessions_per_week: z.number().int().min(0).max(21).optional(),
    max_sessions_per_week: z.number().int().min(0).max(21).optional(),
    max_single_session_duration_minutes: z.number().int().min(20).max(600).optional(),
    max_weekly_duration_minutes: z.number().int().min(30).max(10080).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.min_sessions_per_week !== undefined &&
      value.max_sessions_per_week !== undefined &&
      value.min_sessions_per_week > value.max_sessions_per_week
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["min_sessions_per_week"],
        message: "Minimum sessions per week cannot exceed maximum sessions",
      });
    }
  });

export const athletePreferenceDoseLimitsSchema = z
  .object({
    min_sessions_per_week: z.number().int().min(0).max(21).optional(),
    max_sessions_per_week: z.number().int().min(0).max(21).optional(),
    max_single_session_duration_minutes: z.number().int().min(20).max(600).optional(),
    max_weekly_duration_minutes: z.number().int().min(30).max(10080).optional(),
    sport_overrides: z
      .partialRecord(canonicalSportSchema, athletePreferenceSportDoseLimitOverrideSchema)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.min_sessions_per_week !== undefined &&
      value.max_sessions_per_week !== undefined &&
      value.min_sessions_per_week > value.max_sessions_per_week
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["min_sessions_per_week"],
        message: "Minimum sessions per week cannot exceed maximum sessions",
      });
    }
  });

export const athletePreferenceTrainingStyleSchema = z
  .object({
    progression_pace: capabilityBoundedNumber,
    week_pattern_preference: capabilityBoundedNumber,
    key_session_density_preference: capabilityBoundedNumber.optional(),
    strength_integration_priority: capabilityBoundedNumber,
  })
  .strict();

export const athletePreferenceRecoverySchema = z
  .object({
    recovery_priority: capabilityBoundedNumber,
    post_goal_recovery_days: z.number().int().min(0).max(28),
    systemic_fatigue_tolerance: capabilityBoundedNumber,
    double_day_tolerance: capabilityBoundedNumber.optional(),
    long_session_fatigue_tolerance: capabilityBoundedNumber.optional(),
  })
  .strict();

export const athletePreferenceAdaptationSchema = z
  .object({
    recency_adaptation_preference: capabilityBoundedNumber.optional(),
    plan_churn_tolerance: capabilityBoundedNumber.optional(),
  })
  .strict();

export const athletePreferenceGoalStrategySchema = z
  .object({
    target_surplus_preference: capabilityBoundedNumber,
    priority_tradeoff_preference: capabilityBoundedNumber.optional(),
    taper_style_preference: capabilityBoundedNumber,
  })
  .strict();

export const athletePreferenceBaselineSchema = z
  .object({
    is_enabled: z.boolean().default(false),
    override_ctl: z.number().min(0).max(250).optional(),
    override_atl: z.number().min(0).max(250).optional(),
    override_date: z.string().datetime().optional(),
    // Ramp rate overrides - applied when baseline fitness is enabled
    // These allow advanced athletes to override the default safety caps
    max_weekly_tss_ramp_pct: z.number().min(0).max(40).optional(),
    max_ctl_ramp_per_week: z.number().min(0).max(12).optional(),
  })
  .strict();

/**
 * Canonical persisted athlete preference profile.
 *
 * This schema intentionally excludes planner-only controls, diagnostics,
 * calibration, provenance, and workflow state.
 */
export const athletePreferenceProfileSchema = z
  .object({
    availability: athletePreferenceAvailabilitySchema,
    dose_limits: athletePreferenceDoseLimitsSchema,
    training_style: athletePreferenceTrainingStyleSchema,
    recovery_preferences: athletePreferenceRecoverySchema,
    adaptation_preferences: athletePreferenceAdaptationSchema,
    goal_strategy_preferences: athletePreferenceGoalStrategySchema,
    baseline_fitness: athletePreferenceBaselineSchema.optional(),
  })
  .strict();

export const athletePreferenceAvailabilityPatchSchema = z
  .object({
    weekly_windows: z.array(athletePreferenceAvailabilityDaySchema).max(7).optional(),
    hard_rest_days: z.array(creationWeekDayEnum).max(7).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.hard_rest_days) {
      buildUniqueDayRefinement(["hard_rest_days"])(value.hard_rest_days, ctx);
    }

    if (value.weekly_windows) {
      const seenDays = new Set<string>();

      for (const [index, dayConfig] of value.weekly_windows.entries()) {
        if (seenDays.has(dayConfig.day)) {
          ctx.addIssue({
            code: "custom",
            path: ["weekly_windows", index, "day"],
            message: "Each weekday can only appear once in weekly_windows",
          });
        }
        seenDays.add(dayConfig.day);
      }
    }
  });

export const athletePreferenceProfilePatchSchema = z
  .object({
    availability: athletePreferenceAvailabilityPatchSchema.optional(),
    dose_limits: athletePreferenceDoseLimitsSchema.partial().optional(),
    training_style: athletePreferenceTrainingStyleSchema.partial().optional(),
    recovery_preferences: athletePreferenceRecoverySchema.partial().optional(),
    adaptation_preferences: athletePreferenceAdaptationSchema.partial().optional(),
    goal_strategy_preferences: athletePreferenceGoalStrategySchema.partial().optional(),
    baseline_fitness: athletePreferenceBaselineSchema.partial().optional(),
  })
  .strict();

export const defaultAthletePreferenceProfile = athletePreferenceProfileSchema.parse({
  availability: {
    weekly_windows: [],
    hard_rest_days: [],
  },
  dose_limits: {
    min_sessions_per_week: 3,
    max_sessions_per_week: 4,
    max_single_session_duration_minutes: 90,
    max_weekly_duration_minutes: 360,
    sport_overrides: {},
  },
  training_style: {
    progression_pace: 0.5,
    week_pattern_preference: 0.5,
    key_session_density_preference: 0.5,
    strength_integration_priority: 0.5,
  },
  recovery_preferences: {
    recovery_priority: 0.6,
    post_goal_recovery_days: 5,
    systemic_fatigue_tolerance: 0.5,
    double_day_tolerance: 0.25,
    long_session_fatigue_tolerance: 0.5,
  },
  adaptation_preferences: {
    recency_adaptation_preference: 0.5,
    plan_churn_tolerance: 0.4,
  },
  goal_strategy_preferences: {
    target_surplus_preference: 0,
    priority_tradeoff_preference: 0.5,
    taper_style_preference: 0.5,
  },
  baseline_fitness: {
    is_enabled: false,
    max_weekly_tss_ramp_pct: 10, // Default: outcome_first profile
    max_ctl_ramp_per_week: 5,
  },
});

export const profilePreferenceDefaultsSchema = athletePreferenceProfileSchema;

/**
 * Plan-scoped preference overrides layered on top of profile defaults.
 */
export const planPreferenceOverridesSchema = athletePreferenceProfilePatchSchema;

export const plannerPolicyConfigSchema = z
  .object({
    optimization_profile: creationOptimizationProfileEnum.default("balanced"),
    load_tuning: z
      .object({
        spike_frequency: capabilityBoundedNumber.default(0.35),
        shape_target: z.number().min(-1).max(1).default(0),
        shape_strength: capabilityBoundedNumber.default(0.35),
      })
      .strict(),
    model_confidence: z
      .object({
        starting_fitness_confidence: capabilityBoundedNumber.default(0.6),
      })
      .strict(),
    calibration: trainingPlanCalibrationConfigSchema.default(
      trainingPlanCalibrationConfigSchema.parse({}),
    ),
  })
  .strict();

export const plannerDerivedDiagnosticsSchema = z
  .object({
    fallback_depth: z.number().int().min(0).default(0),
    fallback_mode: z.string().min(1).max(120).optional(),
    confidence: capabilityBoundedNumber.optional(),
    rationale_codes: z.array(z.string().min(1).max(120)).default([]),
    provenance_notes: z.array(z.string().min(1).max(240)).default([]),
  })
  .strict();

export const athleteCapabilitySliceSchema = z
  .object({
    aerobic_base: capabilityBoundedNumber,
    threshold_capacity: capabilityBoundedNumber,
    high_intensity_capacity: capabilityBoundedNumber,
    durability: capabilityBoundedNumber,
    recovery_speed: capabilityBoundedNumber,
    technical_proficiency: capabilityBoundedNumber,
    evidence_quality: capabilityBoundedNumber,
    evidence_recency_days: z.number().min(0).max(3650),
  })
  .strict();

export const capabilitySnapshotInvalidationReasonEnum = z.enum([
  "new_activity",
  "history_import",
  "threshold_update",
  "profile_preference_change",
  "manual_refresh",
]);

export const capabilitySnapshotFreshnessStateEnum = z.enum(["fresh", "stale", "invalidated"]);

export const athleteCapabilityFreshnessMetadataSchema = z
  .object({
    generated_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    invalidated_at: z.string().datetime().optional(),
    invalidation_reasons: z.array(capabilitySnapshotInvalidationReasonEnum).default([]),
    last_activity_at: z.string().datetime().optional(),
    last_threshold_update_at: z.string().datetime().optional(),
    last_profile_preference_change_at: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const generatedAt = Date.parse(value.generated_at);
    const expiresAt = Date.parse(value.expires_at);

    if (Number.isNaN(generatedAt) || Number.isNaN(expiresAt)) {
      return;
    }

    if (expiresAt < generatedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["expires_at"],
        message: "Capability snapshot expiry must not precede generation",
      });
    }

    if (value.invalidated_at && value.invalidation_reasons.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["invalidation_reasons"],
        message: "Invalidated snapshots must include at least one reason",
      });
    }

    if (!value.invalidated_at && value.invalidation_reasons.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["invalidated_at"],
        message: "Invalidation reasons require an invalidated_at timestamp",
      });
    }
  });

export const athleteCapabilitySnapshotSchema = z
  .object({
    sport_slices: z
      .object({
        run: athleteCapabilitySliceSchema,
        bike: athleteCapabilitySliceSchema,
        swim: athleteCapabilitySliceSchema,
        other: athleteCapabilitySliceSchema,
      })
      .strict(),
    freshness: athleteCapabilityFreshnessMetadataSchema,
  })
  .strict();

export const profileTrainingSettingsRecordSchema = z
  .object({
    profile_id: z.string().uuid(),
    settings: athletePreferenceProfileSchema,
    updated_at: z.string().optional(),
  })
  .strict();

export type AthletePreferenceAvailability = z.infer<typeof athletePreferenceAvailabilitySchema>;
export type AthletePreferenceProfile = z.infer<typeof athletePreferenceProfileSchema>;
export type ProfilePreferenceDefaults = AthletePreferenceProfile;
export type AthletePreferenceProfilePatch = z.infer<typeof athletePreferenceProfilePatchSchema>;
export type PlanPreferenceOverrides = z.infer<typeof planPreferenceOverridesSchema>;
export type PlannerPolicyConfig = z.infer<typeof plannerPolicyConfigSchema>;
export type PlannerDerivedDiagnostics = z.infer<typeof plannerDerivedDiagnosticsSchema>;
export type AthleteCapabilitySlice = z.infer<typeof athleteCapabilitySliceSchema>;
export type CapabilitySnapshotInvalidationReason = z.infer<
  typeof capabilitySnapshotInvalidationReasonEnum
>;
export type CapabilitySnapshotFreshnessState = z.infer<typeof capabilitySnapshotFreshnessStateEnum>;
export type AthleteCapabilitySnapshot = z.infer<typeof athleteCapabilitySnapshotSchema>;
export type ProfileTrainingSettingsRecord = z.infer<typeof profileTrainingSettingsRecordSchema>;

export const athleteTrainingSettingsSchema = athletePreferenceProfileSchema;
export const athleteTrainingSettingsPatchSchema = athletePreferenceProfilePatchSchema;

export type AthleteTrainingSettings = AthletePreferenceProfile;
export type AthleteTrainingSettingsPatch = AthletePreferenceProfilePatch;

/**
 * Resolves effective preferences by applying plan overrides to profile defaults.
 *
 * Objects merge field-by-field and array-valued fields replace the profile value
 * only when the override explicitly provides a new array.
 */
export function resolveEffectivePreferences(
  profileDefaults: AthletePreferenceProfile,
  planOverrides?: PlanPreferenceOverrides,
): AthletePreferenceProfile {
  const parsedDefaults = athletePreferenceProfileSchema.parse(profileDefaults);
  const parsedOverrides = planOverrides
    ? planPreferenceOverridesSchema.parse(planOverrides)
    : undefined;

  if (!parsedOverrides) {
    return parsedDefaults;
  }

  return athletePreferenceProfileSchema.parse({
    availability: {
      ...parsedDefaults.availability,
      ...parsedOverrides.availability,
      weekly_windows:
        parsedOverrides.availability?.weekly_windows ?? parsedDefaults.availability.weekly_windows,
      hard_rest_days:
        parsedOverrides.availability?.hard_rest_days ?? parsedDefaults.availability.hard_rest_days,
    },
    dose_limits: {
      ...parsedDefaults.dose_limits,
      ...parsedOverrides.dose_limits,
      sport_overrides:
        parsedDefaults.dose_limits.sport_overrides || parsedOverrides.dose_limits?.sport_overrides
          ? {
              ...(parsedDefaults.dose_limits.sport_overrides ?? {}),
              ...(parsedOverrides.dose_limits?.sport_overrides ?? {}),
            }
          : undefined,
    },
    training_style: {
      ...parsedDefaults.training_style,
      ...parsedOverrides.training_style,
    },
    recovery_preferences: {
      ...parsedDefaults.recovery_preferences,
      ...parsedOverrides.recovery_preferences,
    },
    adaptation_preferences: {
      ...parsedDefaults.adaptation_preferences,
      ...parsedOverrides.adaptation_preferences,
    },
    goal_strategy_preferences: {
      ...parsedDefaults.goal_strategy_preferences,
      ...parsedOverrides.goal_strategy_preferences,
    },
    baseline_fitness: {
      ...parsedDefaults.baseline_fitness,
      ...parsedOverrides.baseline_fitness,
    },
  });
}

export interface ResolveCapabilityFreshnessInput {
  snapshot: AthleteCapabilitySnapshot;
  asOf?: string;
}

export interface CapabilitySnapshotInvalidationInput {
  snapshot: AthleteCapabilitySnapshot;
  reason: CapabilitySnapshotInvalidationReason;
  invalidated_at: string;
}

export interface CapabilitySnapshotChangeEvent {
  reason: CapabilitySnapshotInvalidationReason;
  occurred_at: string;
}

/**
 * Resolves whether a capability snapshot is still usable at a given time.
 */
export function resolveCapabilitySnapshotFreshness(
  input: ResolveCapabilityFreshnessInput,
): CapabilitySnapshotFreshnessState {
  const snapshot = athleteCapabilitySnapshotSchema.parse(input.snapshot);
  const asOfTimestamp = Date.parse(input.asOf ?? snapshot.freshness.generated_at);
  const invalidatedAtTimestamp = snapshot.freshness.invalidated_at
    ? Date.parse(snapshot.freshness.invalidated_at)
    : Number.NaN;

  if (
    snapshot.freshness.invalidated_at &&
    !Number.isNaN(invalidatedAtTimestamp) &&
    invalidatedAtTimestamp <= asOfTimestamp
  ) {
    return capabilitySnapshotFreshnessStateEnum.enum.invalidated;
  }

  const expiresAtTimestamp = Date.parse(snapshot.freshness.expires_at);
  if (!Number.isNaN(expiresAtTimestamp) && asOfTimestamp > expiresAtTimestamp) {
    return capabilitySnapshotFreshnessStateEnum.enum.stale;
  }

  return capabilitySnapshotFreshnessStateEnum.enum.fresh;
}

/**
 * Returns true when a new domain event should invalidate the cached snapshot.
 */
export function shouldInvalidateCapabilitySnapshot(
  snapshot: AthleteCapabilitySnapshot,
  event: CapabilitySnapshotChangeEvent,
): boolean {
  const parsedSnapshot = athleteCapabilitySnapshotSchema.parse(snapshot);
  const occurredAtTimestamp = Date.parse(event.occurred_at);
  const generatedAtTimestamp = Date.parse(parsedSnapshot.freshness.generated_at);

  if (Number.isNaN(occurredAtTimestamp) || Number.isNaN(generatedAtTimestamp)) {
    return false;
  }

  return occurredAtTimestamp >= generatedAtTimestamp;
}

/**
 * Marks a capability snapshot as invalidated while preserving the derived slices.
 */
export function invalidateCapabilitySnapshot(
  input: CapabilitySnapshotInvalidationInput,
): AthleteCapabilitySnapshot {
  const snapshot = athleteCapabilitySnapshotSchema.parse(input.snapshot);

  return athleteCapabilitySnapshotSchema.parse({
    ...snapshot,
    freshness: {
      ...snapshot.freshness,
      invalidated_at: input.invalidated_at,
      invalidation_reasons: Array.from(
        new Set([...snapshot.freshness.invalidation_reasons, input.reason]),
      ),
    },
  });
}
