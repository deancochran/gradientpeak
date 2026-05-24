import { resolveGoalReadinessTarget } from "./goalReadinessTrajectory";

export type GoalReadinessBand =
  | "above_target_range"
  | "in_target_range"
  | "building_toward_target"
  | "below_target_range"
  | "estimating";

export type GoalReadinessViewModel = {
  value: number | null;
  target: number;
  band: GoalReadinessBand;
  label: string;
};

export function resolveGoalReadinessViewModel(input: {
  value: number | null | undefined;
  target?: number | null;
  targetSurplusPreference?: number | null;
}): GoalReadinessViewModel {
  const target =
    typeof input.target === "number" && Number.isFinite(input.target)
      ? input.target
      : resolveGoalReadinessTarget({
          target_surplus_preference: input.targetSurplusPreference,
        });
  const value =
    typeof input.value === "number" && Number.isFinite(input.value) ? input.value : null;

  if (value === null) {
    return { value, target, band: "estimating", label: "Estimating" };
  }

  if (value > target + 2) {
    return { value, target, band: "above_target_range", label: "Above target range" };
  }

  if (value >= target - 5) {
    return { value, target, band: "in_target_range", label: "In target range" };
  }

  if (value >= target * 0.45) {
    return { value, target, band: "building_toward_target", label: "Building toward target" };
  }

  return { value, target, band: "below_target_range", label: "Below target range" };
}
