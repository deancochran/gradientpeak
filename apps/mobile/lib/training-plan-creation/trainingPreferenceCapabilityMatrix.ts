import type { PlanningPreferenceFieldKey } from "@repo/core";

export type TrainingPreferenceCapabilityPath =
  | "availability.weekly_windows"
  | "availability.hard_rest_days"
  | "dose_limits.min_sessions_per_week"
  | "dose_limits.max_sessions_per_week"
  | "dose_limits.max_single_session_duration_minutes"
  | "dose_limits.max_weekly_duration_minutes"
  | "dose_limits.sport_overrides"
  | "training_style.progression_pace"
  | "training_style.week_pattern_preference"
  | "training_style.key_session_density_preference"
  | "training_style.strength_integration_priority"
  | "recovery_preferences.recovery_priority"
  | "recovery_preferences.post_goal_recovery_days"
  | "recovery_preferences.systemic_fatigue_tolerance"
  | "recovery_preferences.double_day_tolerance"
  | "recovery_preferences.long_session_fatigue_tolerance"
  | "adaptation_preferences.recency_adaptation_preference"
  | "adaptation_preferences.plan_churn_tolerance"
  | "goal_strategy_preferences.target_surplus_preference"
  | "goal_strategy_preferences.priority_tradeoff_preference"
  | "goal_strategy_preferences.taper_style_preference"
  | "baseline_fitness.is_enabled"
  | "baseline_fitness.override_ctl"
  | "baseline_fitness.override_atl"
  | "baseline_fitness.override_date"
  | "baseline_fitness.max_weekly_tss_ramp_pct"
  | "baseline_fitness.max_ctl_ramp_per_week";

export type TrainingPreferenceStandaloneCoverage =
  | { status: "covered"; testId: string }
  | { status: "group-covered"; testId: string; rationale: string }
  | { status: "gap"; rationale: string };

export type TrainingPreferenceBuilderOverrideCoverage =
  | { status: "supported"; fieldKey: PlanningPreferenceFieldKey; rationale: string }
  | { status: "not-applicable"; rationale: string }
  | { status: "gap"; rationale: string };

export type TrainingPreferenceCapability = {
  path: TrainingPreferenceCapabilityPath;
  label: string;
  standalone: TrainingPreferenceStandaloneCoverage;
  builderOverride: TrainingPreferenceBuilderOverrideCoverage;
};

export const TRAINING_PREFERENCE_SCHEMA_CAPABILITY_PATHS: TrainingPreferenceCapabilityPath[] = [
  "availability.weekly_windows",
  "availability.hard_rest_days",
  "dose_limits.min_sessions_per_week",
  "dose_limits.max_sessions_per_week",
  "dose_limits.max_single_session_duration_minutes",
  "dose_limits.max_weekly_duration_minutes",
  "dose_limits.sport_overrides",
  "training_style.progression_pace",
  "training_style.week_pattern_preference",
  "training_style.key_session_density_preference",
  "training_style.strength_integration_priority",
  "recovery_preferences.recovery_priority",
  "recovery_preferences.post_goal_recovery_days",
  "recovery_preferences.systemic_fatigue_tolerance",
  "recovery_preferences.double_day_tolerance",
  "recovery_preferences.long_session_fatigue_tolerance",
  "adaptation_preferences.recency_adaptation_preference",
  "adaptation_preferences.plan_churn_tolerance",
  "goal_strategy_preferences.target_surplus_preference",
  "goal_strategy_preferences.priority_tradeoff_preference",
  "goal_strategy_preferences.taper_style_preference",
  "baseline_fitness.is_enabled",
  "baseline_fitness.override_ctl",
  "baseline_fitness.override_atl",
  "baseline_fitness.override_date",
  "baseline_fitness.max_weekly_tss_ramp_pct",
  "baseline_fitness.max_ctl_ramp_per_week",
];

