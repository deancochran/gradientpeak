import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { GroupEventForm } from "../../../../../components/groups/group-event-form";
import { type GroupEventSummary, QueryState } from "../../../../../components/groups/group-ui";
import { api } from "../../../../../lib/api/client";
import { loadRouteQuery } from "../../../../../lib/api/route-loading";
import {
  createGroupDetailInput,
  createGroupEventDetailInput,
} from "../../../../../lib/groups-query-inputs";

export const Route = createFileRoute("/_protected/groups/events/$groupEventId/edit")({
  loader: async ({ context, params }) => {
    const eventInput = createGroupEventDetailInput(params.groupEventId);
    await loadRouteQuery(
      () => context.apiUtils.groups.events.detail.getData(eventInput),
      () => context.apiUtils.groups.events.detail.fetch(eventInput),
    );
    const event = context.apiUtils.groups.events.detail.getData(eventInput)?.event;
    if (!event) return;
    const groupInput = createGroupDetailInput(event.group_id);
    await loadRouteQuery(
      () => context.apiUtils.groups.detail.getData(groupInput),
      () => context.apiUtils.groups.detail.fetch(groupInput),
    );
  },
  component: EditGroupEventPage,
});

function EditGroupEventPage() {
  const { groupEventId } = Route.useParams();
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const detail = api.groups.events.detail.useQuery(createGroupEventDetailInput(groupEventId));
  const event = detail.data?.event as GroupEventSummary | undefined;
  const group = api.groups.detail.useQuery(
    createGroupDetailInput(event?.group_id ?? "00000000-0000-4000-8000-000000000000"),
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
        {event?.is_recurring_series ? (
          <p role="alert">
            Recurring series editing is unavailable. Edit an individual occurrence instead.
          </p>
        ) : event && group.data?.viewer.canCreateGroupEvent ? (
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
                  await Promise.all([
                    utils.groups.events.invalidate(),
                    utils.calendar.invalidate(),
                  ]);
                  toast.success("Event updated");
                }}
                onSuccess={() => {
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
