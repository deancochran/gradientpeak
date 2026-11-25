import type { ProfileGoal } from "@repo/core";
import {
  formatRecordedHistoryValue,
  type RecordedHistoryChart,
  recordedHistoryChartTitle,
} from "@repo/core/goals/recorded-history-visuals";
import { Button } from "@repo/ui/components/button";
import { ChartCard, ChartEmptyState } from "@repo/ui/components/chart";
import { buildChartSegments, getPaddedChartDomain } from "@repo/ui/lib/chart";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { formatDayLabel, formatShortDayLabel } from "../../lib/planning";
import { formatGoalTimeLeft, nearestGoalChartPoint } from "./goal-progress-presentation";
import { useRecordedGoalHistory } from "./use-recorded-goal-history";

export function RecordedGoalHistory({
  goal,
  timezone,
}: {
  goal: ProfileGoal;
  timezone: string | null | undefined;
}) {
  const history = useRecordedGoalHistory(goal, timezone);
  return (
    <ChartCard
      title="Recorded history"
      description="Last 12 calendar weeks · single-category activities"
    >
      {history.state === "timezone" ? (
        <p>Recorded history needs your planning timezone.</p>
      ) : (
        <>
          {history.window ? (
            <p className="text-sm text-muted-foreground">
              Time left:{" "}
              <strong className="text-foreground">
                {formatGoalTimeLeft(goal.target_date, history.window.today)}
              </strong>
            </p>
          ) : null}
          {history.state === "loading" ? <p role="status">Loading recorded history…</p> : null}
          {history.state === "error" || history.state === "partial" ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>
                {history.state === "error"
                  ? "Recorded history could not be loaded."
                  : "Partial history — some activities may be missing (maximum 1,000 records)."}
              </p>
              <Button variant="outline" size="sm" onClick={history.retry}>
                Retry history
              </Button>
            </div>
          ) : null}
          {history.visuals && history.hasPages ? (
            <>
              {history.visuals.targetDistanceMeters !== null ? (
                <p className="text-xs text-muted-foreground">
                  Within 1% of{" "}
                  {formatRecordedHistoryValue(history.visuals.targetDistanceMeters, "meters")}
                </p>
              ) : null}
              {history.visuals.targetWeeks !== null ? (
                <p className="text-xs text-muted-foreground">
                  Target duration: {history.visuals.targetWeeks} weeks
                </p>
              ) : null}
              {history.visuals.charts.map((chart) => (
                <RecordedChart
                  key={chart.id}
                  chart={chart}
                  complete={history.visuals?.complete ?? false}
                />
              ))}
            </>
          ) : null}
        </>
      )}
    </ChartCard>
  );
}