export const TRAINING_PREFERENCE_CAPABILITY_MATRIX: TrainingPreferenceCapability[] = [
  {
    path: "availability.weekly_windows",
    label: "Weekly availability windows",
    standalone: { status: "covered", testId: "preferences-weekly-windows" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Builder currently schedules by plan-local sessions/rest days, not time windows.",
    },
  },
  {
    path: "availability.hard_rest_days",
    label: "Hard rest days",
    standalone: { status: "covered", testId: "preferences-hard-rest-days" },
    builderOverride: {
      status: "supported",
      fieldKey: "restDaysPerWeek",
      rationale: "Plan-local rest-day count maps to creation hard-rest-day constraints.",
    },
  },
  {
    path: "dose_limits.min_sessions_per_week",
    label: "Fewest sessions per week",
    standalone: { status: "covered", testId: "preferences-min-sessions" },
    builderOverride: {
      status: "supported",
      fieldKey: "weeklySessionCount",
      rationale: "Builder session count maps to min/max session constraints.",
    },
  },
  {
    path: "dose_limits.max_sessions_per_week",
    label: "Most sessions per week",
    standalone: { status: "covered", testId: "preferences-max-sessions" },
    builderOverride: {
      status: "supported",
      fieldKey: "weeklySessionCount",
      rationale: "Builder session count maps to min/max session constraints.",
    },
  },
  {
    path: "dose_limits.max_single_session_duration_minutes",
    label: "Longest activity duration",
    standalone: { status: "covered", testId: "preferences-max-duration" },
    builderOverride: {
      status: "supported",
      fieldKey: "maxSingleSessionDurationMinutes",
      rationale: "Builder max single-session duration maps to creation constraints.",
    },
  },
  {
    path: "dose_limits.max_weekly_duration_minutes",
    label: "Weekly time budget",
    standalone: { status: "covered", testId: "preferences-max-weekly-duration" },
    builderOverride: {
      status: "supported",
      fieldKey: "targetWeeklyHours",
      rationale: "Builder weekly hours is exposed as plan-local load intent for preview/readiness.",
    },
  },
  {
    path: "dose_limits.sport_overrides",
    label: "Sport-specific dose overrides",
    standalone: { status: "gap", rationale: "No sport override editor is rendered yet." },
    builderOverride: {
      status: "not-applicable",
      rationale:
        "Plan-local builder currently applies plan-wide constraints, not per-sport overrides.",
    },
  },
  {
    path: "training_style.progression_pace",
    label: "Progression pace",
    standalone: { status: "covered", testId: "preferences-progression-pace" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "training_style.week_pattern_preference",
    label: "Week pattern preference",
    standalone: { status: "covered", testId: "preferences-week-pattern" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "training_style.key_session_density_preference",
    label: "Key session density preference",
    standalone: { status: "covered", testId: "preferences-key-session-density" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "training_style.strength_integration_priority",
    label: "Strength integration priority",
    standalone: { status: "covered", testId: "preferences-strength-integration" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "recovery_preferences.recovery_priority",
    label: "Recovery priority",
    standalone: { status: "covered", testId: "preferences-recovery-priority" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "recovery_preferences.post_goal_recovery_days",
    label: "Recovery days after a goal",
    standalone: { status: "covered", testId: "preferences-recovery-days" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "recovery_preferences.systemic_fatigue_tolerance",
    label: "Systemic fatigue tolerance",
    standalone: { status: "covered", testId: "preferences-systemic-fatigue" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "recovery_preferences.double_day_tolerance",
    label: "Double-day tolerance",
    standalone: { status: "covered", testId: "preferences-double-day-tolerance" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "recovery_preferences.long_session_fatigue_tolerance",
    label: "Long-session fatigue tolerance",
    standalone: { status: "covered", testId: "preferences-long-session-fatigue" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "adaptation_preferences.recency_adaptation_preference",
    label: "Recency adaptation preference",
    standalone: { status: "covered", testId: "preferences-recency-adaptation" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "adaptation_preferences.plan_churn_tolerance",
    label: "Plan churn tolerance",
    standalone: { status: "covered", testId: "preferences-plan-churn" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "goal_strategy_preferences.target_surplus_preference",
    label: "Target surplus preference",
    standalone: { status: "covered", testId: "preferences-target-surplus" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "goal_strategy_preferences.priority_tradeoff_preference",
    label: "Priority tradeoff preference",
    standalone: { status: "covered", testId: "preferences-priority-tradeoff" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "goal_strategy_preferences.taper_style_preference",
    label: "Taper style preference",
    standalone: { status: "covered", testId: "preferences-taper-style" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Not currently modeled as a plan-local creation constraint.",
    },
  },
  {
    path: "baseline_fitness.is_enabled",
    label: "Manual baseline enabled",
    standalone: { status: "covered", testId: "preferences-baseline-enabled" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Global athlete baseline, not plan-local.",
    },
  },
  {
    path: "baseline_fitness.override_ctl",
    label: "Manual baseline CTL",
    standalone: { status: "covered", testId: "preferences-baseline-ctl" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Global athlete baseline, not plan-local.",
    },
  },
  {
    path: "baseline_fitness.override_atl",
    label: "Manual baseline ATL",
    standalone: { status: "covered", testId: "preferences-baseline-atl" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Global athlete baseline, not plan-local.",
    },
  },
  {
    path: "baseline_fitness.override_date",
    label: "Manual baseline date",
    standalone: { status: "covered", testId: "preferences-baseline-date" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Global athlete baseline, not plan-local.",
    },
  },
  {
    path: "baseline_fitness.max_weekly_tss_ramp_pct",
    label: "Max weekly TSS ramp percent",
    standalone: { status: "covered", testId: "preferences-ramp-tss-pct" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Global safety calibration, not plan-local.",
    },
  },
  {
    path: "baseline_fitness.max_ctl_ramp_per_week",
    label: "Max CTL ramp per week",
    standalone: { status: "covered", testId: "preferences-ramp-ctl" },
    builderOverride: {
      status: "not-applicable",
      rationale: "Global safety calibration, not plan-local.",
    },
  },
];

export function getTrainingPreferenceCapabilityGaps() {
  return TRAINING_PREFERENCE_CAPABILITY_MATRIX.filter(
    (capability) =>
      capability.standalone.status === "gap" || capability.builderOverride.status === "gap",
  );
}
