import {
  type ActivityObservationQuantification,
  type ActivityObservationQuantificationBundle,
  createObservationQuantificationBundle,
} from "@repo/core";

export type VolumeTrendsGroupBy = "day" | "week" | "month";

export type VolumeTrendActivityRow = {
  id: string;
  started_at: Date;
  distance_meters: number | null;
  moving_seconds: number | null;
  duration_seconds: number | null;
};

export type VolumeTrendsResult = {
  dataPoints: Array<{
    date: string;
    status: "complete" | "partial" | "unavailable";
    totalDistance: number;
    totalTime: number;
    activityCount: number;
    observationQuantification: ActivityObservationQuantificationBundle;
  }>;
  unavailableDataPoints: Array<{
    date: string;
    status: "partial" | "unavailable";
    activityCount: number;
    observationQuantification: ActivityObservationQuantificationBundle | null;
  }>;
  totals: {
    status: "complete" | "partial" | "unavailable";
    totalDistance: number;
    totalTime: number;
    totalActivities: number;
    observationQuantification: ActivityObservationQuantificationBundle;
  } | null;
  aggregate: {
    status: "complete" | "partial" | "unavailable";
    totalDistance: number | null;
    totalTime: number | null;
    totalActivities: number;
    observationQuantification: ActivityObservationQuantificationBundle | null;
  } | null;
};

export type VolumeTrendDerivedSummary = {
  observationQuantification: ActivityObservationQuantificationBundle;
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
  derivedMap: Map<string, VolumeTrendDerivedSummary>,
): VolumeTrendsResult {
  if (activityRows.length === 0) {
    return { dataPoints: [], unavailableDataPoints: [], totals: null, aggregate: null };
  }

  const groupedData = new Map<
    string,
    {
      date: string;
      activityCount: number;
      missingQuantificationCount: number;
      members: ActivityObservationQuantification[];
    }
  >();

  for (const activity of activityRows) {
    const groupKey = getVolumeTrendGroupKey(new Date(activity.started_at), groupBy);

    let group = groupedData.get(groupKey);

    if (!group) {
      group = {
        date: groupKey,
        activityCount: 0,
        missingQuantificationCount: 0,
        members: [],
      };
      groupedData.set(groupKey, group);
    }

    group.activityCount += 1;
    const members = derivedMap.get(activity.id)?.observationQuantification.members;
    if (!members || members.length === 0) {
      group.missingQuantificationCount += 1;
      continue;
    }
    group.members.push(...members);
  }

  const project = (group: {
    activityCount: number;
    missingQuantificationCount: number;
    members: ActivityObservationQuantification[];
  }) => {
    const observationQuantification =
      group.members.length === 0
        ? null
        : createObservationQuantificationBundle({ members: group.members });
    if (!observationQuantification) {
      return {
        status: "unavailable" as const,
        totalDistance: null,
        totalTime: null,
        observationQuantification,
      };
    }
    const quantification = observationQuantification.summary;
    const totalDistance =
      quantification.distance.status === "unavailable" ? null : quantification.distance.value;
    const time = [
      quantification.duration.moving,
      quantification.duration.active,
      quantification.duration.elapsed,
    ].find((quantity) => quantity.status !== "unavailable");
    const totalTime = time?.value ?? null;
    const hasPartialQuantity =
      quantification.distance.status !== "complete" || time?.status !== "complete";
    return {
      status:
        totalDistance === null && totalTime === null
          ? ("unavailable" as const)
          : group.missingQuantificationCount > 0 || hasPartialQuantity
            ? ("partial" as const)
            : ("complete" as const),
      totalDistance,
      totalTime,
      observationQuantification,
    };
  };

  const projectedDataPoints = Array.from(groupedData.values())
    .map((group) => ({
      date: group.date,
      activityCount: group.activityCount,
      ...project(group),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const dataPoints = projectedDataPoints.flatMap((point) =>
    point.totalDistance !== null &&
    point.totalTime !== null &&
    point.observationQuantification !== null
      ? [
          {
            ...point,
            totalDistance: point.totalDistance,
            totalTime: point.totalTime,
            observationQuantification: point.observationQuantification,
          },
        ]
      : [],
  );
  const unavailableDataPoints = projectedDataPoints.flatMap((point) =>
    point.totalDistance === null ||
    point.totalTime === null ||
    point.observationQuantification === null
      ? [
          {
            date: point.date,
            status: point.status === "complete" ? ("partial" as const) : point.status,
            activityCount: point.activityCount,
            observationQuantification: point.observationQuantification,
          },
        ]
      : [],
  );

  const allMembers: ActivityObservationQuantification[] = [];
  let missingQuantificationCount = 0;
  for (const group of groupedData.values()) {
    missingQuantificationCount += group.missingQuantificationCount;
    allMembers.push(...group.members);
  }
  const aggregate = {
    totalActivities: activityRows.length,
    ...project({
      activityCount: activityRows.length,
      missingQuantificationCount,
      members: allMembers,
    }),
  };
  const totals =
    aggregate.totalDistance !== null &&
    aggregate.totalTime !== null &&
    aggregate.observationQuantification !== null
      ? {
          ...aggregate,
          totalDistance: aggregate.totalDistance,
          totalTime: aggregate.totalTime,
          observationQuantification: aggregate.observationQuantification,
        }
      : null;

  return { dataPoints, unavailableDataPoints, totals, aggregate };
}
