import { isActivityDerivedThresholdMetricType } from "@repo/core/athlete-inputs";
import type { ProfileMetricType } from "@repo/core/schemas/profile-metrics";
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
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SimpleTrendChart } from "../../../components/charts/simple-trend-chart";
import { DetailPageIntro } from "../../../components/protected/activity-route-primitives";
import {
  getProfileMetricFormValues,
  ProfileMetricForm,
  type ProfileMetricFormValues,
} from "../../../components/protected/profile-metric-form";
import { useAuth } from "../../../components/providers/auth-provider";
import { formatDate, formatDateTime } from "../../../lib/activity-route-helpers";
import { api } from "../../../lib/api/client";
import {
  formatObservationSource,
  formatProfileMetricDisplayValue,
  isManualProfileMetric,
  profileMetricGroups,
  profileMetricOptions,
} from "../../../lib/profile-metric-presentation";

type ProfileMetricRow = {
  id: string;
  metric_type: ProfileMetricType;
  recorded_at: Date | string;
  value: number;
  unit: string;
  notes?: string | null;
  reference_activity_id?: string | null;
  source?: string | null;
};

type MetricEditorTarget =
  | { mode: "create"; metric: Pick<ProfileMetricRow, "metric_type"> }
  | { mode: "edit" | "override"; metric: ProfileMetricRow };

function formatMetricType(type: ProfileMetricType) {
  return (
    profileMetricOptions.find((option) => option.type === type)?.label ?? type.replaceAll("_", " ")
  );
}

function buildTrendSummary(rows: ProfileMetricRow[]) {
  if (rows.length === 0) return "No records yet";
  if (rows.length === 1) return "One record saved";

  const oldest = rows.at(-1);
  const newest = rows[0];
  if (!oldest || !newest) return "No records yet";
  const delta = newest.value - oldest.value;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return `${direction} ${Math.abs(delta).toFixed(1)} ${newest.unit}`;
}

export const Route = createFileRoute("/_protected/profile-metrics/")({
  component: ProfileMetricsPage,
});

