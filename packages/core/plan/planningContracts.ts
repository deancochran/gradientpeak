import { z } from "zod";

export const planningActivityCategorySchema = z.enum(["run", "bike", "swim", "strength", "other"]);

export const planningPrimaryFocusSchema = z.enum([
  "rest",
  "recovery",
  "endurance",
  "long_endurance",
  "tempo",
  "threshold",
  "vo2",
  "anaerobic",
  "race_specific",
  "strength_endurance",
  "hypertrophy",
  "max_strength",
  "power",
  "mobility",
  "mixed_conditioning",
]);

export const dailyLoadReasonCodeSchema = z.enum([
  "daily_recommended_load_v1",
  "daily_load_distribution_v1",
  "source_weekly_target",
  "source_missing_weekly_target",
  "target_zero_tss",
  "target_positive_tss",
  "partial_week_scaled",
  "source_planned_session",
  "fallback_no_planned_session",
  "planned_session_estimated_tss",
  "planned_session_explicit_focus",
  "planned_session_explicit_activity",
  "source_preferred_weekdays",
  "fallback_missing_preferred_weekdays",
  "fallback_default_all_weekdays",
  "hard_rest_day_applied",
  "source_scheduled_load",
  "source_completed_load",
  "rest_day_allocation",
  "weekly_target_daily_distribution",
  "source_preference_profile",
  "fallback_missing_preference_profile",
  "availability_windows_applied",
  "availability_default_pattern",
  "hard_rest_days_applied",
  "source_planned_session_dates",
  "fallback_anchor_session_pattern",
  "explicit_scheduling_constraints_applied",
  "planned_session_date_applied",
  "planned_session_date_specific",
  "source_weekly_allocation_activity_mix",
  "fallback_default_activity_category",
  "profile_goal_weekly_distribution",
  "planned_session_category_pin",
  "weekly_allocation_category_budget",
  "hard_rest_day_cap",
  "availability_duration_cap_applied",
  "max_single_session_duration_cap_applied",
  "athlete_capacity_cap_applied",
  "daily_cap_binding",
  "weekly_target_under_allocated_daily_caps",
  "single_training_day_full_weekly_allocation",
  "all_training_days_unavailable",
  "explicit_constraints_no_training_days",
]);

export type DailyLoadReasonCode = z.infer<typeof dailyLoadReasonCodeSchema>;

export const plannedTrainingSessionSchema = z
  .object({
    date: z.string().nullable().optional(),
    offsetDays: z.number().int().nullable().optional(),
    estimatedTss: z.number().nonnegative().nullable().optional(),
    estimatedDurationMinutes: z.number().nonnegative().nullable().optional(),
    estimatedFatigueCost: z.number().nonnegative().nullable().optional(),
    estimatedStrengthSets: z.number().nonnegative().nullable().optional(),
    intentType: z.string().nullable().optional(),
    primaryFocus: planningPrimaryFocusSchema.nullable().optional(),
    activityCategory: planningActivityCategorySchema.nullable().optional(),
    source: z.enum(["generated", "scheduled", "user_adjusted", "imported"]).optional(),
  })
  .strict()
  .superRefine((session, ctx) => {
    if (!session.date && typeof session.offsetDays !== "number") {
      ctx.addIssue({ code: "custom", message: "Planned sessions require date or offsetDays." });
    }
  });

export type PlannedTrainingSession = z.infer<typeof plannedTrainingSessionSchema>;

export const planningEngineInputSchema = z
  .object({
    timeline: z.object({ start_date: z.string(), end_date: z.string() }).strict(),
    blocks: z.array(z.unknown()).default([]),
    goals: z.array(z.unknown()).default([]),
    starting_ctl: z.number().optional(),
    starting_atl: z.number().optional(),
    starting_tsb: z.number().optional(),
    creation_config: z.unknown().optional(),
    preference_profile: z.unknown().optional(),
    training_prescription: z.unknown().optional(),
    weekly_allocation: z.unknown().optional(),
    planned_sessions: z.array(plannedTrainingSessionSchema).optional(),
    scheduling_constraints: z.unknown().optional(),
    no_history_context: z.unknown().optional(),
    prior_inferred_snapshot: z.unknown().optional(),
    disable_weekly_tss_optimizer: z.boolean().optional(),
  })
  .strict();

export type PlanningEngineInput = z.infer<typeof planningEngineInputSchema>;

export const dailyPrescriptionSessionSchema = z
  .object({
    activity_category: planningActivityCategorySchema,
    primary_focus: planningPrimaryFocusSchema,
    target_load_tss: z.number().nonnegative(),
    target_duration_minutes: z.number().nonnegative(),
    target_fatigue_cost: z.number().nonnegative(),
    target_strength_sets: z.number().nonnegative(),
    key_session: z.boolean(),
    source: z.enum(["generated", "planned_session", "rest_day"]),
    reason_codes: z.array(dailyLoadReasonCodeSchema),
  })
  .strict();

