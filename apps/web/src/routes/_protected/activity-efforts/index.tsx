import {
  type ActivityEffortCategory,
  type ActivityEffortType,
  activityEffortDefinitions,
  getActivityEffortDefinitionId,
} from "@repo/core/athlete-inputs";
import type { PreferredUnitSystem } from "@repo/core/units";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { SimpleTrendChart } from "../../../components/charts/simple-trend-chart";
import { DetailPageIntro } from "../../../components/protected/activity-route-primitives";
import { useViewingUserPreferredUnitSystem } from "../../../hooks/use-viewing-user-preferred-unit-system";
import {
  buildObservedDurationCurve,
  formatActivityEffortCurveDisplayValue,
  formatActivityEffortDisplayValue,
  getActivityEffortCurveValue,
  getActivityEffortDisplayUnitLabel,
  getEffortHistoryForDuration,
  getEffortStatus,
} from "../../../lib/activity-effort-presentation";
import { formatDateTime, formatDuration } from "../../../lib/activity-route-helpers";
import { api } from "../../../lib/api/client";

type ActivityEffortRow = {
  id: string;
  activity_category: ActivityEffortCategory;
  activity_id?: string | null;
  duration_seconds: number;
  effort_type: ActivityEffortType;
  method?: string | null;
  provenance?: unknown;
  recorded_at: Date | string;
  source?: string | null;
  start_offset?: number | null;
  unit: string;
  value: number;
};

export function getEffortSourceLabel(source?: string | null): string {
  return source || "Unknown source";
}

function getEffortSummary(rows: ActivityEffortRow[], unitSystem: PreferredUnitSystem) {
  if (rows.length === 0) return "No records yet";
  const observed = rows.filter((row) => getEffortStatus(row) === "observed");
  if (observed.length === 0) return "No observed efforts";
  const best = observed.reduce((current, row) => (row.value > current.value ? row : current));
  return `Best ${formatActivityEffortDisplayValue(best, unitSystem)}`;
}

export const Route = createFileRoute("/_protected/activity-efforts/")({
  component: ActivityEffortsPage,
});

