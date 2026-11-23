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
  colors,
  density = "default",
  description,
  emptyMessage,
  series,
  testId,
  title,
  visual,
}: TrainingStateChartProps) {
  const selected = series.length === 1 ? series.at(0) : undefined;
  const definition = selected ? getTrainingStateMetric(selected.metric) : undefined;
  const chartTitle = title ?? definition?.label ?? "Training state";
  const plottedSeries = series.map(({ metric, source }) => {
    const metricDefinition = getTrainingStateMetric(metric);
    const values = visual.points.map((point) => point[source][metric]);
    return {
      color: colors?.[metric] ?? metricDefinition.webColor,
      id: `${metric}-${source}`,
      label: `${metricDefinition.label} · ${getTrainingStateSourceLabel(source)}`,
      source,
      values,
      summary: summarizeChartValues(values),
    };
  });
  const values = plottedSeries.flatMap((item) => item.values);
  const summary = summarizeChartValues(values);
  if (!summary) {
    return (
      <ChartCard
        {...(className ? { className } : {})}
        {...(description ? { description } : {})}
        title={chartTitle}
      >
        <ChartEmptyState message={emptyMessage} {...(testId === undefined ? {} : { testId })} />
      </ChartCard>
    );
  }

  const domain = getPaddedChartDomain(values);
  const plots = plottedSeries.map((item) => ({
    ...item,
    segments: buildChartSegments(
      visual.points.map((point, index) => ({
        label: point.date,
        x: Number.isFinite(Date.parse(`${point.date}T00:00:00Z`))
          ? Date.parse(`${point.date}T00:00:00Z`)
          : point.index,
        y: item.values[index] ?? null,
      })),
      { bottom: 82, domain, left: 12, right: 98, top: 6 },
    ),
  }));
  const firstDate = visual.points[0]?.date;
  const latestDate = visual.points.at(-1)?.date;
  const compact = density === "compact";
  const chart = (
    <div
      aria-label={`${chartTitle}. ${getTrainingStateAccessibilityLabel(visual, series)}`}
      className={`relative w-full ${compact ? "h-24" : "h-56"}`}
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
        {plots.flatMap((plot) =>
          plot.segments.map((segment) => (
            <polyline
              fill="none"
              key={`${plot.id}-${segment[0]?.label}-${segment.at(-1)?.label}`}
              points={segment.map((point) => `${point.plotX},${point.plotY}`).join(" ")}
              stroke={plot.color}
              strokeDasharray={plot.source === "projected" ? "6 4" : undefined}
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          )),
        )}
      </svg>
      {plots.flatMap((plot) =>
        plot.segments.flat().map((point) => (
          <span
            aria-hidden="true"
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background"
            key={`${plot.id}-${point.label ?? point.x}`}
            style={{
              borderColor: plot.color,
              left: `${point.plotX}%`,
              top: `${point.plotY}%`,
            }}
          />
        )),
      )}
      <span className="absolute bottom-0 left-[12%] text-[10px] text-muted-foreground">
        {firstDate ? formatTrainingStateDate(firstDate, visual.timeZone) : ""}
      </span>
      <span className="absolute bottom-0 right-[2%] text-[10px] text-muted-foreground">
        {latestDate ? formatTrainingStateDate(latestDate, visual.timeZone) : ""}
      </span>
      {!compact ? (
        <>
          <span className="absolute left-[1%] top-[3%] text-[10px] text-muted-foreground">
            {domain.max.toFixed(1)}
          </span>
          <span className="absolute bottom-[17%] left-[1%] text-[10px] text-muted-foreground">
            {domain.min.toFixed(1)}
          </span>
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs font-medium text-muted-foreground">
            Planning date
          </span>
          <span className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-xs font-medium text-muted-foreground">
            {visual.unitLabel}
          </span>
        </>
      ) : null}
    </div>
  );
  if (compact) {
    return (
      <section aria-label={`${chartTitle} comparison`} className={`space-y-2 ${className ?? ""}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-medium text-foreground">{chartTitle}</h3>
          <p className="text-xs text-muted-foreground">{visual.unitLabel}</p>
        </div>
        {chart}
        <dl className="grid grid-cols-3 gap-2">
          {plottedSeries.map((item) => (
            <div key={item.id}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="text-sm font-semibold text-foreground">
                {item.summary ? item.summary.last.toFixed(1) : "Unavailable"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  return (
    <ChartCard
      {...(className ? { className } : {})}
      {...(description ? { description } : {})}
      legend={plottedSeries.map(({ color, id, label }) => ({ color, id, label }))}
      summary={
        selected
          ? [
              { label: "Records", value: String(values.filter((value) => value !== null).length) },
              { label: "Latest", value: `${summary.last.toFixed(1)} ${visual.unitLabel}` },
            ]
          : plottedSeries.map((item) => ({
              label: `${item.label} · Latest`,
              value: item.summary
                ? `${item.summary.last.toFixed(1)} ${visual.unitLabel}`
                : "Unavailable",
            }))
      }
      title={chartTitle}
    >
      {chart}
    </ChartCard>
  );
}

export * from "./shared";
export { TrainingStateChart, TrainingStateLegend };