export const dailyPrescriptionPointSchema = z
  .object({
    date: z.string(),
    sessions: z.array(dailyPrescriptionSessionSchema),
    reason_codes: z.array(dailyLoadReasonCodeSchema),
  })
  .strict();

export type DailyPrescriptionPoint = z.infer<typeof dailyPrescriptionPointSchema>;

export const planningDiagnosticsSchema = z
  .object({
    version: z.literal(1),
    day_count: z.number().int().nonnegative(),
    training_day_count: z.number().int().nonnegative(),
    rest_day_count: z.number().int().nonnegative(),
    planned_session_anchor_count: z.number().int().nonnegative(),
    underallocated_day_count: z.number().int().nonnegative(),
    capacity_limited_day_count: z.number().int().nonnegative(),
    fallback_day_count: z.number().int().nonnegative(),
    average_confidence_score: z.number().min(0).max(100),
    risk_flags: z.array(z.string()),
  })
  .strict();

export type PlanningDiagnostics = z.infer<typeof planningDiagnosticsSchema>;

type DailyPrescriptionSourcePoint = {
  date: string;
  recommendedLoadTss: number;
  recommendedDurationMinutes: number;
  recommendedFatigueCost: number;
  recommendedStrengthSets: number;
  primaryFocus: z.infer<typeof planningPrimaryFocusSchema>;
  activityCategory: z.infer<typeof planningActivityCategorySchema>;
  confidence_score?: number;
  reasonCodes: string[];
};

export function normalizeDailyLoadReasonCodes(codes: string[]): DailyLoadReasonCode[] {
  return codes.flatMap((code) => {
    const parsed = dailyLoadReasonCodeSchema.safeParse(code);
    return parsed.success ? [parsed.data] : [];
  });
}

export function buildDailyPrescriptionPoints(
  points: DailyPrescriptionSourcePoint[],
): DailyPrescriptionPoint[] {
  return points.map((point) => {
    const reason_codes = normalizeDailyLoadReasonCodes(point.reasonCodes);
    const isTrainingDay = point.recommendedLoadTss > 0 && point.primaryFocus !== "rest";
    return dailyPrescriptionPointSchema.parse({
      date: point.date,
      reason_codes,
      sessions: isTrainingDay
        ? [
            {
              activity_category: point.activityCategory,
              primary_focus: point.primaryFocus,
              target_load_tss: point.recommendedLoadTss,
              target_duration_minutes: point.recommendedDurationMinutes,
              target_fatigue_cost: point.recommendedFatigueCost,
              target_strength_sets: point.recommendedStrengthSets,
              key_session: point.reasonCodes.some(
                (code) =>
                  code === "planned_session_date_applied" ||
                  code === "planned_session_category_pin",
              ),
              source: point.reasonCodes.includes("planned_session_date_applied")
                ? "planned_session"
                : "generated",
              reason_codes,
            },
          ]
        : [],
    });
  });
}

export function buildPlanningDiagnostics(
  points: DailyPrescriptionSourcePoint[],
): PlanningDiagnostics {
  const dayCount = points.length;
  const trainingDayCount = points.filter((point) => point.recommendedLoadTss > 0).length;
  const plannedSessionAnchorCount = points.filter((point) =>
    point.reasonCodes.includes("planned_session_date_applied"),
  ).length;
  const underallocatedDayCount = points.filter((point) =>
    point.reasonCodes.includes("weekly_target_under_allocated_daily_caps"),
  ).length;
  const capacityLimitedDayCount = points.filter((point) =>
    point.reasonCodes.includes("athlete_capacity_cap_applied"),
  ).length;
  const fallbackDayCount = points.filter((point) =>
    point.reasonCodes.some((code) => code.startsWith("fallback_")),
  ).length;
  const averageConfidenceScore =
    dayCount > 0
      ? Math.round(
          (points.reduce((sum, point) => sum + (point.confidence_score ?? 0), 0) / dayCount) * 10,
        ) / 10
      : 0;

  return planningDiagnosticsSchema.parse({
    version: 1,
    day_count: dayCount,
    training_day_count: trainingDayCount,
    rest_day_count: Math.max(0, dayCount - trainingDayCount),
    planned_session_anchor_count: plannedSessionAnchorCount,
    underallocated_day_count: underallocatedDayCount,
    capacity_limited_day_count: capacityLimitedDayCount,
    fallback_day_count: fallbackDayCount,
    average_confidence_score: averageConfidenceScore,
    risk_flags: [
      ...(underallocatedDayCount > 0 ? ["daily_load_underallocated"] : []),
      ...(capacityLimitedDayCount > 0 ? ["capacity_caps_applied"] : []),
      ...(fallbackDayCount > dayCount / 2 ? ["fallback_heavy_projection"] : []),
    ],
  });
}
