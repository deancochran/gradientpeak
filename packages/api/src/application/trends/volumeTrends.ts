export type VolumeTrendsGroupBy = "day" | "week" | "month";

export type VolumeTrendActivityRow = {
  started_at: Date;
  distance_meters: number | null;
  moving_seconds: number | null;
  duration_seconds: number | null;
};

export type VolumeTrendsResult = {
  dataPoints: Array<{
    date: string;
    totalDistance: number;
    totalTime: number;
    activityCount: number;
  }>;
  totals: {
    totalDistance: number;
    totalTime: number;
    totalActivities: number;
  } | null;
};

function toDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function getVolumeTrendGroupKey(date: Date, groupBy: VolumeTrendsGroupBy) {
  switch (groupBy) {
    case "day":
      return toDateKey(date);
    case "week": {
      // Get Monday of the week
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay() + 1);
      return toDateKey(weekStart);
    }
    case "month":
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  }
}

export function buildVolumeTrends(
  activityRows: VolumeTrendActivityRow[],
  groupBy: VolumeTrendsGroupBy,
): VolumeTrendsResult {
  if (activityRows.length === 0) {
    return { dataPoints: [], totals: null };
  }

  const groupedData = new Map<
    string,
    {
      date: string;
      totalDistance: number;
      totalTime: number;
      activityCount: number;
    }
  >();

  for (const activity of activityRows) {
    const groupKey = getVolumeTrendGroupKey(new Date(activity.started_at), groupBy);

    let group = groupedData.get(groupKey);

    if (!group) {
      group = {
        date: groupKey,
        totalDistance: 0,
        totalTime: 0,
        activityCount: 0,
      };
      groupedData.set(groupKey, group);
    }

    group.totalDistance += activity.distance_meters || 0;
    group.totalTime += activity.moving_seconds || activity.duration_seconds || 0;
    group.activityCount += 1;
  }

  const dataPoints = Array.from(groupedData.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const totals = {
    totalDistance: activityRows.reduce((sum, a) => sum + (a.distance_meters || 0), 0),
    totalTime: activityRows.reduce(
      (sum, a) => sum + (a.moving_seconds || a.duration_seconds || 0),
      0,
    ),
    totalActivities: activityRows.length,
  };

  return { dataPoints, totals };
}
