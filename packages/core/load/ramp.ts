export function calculateRampRate(currentCTL: number, previousCTL: number): number {
  return currentCTL - previousCTL;
}

export function isRampRateSafe(rampRate: number, threshold = 5): boolean {
  return rampRate <= threshold;
}
