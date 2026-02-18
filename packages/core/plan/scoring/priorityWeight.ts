export interface PriorityWeightOptions {
  epsilon?: number;
  gamma?: number;
}

const DEFAULT_EPSILON = 0.1;
const DEFAULT_GAMMA = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeGoalPriority(priority: number): number {
  if (typeof priority !== "number" || Number.isNaN(priority)) {
    return 0;
  }

  return clamp(priority, 0, 10);
}

/**
 * Maps goal priority (0..10) to a monotonic positive weight.
 *
 * Formula: epsilon + (priority / 10)^gamma
 */
export function mapGoalPriorityToWeight(
  priority: number,
  options?: PriorityWeightOptions,
): number {
  const epsilon = options?.epsilon ?? DEFAULT_EPSILON;
  const gamma = options?.gamma ?? DEFAULT_GAMMA;
  const normalized = normalizeGoalPriority(priority) / 10;

  return epsilon + Math.pow(normalized, gamma);
}

export function mapGoalPriorityToNormalizedInfluence(
  priority: number,
  options?: PriorityWeightOptions,
): number {
  const epsilon = options?.epsilon ?? DEFAULT_EPSILON;
  const maxWeight = mapGoalPriorityToWeight(10, options);
  const weight = mapGoalPriorityToWeight(priority, options);
  const denominator = Math.max(1e-6, maxWeight - epsilon);
  return clamp((weight - epsilon) / denominator, 0, 1);
}
