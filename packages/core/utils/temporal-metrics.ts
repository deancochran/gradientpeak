/**
 * Temporal Metric Lookup Utilities
 *
 * Provides functions for finding metrics at specific dates.
 * Supports the temporal metrics architecture where metrics change over time.
 */

import type { PerformanceMetricLog } from '../schemas/performance-metrics';
import type { ProfileMetricLog } from '../schemas/profile-metrics';

/**
 * Gets the performance metric at or before a specific date.
 *
 * Finds the most recent metric that was recorded at or before the given date.
 * This is the core function for temporal metric lookups.
 *
 * @param metrics - Array of performance metric logs (must be sorted by recorded_at DESC)
 * @param date - Target date for lookup
 * @returns The metric at or before the date, or null if none found
 *
 * @example
 * ```typescript
 * const metrics = await fetchMetrics({ profile_id, category: 'bike', type: 'power' });
 * const activityDate = new Date('2024-01-15');
 * const ftpAtDate = getPerformanceMetricAtDate(metrics, activityDate);
 * ```
 */
export function getPerformanceMetricAtDate(
  metrics: Array<Pick<PerformanceMetricLog, 'id' | 'value' | 'recorded_at' | 'unit'>>,
  date: Date
): Pick<PerformanceMetricLog, 'id' | 'value' | 'recorded_at' | 'unit'> | null {
  if (metrics.length === 0) {
    return null;
  }

  const targetTime = date.getTime();

  // Find the most recent metric at or before the target date
  // Assumes metrics are sorted by recorded_at DESC
  for (const metric of metrics) {
    const metricTime = new Date(metric.recorded_at).getTime();

    if (metricTime <= targetTime) {
      return metric;
    }
  }

  // No metric found before this date
  return null;
}

/**
 * Gets the profile metric at or before a specific date.
 *
 * Finds the most recent profile metric that was recorded at or before the given date.
 *
 * @param metrics - Array of profile metric logs (must be sorted by recorded_at DESC)
 * @param date - Target date for lookup
 * @returns The metric at or before the date, or null if none found
 *
 * @example
 * ```typescript
 * const weightMetrics = await fetchProfileMetrics({ profile_id, metric_type: 'weight_kg' });
 * const activityDate = new Date('2024-01-15');
 * const weightAtDate = getProfileMetricAtDate(weightMetrics, activityDate);
 * ```
 */
export function getProfileMetricAtDate(
  metrics: Array<Pick<ProfileMetricLog, 'id' | 'value' | 'recorded_at' | 'unit'>>,
  date: Date
): Pick<ProfileMetricLog, 'id' | 'value' | 'recorded_at' | 'unit'> | null {
  if (metrics.length === 0) {
    return null;
  }

  const targetTime = date.getTime();

  // Find the most recent metric at or before the target date
  // Assumes metrics are sorted by recorded_at DESC
  for (const metric of metrics) {
    const metricTime = new Date(metric.recorded_at).getTime();

    if (metricTime <= targetTime) {
      return metric;
    }
  }

  // No metric found before this date
  return null;
}

/**
 * Gets all performance metrics within a date range.
 *
 * @param metrics - Array of performance metric logs
 * @param startDate - Start of date range (inclusive)
 * @param endDate - End of date range (inclusive)
 * @returns Array of metrics within the date range
 *
 * @example
 * ```typescript
 * const metrics = await fetchMetrics({ profile_id, category: 'bike', type: 'power' });
 * const startDate = new Date('2024-01-01');
 * const endDate = new Date('2024-01-31');
 * const metricsInJanuary = getPerformanceMetricsInRange(metrics, startDate, endDate);
 * ```
 */
export function getPerformanceMetricsInRange(
  metrics: PerformanceMetricLog[],
  startDate: Date,
  endDate: Date
): PerformanceMetricLog[] {
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  return metrics.filter((metric) => {
    const metricTime = new Date(metric.recorded_at).getTime();
    return metricTime >= startTime && metricTime <= endTime;
  });
}

