import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { GroupEventForm } from "../../../../../components/groups/group-event-form";
import { type GroupEventSummary, QueryState } from "../../../../../components/groups/group-ui";
import { api } from "../../../../../lib/api/client";

export const Route = createFileRoute("/_protected/groups/events/$groupEventId/edit")({
  component: EditGroupEventPage,
});

function EditGroupEventPage() {
  const { groupEventId } = Route.useParams();
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const detail = api.groups.events.detail.useQuery({ groupEventId });
  const event = detail.data?.event as GroupEventSummary | undefined;
  const group = api.groups.detail.useQuery(
    { groupId: event?.group_id ?? "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(event) },
  );
  const updateMutation = api.groups.events.update.useMutation();
  const occurrenceMutation = api.groups.events.updateEventOccurrence.useMutation();
  const isSubmitting = updateMutation.isPending || occurrenceMutation.isPending;

  return (
    <main className="container mx-auto max-w-3xl space-y-6 py-4">
      <h1 className="text-3xl font-semibold tracking-tight">
        {event?.is_recurring_occurrence
          ? "Edit this event"
          : event?.is_recurring_series
            ? "Edit recurring series"
            : "Edit event"}
      </h1>
      <QueryState
        error={detail.error ?? group.error}
        isLoading={detail.isLoading || group.isLoading}
        onRetry={() => {
          void detail.refetch();
          void group.refetch();
        }}
      >
        {event && group.data?.viewer.canCreateGroupEvent ? (
          <Card>
            <CardHeader>
              <CardTitle>Event details</CardTitle>
            </CardHeader>
            <CardContent>
              <GroupEventForm
                event={event}
                isSubmitting={isSubmitting}
                onCancel={() =>
                  void navigate({ to: "/groups/events/$groupEventId", params: { groupEventId } })
                }
                onSubmit={async (value) => {
                  const payload = {
                    groupEventId,
                    title: value.title,
                    description: value.description,
                    startsAt: value.startsAt,
                    endsAt: value.endsAt,
                    timezone: value.timezone,
                    locationName: value.locationName,
                    routeId: value.routeId,
                    activityPlanId: value.activityPlanId,
                  };
                  if (event.is_recurring_occurrence) await occurrenceMutation.mutateAsync(payload);
                  else await updateMutation.mutateAsync(payload);
                  await utils.groups.events.invalidate();
                  toast.success("Event updated");
                  void navigate({ to: "/groups/events/$groupEventId", params: { groupEventId } });
                }}
                submitLabel="Save changes"
              />
            </CardContent>
          </Card>
        ) : (
          <p role="alert">Only group owners and admins can edit this event.</p>
        )}
      </QueryState>
    </main>
  );
}
