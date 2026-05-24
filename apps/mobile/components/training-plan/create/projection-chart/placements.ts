import type { ProjectionChartPayload } from "@repo/core";

type ProjectionPoint = ProjectionChartPayload["points"][number];

export type GoalPointPlacement = {
  marker: {
    id: string;
    name: string;
    target_date: string;
    source: "projection";
  };
  pointIndex: number;
  stackIndex: number;
  stackSize: number;
};

export type PhaseBandPlacement = {
  key: string;
  label: string;
  left: number;
  width: number;
  color: string;
};

export const isDateWithinRange = (date: string, startDate: string, endDate: string) => {
  return date >= startDate && date <= endDate;
};

const toUtcDate = (isoDate: string): Date | null => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const getPhaseColor = (phaseName: string, isDark: boolean) => {
  const normalized = phaseName.toLowerCase();

  if (normalized.includes("base")) {
    return isDark ? "rgba(56, 189, 248, 0.78)" : "rgba(3, 105, 161, 0.78)";
  }
  if (normalized.includes("build")) {
    return isDark ? "rgba(52, 211, 153, 0.8)" : "rgba(5, 150, 105, 0.8)";
  }
  if (normalized.includes("peak")) {
    return isDark ? "rgba(250, 204, 21, 0.85)" : "rgba(202, 138, 4, 0.85)";
  }
  if (normalized.includes("taper")) {
    return isDark ? "rgba(148, 163, 184, 0.82)" : "rgba(71, 85, 105, 0.82)";
  }
  if (normalized.includes("recovery")) {
    return isDark ? "rgba(167, 139, 250, 0.82)" : "rgba(124, 58, 237, 0.82)";
  }

  return isDark ? "rgba(148, 163, 184, 0.72)" : "rgba(100, 116, 139, 0.72)";
};

