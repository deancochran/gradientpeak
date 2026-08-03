interface DurationValuePoint {
  durationSeconds: number;
  value: number;
}

/** Test-only equation reference with no production imports. */
export function independentInverseDurationReference(points: readonly DurationValuePoint[]) {
  let inverseDurationSum = 0;
  let valueSum = 0;
  let productSum = 0;
  let inverseDurationSquaredSum = 0;
  for (const point of points) {
    const inverseDuration = 1 / point.durationSeconds;
    inverseDurationSum += inverseDuration;
    valueSum += point.value;
    productSum += inverseDuration * point.value;
    inverseDurationSquaredSum += inverseDuration * inverseDuration;
  }
  const count = points.length;
  const denominator = count * inverseDurationSquaredSum - inverseDurationSum * inverseDurationSum;
  const reserve = (count * productSum - inverseDurationSum * valueSum) / denominator;
  const intercept = (valueSum - reserve * inverseDurationSum) / count;
  return { intercept, reserve };
}

export function independentCssReference(time400Seconds: number, time200Seconds: number) {
  const secondsPer100Meters = (time400Seconds - time200Seconds) / 2;
  return { secondsPer100Meters, metersPerSecond: 100 / secondsPer100Meters };
}

export function independentSessionReference(input: {
  sessions: readonly { repetitions: number; rpe: number; activeDurationSeconds: number }[];
}) {
  const repetitions = input.sessions.reduce((sum, session) => sum + session.repetitions, 0);
  const activeMinutes =
    input.sessions.reduce((sum, session) => sum + session.activeDurationSeconds, 0) / 60;
  const repetitionRpePoints = input.sessions.reduce(
    (sum, session) => sum + session.repetitions * session.rpe,
    0,
  );
  return {
    repetitions,
    repetitionsPerActiveMinute: repetitions / activeMinutes,
    repetitionRpePoints,
  };
}
