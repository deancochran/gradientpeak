import { type ActivityListDerivedSummary, getTrainingIntensityZone } from "@repo/core";

export type ZoneDistributionActivityRow = {
  id: string;
  started_at: Date;
};

export type IntensityZone =
  | "recovery"
  | "endurance"
  | "tempo"
  | "threshold"
  | "vo2max"
  | "anaerobic"
  | "neuromuscular";

export type ZoneDistributionTrendsResult = {
  weeklyData: Array<{
    weekStart: string;
    totalTSS: number;
    zones: Record<IntensityZone, number>;
  }>;
};

const emptyZoneDistribution = (): Record<IntensityZone, number> => ({
  recovery: 0,
  endurance: 0,
  tempo: 0,
  threshold: 0,
  vo2max: 0,
  anaerobic: 0,
  neuromuscular: 0,
});

function toDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function getWeekStartKey(value: Date) {
  const weekStart = new Date(value);
  weekStart.setDate(value.getDate() - value.getDay() + 1);
  return toDateKey(weekStart);
}

export function buildZoneDistributionTrends(
  activityRows: ZoneDistributionActivityRow[],
  derivedMap: Map<string, Pick<ActivityListDerivedSummary, "intensity_factor" | "tss">>,
): ZoneDistributionTrendsResult {
  if (activityRows.length === 0) {
    return { weeklyData: [] };
  }

  const weeklyData = new Map<
    string,
    {
      weekStart: string;
      totalTSS: number;
      zones: Record<IntensityZone, number>;
    }
  >();

  for (const activity of activityRows) {
    const derived = derivedMap.get(activity.id);
    const intensityFactor = derived?.intensity_factor ?? null;
    const tss = derived?.tss ?? null;

    if (!intensityFactor || !tss) continue;

    const weekKey = getWeekStartKey(new Date(activity.started_at));

    let week = weeklyData.get(weekKey);
    if (!week) {
      week = {
        weekStart: weekKey,
        totalTSS: 0,
        zones: emptyZoneDistribution(),
      };
      weeklyData.set(weekKey, week);
    }

    const zone = getTrainingIntensityZone(intensityFactor) as IntensityZone;
    week.zones[zone] += tss;
    week.totalTSS += tss;
  }

  const weeklyDataArray = Array.from(weeklyData.values()).map((week) => {
    const zones = emptyZoneDistribution();

    if (week.totalTSS > 0) {
      for (const zone in week.zones) {
        const zoneKey = zone as IntensityZone;
        zones[zoneKey] = Math.round((week.zones[zoneKey] / week.totalTSS) * 1000) / 10;
      }
    }

    return {
      weekStart: week.weekStart,
      totalTSS: Math.round(week.totalTSS),
      zones,
    };
  });

  return {
    weeklyData: weeklyDataArray.sort(
      (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime(),
    ),
  };
}
