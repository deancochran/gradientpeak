import {
  type EventDemand,
  type FeasibilityAssessment,
  feasibilityAssessmentSchema,
  type NormalizedPlanningGoal,
  type TrajectoryMode,
} from "../../../schemas/planning";
import type { AthletePreferenceProfile } from "../../../schemas/settings/profile_settings";
import { getSportModelConfig } from "../sports";
import {
  type ResolvedConstraintProfile,
  resolveConstraintProfile,
} from "./resolveConstraintProfile";

export interface AssessFeasibilityInput {
  currentCtl: number;
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
    (maxDurationMinutes / 60) * getSportModelConfig(demand.sport).weekly_tss_per_hour;

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
  const currentCtl = finiteNumber(input.currentCtl, 0);
  const primaryDemand = [...input.resolvedDemands].sort(
    (left, right) => right.required_peak_ctl - left.required_peak_ctl,
  )[0];

  if (!primaryDemand) {
    const feasibility = feasibilityAssessmentSchema.parse({
      status: "feasible",
      limiting_constraints: [],
      required_peak_ctl: currentCtl,
      achievable_peak_ctl: currentCtl,
      readiness_gap_ctl: 0,
      rationale_codes: ["no_goals_capacity_bounded_baseline"],
    });

    return { feasibility, mode: resolveTrajectoryMode(feasibility, 0) };
  }

  if ((input.unsupportedGoalIds?.length ?? 0) > 0) {
    const feasibility = feasibilityAssessmentSchema.parse({
      status: "unsupported_goal_mapping",
      limiting_constraints: input.unsupportedGoalIds,
      required_peak_ctl: finiteNumber(primaryDemand.required_peak_ctl, currentCtl),
      achievable_peak_ctl: currentCtl,
      readiness_gap_ctl: round(
        finiteNumber(primaryDemand.required_peak_ctl, currentCtl) - currentCtl,
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
      sport: primaryDemand.sport,
    });
  const weeksToPeak = Math.max(finiteNumber(input.weeksToPeak, 1), 1);
  const requiredPeakCtl = finiteNumber(primaryDemand.required_peak_ctl, currentCtl);
  const maxCtlRampPerWeek = finiteNumber(constraintProfile.effective_max_ctl_ramp_per_week, 0);
  const requiredCtlRamp = (requiredPeakCtl - currentCtl) / weeksToPeak;
  const achievablePeakCtl = round(currentCtl + maxCtlRampPerWeek * weeksToPeak);
  let status: FeasibilityAssessment["status"] = "feasible";
  const limitingConstraints: string[] = [];
  const rationaleCodes = [...constraintProfile.rationale_codes];

  if (requiredCtlRamp > maxCtlRampPerWeek) {
    status = "infeasible_ramp";
    limitingConstraints.push("ctl_ramp_limit");
    rationaleCodes.push("required_ctl_ramp_exceeds_effective_ramp_cap");
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
    required_peak_ctl: requiredPeakCtl,
    achievable_peak_ctl: status === "feasible" ? requiredPeakCtl : achievablePeakCtl,
    readiness_gap_ctl: round(Math.max(0, requiredPeakCtl - achievablePeakCtl)),
    rationale_codes: rationaleCodes,
  });

  return {
    feasibility,
    mode: resolveTrajectoryMode(feasibility, input.goals.length),
  };
}
