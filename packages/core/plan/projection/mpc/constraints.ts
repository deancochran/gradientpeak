import type { OptimizationProfile } from "../safety-caps";
import { getMpcProfileBounds, type MpcProfileBounds } from "./lattice";

export interface ResolveMpcSolveBoundsInput {
  optimization_profile: OptimizationProfile;
  requested_horizon_weeks?: number;
  requested_candidate_count?: number;
}

export interface ResolveMpcSolveBoundsResult {
  profile_bounds: MpcProfileBounds;
  horizon_weeks: number;
  candidate_count: number;
}

/**
 * Resolves bounded deterministic MPC solve limits for the active profile.
 */
export function resolveMpcSolveBounds(
  input: ResolveMpcSolveBoundsInput,
): ResolveMpcSolveBoundsResult {
  const profileBounds = getMpcProfileBounds(input.optimization_profile);

  return {
    profile_bounds: profileBounds,
    horizon_weeks: clampInteger(
      input.requested_horizon_weeks ?? profileBounds.horizon_weeks,
      1,
      profileBounds.horizon_weeks,
    ),
    candidate_count: clampInteger(
      input.requested_candidate_count ?? profileBounds.candidate_count,
      1,
      profileBounds.candidate_count,
    ),
  };
}

/**
 * Clamps a candidate action to bounded action space.
 */
export function clampMpcCandidateAction(input: {
  candidate_value: number;
  min_value: number;
  max_value: number;
}): number {
  const lower = Math.min(input.min_value, input.max_value);
  const upper = Math.max(input.min_value, input.max_value);
  return Math.max(lower, Math.min(upper, input.candidate_value));
}

function clampInteger(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  return Math.max(minValue, Math.min(maxValue, Math.floor(value)));
}
