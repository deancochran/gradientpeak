export function fitTimerSeconds(totalTimeMs: number): number {
  return Math.max(0, totalTimeMs) / 1000;
}
