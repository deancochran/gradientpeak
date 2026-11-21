import { buildChartSegments, getPaddedChartDomain, summarizeChartValues } from "../../lib/chart";
import { ChartCard, ChartEmptyState } from "../chart/index.web";
import {
  formatTrainingStateDate,
  getTrainingStateAccessibilityLabel,
  getTrainingStateMetric,
  getTrainingStateSourceLabel,
  type TrainingStateChartProps,
  type TrainingStateLegendProps,
} from "./shared";

function TrainingStateLegend({
  colors,
  metrics = ["fitness", "fatigue", "form"],
  sources,
  testId,
}: TrainingStateLegendProps) {
  return (
    <ul
      aria-label="Training-state legend"
      className="flex flex-wrap gap-3 text-xs text-muted-foreground"
      data-testid={testId}
    >
      {metrics.map((metric) => {
        const definition = getTrainingStateMetric(metric);
        return (
          <li className="flex items-center gap-1" key={definition.id}>
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: colors?.[metric] ?? definition.webColor }}
            />
            {definition.label}
          </li>
        );
      })}
      {sources?.map((source) => (
        <li key={source}>━ {getTrainingStateSourceLabel(source)}</li>
      ))}
    </ul>
  );
}

function TrainingStateChart({
  className,
  description,
  emptyMessage,
  metric,
  source,
  testId,
  title,
  visual,
}: TrainingStateChartProps) {
  const definition = getTrainingStateMetric(metric);
  const chartTitle = title ?? definition.label;
  const values = visual.points.map((point) => point[source][metric]);
  const summary = summarizeChartValues(values);
  if (!summary) {
    return (
      <ChartCard
        {...(className ? { className } : {})}
        {...(description ? { description } : {})}
        title={chartTitle}
      >
        <ChartEmptyState message={emptyMessage} testId={testId} />
      </ChartCard>
    );
  }

  const domain = getPaddedChartDomain(values);
  const chartPoints = visual.points.map((point) => ({
    label: point.date,
    x: Number.isFinite(Date.parse(`${point.date}T00:00:00Z`))
      ? Date.parse(`${point.date}T00:00:00Z`)
      : point.index,
    y: point[source][metric],
  }));
  const segments = buildChartSegments(chartPoints, {
    bottom: 82,
    domain,
    left: 12,
    right: 98,
    top: 6,
  });
  const firstDate = visual.points[0]?.date;
  const latestDate = visual.points.at(-1)?.date;

  return (
    <ChartCard
      {...(className ? { className } : {})}
      {...(description ? { description } : {})}
      legend={[{ color: definition.webColor, id: definition.id, label: definition.label }]}
      summary={[
        { label: "Records", value: String(values.filter((value) => value !== null).length) },
        { label: "Latest", value: `${summary.last.toFixed(1)} ${visual.unitLabel}` },
      ]}
      title={chartTitle}
    >
      <div
        aria-label={`${chartTitle}. ${getTrainingStateAccessibilityLabel(visual, metric, source)}`}
        className="relative h-56 w-full"
        data-testid={testId}
        role="img"
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <line className="text-border" stroke="currentColor" x1="12" x2="12" y1="6" y2="82" />
          <line className="text-border" stroke="currentColor" x1="12" x2="98" y1="82" y2="82" />
          {segments.map((segment) => (
            <polyline
              fill="none"
              key={`${segment[0]?.label}-${segment.at(-1)?.label}`}
              points={segment.map((point) => `${point.plotX},${point.plotY}`).join(" ")}
              stroke={definition.webColor}
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {segments.flat().map((point) => (
          <span
            aria-hidden="true"
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background"
            key={point.label ?? `${point.x}-${point.y}`}
            style={{
              borderColor: definition.webColor,
              left: `${point.plotX}%`,
              top: `${point.plotY}%`,
            }}
          />
        ))}
        <span className="absolute bottom-0 left-[12%] text-[10px] text-muted-foreground">
          {firstDate ? formatTrainingStateDate(firstDate, visual.timeZone) : ""}
        </span>
        <span className="absolute bottom-0 right-[2%] text-[10px] text-muted-foreground">
          {latestDate ? formatTrainingStateDate(latestDate, visual.timeZone) : ""}
        </span>
        <span className="absolute left-[1%] top-[3%] text-[10px] text-muted-foreground">
          {summary.max.toFixed(1)}
        </span>
        <span className="absolute bottom-[17%] left-[1%] text-[10px] text-muted-foreground">
          {summary.min.toFixed(1)}
        </span>
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs font-medium text-muted-foreground">
          Planning date
        </span>
        <span className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-xs font-medium text-muted-foreground">
          {visual.unitLabel}
        </span>
      </div>
    </ChartCard>
  );
}

export * from "./shared";
export { TrainingStateChart, TrainingStateLegend };
