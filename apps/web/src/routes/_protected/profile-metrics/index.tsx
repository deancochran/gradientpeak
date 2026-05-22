import { PROFILE_METRIC_UNITS, type ProfileMetricType } from "@repo/core/schemas/profile-metrics";
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
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DetailPageIntro } from "../../../components/protected/activity-route-primitives";
import {
  getProfileMetricFormValues,
  ProfileMetricForm,
  type ProfileMetricFormValues,
} from "../../../components/protected/profile-metric-form";
import { useAuth } from "../../../components/providers/auth-provider";
import { formatDate, formatDateTime } from "../../../lib/activity-route-helpers";
import { api } from "../../../lib/api/client";

const metricOptions = [
  {
    type: "weight_kg",
    label: "Weight",
    description: "Body mass trend for load and power-to-weight context.",
  },
  {
    type: "resting_hr",
    label: "Resting HR",
    description: "Baseline cardiovascular recovery signal.",
  },
  { type: "hrv_rmssd", label: "HRV", description: "Morning readiness and autonomic stress trend." },
  { type: "sleep_hours", label: "Sleep", description: "Sleep duration for recovery context." },
  { type: "vo2_max", label: "VO2 Max", description: "Aerobic capacity estimates over time." },
  { type: "body_fat_percentage", label: "Body Fat", description: "Body composition trend." },
  { type: "hydration_level", label: "Hydration", description: "Subjective hydration score." },
  { type: "stress_score", label: "Stress", description: "Subjective stress score." },
  { type: "soreness_level", label: "Soreness", description: "Subjective soreness score." },
  { type: "wellness_score", label: "Wellness", description: "Overall wellness check-in." },
  { type: "max_hr", label: "Max HR", description: "Maximum heart-rate reference." },
  { type: "lthr", label: "LTHR", description: "Lactate-threshold heart-rate reference." },
] as const satisfies ReadonlyArray<{
  type: ProfileMetricType;
  label: string;
  description: string;
}>;

type MetricOption = (typeof metricOptions)[number];
type ProfileMetricRow = {
  id: string;
  metric_type: ProfileMetricType;
  recorded_at: Date | string;
  value: number;
  unit: string;
  notes?: string | null;
};

function formatMetricType(type: ProfileMetricType) {
  return metricOptions.find((option) => option.type === type)?.label ?? type.replaceAll("_", " ");
}

