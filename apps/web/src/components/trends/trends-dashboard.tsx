import { displayUnitLabel, type PreferredUnitSystem, toDisplayUnitValue } from "@repo/core/units";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useViewingUserPreferredUnitSystem } from "../../hooks/use-viewing-user-preferred-unit-system";
import { formatDate } from "../../lib/activity-route-helpers";
import { api } from "../../lib/api/client";
import {
  formatProfileMetricDisplayValue,
  profileMetricOptions,
} from "../../lib/profile-metric-presentation";
import { SimpleTrendChart } from "../charts/simple-trend-chart";

const RANGE_OPTIONS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
] as const;

type TrendSourceName = "Profile metrics" | "Dashboard" | "Training load" | "Peak power";

export function TrendPartialFailure({
  failedSources,
  isRetrying,
  onRetry,
}: {
  failedSources: readonly TrendSourceName[];
  isRetrying: boolean;
  onRetry: () => void;
}) {
  if (failedSources.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-destructive">Some analytics are unavailable</p>
        <p className="text-sm text-muted-foreground">
          Showing successful sources. Unavailable: {failedSources.join(", ")}.
        </p>
      </div>
      <Button disabled={isRetrying} onClick={onRetry} type="button" variant="outline">
        <RefreshCw className={`mr-2 h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
        Retry unavailable
      </Button>
    </div>
  );
}

export function CommonLoadUnavailable({
  isRetrying,
  onRetry,
  reason,
}: {
  isRetrying: boolean;
  onRetry: () => void;
  reason: string;
}) {
  const description =
    reason === "insufficient_history"
      ? "A complete 84-day history is required before Long-term Load can be shown."
      : reason === "incomplete_observation"
        ? "Some activity history is incomplete, so Common Load history is intentionally unavailable."
        : reason === "invalid_input"
          ? "Set a valid profile planning timezone to calculate Load history."
          : "Load history could not be calculated from the available evidence.";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Long-term Load unavailable</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={isRetrying} onClick={onRetry} type="button" variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
          Retry Load history
        </Button>
      </CardContent>
    </Card>
  );
}

export function getFailedTrendSources(
  states: ReadonlyArray<{ isError: boolean; name: TrendSourceName }>,
): TrendSourceName[] {
  return states.filter((state) => state.isError).map((state) => state.name);
}

export async function retryFailedTrendQueries(
  queries: ReadonlyArray<{ isError: boolean; refetch: () => Promise<unknown> }>,
) {
  await Promise.all(queries.filter((query) => query.isError).map((query) => query.refetch()));
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function number(value: number, digits = 1) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}

export function getTrendDistanceDisplay(meters: number, unitSystem: PreferredUnitSystem) {
  const display = toDisplayUnitValue(
    { dimension: "distance", value: meters, unit: "meters" },
    unitSystem,
  );
  return { label: displayUnitLabel(display.unit), value: display.value };
}

export function getTrendSpeedDisplay(metersPerSecond: number, unitSystem: PreferredUnitSystem) {
  const display = toDisplayUnitValue(
    { dimension: "speed", value: metersPerSecond, unit: "meters_per_second" },
    unitSystem,
  );
  return { label: displayUnitLabel(display.unit), value: display.value };
}

export function flattenProfileMetricPages<T>(
  pages: ReadonlyArray<{ items: readonly T[] }> | undefined,
): T[] {
  return pages?.flatMap((page) => [...page.items]) ?? [];
}

export function TrendsDashboard() {
  const { unitSystem } = useViewingUserPreferredUnitSystem();
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]["days"]>(365);
  const [selectedMetric, setSelectedMetric] =
    useState<(typeof profileMetricOptions)[number]["type"]>("weight_kg");
  const range = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (rangeDays - 1));
    return { end, endDate: toIsoDate(end), start, startDate: toIsoDate(start) };
  }, [rangeDays]);

  const profileMetrics = api.profileMetrics.list.useInfiniteQuery(
    {
      start_date: range.start,
      end_date: range.end,
      limit: 50,
    },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const profileMetricPages = profileMetrics.data?.pages;
  const nextProfileMetricCursor = profileMetricPages?.at(-1)?.nextCursor;
  useEffect(() => {
    if (
      nextProfileMetricCursor &&
      !profileMetrics.isFetchingNextPage &&
      !profileMetrics.isFetchNextPageError
    ) {
      void profileMetrics.fetchNextPage();
    }
  }, [
    nextProfileMetricCursor,
    profileMetrics.fetchNextPage,
    profileMetrics.isFetchNextPageError,
    profileMetrics.isFetchingNextPage,
  ]);
  const dashboard = api.trends.getDashboard.useQuery({
    start_date: range.startDate,
    end_date: range.endDate,
    groupBy: "week",
  });
  const load = api.activities.commonLoadHistory.useQuery();
  const peakPower = api.trends.getPeakPerformances.useQuery({ metric: "power", limit: 5 });

  const sourceStates = [
    { isError: profileMetrics.isError, name: "Profile metrics" as const },
    { isError: dashboard.isError, name: "Dashboard" as const },
    { isError: load.isError, name: "Training load" as const },
    { isError: peakPower.isError, name: "Peak power" as const },
  ];
  const failedSources = getFailedTrendSources(sourceStates);
  const isInitialLoading = [profileMetrics, dashboard, load, peakPower].every(
    (query) => query.data === undefined && query.isLoading,
  );
  const isRetrying = [profileMetrics, dashboard, load, peakPower].some(
    (query) => query.isRefetching,
  );

  const retryFailedSources = async () => {
    await retryFailedTrendQueries([profileMetrics, dashboard, load, peakPower]);
  };

  const metricRows = flattenProfileMetricPages(profileMetricPages).filter(
    (row) => row.metric_type === selectedMetric,
  );
  const selectedMetricDefinition = profileMetricOptions.find(
    (metric) => metric.type === selectedMetric,
  ) ?? {
    description: "Body mass trend for training context.",
    label: "Weight",
    type: "weight_kg" as const,
  };
  const availableLoadHistory = load.data?.status === "available" ? load.data : null;
  const commonLoadPoints = (availableLoadHistory?.points ?? []).filter(
    (point) => point.date >= range.startDate && point.date <= range.endDate,
  );
  const latestLoad = commonLoadPoints.at(-1);
  const latestZones = dashboard.data?.zones.weeklyData.at(-1);
  const zoneEntries = latestZones ? Object.entries(latestZones.zones) : [];
  const performanceUsesPower =
    dashboard.data?.performance.dataPoints.some((point) => point.avgPower != null) ?? false;
  const totalDistance = dashboard.data?.volume.totals
    ? getTrendDistanceDisplay(dashboard.data.volume.totals.totalDistance, unitSystem)
    : null;
  const speedDisplay = getTrendSpeedDisplay(0, unitSystem);

  if (isInitialLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">Building analytics…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Analytics date range</legend>
          {RANGE_OPTIONS.map((option) => (
            <Button
              aria-pressed={rangeDays === option.days}
              key={option.days}
              onClick={() => setRangeDays(option.days)}
              size="sm"
              type="button"
              variant={rangeDays === option.days ? "default" : "outline"}
            >
              {option.label}
            </Button>
          ))}
        </fieldset>
        <Badge variant="outline">
          {formatDate(range.start)} – {formatDate(range.end)}
        </Badge>
      </div>

      <TrendPartialFailure
        failedSources={failedSources}
        isRetrying={isRetrying}
        onRetry={() => void retryFailedSources()}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {load.data?.status === "available" ? (
          <SimpleTrendChart
            axisLabels={{ x: "Date", y: "Common Load" }}
            description="Long-term Common Load from complete versioned history."
            emptyMessage="Complete activity history is required to build Common Load trends."
            formatValue={(value) => number(value)}
            points={commonLoadPoints.map((point) => ({
              id: point.date,
              label: formatDate(point.date),
              value: point.longTermLoad,
              x: new Date(point.date).getTime(),
            }))}
            title="Long-term Load"
          />
        ) : load.data?.status === "unavailable" ? (
          <CommonLoadUnavailable
            isRetrying={load.isRefetching}
            onRetry={() => void load.refetch()}
            reason={load.data.reason}
          />
        ) : load.isError ? (
          <CommonLoadUnavailable
            isRetrying={load.isRefetching}
            onRetry={() => void load.refetch()}
            reason="transport_error"
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Long-term Load</CardTitle>
              <CardDescription>Loading complete Common Load history…</CardDescription>
            </CardHeader>
          </Card>
        )}
        {dashboard.data ? (
          <SimpleTrendChart
            axisLabels={{ x: "Week", y: "Hours" }}
            description={
              dashboard.data.volume.totals
                ? `${dashboard.data.volume.totals.totalActivities} activities · ${number(totalDistance?.value ?? 0)} ${totalDistance?.label} total`
                : "Weekly activity volume in this range."
            }
            emptyMessage="Complete activities to build weekly volume."
            formatValue={(value) => `${number(value)} h`}
            points={dashboard.data.volume.dataPoints.map((point) => ({
              id: point.date,
              label: formatDate(point.date),
              value: point.totalTime / 3600,
              x: new Date(point.date).getTime(),
            }))}
            title="Training volume"
          />
        ) : null}
        {dashboard.data ? (
          <SimpleTrendChart
            axisLabels={{
              x: "Activity",
              y: performanceUsesPower
                ? "Average power (W)"
                : `Average speed (${speedDisplay.label})`,
            }}
            description={
              performanceUsesPower
                ? "Observed average activity power; speed-only activities are omitted to preserve one chart unit."
                : `Observed average activity speed in ${unitSystem === "imperial" ? "miles" : "kilometres"} per hour.`
            }
            emptyMessage={`No activities with ${performanceUsesPower ? "power" : "speed"} are available.`}
            formatValue={(value) =>
              `${number(value)} ${performanceUsesPower ? "W" : speedDisplay.label}`
            }
            points={dashboard.data.performance.dataPoints.map((point) => ({
              id: point.activityId,
              label: `${formatDate(point.date)} · ${point.activityName}`,
              value: performanceUsesPower
                ? point.avgPower
                : point.avgSpeed == null
                  ? null
                  : getTrendSpeedDisplay(point.avgSpeed, unitSystem).value,
              x: new Date(point.date).getTime(),
            }))}
            title={`Activity ${performanceUsesPower ? "power" : "speed"}`}
          />
        ) : null}
        {profileMetrics.data ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {profileMetricOptions.map((metric) => (
                <Button
                  aria-pressed={selectedMetric === metric.type}
                  key={metric.type}
                  onClick={() => setSelectedMetric(metric.type)}
                  size="sm"
                  type="button"
                  variant={selectedMetric === metric.type ? "default" : "outline"}
                >
                  {metric.label}
                </Button>
              ))}
            </div>
            <SimpleTrendChart
              axisLabels={{ x: "Recorded", y: selectedMetricDefinition.label }}
              description="Dated profile observations with their original source preserved in profile history."
              emptyMessage={`No ${selectedMetricDefinition.label.toLowerCase()} observations in this range.`}
              formatValue={(value) =>
                formatProfileMetricDisplayValue({
                  metric_type: selectedMetric,
                  preferredUnitSystem: unitSystem,
                  value,
                })
              }
              points={[...metricRows].reverse().map((row) => ({
                id: row.id,
                label: formatDate(row.recorded_at),
                value: row.value,
                x: new Date(row.recorded_at).getTime(),
              }))}
              title={`${selectedMetricDefinition.label} trend`}
            />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {dashboard.data ? (
          <Card>
            <CardHeader>
              <CardTitle>Consistency</CardTitle>
              <CardDescription>Activity rhythm in this range.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Metric
                label="Current streak"
                value={`${dashboard.data.consistency.currentStreak} days`}
              />
              <Metric
                label="Longest streak"
                value={`${dashboard.data.consistency.longestStreak} days`}
              />
              <Metric label="Weekly average" value={number(dashboard.data.consistency.weeklyAvg)} />
              <Metric
                label="Activities"
                value={String(dashboard.data.consistency.totalActivities)}
              />
            </CardContent>
          </Card>
        ) : null}
        {latestLoad && availableLoadHistory ? (
          <Card>
            <CardHeader>
              <CardTitle>Load evidence</CardTitle>
              <CardDescription>
                {availableLoadHistory.maturity.status} baseline ·{" "}
                {availableLoadHistory.coverageStatus} coverage
                <span className="block">
                  Current Common Load metrics from complete versioned history.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Long-term Load" value={number(latestLoad.longTermLoad)} />
              <Metric label="Recent Load" value={number(latestLoad.recentLoad)} />
              <Metric label="Load Balance" value={number(latestLoad.loadBalance)} />
              <Metric label="Daily Load" value={number(latestLoad.dailyLoad)} />
            </CardContent>
          </Card>
        ) : null}
        {dashboard.data ? (
          <Card>
            <CardHeader>
              <CardTitle>Intensity mix</CardTitle>
              <CardDescription>Latest weekly power-zone distribution.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {zoneEntries.length ? (
                zoneEntries.map(([zone, value]) => (
                  <div className="flex items-center justify-between gap-3" key={zone}>
                    <span className="capitalize text-muted-foreground">{zone}</span>
                    <span className="font-medium">{number(value as number)}%</span>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">No zone evidence in this range.</p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {peakPower.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Peak power evidence</CardTitle>
            <CardDescription>
              Ranked recorded performances; each row links its activity identity in the API
              evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {peakPower.data.performances.length ? (
              peakPower.data.performances.map((peak) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                  key={`${peak.activityId}-${peak.rank}`}
                >
                  <div>
                    <p className="font-medium">
                      #{peak.rank} {peak.activityName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(peak.date)} · {peak.activity_category}
                    </p>
                  </div>
                  <Badge>
                    {number(peak.value)} {peak.unit}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No peak-power evidence yet.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