function ProfileMetricsPage() {
  const { user } = useAuth();
  const utils = api.useUtils();
  const [selectedMetricType, setSelectedMetricType] = useState<ProfileMetricType>("ftp");
  const [editorTarget, setEditorTarget] = useState<MetricEditorTarget | null>(null);
  const [deleteMetric, setDeleteMetric] = useState<ProfileMetricRow | null>(null);
  const metricsQuery = api.profileMetrics.list.useInfiniteQuery(
    { limit: 50 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  useEffect(() => {
    if (metricsQuery.hasNextPage && !metricsQuery.isFetchingNextPage) {
      void metricsQuery.fetchNextPage();
    }
  }, [metricsQuery.fetchNextPage, metricsQuery.hasNextPage, metricsQuery.isFetchingNextPage]);
  const metrics = (metricsQuery.data?.pages.flatMap((page) => page.items) ??
    []) as ProfileMetricRow[];

  const groupedMetrics = useMemo(() => {
    const map = new Map<ProfileMetricType, ProfileMetricRow[]>();
    for (const option of profileMetricOptions) map.set(option.type, []);
    for (const metric of metrics) {
      const rows = map.get(metric.metric_type) ?? [];
      rows.push(metric);
      map.set(metric.metric_type, rows);
    }
    return map;
  }, [metrics]);

  const selectedOption =
    profileMetricOptions.find((option) => option.type === selectedMetricType) ??
    profileMetricGroups[0].metrics[0];
  const selectedRows = groupedMetrics.get(selectedOption.type) ?? [];
  const latestMetric = selectedRows[0];
  const selectedIsThreshold = isActivityDerivedThresholdMetricType(selectedOption.type);

  const createMutation = api.profileMetrics.create.useMutation({
    onSuccess: async () => {
      await utils.profileMetrics.invalidate();
      toast.success("Metric saved");
      setEditorTarget(null);
    },
  });
  const updateMutation = api.profileMetrics.update.useMutation({
    onSuccess: async () => {
      await utils.profileMetrics.invalidate();
      toast.success("Metric updated");
      setEditorTarget(null);
    },
  });
  const deleteMutation = api.profileMetrics.delete.useMutation({
    onSuccess: async () => {
      await utils.profileMetrics.invalidate();
      toast.success("Metric deleted");
      setDeleteMetric(null);
    },
  });
  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-4">
      <DetailPageIntro
        actions={
          selectedIsThreshold ? null : (
            <Button
              onClick={() =>
                setEditorTarget({ mode: "create", metric: { metric_type: selectedMetricType } })
              }
              type="button"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add measurement
            </Button>
          )
        }
        description="Trends now live with profile metrics: pick a measurement, inspect the chart, then edit or delete records from the table below."
        eyebrow="Profile"
        title="Profile metrics"
      />

      {metricsQuery.isError ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-6 py-8 text-sm text-destructive">
          Unable to load profile metrics: {metricsQuery.error.message}
        </div>
      ) : metricsQuery.isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-2xl border">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-6">
            {profileMetricGroups.map((group) => (
              <section className="space-y-3" key={group.label}>
                <div>
                  <h2 className="font-semibold">{group.label}</h2>
                  <p className="text-sm text-muted-foreground">{group.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {group.metrics.map((option) => {
                    const rows = groupedMetrics.get(option.type) ?? [];
                    const latest = rows[0];
                    const selected = option.type === selectedOption.type;
                    return (
                      <button
                        className={`rounded-2xl border p-4 text-left transition-colors ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "bg-card hover:border-primary/30"
                        }`}
                        key={option.type}
                        onClick={() => setSelectedMetricType(option.type)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">{option.label}</p>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                              {option.description}
                            </p>
                          </div>
                          <Badge variant={rows.length ? "default" : "secondary"}>
                            {rows.length}
                          </Badge>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded-xl bg-muted/40 px-3 py-2">
                            <p className="text-xs uppercase text-muted-foreground">Latest</p>
                            <p className="font-medium">
                              {latest ? formatProfileMetricDisplayValue(latest) : "-"}
                            </p>
                          </div>
                          <div className="rounded-xl bg-muted/40 px-3 py-2">
                            <p className="text-xs uppercase text-muted-foreground">Trend</p>
                            <p className="font-medium">{buildTrendSummary(rows)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="space-y-6">
            <SimpleTrendChart
              description={selectedOption.description}
              emptyMessage="Add measurements to build this trend."
              formatValue={(value) =>
                formatProfileMetricDisplayValue({ metric_type: selectedOption.type, value })
              }
              points={[...selectedRows].reverse().map((row) => ({
                id: row.id,
                label: formatDate(row.recorded_at),
                value: row.value,
                x: new Date(row.recorded_at).getTime(),
              }))}
              title={`${selectedOption.label} trend`}
            />
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Measurements
                    </CardTitle>
                    <CardDescription>Edit or delete the records behind this trend.</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {latestMetric ? (
                      <Badge variant="secondary">
                        Latest {formatDate(latestMetric.recorded_at)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <MetricRowsTable
                  emptyMessage={`No ${selectedOption.label.toLowerCase()} measurements yet.`}
                  onDelete={setDeleteMetric}
                  onEdit={(metric) => setEditorTarget({ metric, mode: "edit" })}
                  onOverride={(metric) => setEditorTarget({ metric, mode: "override" })}
                  readOnly={selectedIsThreshold}
                  rows={selectedRows}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <MetricEditDialog
        target={editorTarget}
        metricType={selectedMetricType}
        onClose={() => setEditorTarget(null)}
        onSubmit={(values) => {
          if (editorTarget?.mode === "edit") {
            updateMutation.mutate({
              id: editorTarget.metric.id,
              notes: values.notes?.trim() || null,
              recorded_at: new Date(values.recorded_at).toISOString(),
              value: values.value,
            });
            return;
          }

          if (!user?.id) return;
          createMutation.mutate({
            metric_type: editorTarget?.metric.metric_type ?? selectedMetricType,
            notes: values.notes?.trim() || null,
            profile_id: user.id,
            recorded_at: new Date(values.recorded_at).toISOString(),
            reference_activity_id: null,
            value: values.value,
          });
        }}
        pending={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deleteMetric} onOpenChange={(open) => !open && setDeleteMetric(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete measurement?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the{" "}
              {deleteMetric ? formatMetricType(deleteMetric.metric_type) : "measurement"} record
              from your profile metrics.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMetric && deleteMutation.mutate({ id: deleteMetric.id })}
            >
              Delete measurement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MetricRowsTable({
  emptyMessage,
  onDelete,
  onEdit,
  onOverride,
  readOnly,
  rows,
}: {
  emptyMessage: string;
  onDelete: (row: ProfileMetricRow) => void;
  onEdit: (row: ProfileMetricRow) => void;
  onOverride: (row: ProfileMetricRow) => void;
  readOnly?: boolean;
  rows: ProfileMetricRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-muted-foreground">
        {emptyMessage}
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
            <TableHead>Source</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const manual = isManualProfileMetric(row.source);
            return (
              <TableRow
                className={manual && !readOnly ? "cursor-pointer" : undefined}
                key={row.id}
                onClick={() => manual && !readOnly && onEdit(row)}
              >
                <TableCell>{formatDateTime(row.recorded_at)}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">
                  {formatProfileMetricDisplayValue(row)}
                </TableCell>
                <TableCell>
                  <Badge variant={manual ? "secondary" : "outline"}>
                    {formatObservationSource(row.source)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[280px] truncate text-muted-foreground">
                  {row.notes || "-"}
                </TableCell>
                <TableCell className="text-right">
                  {readOnly ? (
                    <span className="text-xs text-muted-foreground">Calculated</span>
                  ) : manual ? (
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(row);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  ) : (
                    <Button
                      onClick={() => onOverride(row)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Manual override
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MetricEditDialog({
  metricType,
  onClose,
  onSubmit,
  pending,
  target,
}: {
  metricType: ProfileMetricType;
  onClose: () => void;
  onSubmit: (values: ProfileMetricFormValues) => Promise<unknown> | unknown;
  pending: boolean;
  target: MetricEditorTarget | null;
}) {
  const activeType = target?.metric.metric_type ?? metricType;
  const titlePrefix =
    target?.mode === "edit" ? "Edit" : target?.mode === "override" ? "Override" : "Add";

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {titlePrefix} {formatMetricType(activeType)}
          </DialogTitle>
          <DialogDescription>
            {target?.mode === "override"
              ? "The sourced observation stays read-only. Save a separate manual value to override it."
              : "Save a dated manual measurement for this metric."}
          </DialogDescription>
        </DialogHeader>
        <ProfileMetricForm
          metricType={activeType}
          onCancel={onClose}
          onSubmit={onSubmit}
          pending={pending}
          values={getProfileMetricFormValues(
            activeType,
            target?.mode === "edit" || target?.mode === "override" ? target.metric : undefined,
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