function buildTrendSummary(rows: ProfileMetricRow[]) {
  if (rows.length === 0) return "No records yet";
  if (rows.length === 1) return "One record saved";

  const oldest = rows[rows.length - 1]!;
  const newest = rows[0]!;
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
  const [selectedMetricType, setSelectedMetricType] = useState<ProfileMetricType>("weight_kg");
  const [editingMetric, setEditingMetric] = useState<ProfileMetricRow | null>(null);
  const [deleteMetric, setDeleteMetric] = useState<ProfileMetricRow | null>(null);
  const metricsQuery = api.profileMetrics.list.useQuery({ limit: 50 });
  const metrics = (metricsQuery.data?.items ?? []) as ProfileMetricRow[];

  const groupedMetrics = useMemo(() => {
    const map = new Map<ProfileMetricType, ProfileMetricRow[]>();
    for (const option of metricOptions) map.set(option.type, []);
    for (const metric of metrics) {
      const rows = map.get(metric.metric_type) ?? [];
      rows.push(metric);
      map.set(metric.metric_type, rows);
    }
    return map;
  }, [metrics]);

  const selectedOption =
    metricOptions.find((option) => option.type === selectedMetricType) ?? metricOptions[0];
  const selectedRows = groupedMetrics.get(selectedOption.type) ?? [];
  const latestMetric = selectedRows[0];

  const createMutation = api.profileMetrics.create.useMutation({
    onSuccess: async () => {
      await utils.profileMetrics.invalidate();
      toast.success("Metric saved");
      setEditingMetric(null);
    },
  });
  const updateMutation = api.profileMetrics.update.useMutation({
    onSuccess: async () => {
      await utils.profileMetrics.invalidate();
      toast.success("Metric updated");
      setEditingMetric(null);
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
          <Button
            onClick={() =>
              setEditingMetric({ metric_type: selectedMetricType } as ProfileMetricRow)
            }
            type="button"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add measurement
          </Button>
        }
        description="Trends now live with profile metrics: pick a measurement, inspect the chart, then edit or delete records from the table below."
        eyebrow="Profile"
        title="Profile metrics"
      />

      {metricsQuery.isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-2xl border">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {metricOptions.map((option) => {
              const rows = groupedMetrics.get(option.type) ?? [];
              const latest = rows[0];
              const selected = option.type === selectedOption.type;
              return (
                <button
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    selected ? "border-primary bg-primary/5" : "bg-card hover:border-primary/30"
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
                    <Badge variant={rows.length ? "default" : "secondary"}>{rows.length}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-muted/40 px-3 py-2">
                      <p className="text-xs uppercase text-muted-foreground">Latest</p>
                      <p className="font-medium">
                        {latest ? `${latest.value} ${latest.unit}` : "-"}
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

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    {selectedOption.label}
                  </CardTitle>
                  <CardDescription>{selectedOption.description}</CardDescription>
                </div>
                {latestMetric ? (
                  <Badge variant="secondary">Latest {formatDate(latestMetric.recorded_at)}</Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <MetricTrendChart
                rows={selectedRows}
                unit={PROFILE_METRIC_UNITS[selectedOption.type]}
              />
              <MetricRowsTable
                emptyMessage={`No ${selectedOption.label.toLowerCase()} measurements yet.`}
                onDelete={setDeleteMetric}
                onEdit={setEditingMetric}
                rows={selectedRows}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <MetricEditDialog
        metric={editingMetric}
        metricType={selectedMetricType}
        onClose={() => setEditingMetric(null)}
        onSubmit={(values) => {
          const unit = PROFILE_METRIC_UNITS[editingMetric?.metric_type ?? selectedMetricType];
          if (editingMetric?.id) {
            updateMutation.mutate({
              id: editingMetric.id,
              notes: values.notes?.trim() || null,
              recorded_at: new Date(values.recorded_at).toISOString(),
              unit,
              value: values.value,
            });
            return;
          }

          if (!user?.id) return;
          createMutation.mutate({
            metric_type: selectedMetricType,
            notes: values.notes?.trim() || null,
            profile_id: user.id,
            recorded_at: new Date(values.recorded_at).toISOString(),
            reference_activity_id: null,
            unit,
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

function MetricTrendChart({ rows, unit }: { rows: ProfileMetricRow[]; unit: string }) {
  const points = [...rows].reverse();
  const values = points.map((row) => row.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const coordinates = points
    .map((row, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 90 - ((row.value - min) / range) * 70;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>Trend chart</span>
        <span>{rows.length} records</span>
      </div>
      {rows.length === 0 ? (
        <div className="flex h-56 items-center justify-center rounded-xl border border-dashed text-muted-foreground">
          Add measurements to build this trend.
        </div>
      ) : (
        <svg
          className="h-56 w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
          role="img"
          aria-label={`Metric trend in ${unit}`}
        >
          <polyline
            fill="none"
            points={coordinates}
            stroke="currentColor"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
            className="text-primary"
          />
          {points.map((row, index) => {
            const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
            const y = 90 - ((row.value - min) / range) * 70;
            return (
              <circle
                className="fill-background stroke-primary"
                cx={x}
                cy={y}
                key={row.id}
                r="2.5"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}

function MetricRowsTable({
  emptyMessage,
  onDelete,
  onEdit,
  rows,
}: {
  emptyMessage: string;
  onDelete: (row: ProfileMetricRow) => void;
  onEdit: (row: ProfileMetricRow) => void;
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
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow className="cursor-pointer" key={row.id} onClick={() => onEdit(row)}>
              <TableCell>{formatDateTime(row.recorded_at)}</TableCell>
              <TableCell className="font-medium">
                {row.value} {row.unit}
              </TableCell>
              <TableCell className="max-w-[280px] truncate text-muted-foreground">
                {row.notes || "-"}
              </TableCell>
              <TableCell className="text-right">
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MetricEditDialog({
  metric,
  metricType,
  onClose,
  onSubmit,
  pending,
}: {
  metric: ProfileMetricRow | null;
  metricType: ProfileMetricType;
  onClose: () => void;
  onSubmit: (values: ProfileMetricFormValues) => Promise<unknown> | unknown;
  pending: boolean;
}) {
  const activeType = metric?.metric_type ?? metricType;

  return (
    <Dialog open={!!metric} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {metric?.id ? "Edit" : "Add"} {formatMetricType(activeType)}
          </DialogTitle>
          <DialogDescription>
            Clicked rows open here so you can modify or delete individual measurements.
          </DialogDescription>
        </DialogHeader>
        <ProfileMetricForm
          metricType={activeType}
          onCancel={onClose}
          onSubmit={onSubmit}
          pending={pending}
          values={getProfileMetricFormValues(activeType, metric)}
        />
      </DialogContent>
    </Dialog>
  );
}
