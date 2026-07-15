export type ChartPoint = {
  label?: string;
  x: number;
  y: number | null;
};

export type ChartCoordinate = ChartPoint & {
  plotX: number;
  plotY: number;
  y: number;
};

export type ChartDomain = {
  max: number;
  min: number;
};

export type ChartSummary = {
  direction: "down" | "flat" | "up";
  first: number;
  last: number;
  max: number;
  min: number;
};

export type TimestampedValue = {
  timestamp: number;
  value: number | null;
};

type DomainOptions = {
  includeZero?: boolean;
  minimumPadding?: number;
  paddingRatio?: number;
};

type CoordinateOptions = {
  bottom?: number;
  domain?: ChartDomain;
  left?: number;
  right?: number;
  top?: number;
};

export function getPaddedChartDomain(
  values: readonly (number | null | undefined)[],
  options: DomainOptions = {},
): ChartDomain {
  const finiteValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  if (finiteValues.length === 0) return { min: 0, max: 1 };

  const { includeZero = false, minimumPadding = 1, paddingRatio = 0.1 } = options;
  let min = Math.min(...finiteValues);
  let max = Math.max(...finiteValues);

  if (includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }

  const observedRange = max - min;
  const referenceMagnitude = Math.max(Math.abs(min), Math.abs(max), 1);
  const padding = Math.max(
    observedRange * paddingRatio,
    observedRange === 0 ? referenceMagnitude * paddingRatio : 0,
    minimumPadding,
  );

  return { min: min - padding, max: max + padding };
}

export function buildChartSegments(
  points: readonly ChartPoint[],
  options: CoordinateOptions = {},
): ChartCoordinate[][] {
  const { bottom = 90, left = 0, right = 100, top = 10 } = options;
  const domain = options.domain ?? getPaddedChartDomain(points.map((point) => point.y));
  const yRange = domain.max - domain.min || 1;
  const finiteX = points.map((point) => point.x).filter((value) => Number.isFinite(value));
  const xMin = finiteX.length > 0 ? Math.min(...finiteX) : 0;
  const xMax = finiteX.length > 0 ? Math.max(...finiteX) : 1;
  const xRange = xMax - xMin;
  const segments: ChartCoordinate[][] = [];
  let segment: ChartCoordinate[] = [];

  for (const point of points) {
    if (point.y == null || !Number.isFinite(point.y) || !Number.isFinite(point.x)) {
      if (segment.length > 0) segments.push(segment);
      segment = [];
      continue;
    }

    segment.push({
      ...point,
      y: point.y,
      plotX:
        xRange === 0 ? (left + right) / 2 : left + ((point.x - xMin) / xRange) * (right - left),
      plotY: bottom - ((point.y - domain.min) / yRange) * (bottom - top),
    });
  }

  if (segment.length > 0) segments.push(segment);
  return segments;
}

export function summarizeChartValues(
  values: readonly (number | null | undefined)[],
): ChartSummary | null {
  const finiteValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (finiteValues.length === 0) return null;

  const first = finiteValues.at(0);
  const last = finiteValues.at(-1);
  if (first === undefined || last === undefined) return null;
  return {
    direction: last > first ? "up" : last < first ? "down" : "flat",
    first,
    last,
    min: Math.min(...finiteValues),
    max: Math.max(...finiteValues),
  };
}

export function alignSeriesByTimestamp(
  primary: readonly TimestampedValue[],
  secondary: readonly TimestampedValue[],
): Array<{ primary: number; secondary: number; timestamp: number }> {
  const validSecondary = secondary
    .filter(
      (point): point is { timestamp: number; value: number } =>
        Number.isFinite(point.timestamp) && point.value != null && Number.isFinite(point.value),
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  return primary.flatMap((point) => {
    if (point.value == null || !Number.isFinite(point.value) || !Number.isFinite(point.timestamp)) {
      return [];
    }
    const interpolated = interpolateTimestampedValue(validSecondary, point.timestamp);
    return interpolated == null
      ? []
      : [{ primary: point.value, secondary: interpolated, timestamp: point.timestamp }];
  });
}

function interpolateTimestampedValue(
  points: readonly { timestamp: number; value: number }[],
  timestamp: number,
): number | null {
  const first = points.at(0);
  const last = points.at(-1);
  if (!first || !last || timestamp < first.timestamp || timestamp > last.timestamp) {
    return null;
  }

  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const point = points[middle];
    if (!point) return null;
    if (point.timestamp === timestamp) return point.value;
    if (point.timestamp < timestamp) low = middle + 1;
    else high = middle - 1;
  }

  const before = points[high];
  const after = points[low];
  if (!before || !after) return null;
  const ratio = (timestamp - before.timestamp) / (after.timestamp - before.timestamp);
  return before.value + (after.value - before.value) * ratio;
}
