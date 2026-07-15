import { type ProfileMetricType, profileMetricTypes } from "@repo/core/athlete-inputs";
import type { DateRange } from "@/components/shared";

export type ProfileMetricTrendRow = {
  id: string;
  metric_type: string;
  recorded_at: string | Date;
  source?: string | null;
  unit: string;
  value: number;
};

export type ProfileMetricSection = {
  id: "load_calibration" | "supporting_physiology" | "recovery" | "body_aerobic";
  title: string;
  description: string;
  metricTypes: readonly ProfileMetricType[];
};

export const profileMetricSections: readonly ProfileMetricSection[] = [
  {
    id: "load_calibration",
    title: "Load Calibration",
    description: "Thresholds used to calculate sport-specific load and intensity.",
    metricTypes: ["ftp", "threshold_pace_seconds_per_km", "css_seconds_per_100m", "lthr"],
  },
  {
    id: "supporting_physiology",
    title: "Supporting Physiology",
    description: "Heart-rate context, zones, and body-mass trends.",
    metricTypes: ["max_hr", "resting_hr", "weight_kg"],
  },
  {
    id: "recovery",
    title: "Recovery",
    description: "Recovery signals and daily check-ins.",
    metricTypes: [
      "hrv_rmssd",
      "sleep_hours",
      "stress_score",
      "soreness_level",
      "wellness_score",
      "hydration_level",
    ],
  },
  {
    id: "body_aerobic",
    title: "Body & Aerobic",
    description: "Longer-term aerobic and body-composition trends.",
    metricTypes: ["vo2_max", "body_fat_percentage"],
  },
] as const;

export function getProfileMetricSectionGroups(groups: ProfileMetricTrendGroup[]) {
  const byType = new Map(groups.map((group) => [group.id, group]));
  return profileMetricSections.map((section) => ({
    ...section,
    groups: section.metricTypes.flatMap((metricType) => {
      const group = byType.get(metricType);
      return group ? [group] : [];
    }),
  }));
}

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
