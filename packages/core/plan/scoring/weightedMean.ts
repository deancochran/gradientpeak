export function normalizeTargetWeight(rawWeight: number | undefined): number {
  if (
    typeof rawWeight !== "number" ||
    Number.isNaN(rawWeight) ||
    !Number.isFinite(rawWeight) ||
    rawWeight <= 0
  ) {
    return 1;
  }

  return rawWeight;
}

export function weightedMean(values: number[], weights: number[]): number {
  if (values.length === 0 || values.length !== weights.length) {
    return 0;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    const weight = weights[index] ?? 0;
    weightedSum += value * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    return 0;
  }

  return weightedSum / totalWeight;
}

export interface WeightedScoreComponent {
  value: number;
  weight: number;
}

/**
 * Computes a normalized weighted score from named component objects.
 *
 * This keeps score blends stable when calibration overrides do not sum to 1.
 */
export function weightedScore(components: WeightedScoreComponent[]): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const component of components) {
    if (!Number.isFinite(component.value) || !Number.isFinite(component.weight)) {
      continue;
    }

    const weight = Math.max(0, component.weight);
    weightedSum += component.value * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    return 0;
  }

  return weightedSum / totalWeight;
}
