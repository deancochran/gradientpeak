/** Clock arithmetic shared by read-only playback and synthetic simulation.
 * The caller owns lifecycle and supplies monotonic wall deltas; no I/O or clocks here. */
export function advanceVirtualClock(
  elapsedMs: number,
  wallDeltaMs: number,
  multiplier: number,
  maximumMs: number,
): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0)
    throw new RangeError("Clock multiplier must be positive and finite.");
  const limit = Math.max(0, Number.isFinite(maximumMs) ? maximumMs : 0);
  const elapsed = Math.min(limit, Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0));
  const delta = Number.isFinite(wallDeltaMs) ? Math.max(0, wallDeltaMs) : 0;
  return Math.min(limit, elapsed + delta * multiplier);
}
