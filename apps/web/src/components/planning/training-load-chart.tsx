import type { AppRouter, inferRouterOutputs } from "@repo/api/client";

type PlanTabProjection = inferRouterOutputs<AppRouter>["trainingPlans"]["getPlanTabProjection"];
type TimelineDay = NonNullable<PlanTabProjection["timeline"]>["days"][number];

type ChartPoint = {
  date: string;
  value: number;
};

type ChartSeries = {
  className: string;
  label: string;
  points: ChartPoint[];
  strokeDasharray?: string;
};

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

function buildSeriesGeometry(points: ChartPoint[], dates: string[], maximum: number) {
  const values = new Map(points.map((point) => [point.date, point.value]));
  const denominator = Math.max(dates.length - 1, 1);
  const segments: string[] = [];
  const markers: Array<{ x: number; y: number }> = [];
  let segment: string[] = [];

  for (const [index, date] of dates.entries()) {
    const value = values.get(date);
    if (value === undefined) {
      if (segment.length > 0) segments.push(segment.join(" "));
      segment = [];
      continue;
    }
    const x = (index / denominator) * 100;
    const y = 100 - (value / maximum) * 100;
    segment.push(`${x},${y}`);
    markers.push({ x, y });
  }
  if (segment.length > 0) segments.push(segment.join(" "));

  return { markers, segments };
}

function seriesSummary(series: ChartSeries) {
  const latest = [...series.points]
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1);
  return latest
    ? `${series.label}: ${series.points.length} daily ${series.points.length === 1 ? "value" : "values"}, latest ${rounded(latest.value)} on ${latest.date}.`
    : `${series.label}: unavailable.`;
}

function ChartPanel({
  dates: timelineDates,
  series,
  title,
}: {
  dates: string[];
  series: ChartSeries[];
  title: string;
}) {
  const dates = [
    ...new Set([
      ...timelineDates,
      ...series.flatMap((entry) => entry.points.map((point) => point.date)),
    ]),
  ].sort();
  const maximum = Math.max(
    ...series.flatMap((entry) => entry.points.map((point) => point.value)),
    1,
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <svg
        aria-hidden="true"
        className="h-32 w-full overflow-visible"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <line
          className="text-border"
          stroke="currentColor"
          strokeWidth="1"
          x1="0"
          x2="100"
          y1="100"
          y2="100"
        />
        {series.map((entry) => {
          const geometry = buildSeriesGeometry(entry.points, dates, maximum);
          return (
            <g className={entry.className} key={entry.label}>
              {geometry.segments.map((points) => (
                <polyline
                  fill="none"
                  key={points}
                  points={points}
                  stroke="currentColor"
                  strokeDasharray={entry.strokeDasharray}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {geometry.markers.map((marker) => (
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  fill="currentColor"
                  key={`${marker.x}:${marker.y}`}
                  r="1.8"
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{dates[0]}</span>
        <span>{dates.at(-1)}</span>
      </div>
    </div>
  );
}

export function TrainingLoadChart({
  fitness,
  days,
}: {
  fitness: PlanTabProjection["fitness"];
  days: TimelineDay[];
}) {
  const planned = days.flatMap((day) =>
    day.load.scheduledLoadStatus === "unavailable" || day.load.scheduledLoad === null
      ? []
      : [{ date: day.date, value: day.load.scheduledLoad }],
  );
  const completed = days.flatMap((day) =>
    day.load.completedLoadStatus === "unavailable" || day.load.completedLoad === null
      ? []
      : [{ date: day.date, value: day.load.completedLoad }],
  );
  const actualFitness = fitness.actual.map((point) => ({
    date: point.date,
    value: point.longTermLoad,
  }));
  const scheduledFitness = fitness.scheduled.map((point) => ({
    date: point.date,
    value: point.longTermLoad,
  }));
  const loadSeries: ChartSeries[] = [
    { className: "text-primary", label: "Scheduled / planned Common Load", points: planned },
    { className: "text-emerald-600", label: "Completed Common Load", points: completed },
  ];
  const fitnessSeries: ChartSeries[] = [
    { className: "text-violet-600", label: "Actual fitness", points: actualFitness },
    {
      className: "text-amber-600",
      label: "Scheduled fitness",
      points: scheduledFitness,
      strokeDasharray: "5 3",
    },
  ];
  const allSeries = [...loadSeries, ...fitnessSeries];
  const unavailableLoadValues = days.filter(
    (day) =>
      day.load.scheduledLoadStatus === "unavailable" ||
      day.load.completedLoadStatus === "unavailable" ||
      day.load.scheduledLoad === null ||
      day.load.completedLoad === null,
  ).length;

  if (allSeries.every((series) => series.points.length === 0)) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        No chart data is available for this planning window. Unavailable values are not shown as
        zero.
      </p>
    );
  }

  const visibleSeries = allSeries.filter((series) => series.points.length > 0);
  const summary = allSeries.map(seriesSummary).join(" ");
  const unavailableSummary =
    unavailableLoadValues > 0
      ? ` ${unavailableLoadValues} day${unavailableLoadValues === 1 ? " has" : "s have"} unavailable Common Load values; those values are omitted, not shown as zero.`
      : "";

  return (
    <section
      aria-label={`Training load chart. ${summary}${unavailableSummary}`}
      className="space-y-4 rounded-xl border p-4"
      role="img"
    >
      <div>
        <h3 className="font-medium">Daily training chart</h3>
        <p className="text-sm text-muted-foreground">
          Scheduled and completed Common Load with actual and scheduled fitness.
        </p>
      </div>
      <ul aria-label="Chart legend" className="flex list-none flex-wrap gap-x-4 gap-y-2 text-xs">
        {visibleSeries.map((series) => (
          <li className="inline-flex items-center gap-2" key={series.label}>
            <span aria-hidden="true" className={`h-0.5 w-5 ${series.className} bg-current`} />
            {series.label}
          </li>
        ))}
      </ul>
      {loadSeries.some((series) => series.points.length > 0) ? (
        <ChartPanel
          dates={days.map((day) => day.date)}
          series={loadSeries.filter((series) => series.points.length > 0)}
          title="Common Load"
        />
      ) : null}
      {fitnessSeries.some((series) => series.points.length > 0) ? (
        <ChartPanel
          dates={days.map((day) => day.date)}
          series={fitnessSeries.filter((series) => series.points.length > 0)}
          title="Fitness"
        />
      ) : null}
      {unavailableLoadValues > 0 ? (
        <p className="text-xs text-muted-foreground">
          Unavailable Common Load values are omitted from the chart, not shown as zero.
        </p>
      ) : null}
    </section>
  );
}