function ActivityEffortsPage() {
  const { unitSystem } = useViewingUserPreferredUnitSystem();
  const effortsQuery = api.activityEfforts.getForProfile.useQuery();
  const efforts = (effortsQuery.data ?? []) as unknown as ActivityEffortRow[];
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<
    (typeof activityEffortDefinitions)[number]["id"]
  >(activityEffortDefinitions[0].id);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);

  const groupedEfforts = useMemo(() => {
    const map = new Map<string, ActivityEffortRow[]>();
    for (const definition of activityEffortDefinitions) map.set(definition.id, []);
    for (const effort of efforts) {
      const definitionId = getActivityEffortDefinitionId(effort);
      if (!definitionId) continue;
      map.set(definitionId, [...(map.get(definitionId) ?? []), effort]);
    }
    return map;
  }, [efforts]);

  const activeDefinition =
    activityEffortDefinitions.find((definition) => definition.id === selectedDefinitionId) ??
    activityEffortDefinitions[0];
  const definitionRows = groupedEfforts.get(activeDefinition.id) ?? [];
  const durationOptions = [...new Set(definitionRows.map((row) => row.duration_seconds))].sort(
    (left, right) => left - right,
  );
  const activeDuration =
    selectedDuration != null && durationOptions.includes(selectedDuration)
      ? selectedDuration
      : (durationOptions[0] ?? activeDefinition.defaultDurationSeconds);
  const selectedRows = getEffortHistoryForDuration(definitionRows, activeDuration);
  const observedHistory = selectedRows.filter((row) => getEffortStatus(row) === "observed");
  const durationCurve = buildObservedDurationCurve(definitionRows);
  const isPaceCurve = activeDefinition.effortType === "speed";
  const isHeartRateCurve = activeDefinition.effortType === "heart_rate";
  const curveLabel = isPaceCurve
    ? `${activeDefinition.activityCategory === "swim" ? "Swim" : "Run"} pace`
    : activeDefinition.label;
  const curveAxisLabel = isPaceCurve
    ? `Pace (${getActivityEffortDisplayUnitLabel(
        activeDefinition.activityCategory,
        activeDefinition.effortType,
        unitSystem,
      )})`
    : isHeartRateCurve
      ? "Heart rate (bpm)"
      : `Power (${activeDefinition.unit})`;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        actions={null}
        description="Choose a measurement card to inspect calculated evidence across durations and dates."
        eyebrow="Performance"
        title="Activity efforts"
      />

      {effortsQuery.isError ? (
        <Card>
          <CardContent className="space-y-4 py-10 text-center" role="alert">
            <p className="font-medium text-destructive">Activity efforts could not be loaded.</p>
            <p className="text-sm text-muted-foreground">
              Check your connection and retry without leaving this page.
            </p>
            <Button onClick={() => void effortsQuery.refetch()} type="button" variant="outline">
              Retry activity efforts
            </Button>
          </CardContent>
        </Card>
      ) : effortsQuery.isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-2xl border">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {activityEffortDefinitions.map((definition) => {
              const rows = groupedEfforts.get(definition.id) ?? [];
              const latest = rows[0];
              const selected = definition.id === activeDefinition.id;
              return (
                <button
                  className={`rounded-2xl border p-4 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "bg-card hover:border-primary/30"}`}
                  key={definition.id}
                  onClick={() => {
                    setSelectedDefinitionId(definition.id);
                    setSelectedDuration(null);
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{definition.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Performance across durations with dated history.
                      </p>
                    </div>
                    <Badge variant={rows.length ? "default" : "secondary"}>{rows.length}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-muted/40 px-3 py-2">
                      <p className="text-xs uppercase text-muted-foreground">Latest</p>
                      <p className="font-medium">
                        {latest ? formatActivityEffortDisplayValue(latest, unitSystem) : "-"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/40 px-3 py-2">
                      <p className="text-xs uppercase text-muted-foreground">Summary</p>
                      <p className="font-medium">{getEffortSummary(rows, unitSystem)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="space-y-6">
            <SimpleTrendChart
              axisLabels={{ x: "Duration", y: curveAxisLabel }}
              description={`Observed best ${isPaceCurve ? "pace" : "performance"} by duration. Modeled and review data are excluded.`}
              emptyMessage="No eligible observed efforts are available for this curve."
              formatX={formatDuration}
              formatValue={(value) =>
                formatActivityEffortCurveDisplayValue({
                  activityCategory: activeDefinition.activityCategory,
                  effortType: activeDefinition.effortType,
                  unitSystem,
                  value,
                })
              }
              invertY={isPaceCurve}
              lowerIsBetter={isPaceCurve}
              points={durationCurve.map((point) => ({
                id: point.id,
                label: point.label,
                value: getActivityEffortCurveValue(
                  activeDefinition.activityCategory,
                  activeDefinition.effortType,
                  point.value,
                  unitSystem,
                ),
                x: point.durationSeconds,
              }))}
              smooth
              summaryLabels={{
                first: "Shortest",
                latest: "Longest",
                trend: "Change",
              }}
              title={`${curveLabel} observed duration curve`}
              xScale="log"
            />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Selected-duration history
                </CardTitle>
                <CardDescription>
                  Compare observed values over date. Modeled and review records stay labeled in the
                  table and do not enter the chart.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <fieldset className="flex flex-wrap gap-2">
                  <legend className="sr-only">History duration</legend>
                  {(durationOptions.length > 0 ? durationOptions : [activeDuration]).map(
                    (duration) => (
                      <Button
                        key={duration}
                        onClick={() => setSelectedDuration(duration)}
                        size="sm"
                        type="button"
                        variant={duration === activeDuration ? "default" : "outline"}
                      >
                        {formatDuration(duration)}
                      </Button>
                    ),
                  )}
                </fieldset>
                <SimpleTrendChart
                  description={`Observed ${formatDuration(activeDuration)} efforts by recorded date.`}
                  emptyMessage="No observed history at this duration. Review and modeled rows may still appear below."
                  formatValue={(value) =>
                    formatActivityEffortCurveDisplayValue({
                      activityCategory: activeDefinition.activityCategory,
                      effortType: activeDefinition.effortType,
                      unitSystem,
                      value,
                    })
                  }
                  invertY={isPaceCurve}
                  lowerIsBetter={isPaceCurve}
                  points={[...observedHistory].reverse().map((row) => ({
                    id: row.id,
                    label: formatDateTime(row.recorded_at),
                    value: getActivityEffortCurveValue(
                      activeDefinition.activityCategory,
                      activeDefinition.effortType,
                      row.value,
                      unitSystem,
                    ),
                    x: new Date(row.recorded_at).getTime(),
                  }))}
                  title={`${formatDuration(activeDuration)} history over date`}
                />
                <EffortRowsTable rows={selectedRows} unitSystem={unitSystem} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function EffortRowsTable({
  rows,
  unitSystem,
}: {
  rows: ActivityEffortRow[];
  unitSystem: PreferredUnitSystem;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-muted-foreground">
        No efforts recorded at this duration.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Recorded</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Source / status</TableHead>
            <TableHead>Activity</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const status = getEffortStatus(row);
            return (
              <TableRow key={row.id}>
                <TableCell>{formatDateTime(row.recorded_at)}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">
                  {formatActivityEffortDisplayValue(row, unitSystem)}
                </TableCell>
                <TableCell>{formatDuration(row.duration_seconds)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{getEffortSourceLabel(row.source)}</Badge>
                    <Badge variant={status === "observed" ? "default" : "outline"}>{status}</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  {row.activity_id ? (
                    <Link
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      onClick={(event) => event.stopPropagation()}
                      params={{ activityId: row.activity_id }}
                      to="/activities/$activityId"
                    >
                      View activity
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-xs text-muted-foreground">Calculated</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
