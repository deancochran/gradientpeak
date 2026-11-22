/**
 * Observed Power-Curve Projection
 *
 * Projects only from an accepted observed CP/reserve fit.
 */

/**
 * Predicts only within the duration span of an observed CP/W' fit. Requiring
 * fit metadata prevents an FTP estimate from being passed as if it were CP and
 * prevents silent extrapolation beyond the evidence domain.
 */
export function estimatePowerForDuration(
  model: {
    source: "observed-curve-fit";
    cp: number;
    wPrime: number;
    fitMinDurationSeconds: number;
    fitMaxDurationSeconds: number;
  },
  durationSeconds: number,
): number {
  if (
    model.source !== "observed-curve-fit" ||
    !Number.isFinite(model.cp) ||
    !Number.isFinite(model.wPrime) ||
    !Number.isFinite(model.fitMinDurationSeconds) ||
    !Number.isFinite(model.fitMaxDurationSeconds) ||
    model.cp <= 0 ||
    model.wPrime <= 0 ||
    model.fitMinDurationSeconds > model.fitMaxDurationSeconds
  ) {
    throw new Error("A valid observed CP/W' fit is required");
  }
  const minimum = Math.max(180, model.fitMinDurationSeconds);
  const maximum = Math.min(1_800, model.fitMaxDurationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < minimum || durationSeconds > maximum) {
    throw new Error(
      `Duration must be within the observed fit span (${minimum}-${maximum} seconds)`,
    );
  }

  const power = model.cp + model.wPrime / durationSeconds;
  return Math.round(power);
}
