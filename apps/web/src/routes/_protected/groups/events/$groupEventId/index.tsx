import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  GroupEventCard,
  type GroupEventSummary,
  MutationError,
  QueryState,
} from "../../../../../components/groups/group-ui";
import { api } from "../../../../../lib/api/client";

export const Route = createFileRoute("/_protected/groups/events/$groupEventId/")({
  component: GroupEventDetailPage,
});

type RsvpStatus = "accepted" | "declined" | "tentative";

function GroupEventDetailPage() {
  const { groupEventId } = Route.useParams();
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const detail = api.groups.events.detail.useQuery({ groupEventId });
  const event = detail.data?.event as GroupEventSummary | undefined;
  const group = api.groups.detail.useQuery(
    { groupId: event?.group_id ?? "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(event) },
  );
  const occurrences = api.groups.events.seriesOccurrences.useQuery(
    { groupEventId, limit: 30, startsAfter: new Date().toISOString() },
    { enabled: Boolean(event?.is_recurring_occurrence || event?.is_recurring_series) },
  );
  const route = api.routes.get.useQuery(
    { id: event?.route_id ?? "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(event?.route_id), retry: false },
  );
  const plan = api.activityPlans.getManyByIds.useQuery(
    { ids: event?.activity_plan_id ? [event.activity_plan_id] : [] },
    { enabled: Boolean(event?.activity_plan_id), retry: false },
  );
  const rsvpMutation = api.groups.events.rsvp.useMutation({
    onSuccess: () => utils.groups.events.invalidate(),
  });
  const seriesRsvpMutation = api.groups.events.rsvpEventSeries.useMutation({
    onSuccess: () => utils.groups.events.invalidate(),
  });
  const cancelMutation = api.groups.events.cancel.useMutation({
    onSuccess: () => utils.groups.events.invalidate(),
  });
  const mutationError = rsvpMutation.error ?? seriesRsvpMutation.error ?? cancelMutation.error;
  const canManage = Boolean(group.data?.viewer.canCreateGroupEvent);
  const seriesId = event?.series_id ?? (event?.is_recurring_series ? event.id : null);
  const effectiveRsvp = event?.viewerRsvp?.status ?? event?.viewerSeriesRsvp?.status ?? null;

  const setOccurrenceRsvp = (status: RsvpStatus | null) =>
    rsvpMutation.mutate(
      { groupEventId, status },
      { onSuccess: () => toast.success(status ? "RSVP saved" : "RSVP cleared") },
    );
  const setSeriesRsvp = (status: RsvpStatus | null) => {
    if (seriesId)
      seriesRsvpMutation.mutate(
        { groupEventSeriesId: seriesId, status },
        { onSuccess: () => toast.success(status ? "Series RSVP saved" : "Series RSVP cleared") },
      );
  };

  return (
    <main className="container mx-auto max-w-5xl space-y-6 py-4">
      <QueryState
        error={detail.error}
        isLoading={detail.isLoading}
        onRetry={() => void detail.refetch()}
      >
        {event ? (
          <>
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {event.group ? (
                      <button
                        className="text-sm text-muted-foreground hover:underline"
                        onClick={() =>
                          void navigate({
                            to: "/groups/$groupId",
                            params: { groupId: event.group_id },
                          })
                        }
                        type="button"
                      >
                        {event.group.name}
                      </button>
                    ) : null}
                    <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
                  </div>
                  {event.cancelled_at ? <Badge variant="destructive">Cancelled</Badge> : null}
                </div>
                <p className="font-medium">
                  {new Date(event.starts_at).toLocaleString()}
                  {event.ends_at ? ` – ${new Date(event.ends_at).toLocaleString()}` : ""}
                </p>
                {event.location_name ? (
                  <p className="text-muted-foreground">{event.location_name}</p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {event.description ? (
                  <p className="whitespace-pre-wrap text-muted-foreground">{event.description}</p>
                ) : null}
                <p>{event.acceptedRsvpCount} going</p>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        void navigate({
                          to: "/groups/events/$groupEventId/edit",
                          params: { groupEventId },
                        })
                      }
                      type="button"
                      variant="outline"
                    >
                      {event.is_recurring_occurrence ? "Edit this event" : "Edit event"}
                    </Button>
                    {event.is_recurring_occurrence && event.series_id ? (
                      <Button
                        onClick={() =>
                          void navigate({
                            to: "/groups/events/$groupEventId/edit",
                            params: { groupEventId: event.series_id as string },
                          })
                        }
                        type="button"
                        variant="outline"
                      >
                        Edit series
                      </Button>
                    ) : null}
                    {!event.cancelled_at ? (
                      <Button
                        disabled={cancelMutation.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              event.is_recurring_occurrence || event.is_recurring_series
                                ? "Cancel this event only?"
                                : "Cancel this event?",
                            )
                          )
                            cancelMutation.mutate({ groupEventId, scope: "single" });
                        }}
                        type="button"
                        variant="destructive"
                      >
                        Cancel event
                      </Button>
                    ) : null}
                    {!event.cancelled_at &&
                    (event.is_recurring_occurrence || event.is_recurring_series) ? (
                      <Button
                        disabled={cancelMutation.isPending}
                        onClick={() => {
                          if (window.confirm("Cancel the entire recurring series?"))
                            cancelMutation.mutate({ groupEventId, scope: "series" });
                        }}
                        type="button"
                        variant="destructive"
                      >
                        Cancel entire series
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {event.route_id || event.activity_plan_id ? (
              <section className="grid gap-4 md:grid-cols-2" aria-labelledby="attachments-heading">
                <h2 className="sr-only" id="attachments-heading">
                  Attachments
                </h2>
                {event.route_id ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Route</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {route.isLoading ? (
                        <p>Loading route…</p>
                      ) : route.data ? (
                        <div className="space-y-3">
                          <p className="font-semibold">{route.data.name}</p>
                          <Button
                            onClick={() =>
                              void navigate({
                                to: "/routes/$routeId",
                                params: { routeId: route.data.id },
                              })
                            }
                            type="button"
                            variant="outline"
                          >
                            Open route
                          </Button>
                        </div>
                      ) : (
                        <p className="text-muted-foreground" role="status">
                          This attached route is not available to your account.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ) : null}
                {event.activity_plan_id ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Activity plan</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {plan.isLoading ? (
                        <p>Loading activity plan…</p>
                      ) : plan.data?.items[0] ? (
                        <p className="font-semibold">{plan.data.items[0].name}</p>
                      ) : (
                        <p className="text-muted-foreground" role="status">
                          This attached activity plan is not available to your account.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ) : null}
              </section>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Your RSVP</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Effective response: {effectiveRsvp ?? "none"}
                  {event.viewerRsvp
                    ? " (this date overrides the series)"
                    : event.viewerSeriesRsvp
                      ? " (from series)"
                      : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["accepted", "tentative", "declined"] as const).map((status) => (
                    <Button
                      aria-pressed={event.viewerRsvp?.status === status}
                      disabled={rsvpMutation.isPending || Boolean(event.cancelled_at)}
                      key={status}
                      onClick={() => setOccurrenceRsvp(status)}
                      type="button"
                      variant={event.viewerRsvp?.status === status ? "default" : "outline"}
                    >
                      {status === "accepted"
                        ? "Going"
                        : status === "tentative"
                          ? "Tentative"
                          : "Decline"}
                    </Button>
                  ))}
                  {event.viewerRsvp ? (
                    <Button
                      disabled={rsvpMutation.isPending}
                      onClick={() => setOccurrenceRsvp(null)}
                      type="button"
                      variant="ghost"
                    >
                      Clear date RSVP
                    </Button>
                  ) : null}
                </div>
                {seriesId ? (
                  <div className="space-y-2 border-t pt-3">
                    <p className="font-medium">Apply to the recurring series</p>
                    <div className="flex flex-wrap gap-2">
                      {(["accepted", "tentative", "declined"] as const).map((status) => (
                        <Button
                          aria-pressed={event.viewerSeriesRsvp?.status === status}
                          disabled={seriesRsvpMutation.isPending || Boolean(event.cancelled_at)}
                          key={status}
                          onClick={() => setSeriesRsvp(status)}
                          type="button"
                          variant={
                            event.viewerSeriesRsvp?.status === status ? "secondary" : "outline"
                          }
                        >
                          {status === "accepted"
                            ? "Going to series"
                            : status === "tentative"
                              ? "Tentative for series"
                              : "Decline series"}
                        </Button>
                      ))}
                      {event.viewerSeriesRsvp ? (
                        <Button
                          disabled={seriesRsvpMutation.isPending}
                          onClick={() => setSeriesRsvp(null)}
                          type="button"
                          variant="ghost"
                        >
                          Clear series RSVP
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <MutationError error={mutationError} />

            {event.is_recurring_occurrence || event.is_recurring_series ? (
              <section className="space-y-4" aria-labelledby="dates-heading">
                <h2 className="text-2xl font-semibold" id="dates-heading">
                  Future dates
                </h2>
                <QueryState
                  error={occurrences.error}
                  isLoading={occurrences.isLoading}
                  onRetry={() => void occurrences.refetch()}
                >
                  {(occurrences.data?.items ?? []).filter((item) => item.id !== event.id).length ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {occurrences.data?.items
                        .filter((item) => item.id !== event.id)
                        .map((item) => (
                          <GroupEventCard
                            event={item as GroupEventSummary}
                            key={item.id}
                            onOpen={() =>
                              void navigate({
                                to: "/groups/events/$groupEventId",
                                params: { groupEventId: item.id },
                              })
                            }
                          />
                        ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No future dates.</p>
                  )}
                </QueryState>
              </section>
            ) : null}
          </>
        ) : null}
      </QueryState>
    </main>
  );
}
