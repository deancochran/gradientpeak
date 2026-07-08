import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import {
  creationWeekDayEnum,
  type TrainingPlanCreationConfig,
} from "../schemas/training_plan_structure";
import { normalizeCreationConfig } from "./normalizeCreationConfig";

type ProjectionRelevantCreationDefaults = Pick<
  TrainingPlanCreationConfig,
  | "availability_config"
  | "constraints"
  | "post_goal_recovery_days"
  | "behavior_controls_v1"
  | "recent_influence"
  | "recent_influence_action"
  | "calibration"
>;

function clamp01(value: number | undefined, fallback = 0.5): number {
  return Math.max(0, Math.min(1, value ?? fallback));
}

function lerp(min: number, max: number, ratio: number): number {
  return min + (max - min) * clamp01(ratio);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function mapAthletePreferencesToCreationDefaults(
  preferences: AthletePreferenceProfile,
): ProjectionRelevantCreationDefaults {
  const baseline = normalizeCreationConfig({});
  const progressionPace = clamp01(preferences.training_style.progression_pace);
  const weekPattern = clamp01(preferences.training_style.week_pattern_preference);
  const keySessionDensity = clamp01(preferences.training_style.key_session_density_preference);
  const strengthPriority = clamp01(preferences.training_style.strength_integration_priority);
  const recoveryPriority = clamp01(preferences.recovery_preferences.recovery_priority);
  const systemicFatigueTolerance = clamp01(
    preferences.recovery_preferences.systemic_fatigue_tolerance,
  );
  const doubleDayTolerance = clamp01(preferences.recovery_preferences.double_day_tolerance);
  const longSessionTolerance = clamp01(
    preferences.recovery_preferences.long_session_fatigue_tolerance,
  );
  const recencyAdaptation = clamp01(
    preferences.adaptation_preferences.recency_adaptation_preference,
  );
  const churnTolerance = clamp01(preferences.adaptation_preferences.plan_churn_tolerance);
  const priorityTradeoff = clamp01(
    preferences.goal_strategy_preferences.priority_tradeoff_preference,
  );
  const targetSurplus = clamp01(preferences.goal_strategy_preferences.target_surplus_preference);
  const taperStyle = clamp01(preferences.goal_strategy_preferences.taper_style_preference);
  const targetAttainmentWeight = round3(lerp(0.38, 0.53, priorityTradeoff));
  const availabilityByDay = new Map(
    preferences.availability.weekly_windows.map((dayConfig) => [dayConfig.day, dayConfig]),
  );
  const maxSessionsPerDay = doubleDayTolerance < 0.33 ? 1 : doubleDayTolerance > 0.72 ? 3 : 2;

  return {
    availability_config: {
      template: "custom",
      days: creationWeekDayEnum.options.map((day) => {
        const dayConfig = availabilityByDay.get(day);
        return {
          day,
          windows: dayConfig?.windows ?? [],
          max_sessions: Math.min(dayConfig?.max_sessions ?? maxSessionsPerDay, maxSessionsPerDay),
        };
      }),
    },
    constraints: {
      ...baseline.constraints,
      hard_rest_days: preferences.availability.hard_rest_days,
      min_sessions_per_week: preferences.dose_limits.min_sessions_per_week,
      max_sessions_per_week: preferences.dose_limits.max_sessions_per_week,
      max_single_session_duration_minutes:
        preferences.dose_limits.max_single_session_duration_minutes,
      max_weekly_duration_minutes: preferences.dose_limits.max_weekly_duration_minutes,
      sport_overrides: preferences.dose_limits.sport_overrides,
    },
    post_goal_recovery_days: preferences.recovery_preferences.post_goal_recovery_days,
    recent_influence: {
      influence_score: round3((recencyAdaptation - 0.5) * 2),
    },
    recent_influence_action: recencyAdaptation <= 0.02 ? "disabled" : "accepted",
    behavior_controls_v1: {
      ...baseline.behavior_controls_v1,
      aggressiveness: round3(
        clamp01(progressionPace * 0.7 + systemicFatigueTolerance * 0.2 + (1 - taperStyle) * 0.1),
      ),
      variability: round3(clamp01(weekPattern * 0.55 + churnTolerance * 0.45)),
      spike_frequency: round3(
        clamp01(keySessionDensity * 0.65 + weekPattern * 0.2 + doubleDayTolerance * 0.15),
      ),
      shape_target: round3((weekPattern - 0.5) * 2),
      shape_strength: round3(
        Math.max(0.15, Math.abs(weekPattern - 0.5) * 1.2 + keySessionDensity * 0.35),
      ),
      recovery_priority: round3(
        clamp01(recoveryPriority * 0.7 + (1 - systemicFatigueTolerance) * 0.2 + taperStyle * 0.1),
      ),
    },
    calibration: {
      ...baseline.calibration,
      readiness_composite: {
        target_attainment_weight: targetAttainmentWeight,
        envelope_weight: round3(0.75 - targetAttainmentWeight),
        durability_weight: round3(0.15),
        evidence_weight: round3(0.1),
      },
      readiness_timeline: {
        ...baseline.calibration.readiness_timeline,
        target_tsb: round3(lerp(4, 14, taperStyle)),
        fatigue_overflow_scale: round3(lerp(0.22, 0.72, systemicFatigueTolerance)),
        max_step_delta: Math.round(lerp(5, 16, churnTolerance)),
      },
      envelope_penalties: {
        ...baseline.calibration.envelope_penalties,
        over_high_weight: round3(lerp(0.78, 0.42, systemicFatigueTolerance)),
        over_ramp_weight: round3(lerp(0.38, 0.18, progressionPace)),
      },
      durability_penalties: {
        ...baseline.calibration.durability_penalties,
        monotony_scale: round3(lerp(3.2, 1.2, doubleDayTolerance)),
        strain_scale: round3(lerp(650, 1300, longSessionTolerance)),
        deload_debt_scale: round3(lerp(9, 3.5, recoveryPriority)),
      },
      optimizer: {
        ...baseline.calibration.optimizer,
        churn_penalty_weight: round3(lerp(0.42, 0.08, churnTolerance)),
        risk_penalty_weight: round3(lerp(0.52, 0.22, systemicFatigueTolerance)),
        volatility_penalty_weight: round3(lerp(0.36, 0.12, keySessionDensity)),
      },
      no_history: {
        ...baseline.calibration.no_history,
        demand_tier_time_pressure_scale: round3(lerp(0.82, 1.22, targetSurplus)),
      },
    },
  };
}
