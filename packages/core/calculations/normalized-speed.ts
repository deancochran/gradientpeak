/**
 * Calculates Normalized Speed for an activity.
 *
 * Normalized Speed is defined as Total Distance / Moving Time.
 * This accounts for stops and pauses, providing a more accurate representation
 * of the actual speed during movement.
 *
 * @param distance - Total distance in meters.
 * @param movingTime - Moving time in seconds.
 * @returns Normalized Speed in meters per second.
 */
export function calculateNormalizedSpeed(
  distance: number,
  movingTime: number,
): number {
  if (movingTime <= 0) return 0;
  return distance / movingTime;
}

/**
 * Calculates Moving Time from a speed stream.
 *
 * Moving time is the total time where speed is above a certain threshold.
 *
 * @param speedStream - Array of speed values (m/s).
 * @param timestamps - Array of timestamps (seconds).
 * @param threshold - Speed threshold to consider moving (default 0.1 m/s).
 * @returns Moving time in seconds.
 */
export function calculateMovingTime(
  speedStream: number[],
  timestamps: number[],
  threshold: number = 0.1,
): number {
  if (!speedStream || !timestamps || speedStream.length !== timestamps.length) {
    return 0;
  }

  let movingTime = 0;

  for (let i = 1; i < speedStream.length; i++) {
    const speed = speedStream[i];
    const prevTimestamp = timestamps[i - 1];
    const currentTimestamp = timestamps[i];

    if (
      speed === undefined ||
      prevTimestamp === undefined ||
      currentTimestamp === undefined
    ) {
      continue;
    }

    if (speed > threshold) {
      const duration = currentTimestamp - prevTimestamp;
      movingTime += duration;
    }
  }

  return movingTime;
}
