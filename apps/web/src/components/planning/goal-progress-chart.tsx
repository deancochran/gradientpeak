import { Button } from "@repo/ui/components/button";
import { ChartCard, ChartEmptyState } from "@repo/ui/components/chart";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { formatDayLabel, formatShortDayLabel } from "../../lib/planning";
import {
  buildGoalProgressPlot,
  formatGoalGap,
  formatGoalTimeLeft,
  formatThreshold,
  type GoalProgress,
  goalPlanningDate,
  nearestGoalChartPoint,
  type ThresholdHistory,
} from "./goal-progress-presentation";

export function GoalProgressChart({
  data,
  history = [],
  isLoading,
  isError,
  historyError = false,
  onRetry,
  planningTimezone = null,
  targetDate = null,
}: {
  data: GoalProgress | undefined;
  history?: ThresholdHistory;
  isLoading: boolean;
  isError: boolean;
  historyError?: boolean;
  onRetry: () => void;
  planningTimezone?: string | null;
  targetDate?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const timeLeft = formatGoalTimeLeft(targetDate, goalPlanningDate(new Date(), planningTimezone));
  if (isLoading)
    return (
      <ChartCard title="Goal progress">
        <p role="status">Loading goal progress…</p>
      </ChartCard>
    );
  if (isError)
    return (
      <ChartCard title="Goal progress">
        <div role="alert">
          <p>Goal progress could not be loaded.</p>
          <Button variant="outline" onClick={onRetry}>
            Retry progress
          </Button>
        </div>
      </ChartCard>
    );
  if (!data || data.result.status === "unsupported")
    return (
      <ChartCard title="Goal progress">
        <p className="text-sm text-muted-foreground">
          Time left <strong className="ml-2 text-foreground">{timeLeft}</strong>
        </p>
        <ChartEmptyState
          message={
            data
              ? "Progress charts are not available for this goal type."
              : "Goal progress is unavailable."
          }
        />
      </ChartCard>
    );
  const result = data.result;
  const plot = buildGoalProgressPlot(data, history);
  if (!plot) return null;
  const selected =
    plot.points.find((point) => point.thresholdId === selectedId) ?? plot.points.at(-1);
  const formatValue = (value: number) => formatThreshold(value, result.target.activityCategory);
  const evidenceDate = (instant: string | number) =>
    goalPlanningDate(new Date(instant), planningTimezone) ??
    new Date(instant).toISOString().slice(0, 10);
  const fullEvidenceDate = (instant: string | number) =>
    `${formatDayLabel(evidenceDate(instant))}${goalPlanningDate(new Date(instant), planningTimezone) ? "" : " UTC"}`;
  const axisDate = (instant: number) =>
    targetDate && instant === Date.parse(result.deadlineAt) ? targetDate : evidenceDate(instant);
  const assessedLabel = fullEvidenceDate(result.assessedAt);
  const summary = [
    { label: "Current", value: result.current ? formatValue(result.current.value) : "Unavailable" },
    { label: "Target", value: formatValue(result.target.targetValue) },
    {
      label: result.target.unit === "watts" ? "Remaining gap" : "Pace gap to achievement",
      value: formatGoalGap(result),
    },
    { label: "Time left", value: timeLeft },
  ];
  return (
    <ChartCard title="Goal progress" description="Calculated threshold history">
      <dl className="grid grid-cols-2 gap-4 border-b pb-4 sm:grid-cols-4">
        {summary.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      {result.target.achievementValue !== result.target.targetValue ? (
        <p className="text-xs text-muted-foreground">
          Achievement threshold: {formatValue(result.target.achievementValue)}
        </p>
      ) : null}
      {data.publication?.status !== "available" || result.current?.freshness === "stale" ? (
        <p className="text-sm text-muted-foreground">
          Threshold evidence is{" "}
          {data.publication?.status === "unavailable" ? "unavailable" : "stale"}.
        </p>
      ) : null}
      {historyError ? (
        <div role="alert" className="text-sm">
          <p>Full history could not be loaded. Showing available goal evidence.</p>
          <Button variant="ghost" onClick={onRetry}>
            Retry history
          </Button>
        </div>
      ) : null}
      {plot.points.length ? (
        <>
          <div className="relative h-64 w-full">
            <svg
              role="img"
              aria-label={`Threshold history. ${summary.map((item) => `${item.label}: ${item.value}`).join(". ")}. Assessed ${assessedLabel}. ${plot.points.length} measurements. Select a chart point or dated measurement to view its source activities.`}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              {[10, 48, 86].map((y) => (
                <line
                  key={y}
                  x1="8"
                  x2="92"
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  className="text-border"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <line
                data-testid="goal-target-line"
                x1="8"
                x2="92"
                y1={plot.targetY}
                y2={plot.targetY}
                stroke="currentColor"
                strokeDasharray="6 4"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                className="text-muted-foreground"
              />
              <line
                data-testid="goal-assessed-line"
                x1={plot.assessedX}
                x2={plot.assessedX}
                y1="10"
                y2="86"
                stroke="currentColor"
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
                className="text-primary/50"
              />
              <line
                data-testid="goal-deadline-line"
                x1={plot.deadlineX}
                x2={plot.deadlineX}
                y1="10"
                y2="86"
                stroke="currentColor"
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
                className="text-muted-foreground"
              />
              {plot.segments
                .filter((segment) => segment.length > 1)
                .map((segment) => (
                  <polyline
                    key={segment[0]?.label}
                    points={segment.map((point) => `${point.plotX},${point.plotY}`).join(" ")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                    className="text-primary"
                  />
                ))}
            </svg>
            {plot.segments.flat().map((point) => (
              <span
                key={point.label}
                aria-hidden="true"
                data-goal-point={point.label}
                data-selected={point.label === selected?.thresholdId}
                className={`pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary ${point.label === selected?.thresholdId ? "bg-background ring-2 ring-primary/30" : "bg-primary"}`}
                style={{ left: `${point.plotX}%`, top: `${point.plotY}%` }}
              />
            ))}
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              data-testid="goal-chart-hit-surface"
              className="absolute inset-0 z-10 cursor-crosshair"
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                const nearest = nearestGoalChartPoint(plot.segments.flat(), {
                  x: event.clientX - bounds.left,
                  y: event.clientY - bounds.top,
                  width: bounds.width,
                  height: bounds.height,
                });
                if (nearest) setSelectedId(nearest);
              }}
            />
            <span
              className="pointer-events-none absolute right-[8%] -translate-y-full rounded bg-card/90 px-1 text-xs font-medium"
              style={{ top: `${plot.targetY}%` }}
            >
              Target {formatValue(result.target.targetValue)}
            </span>
            <span className="absolute left-0 top-0 text-xs text-muted-foreground">
              {formatValue(plot.domain.max)}
            </span>
            <span className="absolute bottom-6 left-0 text-xs text-muted-foreground">
              {formatValue(plot.domain.min)}
            </span>
            <span className="absolute bottom-0 left-[8%] text-xs text-muted-foreground">
              {formatShortDayLabel(axisDate(plot.start))}
            </span>
            <span className="absolute bottom-0 right-[8%] text-xs text-muted-foreground">
              {formatShortDayLabel(axisDate(plot.end))}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            ● Calculated threshold · – – Target · ⋮ Deadline · Assessed {assessedLabel}
          </p>
          <fieldset
            aria-label="Threshold measurements"
            className="flex min-w-0 gap-2 overflow-x-auto pb-2"
          >
            {plot.points.map((point) => (
              <Button
                key={point.thresholdId}
                variant={point === selected ? "secondary" : "outline"}
                size="sm"
                className="shrink-0"
                aria-pressed={point === selected}
                aria-label={`${fullEvidenceDate(point.effectiveAt)} · ${formatValue(point.value)}`}
                onClick={() => setSelectedId(point.thresholdId)}
              >
                {formatShortDayLabel(evidenceDate(point.effectiveAt))} · {formatValue(point.value)}
              </Button>
            ))}
          </fieldset>
          {selected ? (
            <div aria-live="polite" className="space-y-2 border-t pt-3">
              <p className="font-semibold">
                {formatValue(selected.value)} · {fullEvidenceDate(selected.effectiveAt)}
              </p>
              <p className="text-xs text-muted-foreground">
                {selected.confidence == null
                  ? "Confidence unknown"
                  : `${Math.round(selected.confidence * 100)}% confidence`}
              </p>
              <div className="flex flex-wrap gap-3">
                {selected.sourceActivities.map((activity) => (
                  <Link
                    key={activity.id}
                    to="/activities/$activityId"
                    params={{ activityId: activity.id }}
                    className="py-2 text-sm font-medium text-primary underline underline-offset-4"
                  >
                    Source activity: {activity.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <ChartEmptyState message="No comparable threshold measurements yet." />
      )}
    </ChartCard>
  );
}
