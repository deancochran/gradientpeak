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
import { BarChart3, Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ActivityEffortForm,
  toDateTimeLocalValue,
} from "../../../components/protected/activity-effort-form";
import { DetailPageIntro } from "../../../components/protected/activity-route-primitives";
import type { ActivityEffortFormValues } from "../../../lib/activity-route-form-schemas";
import { formatDateTime, formatDuration } from "../../../lib/activity-route-helpers";
import { api } from "../../../lib/api/client";

type ActivityEffortRow = {
  id: string;
  activity_category: ActivityEffortFormValues["activity_category"];
  duration_seconds: number;
  effort_type: ActivityEffortFormValues["effort_type"];
  recorded_at: Date | string;
  start_offset?: number | null;
  unit: string;
  value: number;
};

type EffortMeasurementKey =
  `${ActivityEffortFormValues["activity_category"]}:${ActivityEffortFormValues["effort_type"]}:${number}`;

function getEffortKey(
  effort: Pick<ActivityEffortRow, "activity_category" | "effort_type" | "duration_seconds">,
): EffortMeasurementKey {
  return `${effort.activity_category}:${effort.effort_type}:${effort.duration_seconds}`;
}

function formatEffortLabel(key: EffortMeasurementKey) {
  const [category, type, duration] = key.split(":");
  return `${category} ${duration}s ${type}`;
}

function getEffortSummary(rows: ActivityEffortRow[]) {
  if (rows.length === 0) return "No records yet";
  const best = Math.max(...rows.map((row) => row.value));
  return `Best ${best.toFixed(1)} ${rows[0]?.unit ?? ""}`;
}

export const Route = createFileRoute("/_protected/activity-efforts/")({
  component: ActivityEffortsPage,
});

function ActivityEffortsPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const effortsQuery = api.activityEfforts.getForProfile.useQuery();
  const efforts = (effortsQuery.data ?? []) as unknown as ActivityEffortRow[];
  const [selectedKey, setSelectedKey] = useState<EffortMeasurementKey | null>(null);
  const [editingEffort, setEditingEffort] = useState<ActivityEffortRow | null>(null);
  const [deleteEffort, setDeleteEffort] = useState<ActivityEffortRow | null>(null);

  const groupedEfforts = useMemo(() => {
    const map = new Map<EffortMeasurementKey, ActivityEffortRow[]>();
    for (const effort of efforts) {
      const key = getEffortKey(effort);
      map.set(key, [...(map.get(key) ?? []), effort]);
    }
    return map;
  }, [efforts]);

  const measurementKeys = [...groupedEfforts.keys()];
  const activeKey = selectedKey ?? measurementKeys[0] ?? null;
  const selectedRows = activeKey ? (groupedEfforts.get(activeKey) ?? []) : [];

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
        actions={
          <Button onClick={() => void navigate({ to: "/activity-efforts/new" })} type="button">
            <Plus className="mr-2 h-4 w-4" />
            Add effort
          </Button>
        }
        description="Choose a measurement card to open its chart and manage the records behind it."
        eyebrow="Performance"
        title="Activity efforts"
      />

      {effortsQuery.isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-2xl border">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : measurementKeys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Create an effort to track reference segments and best-power or best-speed efforts.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {measurementKeys.map((key) => {
              const rows = groupedEfforts.get(key) ?? [];
              const latest = rows[0];
              const selected = key === activeKey;
              return (
                <button
                  className={`rounded-2xl border p-4 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "bg-card hover:border-primary/30"}`}
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold capitalize text-foreground">
                        {formatEffortLabel(key)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Grouped by activity, duration, and measurement type.
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
                      <p className="text-xs uppercase text-muted-foreground">Summary</p>
                      <p className="font-medium">{getEffortSummary(rows)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 capitalize">
                <BarChart3 className="h-5 w-5" />
                {activeKey ? formatEffortLabel(activeKey) : "Effort measurement"}
              </CardTitle>
              <CardDescription>
                Charted by recorded date with editable records underneath.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <EffortTrendChart rows={selectedRows} />
              <EffortRowsTable
                rows={selectedRows}
                onEdit={setEditingEffort}
                onDelete={setDeleteEffort}
              />
            </CardContent>
          </Card>
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
            unit: values.unit.trim(),
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

function EffortTrendChart({ rows }: { rows: ActivityEffortRow[] }) {
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
        <span>Performance chart</span>
        <span>{rows.length} records</span>
      </div>
      <svg
        className="h-56 w-full overflow-visible"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        role="img"
        aria-label="Activity effort trend"
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
    </div>
  );
}

function EffortRowsTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: ActivityEffortRow[];
  onEdit: (row: ActivityEffortRow) => void;
  onDelete: (row: ActivityEffortRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Recorded</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Duration</TableHead>
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
              <TableCell>{formatDuration(row.duration_seconds)}</TableCell>
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
  return (
    <Dialog open={!!effort} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit effort</DialogTitle>
          <DialogDescription>
            Clicked rows open here so you can modify the selected effort record.
          </DialogDescription>
        </DialogHeader>
        <ActivityEffortForm
          actionLayout="dialog"
          onCancel={onClose}
          onSubmit={onSubmit}
          onSubmitError={onSubmitError}
          pending={pending}
          submitLabel="Save"
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