/**
 * Gets all profile metrics within a date range.
 *
 * @param metrics - Array of profile metric logs
 * @param startDate - Start of date range (inclusive)
 * @param endDate - End of date range (inclusive)
 * @returns Array of metrics within the date range
 *
 * @example
 * ```typescript
 * const weightMetrics = await fetchProfileMetrics({ profile_id, metric_type: 'weight_kg' });
 * const startDate = new Date('2024-01-01');
 * const endDate = new Date('2024-01-31');
 * const weightInJanuary = getProfileMetricsInRange(weightMetrics, startDate, endDate);
 * ```
 */
export function getProfileMetricsInRange(
  metrics: ProfileMetricLog[],
  startDate: Date,
  endDate: Date
): ProfileMetricLog[] {
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  return metrics.filter((metric) => {
    const metricTime = new Date(metric.recorded_at).getTime();
    return metricTime >= startTime && metricTime <= endTime;
  });
}

/**
 * Finds the closest metric to a specific date (before or after).
 *
 * @param metrics - Array of performance metric logs
 * @param date - Target date
 * @returns The closest metric to the date, or null if none found
 */
export function getClosestPerformanceMetric(
  metrics: PerformanceMetricLog[],
  date: Date
): PerformanceMetricLog | null {
  if (metrics.length === 0) {
    return null;
  }

  const targetTime = date.getTime();

  const firstMetric = metrics[0];
  if (!firstMetric) return null;

  let closestMetric = firstMetric;
  let closestDiff = Math.abs(new Date(closestMetric.recorded_at).getTime() - targetTime);

  for (const metric of metrics) {
    const metricTime = new Date(metric.recorded_at).getTime();
    const diff = Math.abs(metricTime - targetTime);

    if (diff < closestDiff) {
      closestMetric = metric;
      closestDiff = diff;
    }
  }

  return closestMetric;
}

/**
 * Finds the closest profile metric to a specific date (before or after).
 *
 * @param metrics - Array of profile metric logs
 * @param date - Target date
 * @returns The closest metric to the date, or null if none found
 */
export function getClosestProfileMetric(
  metrics: ProfileMetricLog[],
  date: Date
): ProfileMetricLog | null {
  if (metrics.length === 0) {
    return null;
  }

  const targetTime = date.getTime();

  const firstMetric = metrics[0];
  if (!firstMetric) return null;

  let closestMetric = firstMetric;
  let closestDiff = Math.abs(new Date(closestMetric.recorded_at).getTime() - targetTime);

  for (const metric of metrics) {
    const metricTime = new Date(metric.recorded_at).getTime();
    const diff = Math.abs(metricTime - targetTime);

    if (diff < closestDiff) {
      closestMetric = metric;
      closestDiff = diff;
    }
  }

  return closestMetric;
}

/**
 * Calculates the trend of a metric over time.
 *
 * @param metrics - Array of metrics (sorted by recorded_at ASC)
 * @returns Trend information (increasing, decreasing, or stable)
 */
export function calculateMetricTrend(
  metrics: Array<Pick<PerformanceMetricLog | ProfileMetricLog, 'value' | 'recorded_at'>>
): {
  direction: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
  rate: number; // Change per day
} | null {
  if (metrics.length < 2) {
    return null;
  }

  const first = metrics[0];
  const last = metrics[metrics.length - 1];

  if (!first || !last) {
    return null;
  }

  const valueChange = last.value - first.value;
  const changePercent = (valueChange / first.value) * 100;

  // Calculate rate of change per day
  const timeRangeMs =
    new Date(last.recorded_at).getTime() - new Date(first.recorded_at).getTime();
  const timeRangeDays = timeRangeMs / (1000 * 60 * 60 * 24);
  const rate = timeRangeDays > 0 ? valueChange / timeRangeDays : 0;

  let direction: 'increasing' | 'decreasing' | 'stable';
  if (Math.abs(changePercent) < 1) {
    // Less than 1% change considered stable
    direction = 'stable';
  } else if (changePercent > 0) {
    direction = 'increasing';
  } else {
    direction = 'decreasing';
  }

  return {
    direction,
    changePercent: Math.round(changePercent * 10) / 10,
    rate: Math.round(rate * 100) / 100,
  };
}
