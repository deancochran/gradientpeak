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
  description?: string;
  emptyMessage: string;
  formatValue?: (value: number) => string;
  points: readonly SimpleTrendChartPoint[];
  title: string;
};

const formatDefaultValue = (value: number) => String(value);

export function SimpleTrendChart({
  description,
  emptyMessage,
  formatValue = formatDefaultValue,
  points,
  title,
}: SimpleTrendChartProps) {
  const values = points.map((point) => point.value);
  const valueSummary = summarizeChartValues(values);
  const validPointCount = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  ).length;
  const summary: ChartSummaryItem[] = valueSummary
    ? [
        { label: "Records", value: String(validPointCount) },
        { label: "First", value: formatValue(valueSummary.first) },
        { label: "Latest", value: formatValue(valueSummary.last) },
        {
          label: "Trend",
          value:
            valueSummary.direction === "flat"
              ? "No change"
              : `${valueSummary.direction === "up" ? "Up" : "Down"} ${formatValue(
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

  const domain = getPaddedChartDomain(values);
  const segments = buildChartSegments(
    points.map((point) => ({ label: point.id, x: point.x, y: point.value })),
    { bottom: 90, domain, left: 0, right: 100, top: 10 },
  );
  const ariaLabel = getChartAccessibilityLabel(title, summary);

  return (
    <ChartCard description={description} summary={summary} title={title}>
      <div aria-label={ariaLabel} className="relative h-56 w-full" role="img">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          {segments.map((segment) => (
            <polyline
              className="text-primary"
              fill="none"
              key={`${segment[0]?.label}-${segment.at(-1)?.label}`}
              points={segment.map((point) => `${point.plotX},${point.plotY}`).join(" ")}
              stroke="currentColor"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
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
      </div>
    </ChartCard>
  );
}
