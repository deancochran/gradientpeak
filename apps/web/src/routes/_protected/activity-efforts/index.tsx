import {
  type ActivityEffortType,
  activityEffortDefinitions,
  getActivityEffortDefinitionId,
} from "@repo/core/athlete-inputs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
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
import { toast } from "sonner";
import { SimpleTrendChart } from "../../../components/charts/simple-trend-chart";
import {
  ActivityEffortForm,
  toDateTimeLocalValue,
} from "../../../components/protected/activity-effort-form";
import { DetailPageIntro } from "../../../components/protected/activity-route-primitives";
import {
  buildObservedDurationCurve,
  formatActivityEffortDisplayValue,
  getActivityEffortCurveValue,
  getEffortHistoryForDuration,
  getEffortStatus,
} from "../../../lib/activity-effort-presentation";
import type { ActivityEffortFormValues } from "../../../lib/activity-route-form-schemas";
import { formatDateTime, formatDuration } from "../../../lib/activity-route-helpers";
import { api } from "../../../lib/api/client";

type ActivityEffortRow = {
  id: string;
  activity_category: ActivityEffortFormValues["activity_category"];
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

function getEffortSummary(rows: ActivityEffortRow[]) {
  if (rows.length === 0) return "No records yet";
  const observed = rows.filter((row) => getEffortStatus(row) === "observed");
  if (observed.length === 0) return "No observed efforts";
  const best = observed.reduce((current, row) => (row.value > current.value ? row : current));
  return `Best ${formatActivityEffortDisplayValue(best)}`;
}

export const Route = createFileRoute("/_protected/activity-efforts/")({
  component: ActivityEffortsPage,
});

function ActivityEffortsPage() {
  const utils = api.useUtils();
  const effortsQuery = api.activityEfforts.getForProfile.useQuery();
  const efforts = (effortsQuery.data ?? []) as unknown as ActivityEffortRow[];
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<
    (typeof activityEffortDefinitions)[number]["id"]
  >(activityEffortDefinitions[0].id);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [editingEffort, setEditingEffort] = useState<ActivityEffortRow | null>(null);
  const [deleteEffort, setDeleteEffort] = useState<ActivityEffortRow | null>(null);

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
  const curveLabel = isPaceCurve
    ? `${activeDefinition.activityCategory === "swim" ? "Swim" : "Run"} pace`
    : activeDefinition.label;
  const curveAxisLabel = isPaceCurve
    ? `Pace (/${activeDefinition.activityCategory === "swim" ? "100m" : "km"})`
    : `Power (${activeDefinition.unit})`;

  const updateMutation = api.activityEfforts.update.useMutation({
    onSuccess: async () => {
      await utils.activityEfforts.invalidate();
      toast.success("Effort updated");
      setEditingEffort(null);
    },
  });
  const deleteMutation = api.activityEfforts.delete.useMutation({
    onSuccess: async () => {
      await utils.activityEfforts.invalidate();
      toast.success("Effort deleted");
      setDeleteEffort(null);
    },
  });

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        actions={null}
        description="Choose a measurement card to open its chart and manage the records behind it."
        eyebrow="Performance"
        title="Activity efforts"
      />

      {effortsQuery.isLoading ? (
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
                        {latest ? formatActivityEffortDisplayValue(latest) : "-"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/40 px-3 py-2">
                      <p className="text-xs uppercase text-muted-foreground">Summary</p>
                      <p className="font-medium">{getEffortSummary(rows)}</p>
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
                formatActivityEffortDisplayValue({
                  activity_category: activeDefinition.activityCategory,
                  effort_type: activeDefinition.effortType,
                  unit: activeDefinition.unit,
                  value: isPaceCurve
                    ? (activeDefinition.activityCategory === "swim" ? 100 : 1_000) / value
                    : value,
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
                    formatActivityEffortDisplayValue({
                      activity_category: activeDefinition.activityCategory,
                      effort_type: activeDefinition.effortType,
                      unit: activeDefinition.unit,
                      value: isPaceCurve
                        ? (activeDefinition.activityCategory === "swim" ? 100 : 1_000) / value
                        : value,
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
                    ),
                    x: new Date(row.recorded_at).getTime(),
                  }))}
                  title={`${formatDuration(activeDuration)} history over date`}
                />
                <EffortRowsTable rows={selectedRows} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <EffortEditDialog
        effort={editingEffort}
        onClose={() => setEditingEffort(null)}
        onSubmit={(values) => {
          if (!editingEffort) return;
          return updateMutation.mutateAsync({
            id: editingEffort.id,
            activity_category: values.activity_category,
            duration_seconds: values.duration_seconds,
            effort_type: values.effort_type,
            recorded_at: new Date(values.recorded_at).toISOString(),
            value: values.value,
          });
        }}
        onSubmitError={() => {
          toast.error("Effort update failed");
        }}
        pending={updateMutation.isPending}
      />

      <AlertDialog open={!!deleteEffort} onOpenChange={(open) => !open && setDeleteEffort(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete effort?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected effort record from your profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEffort && deleteMutation.mutate({ id: deleteEffort.id })}
            >
              Delete effort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EffortRowsTable({ rows }: { rows: ActivityEffortRow[] }) {
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
                  {formatActivityEffortDisplayValue(row)}
                </TableCell>
                <TableCell>{formatDuration(row.duration_seconds)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{row.source ?? "legacy"}</Badge>
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

function EffortEditDialog({
  effort,
  onClose,
  onSubmit,
  pending,
  onSubmitError,
}: {
  effort: ActivityEffortRow | null;
  onClose: () => void;
  onSubmit: (values: ActivityEffortFormValues) => Promise<unknown> | unknown;
  onSubmitError: (error: unknown) => Promise<void> | void;
  pending: boolean;
}) {
  const isManual = effort?.source === "manual";
  return (
    <Dialog open={!!effort} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isManual ? "Edit effort" : "Add manual override"}</DialogTitle>
          <DialogDescription>
            {isManual
              ? "Update this manual effort record."
              : "The original evidence remains unchanged. Saving creates a separate manual effort."}
          </DialogDescription>
        </DialogHeader>
        <ActivityEffortForm
          actionLayout="dialog"
          onCancel={onClose}
          onSubmit={onSubmit}
          onSubmitError={onSubmitError}
          pending={pending}
          submitLabel={isManual ? "Save" : "Create override"}
          submittingLabel="Saving..."
          values={
            effort
              ? {
                  activity_category: effort.activity_category,
                  duration_seconds: effort.duration_seconds,
                  effort_type: effort.effort_type,
                  recorded_at: toDateTimeLocalValue(effort.recorded_at),
                  unit: effort.unit,
                  value: effort.value,
                }
              : undefined
          }
        />
      </DialogContent>
    </Dialog>
  );
}
