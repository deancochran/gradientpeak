import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { isValidDateOnlyUtc } from "@repo/core/calendar";
import { useId } from "react";

type PlanTabProjection = inferRouterOutputs<AppRouter>["trainingPlans"]["getPlanTabProjection"];
type TimelineDay = NonNullable<PlanTabProjection["timeline"]>["days"][number];
type GoalMarker = PlanTabProjection["goalMarkers"][number];

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
  goalMarkers,
  selectedDate,
  series,
  title,
}: {
  dates: string[];
  goalMarkers: GoalMarker[];
  selectedDate?: string;
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
  const selectedDateIndex = selectedDate ? dates.indexOf(selectedDate) : -1;
  const selectedDateX =
    selectedDateIndex >= 0 ? (selectedDateIndex / Math.max(dates.length - 1, 1)) * 100 : null;
  const denominator = Math.max(dates.length - 1, 1);
  const goalMarkersByDate = new Map<string, GoalMarker[]>();
  for (const marker of goalMarkers) {
    const markers = goalMarkersByDate.get(marker.targetDate) ?? [];
    markers.push(marker);
    goalMarkersByDate.set(marker.targetDate, markers);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <svg
        aria-hidden="true"
        className="h-32 w-full overflow-visible"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {series.length > 0 ? (
          <line
            className="text-border"
            stroke="currentColor"
            strokeWidth="1"
            x1="0"
            x2="100"
            y1="100"
            y2="100"
          />
        ) : null}
        {selectedDateX !== null ? (
          <line
            className="text-primary"
            data-testid="training-chart-selected-date-marker"
            stroke="currentColor"
            strokeDasharray="3 3"
            strokeWidth="1"
            x1={selectedDateX}
            x2={selectedDateX}
            y1="0"
            y2="100"
          />
        ) : null}
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
        {[...goalMarkersByDate.entries()].map(([date, markers]) => {
          const dateIndex = dates.indexOf(date);
          if (dateIndex < 0) return null;
          const x = (dateIndex / denominator) * 100;
          return (
            <g data-goal-marker-count={markers.length} data-goal-marker-date={date} key={date}>
              <line
                className="text-rose-600"
                stroke="currentColor"
                strokeDasharray="2 2"
                strokeWidth="1.5"
                x1={x}
                x2={x}
                y1="0"
                y2="100"
              />
              <circle className="text-rose-600" cx={x} cy="7" fill="currentColor" r="3" />
              {markers.length > 1 ? (
                <text
                  className="fill-background text-[8px] font-semibold"
                  textAnchor="middle"
                  x={x}
                  y="9.5"
                >
                  {markers.length}
                </text>
              ) : null}
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
  fitnessHistory,
  goalMarkers,
  goalMarkersTruncated = false,
  days,
  selectedDate,
  today,
}: {
  fitness: PlanTabProjection["fitness"];
  fitnessHistory: PlanTabProjection["fitnessHistory"];
  goalMarkers: GoalMarker[];
  goalMarkersTruncated?: boolean;
  days: TimelineDay[];
  selectedDate?: string;
  today?: string;
}) {
  const descriptionId = useId();
  const summaryId = useId();
  const titleId = useId();
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
  const fitnessHistoryAvailable =
    fitnessHistory?.status === "current" || fitnessHistory?.status === "historical";
  const canonicalToday = typeof today === "string" && isValidDateOnlyUtc(today) ? today : undefined;
  const fitnessHistoryQualifier =
    fitnessHistoryAvailable && fitnessHistory?.verifiedThrough
      ? ` verified through ${fitnessHistory.verifiedThrough}`
      : "";
  const actualFitnessLabel = !fitnessHistoryAvailable
    ? "Published current model-derived fitness"
    : fitnessHistory?.status === "historical"
      ? "Historical model-derived fitness"
      : "Model-derived fitness";
  const scheduledFitnessLabel =
    fitnessHistory?.status === "historical"
      ? `Planned model-derived fitness (projected from a historical baseline${fitnessHistoryQualifier})`
      : fitnessHistory?.status === "current"
        ? `Planned model-derived fitness (projected from a baseline${fitnessHistoryQualifier})`
        : "Planned model-derived fitness (projected from an unverified baseline)";
  const actualFitness = (
    fitnessHistoryAvailable
      ? canonicalToday
        ? fitness.actual.filter((point) => point.date <= canonicalToday)
        : fitness.actual
      : canonicalToday
        ? fitness.actual.filter((point) => point.date === canonicalToday)
        : []
  ).map((point) => ({
    date: point.date,
    value: point.longTermLoad,
  }));
  const loadSeries: ChartSeries[] = [
    { className: "text-primary", label: "Scheduled / planned Common Load", points: planned },
    { className: "text-emerald-600", label: "Completed Common Load", points: completed },
  ];
  const fitnessSeries: ChartSeries[] = [
    ...(actualFitness.length > 0
      ? [
          {
            className: "text-violet-600",
            label: `${actualFitnessLabel}${fitnessHistoryQualifier}`,
            points: actualFitness,
          },
        ]
      : []),
    {
      className: "text-amber-600",
      label: scheduledFitnessLabel,
      points: fitness.scheduled.map((point) => ({
        date: point.date,
        value: point.longTermLoad,
      })),
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
  const timelineDates = days.map((day) => day.date);
  const firstDate = timelineDates[0];
  const lastDate = timelineDates.at(-1);
  const visibleGoalMarkers =
    firstDate && lastDate
      ? goalMarkers
          .filter((marker) => marker.targetDate >= firstDate && marker.targetDate <= lastDate)
          .sort(
            (left, right) =>
              left.targetDate.localeCompare(right.targetDate) ||
              left.priority - right.priority ||
              left.label.localeCompare(right.label),
          )
      : [];
  const goalSummary =
    visibleGoalMarkers.length > 0
      ? ` ${visibleGoalMarkers.length} goal ${visibleGoalMarkers.length === 1 ? "marker" : "markers"} in this window: ${visibleGoalMarkers.map((marker) => `${marker.label} on ${marker.targetDate}`).join("; ")}.`
      : "";

  if (allSeries.every((series) => series.points.length === 0) && visibleGoalMarkers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        No chart data is available for this planning window. Unavailable values are not shown as
        zero.
      </p>
    );
  }

  const visibleSeries = allSeries.filter((series) => series.points.length > 0);
  const fitnessDescription = fitnessHistoryAvailable
    ? "Scheduled and completed Common Load with available model-derived fitness."
    : actualFitness.length > 0
      ? "Scheduled and completed Common Load. Published current model-derived fitness is shown; history is unavailable. Planned model-derived fitness uses an unverified baseline."
      : "Scheduled and completed Common Load. Planned model-derived fitness uses an unverified baseline.";
  const summary = `${allSeries.map(seriesSummary).join(" ")}${
    selectedDate ? ` Selected day: ${selectedDate}.` : ""
  }${goalSummary}`;
  const unavailableSummary =
    unavailableLoadValues > 0
      ? ` ${unavailableLoadValues} day${unavailableLoadValues === 1 ? " has" : "s have"} unavailable Common Load values; those values are omitted, not shown as zero.`
      : "";
  const truncationSummary = goalMarkersTruncated
    ? " Some goal markers may not be shown because the returned marker list is truncated."
    : "";

  return (
    <section
      aria-describedby={`${descriptionId} ${summaryId}`}
      aria-labelledby={titleId}
      className="space-y-4 rounded-xl border p-4"
    >
      <div>
        <h3 className="font-medium" id={titleId}>
          Daily training chart
        </h3>
        <p className="text-sm text-muted-foreground" id={descriptionId}>
          {fitnessDescription}
        </p>
      </div>
      <p className="sr-only" id={summaryId}>
        {summary}
        {unavailableSummary}
        {truncationSummary}
      </p>
      <ul aria-label="Chart legend" className="flex list-none flex-wrap gap-x-4 gap-y-2 text-xs">
        {visibleSeries.map((series) => (
          <li className="inline-flex items-center gap-2" key={series.label}>
            <span aria-hidden="true" className={`h-0.5 w-5 ${series.className} bg-current`} />
            {series.label}
          </li>
        ))}
        {visibleGoalMarkers.length > 0 ? (
          <li className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-px bg-rose-600" />
            Goal target date
          </li>
        ) : null}
      </ul>
      {loadSeries.some((series) => series.points.length > 0) ? (
        <ChartPanel
          dates={timelineDates}
          goalMarkers={visibleGoalMarkers}
          {...(selectedDate === undefined ? {} : { selectedDate })}
          series={loadSeries.filter((series) => series.points.length > 0)}
          title="Common Load"
        />
      ) : null}
      {fitnessSeries.some((series) => series.points.length > 0) ? (
        <ChartPanel
          dates={timelineDates}
          goalMarkers={visibleGoalMarkers}
          {...(selectedDate === undefined ? {} : { selectedDate })}
          series={fitnessSeries.filter((series) => series.points.length > 0)}
          title="Fitness"
        />
      ) : null}
      {!loadSeries.some((series) => series.points.length > 0) && visibleGoalMarkers.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            No Common Load data is available for this window; goal target dates remain visible.
          </p>
          <ChartPanel
            dates={timelineDates}
            goalMarkers={visibleGoalMarkers}
            {...(selectedDate === undefined ? {} : { selectedDate })}
            series={[]}
            title="Goal target dates"
          />
        </>
      ) : null}
      {visibleGoalMarkers.length > 0 ? (
        <ul aria-label="Goals on chart" className="space-y-1 text-xs">
          {visibleGoalMarkers.map((marker) => (
            <li key={marker.id}>
              <a
                aria-label={`${marker.label}, target date ${marker.targetDate}, priority ${marker.priority}${
                  marker.activityCategory ? `, ${marker.activityCategory}` : ""
                }`}
                className="underline decoration-dotted underline-offset-2"
                data-testid={`training-chart-goal-marker-${marker.id}`}
                href={`/goals/${marker.id}`}
              >
                {marker.label} · {marker.targetDate}
                {marker.activityCategory ? ` · ${marker.activityCategory}` : ""}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {goalMarkersTruncated ? (
        <p className="text-xs text-muted-foreground">
          Some goal markers may not be shown because the returned marker list is truncated.
        </p>
      ) : null}
      {unavailableLoadValues > 0 ? (
        <p className="text-xs text-muted-foreground">
          Unavailable Common Load values are omitted from the chart, not shown as zero.
        </p>
      ) : null}
    </section>
  );
}
