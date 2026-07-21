import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { GroupEventForm } from "../../../../../components/groups/group-event-form";
import { QueryState } from "../../../../../components/groups/group-ui";
import { api } from "../../../../../lib/api/client";

export const Route = createFileRoute("/_protected/groups/$groupId/events/new")({
  component: CreateGroupEventPage,
});

function CreateGroupEventPage() {
  const { groupId } = Route.useParams();
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const detail = api.groups.detail.useQuery({ groupId });
  const createMutation = api.groups.events.create.useMutation();
  const recurringMutation = api.groups.events.createRecurringEventSeries.useMutation();
  const isSubmitting = createMutation.isPending || recurringMutation.isPending;
  return (
    <main className="container mx-auto max-w-3xl space-y-6 py-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Create group event</h1>
        <p className="text-sm text-muted-foreground">
          Schedule one date or a materialized recurring series.
        </p>
      </div>
      <QueryState
        error={detail.error}
        isLoading={detail.isLoading}
        onRetry={() => void detail.refetch()}
      >
        {detail.data?.viewer.canCreateGroupEvent ? (
          <Card>
            <CardHeader>
              <CardTitle>Event details</CardTitle>
            </CardHeader>
            <CardContent>
              <GroupEventForm
                isSubmitting={isSubmitting}
                onCancel={() => void navigate({ to: "/groups/$groupId", params: { groupId } })}
                onSubmit={async (value) => {
                  const result = value.recurrenceRule
                    ? await recurringMutation.mutateAsync({
                        groupId,
                        ...value,
                        recurrenceRule: value.recurrenceRule,
                        recurrenceTimezone: value.recurrenceTimezone ?? value.timezone,
                      })
                    : await createMutation.mutateAsync({ groupId, ...value });
                  if (!result.event)
                    throw new Error("The event was created without a readable result.");
                  await utils.groups.events.invalidate();
                  toast.success(value.recurrenceRule ? "Recurring event created" : "Event created");
                  void navigate({
                    to: "/groups/events/$groupEventId",
                    params: { groupEventId: result.event.id },
                  });
                }}
                submitLabel="Create event"
              />
            </CardContent>
          </Card>
        ) : (
          <p role="alert">Only group owners and admins can create events.</p>
        )}
      </QueryState>
    </main>
  );
}
