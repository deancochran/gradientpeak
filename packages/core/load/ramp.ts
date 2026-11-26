export function calculateRampRate(
  currentLongTermLoad: number,
  previousLongTermLoad: number,
): number {
  return currentLongTermLoad - previousLongTermLoad;
}

export function isRampRateSafe(rampRate: number, threshold = 5): boolean {
  return rampRate <= threshold;
}
