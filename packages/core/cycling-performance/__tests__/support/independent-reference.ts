interface ReferencePoint {
  durationSeconds: number;
  powerWatts: number;
}

/**
 * Clarity-first test oracle. It intentionally imports no production schema,
 * calculator, policy constant, or helper.
 */
export function independentCyclingDurationReference(input: {
  criticalPowerPoints: readonly ReferencePoint[];
  twentyMinutePowerWatts: number;
  oneHourPowerWatts: number;
}) {
  let inverseDurationSum = 0;
  let powerSum = 0;
  let inverseDurationPowerSum = 0;
  let inverseDurationSquaredSum = 0;
  for (const point of input.criticalPowerPoints) {
    const inverseDuration = 1 / point.durationSeconds;
    inverseDurationSum += inverseDuration;
    powerSum += point.powerWatts;
    inverseDurationPowerSum += inverseDuration * point.powerWatts;
    inverseDurationSquaredSum += inverseDuration * inverseDuration;
  }
  const count = input.criticalPowerPoints.length;
  const denominator = count * inverseDurationSquaredSum - inverseDurationSum * inverseDurationSum;
  const reserveJoules =
    (count * inverseDurationPowerSum - inverseDurationSum * powerSum) / denominator;
  const criticalPowerWatts = (powerSum - reserveJoules * inverseDurationSum) / count;
  const modeledTwentyMinutePowerWatts = criticalPowerWatts + reserveJoules / 1_200;
  const planningThresholdPowerWatts = modeledTwentyMinutePowerWatts * 0.95;
  const modeledTimeToExhaustionSeconds =
    reserveJoules / (planningThresholdPowerWatts - criticalPowerWatts);

  return {
    criticalPowerWatts,
    reserveJoules,
    planningThresholdPowerWatts,
    modeledTimeToExhaustionSeconds,
    durationRetentionRatio: input.oneHourPowerWatts / input.twentyMinutePowerWatts,
  };
}
