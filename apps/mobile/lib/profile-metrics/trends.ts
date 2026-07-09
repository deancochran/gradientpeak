import { profileMetricTypes } from "@repo/core/athlete-inputs";
import type { DateRange } from "@/components/shared";

export type ProfileMetricTrendRow = {
  id: string;
  metric_type: string;
  recorded_at: string | Date;
  unit: string;
  value: number;
};

export type ProfileMetricTrendPoint = {
  label: string;
  value: number;
};

export type ProfileMetricTrendGroup = {
  id: string;
  latest?: ProfileMetricTrendRow;
  previous?: ProfileMetricTrendRow;
  records: ProfileMetricTrendRow[];
  points: ProfileMetricTrendPoint[];
};

export function formatProfileMetricTrendDate(value: string | Date) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function buildProfileMetricTrendPoints(
  records: ProfileMetricTrendRow[],
): ProfileMetricTrendPoint[] {
  return [...records].reverse().map((record) => ({
    label: formatProfileMetricTrendDate(record.recorded_at),
    value: Number(record.value),
  }));
}

export function buildProfileMetricTrendGroups(
  metrics: ProfileMetricTrendRow[],
): ProfileMetricTrendGroup[] {
  const recordsByType = new Map<string, ProfileMetricTrendRow[]>();
  for (const metric of metrics) {
    recordsByType.set(metric.metric_type, [
      ...(recordsByType.get(metric.metric_type) ?? []),
      metric,
    ]);
  }

  return profileMetricTypes
    .map((metricType) => {
      const records = recordsByType.get(metricType) ?? [];
      const sorted = [...records].sort(
        (left, right) =>
          new Date(right.recorded_at).getTime() - new Date(left.recorded_at).getTime(),
      );
      return {
        id: metricType,
        latest: sorted[0],
        previous: sorted[1],
        records: sorted,
        points: buildProfileMetricTrendPoints(sorted),
      } satisfies ProfileMetricTrendGroup;
    })
    .sort((left, right) => Number(Boolean(right.latest)) - Number(Boolean(left.latest)));
}

export function filterProfileMetricRecordsByRange(
  records: ProfileMetricTrendRow[],
  dateRange: DateRange,
) {
  if (dateRange === "all") return records;

  const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  return records.filter((record) => new Date(record.recorded_at) >= cutoff);
}
