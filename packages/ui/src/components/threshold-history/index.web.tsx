import { buildChartSegments, getPaddedChartDomain } from "../../lib/chart";
import {
  buildThresholdHistoryChartData,
  formatThresholdDate,
  formatThresholdValue,
  type ThresholdHistoryChartProps,
  thresholdMetricLabel,
} from "./shared";

function ThresholdHistoryChart({ emptyMessage, series, testId }: ThresholdHistoryChartProps) {
  const values = series.points.map((point) => point.value).filter(Number.isFinite);
  if (!values.length) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  const domain = getPaddedChartDomain(values, {
    minimumPadding: series.unit === "meters_per_second" ? 0.01 : 1,
  });
  const segments = buildChartSegments(
    buildThresholdHistoryChartData(series.points).map((point) => ({
      ...(point.thresholdId === undefined ? {} : { label: point.thresholdId }),
      x: point.timestamp,
      y: point.value,
    })),
    { bottom: 80, domain, left: 10, right: 96, top: 8 },
  );
  const first = series.points[0];
  const last = series.points.at(-1);
  const label = `${thresholdMetricLabel(series.activityCategory, series.metric)} history. ${series.points.length} chronological records. Latest ${last ? formatThresholdValue(last.value, last.unit, last.activityCategory) : "unavailable"} on ${last ? formatThresholdDate(last.effectiveAt) : "unknown date"}.`;
  return (
    <div aria-label={label} className="relative h-44 w-full" data-testid={testId} role="img">
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full overflow-visible"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <line className="text-border" stroke="currentColor" x1="10" x2="96" y1="8" y2="8" />
        <line className="text-border" stroke="currentColor" x1="10" x2="10" y1="8" y2="80" />
        <line className="text-border" stroke="currentColor" x1="10" x2="96" y1="80" y2="80" />
        {segments.map((segment) => (
          <polyline
            fill="none"
            key={segment.map((point) => point.label).join("-")}
            points={segment.map((point) => `${point.plotX},${point.plotY}`).join(" ")}
            stroke="var(--chart-1)"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {segments.flat().map((point) => (
        <span
          aria-hidden="true"
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-chart-1 bg-background"
          key={point.label}
          style={{ left: `${point.plotX}%`, top: `${point.plotY}%` }}
        />
      ))}
      <span className="absolute left-0 top-0 text-[10px] text-muted-foreground">
        {formatThresholdValue(domain.max, series.unit, series.activityCategory)}
      </span>
      <span className="absolute bottom-[18%] left-0 text-[10px] text-muted-foreground">
        {formatThresholdValue(domain.min, series.unit, series.activityCategory)}
      </span>
      <span className="absolute bottom-0 left-[10%] text-[10px] text-muted-foreground">
        {first ? formatThresholdDate(first.effectiveAt) : ""}
      </span>
      <span className="absolute bottom-0 right-[4%] text-[10px] text-muted-foreground">
        {last ? formatThresholdDate(last.effectiveAt) : ""}
      </span>
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
        Effective date
      </span>
    </div>
  );
}

export * from "./shared";
export { ThresholdHistoryChart };
