import {
  ChartCard,
  ChartEmptyState,
  type ChartSummaryItem,
  getChartAccessibilityLabel,
} from "@repo/ui/components/chart";
import { buildChartSegments, getPaddedChartDomain, summarizeChartValues } from "@repo/ui/lib/chart";

export type SimpleTrendChartPoint = {
  id: string;
  label?: string;
  value: number | null;
  x: number;
};

type SimpleTrendChartProps = {
  axisLabels?: { x: string; y: string };
  description?: string;
  emptyMessage: string;
  formatX?: (value: number) => string;
  formatValue?: (value: number) => string;
  invertY?: boolean;
  lowerIsBetter?: boolean;
  points: readonly SimpleTrendChartPoint[];
  smooth?: boolean;
  summaryLabels?: { first: string; latest: string; trend: string };
  title: string;
  xScale?: "linear" | "log";
};

const formatDefaultValue = (value: number) => String(value);

export function buildSmoothChartPath(points: readonly { plotX: number; plotY: number }[]): string {
  const first = points[0];
  if (!first) return "";

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    if (!previous) return path;
    const midpointX = (previous.plotX + point.plotX) / 2;
    return `${path} C ${midpointX},${previous.plotY} ${midpointX},${point.plotY} ${point.plotX},${point.plotY}`;
  }, `M ${first.plotX},${first.plotY}`);
}

export function SimpleTrendChart({
  axisLabels,
  description,
  emptyMessage,
  formatX = formatDefaultValue,
  formatValue = formatDefaultValue,
  invertY = false,
  lowerIsBetter = false,
  points,
  smooth = false,
  summaryLabels = { first: "First", latest: "Latest", trend: "Trend" },
  title,
  xScale = "linear",
}: SimpleTrendChartProps) {
  const values = points.map((point) => point.value);
  const valueSummary = summarizeChartValues(values);
  const validPointCount = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  ).length;
  const summary: ChartSummaryItem[] = valueSummary
    ? [
        { label: "Records", value: String(validPointCount) },
        { label: summaryLabels.first, value: formatValue(valueSummary.first) },
        { label: summaryLabels.latest, value: formatValue(valueSummary.last) },
        {
          label: summaryLabels.trend,
          value:
            valueSummary.direction === "flat"
              ? "No change"
              : `${lowerIsBetter ? (valueSummary.direction === "up" ? "Slower" : "Faster") : valueSummary.direction === "up" ? "Up" : "Down"} ${formatValue(
                  Math.abs(valueSummary.last - valueSummary.first),
                )}`,
        },
      ]
    : [];

  if (!valueSummary) {
    return (
      <ChartCard description={description} title={title}>
        <ChartEmptyState message={emptyMessage} />
      </ChartCard>
    );
  }

  const plotValues = values.map((value) =>
    value == null || !invertY ? value : Number.isFinite(value) ? -value : value,
  );
  const domain = getPaddedChartDomain(plotValues);
  const chartPoints = points.map((point) => ({
    label: point.id,
    x: xScale === "log" ? Math.log(Math.max(point.x, 1)) : point.x,
    y: point.value == null || !invertY ? point.value : -point.value,
  }));
  const segments = buildChartSegments(chartPoints, {
    bottom: axisLabels ? 82 : 90,
    domain,
    left: axisLabels ? 12 : 0,
    right: axisLabels ? 98 : 100,
    top: axisLabels ? 6 : 10,
  });
  const finiteXValues = points.map((point) => point.x).filter(Number.isFinite);
  const xMinimum = finiteXValues.length > 0 ? Math.min(...finiteXValues) : 0;
  const xMaximum = finiteXValues.length > 0 ? Math.max(...finiteXValues) : 0;
  const pointDescription = points
    .filter((point) => point.value != null && Number.isFinite(point.value))
    .map((point) => `${point.label ?? formatX(point.x)}: ${formatValue(point.value as number)}`)
    .join("; ");
  const ariaLabel = `${getChartAccessibilityLabel(title, summary)}${pointDescription ? `. Points: ${pointDescription}` : ""}`;

  return (
    <ChartCard description={description} summary={summary} title={title}>
      <div aria-label={ariaLabel} className="relative h-56 w-full" role="img">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          {axisLabels ? (
            <>
              <line className="text-border" x1="12" x2="12" y1="6" y2="82" stroke="currentColor" />
              <line className="text-border" x1="12" x2="98" y1="82" y2="82" stroke="currentColor" />
            </>
          ) : null}
          {segments.map((segment) =>
            smooth ? (
              <path
                className="text-primary"
                d={buildSmoothChartPath(segment)}
                fill="none"
                key={`${segment[0]?.label}-${segment.at(-1)?.label}`}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <polyline
                className="text-primary"
                fill="none"
                key={`${segment[0]?.label}-${segment.at(-1)?.label}`}
                points={segment.map((point) => `${point.plotX},${point.plotY}`).join(" ")}
                stroke="currentColor"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            ),
          )}
        </svg>
        {segments.flat().map((point) => (
          <span
            aria-hidden="true"
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background"
            data-chart-point="true"
            key={point.label ?? `${point.x}-${point.y}`}
            style={{ left: `${point.plotX}%`, top: `${point.plotY}%` }}
          />
        ))}
        {axisLabels ? (
          <>
            <span className="absolute bottom-0 left-[12%] text-[10px] text-muted-foreground">
              {formatX(xMinimum)}
            </span>
            <span className="absolute bottom-0 right-[2%] text-[10px] text-muted-foreground">
              {formatX(xMaximum)}
            </span>
            <span className="absolute left-[1%] top-[3%] text-[10px] text-muted-foreground">
              {formatValue(invertY ? valueSummary.min : valueSummary.max)}
            </span>
            <span className="absolute bottom-[17%] left-[1%] text-[10px] text-muted-foreground">
              {formatValue(invertY ? valueSummary.max : valueSummary.min)}
            </span>
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs font-medium text-muted-foreground">
              {axisLabels.x}
            </span>
            <span className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-xs font-medium text-muted-foreground">
              {axisLabels.y}
            </span>
          </>
        ) : null}
      </div>
    </ChartCard>
  );
}
