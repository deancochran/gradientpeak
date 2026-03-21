import type { MetricEstimationResult } from "./types";

export function estimateFTPFromRecentActivities(
  activities: Array<{
    powerStream?: number[];
    timestamps?: number[];
    startedAt: Date;
  }>,
): MetricEstimationResult | null {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentActivities = activities.filter(
    (activity) =>
      activity.powerStream &&
      activity.timestamps &&
      activity.powerStream.length > 0 &&
      new Date(activity.startedAt) >= ninetyDaysAgo,
  );

  let maxAvgPower = 0;
  for (const activity of recentActivities) {
    if (!activity.powerStream || !activity.timestamps) continue;
    const avgPower = findMaxAverage(activity.powerStream, activity.timestamps, 1200);
    if (avgPower > maxAvgPower) maxAvgPower = avgPower;
  }

  if (maxAvgPower === 0) return null;
  return {
    value: Math.round(maxAvgPower * 0.95),
    source: "estimated",
    confidence: "medium",
    notes: `Estimated from 20min power (${Math.round(maxAvgPower)}W) from recent activities`,
  };
}

export function estimateLTHRFromRecentActivities(
  activities: Array<{
    hrStream?: number[];
    timestamps?: number[];
    startedAt: Date;
  }>,
): MetricEstimationResult | null {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentActivities = activities.filter(
    (activity) =>
      activity.hrStream &&
      activity.timestamps &&
      activity.hrStream.length > 0 &&
      new Date(activity.startedAt) >= ninetyDaysAgo,
  );

  let maxAvgHr = 0;
  for (const activity of recentActivities) {
    if (!activity.hrStream || !activity.timestamps) continue;
    const avgHr = findMaxAverage(activity.hrStream, activity.timestamps, 1200);
    if (avgHr > maxAvgHr) maxAvgHr = avgHr;
  }

  if (maxAvgHr === 0) return null;
  return {
    value: Math.round(maxAvgHr),
    source: "estimated",
    confidence: "medium",
    notes: `Estimated from 20min avg HR (${Math.round(maxAvgHr)} bpm) from recent activities`,
  };
}

export function estimateThresholdPaceFromRecentRuns(
  activities: Array<{
    paceStream?: number[];
    timestamps?: number[];
    distanceMeters?: number;
    startedAt: Date;
  }>,
): MetricEstimationResult | null {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentRuns = activities.filter(
    (activity) =>
      activity.paceStream &&
      activity.timestamps &&
      activity.distanceMeters &&
      activity.paceStream.length > 0 &&
      new Date(activity.startedAt) >= ninetyDaysAgo,
  );

  let bestPace = Infinity;
  for (const run of recentRuns) {
    if (!run.paceStream || !run.distanceMeters) continue;
    if (Math.abs(run.distanceMeters - 5000) < 500) {
      const avgPace = run.paceStream.reduce((sum, pace) => sum + pace, 0) / run.paceStream.length;
      if (avgPace < bestPace) bestPace = avgPace;
    }
  }

  if (bestPace === Infinity) return null;
  const estimatedThresholdPace = Math.round(bestPace * 1.05);
  const minutes = Math.floor(estimatedThresholdPace / 60);
  const seconds = estimatedThresholdPace % 60;
  return {
    value: estimatedThresholdPace,
    source: "estimated",
    confidence: "medium",
    notes: `Estimated from recent 5k pace: ${minutes}:${seconds.toString().padStart(2, "0")} min/km`,
  };
}

export function estimateCriticalVelocity(
  activities: Array<{
    distanceMeters?: number;
    durationSeconds?: number;
    startedAt: Date;
  }>,
): MetricEstimationResult | null {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const sustainedRuns = activities.filter(
    (activity) =>
      activity.distanceMeters &&
      activity.durationSeconds &&
      activity.durationSeconds >= 1200 &&
      activity.durationSeconds <= 3600 &&
      new Date(activity.startedAt) >= ninetyDaysAgo,
  );

  let bestVelocity = 0;
  for (const run of sustainedRuns) {
    if (!run.distanceMeters || !run.durationSeconds) continue;
    const velocity = run.distanceMeters / run.durationSeconds;
    if (velocity > bestVelocity) bestVelocity = velocity;
  }

  if (bestVelocity === 0) return null;
  const paceSecondsPerKm = Math.round(1000 / bestVelocity);
  const minutes = Math.floor(paceSecondsPerKm / 60);
  const seconds = paceSecondsPerKm % 60;
  return {
    value: bestVelocity,
    source: "estimated",
    confidence: "medium",
    notes: `Estimated from recent sustained runs: ${minutes}:${seconds.toString().padStart(2, "0")} min/km`,
  };
}

function findMaxAverage(values: number[], timestamps: number[], durationSeconds: number): number {
  if (values.length < 2) return 0;

  let maxAverage = 0;
  for (let index = 0; index < values.length; index += 1) {
    const startTime = timestamps[index];
    if (startTime === undefined) continue;

    const targetEndTime = startTime + durationSeconds;
    let endIndex = index;
    while (endIndex < timestamps.length) {
      const currentTime = timestamps[endIndex];
      if (currentTime === undefined || currentTime >= targetEndTime) break;
      endIndex += 1;
    }

    if (endIndex - index < 10) continue;

    const sum = values.slice(index, endIndex).reduce((acc, value) => acc + value, 0);
    const average = sum / (endIndex - index);
    if (average > maxAverage) maxAverage = average;
  }

  return maxAverage;
}
