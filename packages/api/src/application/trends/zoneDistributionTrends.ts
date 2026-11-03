import {
  type ActivityObservationQuantification,
  type ActivityObservationQuantificationBundle,
  createObservationQuantificationBundle,
} from "@repo/core";
import { getTrainingIntensityZone } from "@repo/core/zones";

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
    status: "complete" | "partial" | "unavailable";
    totalCommonLoad: number | null;
    zones: Record<IntensityZone, number>;
    observationQuantification: ActivityObservationQuantificationBundle | null;
    coverage: { totalActivities: number; quantifiedActivities: number };
  }>;
};

export type ZoneDistributionDerivedSummary = {
  observationQuantification: ActivityObservationQuantificationBundle;
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
  derivedMap: Map<string, ZoneDistributionDerivedSummary>,
): ZoneDistributionTrendsResult {
  if (activityRows.length === 0) {
    return { weeklyData: [] };
  }

  const weeklyData = new Map<
    string,
    {
      weekStart: string;
      totalActivities: number;
      quantifiedActivities: number;
      members: ActivityObservationQuantification[];
    }
  >();

  for (const activity of activityRows) {
    const derived = derivedMap.get(activity.id);
    const weekKey = getWeekStartKey(new Date(activity.started_at));

    let week = weeklyData.get(weekKey);
    if (!week) {
      week = {
        weekStart: weekKey,
        totalActivities: 0,
        quantifiedActivities: 0,
        members: [],
      };
      weeklyData.set(weekKey, week);
    }
    week.totalActivities += 1;
    if (!derived || derived.observationQuantification.members.length === 0) continue;
    week.quantifiedActivities += 1;
    week.members.push(...derived.observationQuantification.members);
  }

  const weeklyDataArray = Array.from(weeklyData.values()).map((week) => {
    const zones = emptyZoneDistribution();
    const observationQuantification =
      week.members.length === 0
        ? null
        : createObservationQuantificationBundle({ members: week.members });
    const quantification = observationQuantification?.summary ?? null;
    const totalCommonLoad =
      !quantification || quantification.commonLoad.status === "unavailable"
        ? null
        : quantification.commonLoad.load;
    const zoneLoads = emptyZoneDistribution();
    for (const member of week.members) {
      const commonLoad = member.commonLoad;
      const intensity = commonLoad.status === "unavailable" ? null : commonLoad.intensity;
      if (commonLoad.status === "unavailable" || commonLoad.load === null || intensity === null)
        continue;
      const zone = getTrainingIntensityZone(intensity) as IntensityZone;
      zoneLoads[zone] += commonLoad.load;
    }

    if (totalCommonLoad !== null && totalCommonLoad > 0) {
      for (const zone in zoneLoads) {
        const zoneKey = zone as IntensityZone;
        zones[zoneKey] = Math.round((zoneLoads[zoneKey] / totalCommonLoad) * 1000) / 10;
      }
    }

    return {
      weekStart: week.weekStart,
      status:
        totalCommonLoad === null
          ? ("unavailable" as const)
          : week.quantifiedActivities < week.totalActivities ||
              quantification?.commonLoad.status === "partial"
            ? ("partial" as const)
            : ("complete" as const),
      totalCommonLoad: totalCommonLoad === null ? null : Math.round(totalCommonLoad),
      zones,
      observationQuantification,
      coverage: {
        totalActivities: week.totalActivities,
        quantifiedActivities: week.quantifiedActivities,
      },
    };
  });

  return {
    weeklyData: weeklyDataArray.sort(
      (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime(),
    ),
  };
}