export const resolveGoalPointPlacements = (
  points: ProjectionPoint[],
  payload: ProjectionChartPayload,
): GoalPointPlacement[] => {
  if (points.length === 0) {
    return [];
  }

  const mergedMarkers: Array<{
    id: string;
    name: string;
    target_date: string;
    source: "projection";
  }> = payload.goal_markers.map((goal) => ({
    ...goal,
    source: "projection",
  }));

  const visibleStartDate = points[0]?.date;
  const visibleEndDate = points[points.length - 1]?.date;
  const visibleMarkers =
    visibleStartDate && visibleEndDate
      ? mergedMarkers.filter((goal) =>
          isDateWithinRange(goal.target_date, visibleStartDate, visibleEndDate),
        )
      : mergedMarkers;

  if (visibleMarkers.length === 0) {
    return [];
  }

  const indexByPointDate = new Map<string, number>();
  const pointTimes = points.map((point, index) => {
    if (!indexByPointDate.has(point.date)) {
      indexByPointDate.set(point.date, index);
    }

    const pointDate = toUtcDate(point.date);
    return pointDate ? pointDate.getTime() : Number.NaN;
  });

  const indexedPlacements: Array<{
    marker: GoalPointPlacement["marker"];
    pointIndex: number;
  }> = [];

  for (const goal of visibleMarkers) {
    const directIndex = indexByPointDate.get(goal.target_date);
    if (directIndex !== undefined) {
      indexedPlacements.push({ marker: goal, pointIndex: directIndex });
      continue;
    }

    const goalDate = toUtcDate(goal.target_date);
    if (!goalDate) {
      continue;
    }

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    const goalTime = goalDate.getTime();

    for (let index = 0; index < pointTimes.length; index++) {
      const pointTime = pointTimes[index];
      if (!Number.isFinite(pointTime)) {
        continue;
      }

      const distance = Math.abs(pointTime - goalTime);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    indexedPlacements.push({ marker: goal, pointIndex: bestIndex });
  }

  const placementsByIndex = new Map<number, typeof indexedPlacements>();
  for (const placement of indexedPlacements) {
    const current = placementsByIndex.get(placement.pointIndex) ?? [];
    current.push(placement);
    placementsByIndex.set(placement.pointIndex, current);
  }

  const stackedPlacements: GoalPointPlacement[] = [];
  const sortedIndexes = Array.from(placementsByIndex.keys()).sort((a, b) => a - b);

  for (const pointIndex of sortedIndexes) {
    const placementsAtIndex = placementsByIndex.get(pointIndex) ?? [];
    const stackSize = placementsAtIndex.length;

    placementsAtIndex.forEach((placement, stackIndex) => {
      stackedPlacements.push({
        marker: placement.marker,
        pointIndex,
        stackIndex,
        stackSize,
      });
    });
  }

  return stackedPlacements;
};

export const resolveNearestPointIndexByDate = (
  points: ProjectionPoint[],
  date: string,
): number | null => {
  if (points.length === 0) return null;

  const directIndex = points.findIndex((point) => point.date === date);
  if (directIndex >= 0) return directIndex;

  const target = toUtcDate(date);
  if (!target) return null;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const pointDate = toUtcDate(points[index]?.date);
    if (!pointDate) continue;
    const distance = Math.abs(pointDate.getTime() - target.getTime());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
};

export const resolvePhaseBoundaryMarkers = (
  points: ProjectionPoint[],
  projectionChart: ProjectionChartPayload | undefined,
) => {
  if (!projectionChart) {
    return [] as Array<{ index: number; label: string }>;
  }

  const deduped = new Map<number, string>();
  for (const phase of projectionChart.periodization_phases.slice(1)) {
    const index = resolveNearestPointIndexByDate(points, phase.start_date);
    if (index === null || index <= 0 || index >= points.length - 1) {
      continue;
    }
    if (!deduped.has(index)) {
      deduped.set(index, phase.name);
    }
  }

  return Array.from(deduped.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([index, label]) => ({ index, label }));
};

export const resolvePhaseBandPlacements = (input: {
  points: ProjectionPoint[];
  projectionChart: ProjectionChartPayload | undefined;
  isDark: boolean;
  markerXForIndex: (index: number) => number;
}): PhaseBandPlacement[] => {
  const { points, projectionChart, isDark, markerXForIndex } = input;
  if (!projectionChart || points.length === 0) {
    return [];
  }

  const visibleStart = points[0]?.date;
  const visibleEnd = points[points.length - 1]?.date;
  if (!visibleStart || !visibleEnd) {
    return [];
  }

  const rawBands = projectionChart.periodization_phases
    .map((phase) => {
      const clampedStart = phase.start_date < visibleStart ? visibleStart : phase.start_date;
      const clampedEnd = phase.end_date > visibleEnd ? visibleEnd : phase.end_date;
      if (clampedStart > clampedEnd) {
        return null;
      }

      const startIndex = resolveNearestPointIndexByDate(points, clampedStart);
      const endIndex = resolveNearestPointIndexByDate(points, clampedEnd);
      if (startIndex === null || endIndex === null) {
        return null;
      }

      const leftIndex = Math.min(startIndex, endIndex);
      const rightIndex = Math.max(startIndex, endIndex);
      const left = markerXForIndex(leftIndex);
      const right = markerXForIndex(rightIndex);

      return {
        key: phase.id,
        label: phase.name,
        left,
        width: Math.max(1, right - left),
        color: getPhaseColor(phase.name, isDark),
      };
    })
    .filter((phase): phase is PhaseBandPlacement => phase !== null);

  const sortedBands = [...rawBands].sort((a, b) => a.left - b.left);

  return sortedBands.map((band, index) => {
    const nextBand = sortedBands[index + 1];
    const connectedWidth = nextBand ? Math.max(1, nextBand.left - band.left) : band.width;

    return {
      ...band,
      width: connectedWidth,
    };
  });
};

export const resolvePhaseLegendItems = (phaseBandPlacements: PhaseBandPlacement[]) => {
  const deduped = new Map<string, { label: string; color: string }>();
  for (const phase of phaseBandPlacements) {
    const key = phase.label.trim().toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, { label: phase.label, color: phase.color });
    }
  }

  return Array.from(deduped.values());
};