function RecordedChart({ chart, complete }: { chart: RecordedHistoryChart; complete: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = chart.points.find((point) => point.id === selectedId) ?? chart.points.at(-1);
  const values = chart.points.map((point) => point.value);
  const domain =
    chart.id === "sessions"
      ? {
          min: 0,
          max: Math.ceil(
            Math.max(1, chart.target ?? 0, ...values.map((value) => value ?? 0)) * 1.15,
          ),
        }
      : getPaddedChartDomain([...values, chart.target]);
  const points = chart.points.map((point) => ({
    x: Date.parse(
      chart.id === "sessions" ? point.date : (point.activities[0]?.startedAt ?? point.date),
    ),
    y: point.value,
    label: point.id,
  }));
  const segments = buildChartSegments(points, { domain, left: 8, right: 92, top: 10, bottom: 86 });
  const targetY =
    chart.target === null
      ? null
      : 86 - ((chart.target - domain.min) / (domain.max - domain.min)) * 76;
  const formatValue = (value: number | null) => formatRecordedHistoryValue(value, chart.unit);
  const label = (value: number | null, lowerBound = false) =>
    value === null ? "Unavailable" : `${lowerBound ? "≥ " : ""}${formatValue(value)}`;
  const bestLabel =
    chart.id === "event_time"
      ? complete
        ? "Best recorded"
        : "Best loaded"
      : complete
        ? "Longest recorded"
        : "Longest loaded";
  return (
    <section
      className="min-w-0 space-y-3 border-t pt-4"
      aria-label={recordedHistoryChartTitle(chart.id)}
    >
      <h3 className="font-semibold">{recordedHistoryChartTitle(chart.id)}</h3>
      {chart.id === "event_time" ? (
        <p className="text-xs text-muted-foreground">Elapsed time · lower is faster</p>
      ) : null}
      <dl className="grid grid-cols-3 gap-3">
        {chart.id === "sessions" ? (
          <div>
            <dt className="text-xs text-muted-foreground">This week</dt>
            <dd className="font-semibold">
              {label(chart.points.at(-1)?.value ?? null, !complete)}
            </dd>
          </div>
        ) : (
          <div>
            <dt className="text-xs text-muted-foreground">{bestLabel}</dt>
            <dd className="font-semibold">{formatValue(chart.best)}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted-foreground">
            {chart.id === "sessions" ? "Weekly target" : "Target"}
          </dt>
          <dd className="font-semibold">
            {chart.target === null ? "Not specified" : formatValue(chart.target)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {chart.id === "sessions" ? "Remaining this week" : "Gap to target"}
          </dt>
          <dd className="font-semibold">{chart.target === null ? "—" : formatValue(chart.gap)}</dd>
        </div>
      </dl>
      {segments.length ? (
        <div className="relative h-56 w-full">
          <svg
            role="img"
            aria-label={`${recordedHistoryChartTitle(chart.id)}. ${chart.id === "event_time" ? "Lower time is faster. " : ""}${complete ? "Loaded history complete." : "Partial history."} Select a dated observation below.`}
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {[10, 48, 86].map((y) => (
              <line
                key={y}
                x1="8"
                x2="92"
                y1={y}
                y2={y}
                stroke="currentColor"
                vectorEffect="non-scaling-stroke"
                className="text-border"
              />
            ))}
            {targetY !== null ? (
              <line
                data-testid={`recorded-target-${chart.id}`}
                x1="8"
                x2="92"
                y1={targetY}
                y2={targetY}
                stroke="currentColor"
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
                className="text-muted-foreground"
              />
            ) : null}
            {chart.id === "sessions"
              ? segments
                  .flat()
                  .map((point) => (
                    <rect
                      key={point.label}
                      x={point.plotX - 2}
                      y={point.plotY}
                      width="4"
                      height={Math.max(0, 86 - point.plotY)}
                      fill="currentColor"
                      className="text-primary"
                      stroke={selected?.id === point.label ? "currentColor" : "none"}
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                      opacity={
                        chart.points.find((item) => item.id === point.label)?.inProgress ? 0.5 : 1
                      }
                    />
                  ))
              : segments
                  .filter((segment) => segment.length > 1)
                  .map((segment) => (
                    <polyline
                      key={segment[0]?.label}
                      points={segment.map((point) => `${point.plotX},${point.plotY}`).join(" ")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                      className="text-primary"
                    />
                  ))}
          </svg>
          {chart.id !== "sessions"
            ? segments
                .flat()
                .map((point) => (
                  <span
                    key={point.label}
                    aria-hidden="true"
                    className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary ${selected?.id === point.label ? "bg-background ring-2 ring-primary/30" : "bg-primary"}`}
                    style={{ left: `${point.plotX}%`, top: `${point.plotY}%` }}
                  />
                ))
            : null}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 z-10"
            data-testid={`recorded-hit-${chart.id}`}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const id = nearestGoalChartPoint(
                segments
                  .flat()
                  .map((point) => (chart.id === "sessions" ? { ...point, plotY: 0 } : point)),
                {
                  x: event.clientX - bounds.left,
                  y: chart.id === "sessions" ? 0 : event.clientY - bounds.top,
                  width: bounds.width,
                  height: bounds.height,
                },
              );
              if (id) setSelectedId(id);
            }}
          />
          {targetY !== null ? (
            <span
              className="pointer-events-none absolute right-[8%] -translate-y-full bg-card/90 px-1 text-xs"
              style={{ top: `${targetY}%` }}
            >
              Target {formatValue(chart.target)}
            </span>
          ) : null}
          <span className="absolute left-0 top-0 text-xs text-muted-foreground">
            {formatValue(domain.max)}
          </span>
          <span className="absolute bottom-0 left-[8%] text-xs text-muted-foreground">
            {chart.points[0] ? formatShortDayLabel(chart.points[0].date) : ""}
          </span>
          <span className="absolute bottom-0 right-[8%] text-xs text-muted-foreground">
            {chart.points.at(-1) ? formatShortDayLabel(chart.points.at(-1)?.date ?? "") : ""}
          </span>
        </div>
      ) : (
        <ChartEmptyState
          message={
            complete
              ? "No matching recorded measurements in this window."
              : "No matching measurements in the history loaded so far."
          }
        />
      )}
      <fieldset
        aria-label={`${recordedHistoryChartTitle(chart.id)} observations`}
        className="flex min-w-0 gap-2 overflow-x-auto pb-2"
      >
        {chart.points.map((point) => (
          <Button
            key={point.id}
            size="sm"
            variant={selected?.id === point.id ? "secondary" : "outline"}
            className="shrink-0"
            aria-pressed={selected?.id === point.id}
            aria-label={`${formatDayLabel(point.date)} · ${label(point.value, point.lowerBound)}${point.inProgress ? " · In progress" : ""}`}
            onClick={() => setSelectedId(point.id)}
          >
            {formatShortDayLabel(point.date)} ·{" "}
            {point.value === null ? "—" : label(point.value, point.lowerBound)}
            {point.inProgress ? " · In progress" : ""}
          </Button>
        ))}
      </fieldset>
      {selected ? (
        <div aria-live="polite" className="space-y-2">
          <p className="text-sm font-semibold">
            {formatDayLabel(selected.date)} · {label(selected.value, selected.lowerBound)}
            {selected.inProgress ? " · In progress" : ""}
          </p>
          <ul className="max-h-40 space-y-2 overflow-y-auto">
            {selected.activities.map((activity) => (
              <li key={activity.id} className="text-sm">
                <Link
                  to="/activities/$activityId"
                  params={{ activityId: activity.id }}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  Source activity: {activity.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Distance: {formatRecordedHistoryValue(activity.distanceMeters, "meters")} ·
                  Elapsed: {formatRecordedHistoryValue(activity.elapsedSeconds, "seconds")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
