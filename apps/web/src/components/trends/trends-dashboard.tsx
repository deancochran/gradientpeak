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
import { useMemo, useState } from "react";
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

type TrendSourceName =
  | "Profile metrics"
  | "Volume"
  | "Training load"
  | "Consistency"
  | "Performance"
  | "Intensity mix"
  | "Peak power";

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
      ? "A complete 84-day history is required before Long-term can be shown."
      : reason === "incomplete_observation"
        ? "Some activity history is incomplete, so common Load history is intentionally unavailable."
        : reason === "invalid_input"
          ? "Set a valid profile planning timezone to calculate Load history."
          : "Load history could not be calculated from the available evidence.";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Long-term unavailable</CardTitle>
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

export function TrendsDashboard() {
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]["days"]>(365);
  const [selectedMetric, setSelectedMetric] =
    useState<(typeof profileMetricOptions)[number]["type"]>("ftp");
  const range = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (rangeDays - 1));
    return { end, endDate: toIsoDate(end), start, startDate: toIsoDate(start) };
  }, [rangeDays]);

  const profileMetrics = api.profileMetrics.list.useQuery({
    start_date: range.start,
    end_date: range.end,
    limit: 100,
  });
  const volume = api.trends.getVolumeTrends.useQuery({
    start_date: range.startDate,
    end_date: range.endDate,
    groupBy: "week",
  });
  const load = api.activities.commonLoadHistory.useQuery();
  const consistency = api.trends.getConsistencyMetrics.useQuery({
    start_date: range.startDate,
    end_date: range.endDate,
  });
  const performance = api.trends.getPerformanceTrends.useQuery({
    start_date: range.startDate,
    end_date: range.endDate,
  });
  const zones = api.trends.getZoneDistributionTrends.useQuery({
    start_date: range.startDate,
    end_date: range.endDate,
    metric: "power",
  });
  const peakPower = api.trends.getPeakPerformances.useQuery({ metric: "power", limit: 5 });

  const sourceStates = [
    { isError: profileMetrics.isError, name: "Profile metrics" as const },
    { isError: volume.isError, name: "Volume" as const },
    { isError: load.isError, name: "Training load" as const },
    { isError: consistency.isError, name: "Consistency" as const },
    { isError: performance.isError, name: "Performance" as const },
    { isError: zones.isError, name: "Intensity mix" as const },
    { isError: peakPower.isError, name: "Peak power" as const },
  ];
  const failedSources = getFailedTrendSources(sourceStates);
  const isInitialLoading = [
    profileMetrics,
    volume,
    load,
    consistency,
    performance,
    zones,
    peakPower,
  ].every((query) => query.data === undefined && query.isLoading);
  const isRetrying = [
    profileMetrics,
    volume,
    load,
    consistency,
    performance,
    zones,
    peakPower,
  ].some((query) => query.isRefetching);

  const retryFailedSources = async () => {
    await retryFailedTrendQueries([
      profileMetrics,
      volume,
      load,
      consistency,
      performance,
      zones,
      peakPower,
    ]);
  };

  const metricRows = (profileMetrics.data?.items ?? []).filter(
    (row) => row.metric_type === selectedMetric,
  );
  const selectedMetricDefinition = profileMetricOptions.find(
    (metric) => metric.type === selectedMetric,
  ) ?? {
    description: "Bike power threshold used to calibrate training load.",
    label: "Functional threshold power",
    type: "ftp" as const,
  };
  const commonLoadPoints = load.data?.status === "available" ? load.data.points : [];
  const latestLoad = commonLoadPoints.at(-1);
  const latestZones = zones.data?.weeklyData.at(-1);
  const zoneEntries = latestZones ? Object.entries(latestZones.zones) : [];
  const performanceUsesPower =
    performance.data?.dataPoints.some((point) => point.avgPower != null) ?? false;

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
            axisLabels={{ x: "Date", y: "Load" }}
            description="Long-term common Load from complete versioned history."
            emptyMessage="Complete activity history is required to build common Load trends."
            formatValue={(value) => number(value)}
            points={commonLoadPoints.map((point) => ({
              id: point.date,
              label: formatDate(point.date),
              value: point.longTermLoad,
              x: new Date(point.date).getTime(),
            }))}
            title="Long-term"
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
              <CardTitle>Long-term</CardTitle>
              <CardDescription>Loading complete common Load history…</CardDescription>
            </CardHeader>
          </Card>
        )}
        {volume.data ? (
          <SimpleTrendChart
            axisLabels={{ x: "Week", y: "Hours" }}
            description={
              volume.data.totals
                ? `${volume.data.totals.totalActivities} activities · ${number(volume.data.totals.totalDistance / 1000)} km total`
                : "Weekly activity volume in this range."
            }
            emptyMessage="Complete activities to build weekly volume."
            formatValue={(value) => `${number(value)} h`}
            points={volume.data.dataPoints.map((point) => ({
              id: point.date,
              label: formatDate(point.date),
              value: point.totalTime / 3600,
              x: new Date(point.date).getTime(),
            }))}
            title="Training volume"
          />
        ) : null}
        {performance.data ? (
          <SimpleTrendChart
            axisLabels={{
              x: "Activity",
              y: performanceUsesPower ? "Average power (W)" : "Average speed (km/h)",
            }}
            description={
              performanceUsesPower
                ? "Observed average activity power; speed-only activities are omitted to preserve one chart unit."
                : "Observed average activity speed in kilometres per hour."
            }
            emptyMessage={`No activities with ${performanceUsesPower ? "power" : "speed"} are available.`}
            formatValue={(value) => `${number(value)} ${performanceUsesPower ? "W" : "km/h"}`}
            points={performance.data.dataPoints.map((point) => ({
              id: point.activityId,
              label: `${formatDate(point.date)} · ${point.activityName}`,
              value: performanceUsesPower
                ? point.avgPower
                : point.avgSpeed == null
                  ? null
                  : point.avgSpeed * 3.6,
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
                formatProfileMetricDisplayValue({ metric_type: selectedMetric, value })
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
        {consistency.data ? (
          <Card>
            <CardHeader>
              <CardTitle>Consistency</CardTitle>
              <CardDescription>Activity rhythm in this range.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Current streak" value={`${consistency.data.currentStreak} days`} />
              <Metric label="Longest streak" value={`${consistency.data.longestStreak} days`} />
              <Metric label="Weekly average" value={number(consistency.data.weeklyAvg)} />
              <Metric label="Activities" value={String(consistency.data.totalActivities)} />
            </CardContent>
          </Card>
        ) : null}
        {latestLoad ? (
          <Card>
            <CardHeader>
              <CardTitle>Load evidence</CardTitle>
              <CardDescription>Complete common Load history</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Long-term" value={number(latestLoad.longTermLoad)} />
              <Metric label="Recent" value={number(latestLoad.recentLoad)} />
              <Metric label="Balance" value={number(latestLoad.loadBalance)} />
              <Metric label="Daily" value={number(latestLoad.dailyLoad)} />
            </CardContent>
          </Card>
        ) : null}
        {zones.data ? (
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
                    <span className="font-medium">{number(value)}%</span>
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
                      {formatDate(peak.date)} · {peak.category}
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
