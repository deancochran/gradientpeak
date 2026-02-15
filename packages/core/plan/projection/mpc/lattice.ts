import type { OptimizationProfile } from "../safety-caps";

export interface MpcProfileBounds {
  horizon_weeks: number;
  candidate_count: number;
}

const MPC_PROFILE_BOUNDS: Record<OptimizationProfile, MpcProfileBounds> = {
  sustainable: { horizon_weeks: 2, candidate_count: 5 },
  balanced: { horizon_weeks: 4, candidate_count: 7 },
  outcome_first: { horizon_weeks: 6, candidate_count: 9 },
};

const DEFAULT_PRECISION = 1;

/**
 * Returns deterministic MPC solve bounds for an optimization profile.
 */
export function getMpcProfileBounds(
  profile: OptimizationProfile,
): MpcProfileBounds {
  return MPC_PROFILE_BOUNDS[profile];
}

export interface DeterministicCandidateLatticeInput {
  min_value: number;
  max_value: number;
  center_value: number;
  candidate_count: number;
  precision?: number;
}

/**
 * Builds a deterministic bounded candidate lattice for weekly actions.
 */
export function buildDeterministicCandidateLattice(
  input: DeterministicCandidateLatticeInput,
): number[] {
  const precision =
    input.precision === undefined
      ? DEFAULT_PRECISION
      : Math.max(0, Math.floor(input.precision));

  const lower = Math.min(input.min_value, input.max_value);
  const upper = Math.max(input.min_value, input.max_value);
  const count = Math.max(1, Math.floor(input.candidate_count));
  const clampedCenter = clampNumber(input.center_value, lower, upper);

  if (upper === lower) {
    return [roundToPrecision(lower, precision)];
  }

  if (count === 1) {
    return [roundToPrecision(clampedCenter, precision)];
  }

  const step = (upper - lower) / Math.max(1, count - 1);
  const lattice: number[] = [];

  for (let index = 0; index < count; index += 1) {
    lattice.push(roundToPrecision(lower + step * index, precision));
  }

  const roundedCenter = roundToPrecision(clampedCenter, precision);
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < lattice.length; index += 1) {
    const candidate = lattice[index] ?? roundedCenter;
    const distance = Math.abs(candidate - roundedCenter);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  lattice[nearestIndex] = roundedCenter;

  return [...new Set(lattice)].sort((a, b) => a - b);
}

export interface ProfileBoundedCandidateLatticeInput {
  optimization_profile: OptimizationProfile;
  min_value: number;
  max_value: number;
  center_value: number;
  requested_candidate_count?: number;
  precision?: number;
}

/**
 * Builds profile-bounded deterministic candidates.
 */
export function buildProfileBoundedCandidateLattice(
  input: ProfileBoundedCandidateLatticeInput,
): number[] {
  const profileBounds = getMpcProfileBounds(input.optimization_profile);
  const requested =
    input.requested_candidate_count ?? profileBounds.candidate_count;
  const boundedCount = Math.max(
    1,
    Math.min(profileBounds.candidate_count, Math.floor(requested)),
  );

  return buildDeterministicCandidateLattice({
    min_value: input.min_value,
    max_value: input.max_value,
    center_value: input.center_value,
    candidate_count: boundedCount,
    precision: input.precision,
  });
}

function roundToPrecision(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function clampNumber(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  return Math.max(minValue, Math.min(maxValue, value));
}
