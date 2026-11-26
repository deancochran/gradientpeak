export type TrainingPathChartWindowPoint = {
  date: string;
};

export type TrainingPathChartWindow<TPoint extends TrainingPathChartWindowPoint> = {
  anchorDate: string | null;
  anchorIndex: number | null;
  maxPoints: number;
  selectedDate: string | null;
  selectedIndex: number | null;
  startIndex: number;
  visiblePoints: TPoint[];
};

export function getTrainingPathChartOffset(index: number, slotWidth: number) {
  return Math.max(0, index) * slotWidth;
}

export function getNearestTrainingPathChartIndex(
  offsetX: number,
  slotWidth: number,
  pointCount: number,
) {
  if (pointCount <= 0) return -1;
  return Math.max(0, Math.min(pointCount - 1, Math.round(offsetX / slotWidth)));
}

export function deriveTrainingPathChartWindow<TPoint extends TrainingPathChartWindowPoint>({
  anchorDate,
  maxPoints,
  points,
  selectedDate,
}: {
  anchorDate?: string | null;
  maxPoints: number;
  points: TPoint[] | undefined;
  selectedDate?: string | null;
}): TrainingPathChartWindow<TPoint> {
  const sourcePoints = points ?? [];
  const safeMaxPoints = Math.max(1, Math.floor(maxPoints));
  const anchorIndex = anchorDate
    ? sourcePoints.findIndex((point) => point.date === anchorDate)
    : -1;
  const selectedIndex = selectedDate
    ? sourcePoints.findIndex((point) => point.date === selectedDate)
    : -1;

  if (sourcePoints.length <= safeMaxPoints) {
    return {
      anchorDate: anchorIndex >= 0 ? (sourcePoints[anchorIndex]?.date ?? null) : null,
      anchorIndex: anchorIndex >= 0 ? anchorIndex : null,
      maxPoints: safeMaxPoints,
      selectedDate: selectedIndex >= 0 ? (sourcePoints[selectedIndex]?.date ?? null) : null,
      selectedIndex: selectedIndex >= 0 ? selectedIndex : null,
      startIndex: 0,
      visiblePoints: sourcePoints,
    };
  }

  const centerIndex = anchorIndex >= 0 ? anchorIndex : Math.floor(sourcePoints.length / 2);
  const halfWindow = Math.floor(safeMaxPoints / 2);
  const startIndex = Math.max(
    0,
    Math.min(centerIndex - halfWindow, sourcePoints.length - safeMaxPoints),
  );
  const endIndex = startIndex + safeMaxPoints;

  return {
    anchorDate: anchorIndex >= 0 ? (sourcePoints[anchorIndex]?.date ?? null) : null,
    anchorIndex: anchorIndex >= 0 ? anchorIndex : null,
    maxPoints: safeMaxPoints,
    selectedDate: selectedIndex >= 0 ? (sourcePoints[selectedIndex]?.date ?? null) : null,
    selectedIndex: selectedIndex >= 0 ? selectedIndex : null,
    startIndex,
    visiblePoints: sourcePoints.slice(startIndex, endIndex),
  };
}
