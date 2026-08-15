import type { ProfileMetricType } from "@repo/core/schemas/profile-metrics";
import type { PreferredUnitSystem } from "@repo/core/units";
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
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DetailPageIntro } from "../../../components/protected/activity-route-primitives";
import {
  getProfileMetricFormValues,
  ProfileMetricForm,
  type ProfileMetricFormValues,
} from "../../../components/protected/profile-metric-form";
import { useAuth } from "../../../components/providers/auth-provider";
import { useViewingUserPreferredUnitSystem } from "../../../hooks/use-viewing-user-preferred-unit-system";
import { formatDateTime } from "../../../lib/activity-route-helpers";
import { api } from "../../../lib/api/client";
import {
  formatObservationSource,
  formatProfileMetricDisplayValue,
  isManualProfileMetric,
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

export const Route = createFileRoute("/_protected/profile-metrics/$metricId")({
  component: ProfileMetricDetailPage,
});

function metricLabel(metricType: ProfileMetricType) {
  return profileMetricOptions.find((option) => option.type === metricType)?.label ?? metricType;
}

function ProfileMetricDetailPage() {
  const { metricId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const { unitSystem } = useViewingUserPreferredUnitSystem();
  const utils = api.useUtils();
  const metricQuery = api.profileMetrics.getById.useQuery({ id: metricId }, { retry: false });
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const metric = metricQuery.data as ProfileMetricRow | null | undefined;
  const manual = metric ? isManualProfileMetric(metric.source) : false;
  const updateMutation = api.profileMetrics.update.useMutation({
    onSuccess: async () => {
      await utils.profileMetrics.invalidate();
      await utils.profileMetrics.getById.invalidate({ id: metricId });
      setEditing(false);
      toast.success(manual ? "Metric updated" : "Manual override saved");
    },
    onError: (error) => toast.error(error.message || "Metric could not be saved"),
  });
  const createMutation = api.profileMetrics.create.useMutation({
    onSuccess: async () => {
      await utils.profileMetrics.invalidate();
      setEditing(false);
      toast.success("Manual override saved");
    },
    onError: (error) => toast.error(error.message || "Manual override could not be saved"),
  });
  const deleteMutation = api.profileMetrics.delete.useMutation({
    onSuccess: async () => {
      await utils.profileMetrics.invalidate();
      toast.success("Metric deleted");
      void navigate({ to: "/profile-metrics" });
    },
    onError: (error) => toast.error(error.message || "Metric could not be deleted"),
  });

  if (metricQuery.isLoading) {
    return (
      <Loader2 aria-label="Loading profile metric" className="mx-auto mt-20 h-8 w-8 animate-spin" />
    );
  }

  if (metricQuery.isError || !metric) {
    return (
      <Card className="mx-auto mt-8 max-w-2xl border-destructive/30">
        <CardHeader>
          <CardTitle>Profile metric unavailable</CardTitle>
          <CardDescription>
            This metric may have been removed or you may no longer have access to it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/profile-metrics">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to profile metrics
            </Link>
          </Button>
          <Button onClick={() => void metricQuery.refetch()} type="button" variant="ghost">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const saveMetric = (values: ProfileMetricFormValues) => {
    if (!manual) {
      if (!user?.id) return;
      createMutation.mutate({
        metric_type: metric.metric_type,
        notes: values.notes?.trim() || null,
        profile_id: user.id,
        recorded_at: new Date(values.recorded_at).toISOString(),
        reference_activity_id: null,
        value: values.value,
      });
      return;
    }
    updateMutation.mutate({
      id: metric.id,
      notes: values.notes?.trim() || null,
      recorded_at: new Date(values.recorded_at).toISOString(),
      value: values.value,
    });
  };

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-4">
      <Button asChild size="sm" variant="ghost">
        <Link to="/profile-metrics">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to profile metrics
        </Link>
      </Button>
      <DetailPageIntro
        actions={
          manual ? (
            <div className="flex gap-2">
              <Button onClick={() => setEditing(true)} type="button" variant="outline">
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
              <Button onClick={() => setConfirmingDelete(true)} type="button" variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </div>
          ) : (
            <Button onClick={() => setEditing(true)} type="button">
              Manual override
            </Button>
          )
        }
        description={`Recorded ${formatDateTime(metric.recorded_at)}`}
        eyebrow="Profile metric"
        title={metricLabel(metric.metric_type)}
      />
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap gap-2">
            <Badge>
              {formatProfileMetricDisplayValue({ ...metric, preferredUnitSystem: unitSystem })}
            </Badge>
            <Badge variant="secondary">{formatObservationSource(metric.source)}</Badge>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Recorded</dt>
              <dd className="font-medium">{formatDateTime(metric.recorded_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Source</dt>
              <dd className="font-medium">{formatObservationSource(metric.source)}</dd>
            </div>
          </dl>
          {metric.notes ? (
            <div>
              <h2 className="font-semibold">Notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {metric.notes}
              </p>
            </div>
          ) : null}
          {metric.reference_activity_id ? (
            <Button asChild variant="outline">
              <Link
                params={{ activityId: metric.reference_activity_id }}
                to="/activities/$activityId"
              >
                View reference activity
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {manual ? "Edit" : "Override"} {metricLabel(metric.metric_type)}
            </DialogTitle>
            <DialogDescription>
              {manual
                ? "Update this manual measurement."
                : "The sourced observation stays read-only. Save a separate manual value to override it."}
            </DialogDescription>
          </DialogHeader>
          <ProfileMetricForm
            metricType={metric.metric_type}
            onCancel={() => setEditing(false)}
            onSubmit={saveMetric}
            pending={updateMutation.isPending || createMutation.isPending}
            unitSystem={unitSystem as PreferredUnitSystem}
            values={getProfileMetricFormValues(metric.metric_type, metric)}
          />
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete measurement?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes this manual profile metric record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate({ id: metric.id })}>
              Delete measurement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
