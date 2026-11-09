import {
  type EventDemand,
  type FeasibilityAssessment,
  feasibilityAssessmentSchema,
  type NormalizedPlanningGoal,
  type TrajectoryMode,
} from "../../../schemas/planning";
import type { AthletePreferenceProfile } from "../../../schemas/settings/profile_settings";
import { getActivityCategoryModelConfig } from "../activity-categories";
import {
  type ResolvedConstraintProfile,
  resolveConstraintProfile,
} from "./resolveConstraintProfile";

export interface AssessFeasibilityInput {
  currentLongTermLoad: number;
  weeksToPeak: number;
  goals: NormalizedPlanningGoal[];
  resolvedDemands: EventDemand[];
  unsupportedGoalIds?: string[];
  preferenceProfile: AthletePreferenceProfile;
  constraintProfile?: ResolvedConstraintProfile;
}

export interface FeasibilityAssessmentResult {
  feasibility: FeasibilityAssessment;
  mode: TrajectoryMode;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function assessAvailability(
  demand: EventDemand,
  preferenceProfile: AthletePreferenceProfile,
): boolean {
  const maxDurationMinutes = preferenceProfile.dose_limits.max_weekly_duration_minutes;

  if (maxDurationMinutes === undefined) {
    return true;
  }

  const maxSupportedWeeklyLoad =
    (maxDurationMinutes / 60) *
    getActivityCategoryModelConfig(demand.activity_category).weekly_load_per_hour;

  return maxSupportedWeeklyLoad >= demand.required_weekly_load_floor;
}

function hasRecoveryConflict(
  goals: NormalizedPlanningGoal[],
  recoveryDays: number,
  taperDays: number,
): boolean {
  for (let index = 1; index < goals.length; index += 1) {
    const previous = goals[index - 1];
    const current = goals[index];

    if (!previous || !current) {
      continue;
    }

    const deltaDays =
      (Date.parse(current.target_date) - Date.parse(previous.target_date)) / 86400000;

    if (deltaDays < recoveryDays + taperDays && previous.priority >= current.priority) {
      return true;
    }
  }

  return false;
}

export function resolveTrajectoryMode(
  feasibility: FeasibilityAssessment,
  goalCount: number,
): TrajectoryMode {
  if (goalCount === 0) {
    return "capacity_bounded";
  }

  return feasibility.status === "feasible" ? "target_seeking" : "capacity_bounded";
}

export function assessFeasibility(input: AssessFeasibilityInput): FeasibilityAssessmentResult {
  const currentLongTermLoad = finiteNumber(input.currentLongTermLoad, 0);
  const primaryDemand = [...input.resolvedDemands].sort(
    (left, right) => right.required_peak_longTermLoad - left.required_peak_longTermLoad,
  )[0];

  if (!primaryDemand) {
    const feasibility = feasibilityAssessmentSchema.parse({
      status: "feasible",
      limiting_constraints: [],
      required_peak_longTermLoad: currentLongTermLoad,
      achievable_peak_longTermLoad: currentLongTermLoad,
      readiness_gap_longTermLoad: 0,
      rationale_codes: ["no_goals_capacity_bounded_baseline"],
    });

    return { feasibility, mode: resolveTrajectoryMode(feasibility, 0) };
  }

  if ((input.unsupportedGoalIds?.length ?? 0) > 0) {
    const feasibility = feasibilityAssessmentSchema.parse({
      status: "unsupported_goal_mapping",
      limiting_constraints: input.unsupportedGoalIds,
      required_peak_longTermLoad: finiteNumber(
        primaryDemand.required_peak_longTermLoad,
        currentLongTermLoad,
      ),
      achievable_peak_longTermLoad: currentLongTermLoad,
      readiness_gap_longTermLoad: round(
        finiteNumber(primaryDemand.required_peak_longTermLoad, currentLongTermLoad) -
          currentLongTermLoad,
      ),
      rationale_codes: ["unsupported_goal_mapping_detected"],
    });

    return {
      feasibility,
      mode: resolveTrajectoryMode(feasibility, input.goals.length),
    };
  }

  const constraintProfile =
    input.constraintProfile ??
    resolveConstraintProfile({
      optimizationProfile: "balanced",
      preferenceProfile: input.preferenceProfile,
      activity_category: primaryDemand.activity_category,
    });
  const weeksToPeak = Math.max(finiteNumber(input.weeksToPeak, 1), 1);
  const requiredPeakLongTermLoad = finiteNumber(
    primaryDemand.required_peak_longTermLoad,
    currentLongTermLoad,
  );
  const maxLongTermLoadRampPerWeek = finiteNumber(
    constraintProfile.effective_max_longTermLoad_ramp_per_week,
    0,
  );
  const requiredLongTermLoadRamp = (requiredPeakLongTermLoad - currentLongTermLoad) / weeksToPeak;
  const achievablePeakLongTermLoad = round(
    currentLongTermLoad + maxLongTermLoadRampPerWeek * weeksToPeak,
  );
  let status: FeasibilityAssessment["status"] = "feasible";
  const limitingConstraints: string[] = [];
  const rationaleCodes = [...constraintProfile.rationale_codes];

  if (requiredLongTermLoadRamp > maxLongTermLoadRampPerWeek) {
    status = "infeasible_ramp";
    limitingConstraints.push("longTermLoad_ramp_limit");
    rationaleCodes.push("required_longTermLoad_ramp_exceeds_effective_ramp_cap");
  } else if (!assessAvailability(primaryDemand, input.preferenceProfile)) {
    status = "infeasible_availability";
    limitingConstraints.push("max_weekly_duration_minutes");
    rationaleCodes.push("availability_constrained_weekly_load_floor_not_supported");
  } else if (
    hasRecoveryConflict(
      input.goals,
      constraintProfile.effective_post_goal_recovery_days,
      Math.max(4, Math.round(primaryDemand.demand_duration_minutes / 120)),
    )
  ) {
    status = "infeasible_recovery";
    limitingConstraints.push("goal_recovery_overlap");
    rationaleCodes.push("minimum_taper_plus_recovery_window_conflict");
  } else if (
    input.goals.some(
      (goal, index) => index > 0 && goal.target_date === input.goals[index - 1]?.target_date,
    )
  ) {
    status = "infeasible_multigoal";
    limitingConstraints.push("same_day_goal_conflict");
    rationaleCodes.push("same_day_multigoal_conflict_detected");
  }

  const feasibility = feasibilityAssessmentSchema.parse({
    status,
    limiting_constraints: limitingConstraints,
    required_peak_longTermLoad: requiredPeakLongTermLoad,
    achievable_peak_longTermLoad:
      status === "feasible" ? requiredPeakLongTermLoad : achievablePeakLongTermLoad,
    readiness_gap_longTermLoad: round(
      Math.max(0, requiredPeakLongTermLoad - achievablePeakLongTermLoad),
    ),
    rationale_codes: rationaleCodes,
  });

  return {
    feasibility,
    mode: resolveTrajectoryMode(feasibility, input.goals.length),
  };
}
