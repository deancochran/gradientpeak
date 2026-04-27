import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  ActivityListCard,
  DetailMetricGrid,
  DetailPageIntro,
  EntityMapCard,
} from "../../../../components/protected/activity-route-primitives";
import {
  formatDate,
  formatDuration,
  getActivityCoordinates,
} from "../../../../lib/activity-route-helpers";
import { api } from "../../../../lib/api/client";

export const Route = createFileRoute("/_protected/activity-efforts/$effortId/")({
  component: ActivityEffortDetailPage,
});

function ActivityEffortDetailPage() {
  const utils = api.useUtils();
  const navigate = Route.useNavigate();
  const { effortId } = Route.useParams();
  const effortQuery = api.activityEfforts.getById.useQuery({ id: effortId });
  const effort = effortQuery.data;
  const activityQuery = api.activities.getById.useQuery(
    { id: effort?.activity_id ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(effort?.activity_id) },
  );
  const deleteMutation = api.activityEfforts.delete.useMutation({
    onSuccess: async () => {
      await utils.activityEfforts.invalidate();
      toast.success("Effort deleted");
      void navigate({ to: "/activity-efforts" });
    },
  });
  const coordinates = useMemo(
    () => getActivityCoordinates(activityQuery.data?.activity?.polyline, undefined),
    [activityQuery.data?.activity?.polyline],
  );

  if (effortQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!effort) {
    return (
      <div className="container mx-auto max-w-3xl py-10">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Effort not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-4">
      <DetailPageIntro
        actions={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete effort?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the saved effort from your profile.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate({ id: effort.id })}>
                  Delete effort
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
        badges={[
          `${effort.activity_category} ${effort.effort_type}`,
          formatDate(effort.recorded_at),
        ]}
        description="Reference effort detail with optional linked activity context."
        eyebrow="Effort detail"
        title={`${effort.value} ${effort.unit}`}
      />

      <DetailMetricGrid
        items={[
          { label: "Duration", value: formatDuration(effort.duration_seconds) },
          { label: "Value", value: `${effort.value} ${effort.unit}` },
          {
            label: "Start offset",
            value: effort.start_offset != null ? formatDuration(effort.start_offset) : "-",
          },
          { label: "Recorded", value: formatDate(effort.recorded_at) },
        ]}
      />

      {activityQuery.data?.activity ? (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Linked activity</h2>
          <ActivityListCard
            activity={{ ...activityQuery.data.activity, derived: activityQuery.data.derived }}
            onOpen={() =>
              void navigate({
                to: "/activities/$activityId",
                params: { activityId: activityQuery.data?.activity.id ?? "" },
              })
            }
          />
        </div>
      ) : null}

      <EntityMapCard
        coordinates={coordinates}
        emptyMessage="This linked activity does not have a saved route preview yet."
        subtitle="Quick route context for where the effort happened."
        title="Segment context"
      />
    </div>
  );
}
