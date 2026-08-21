import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  GroupEventCard,
  type GroupEventSummary,
  MutationError,
  QueryState,
  type WebGroupSummary,
} from "../../../../components/groups/group-ui";
import { api } from "../../../../lib/api/client";

export const Route = createFileRoute("/_protected/groups/$groupId/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { groupId } = Route.useParams();
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const [eventTimeframe, setEventTimeframe] = useState<"upcoming" | "past">("upcoming");
  const now = useMemo(() => new Date().toISOString(), []);
  const detail = api.groups.detail.useQuery({ groupId });
  const viewer = detail.data?.viewer;
  const upcomingEvents = api.groups.events.list.useInfiniteQuery(
    { groupId, limit: 20, startsAfter: now },
    {
      enabled: Boolean(viewer?.canViewGroupEvents),
      getNextPageParam: (page) => page.nextCursor,
    },
  );
  const pastEvents = api.groups.events.list.useInfiniteQuery(
    { groupId, limit: 20, startsBefore: now },
    {
      enabled: Boolean(viewer?.canViewGroupEvents),
      getNextPageParam: (page) => page.nextCursor,
    },
  );
  const joinMutation = api.groups.joinOrRequest.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const leaveMutation = api.groups.leave.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const deleteMutation = api.groups.delete.useMutation({
    onSuccess: () => {
      void utils.groups.invalidate();
      void navigate({ to: "/groups" });
    },
  });
  const mutationError = joinMutation.error ?? leaveMutation.error ?? deleteMutation.error;
  const group = detail.data?.group as WebGroupSummary | undefined;
  const events = eventTimeframe === "upcoming" ? upcomingEvents : pastEvents;
  const eventItems = (events.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (event) => !event.is_recurring_series,
  );
  const eventHeading = eventTimeframe === "upcoming" ? "Upcoming events" : "Past events";
  const emptyEventMessage =
    eventTimeframe === "upcoming" ? "No upcoming events." : "No past events.";

  return (
    <main className="container mx-auto max-w-5xl space-y-6 py-4">
      <QueryState
        error={detail.error}
        isLoading={detail.isLoading}
        onRetry={() => void detail.refetch()}
      >
        {group && viewer ? (
          <>
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="break-words text-3xl font-semibold tracking-tight">
                      {group.name}
                    </h1>
                    <p className="text-sm text-muted-foreground">@{group.slug}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {group.access_level === "public" ? "Public" : "Members only"}
                    </Badge>
                    <Badge className="capitalize" variant="secondary">
                      {viewer.relationshipState.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                {group.description ? (
                  <p className="whitespace-pre-wrap">{group.description}</p>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {viewer.canJoin || viewer.canRequestToJoin ? (
                  <Button
                    disabled={joinMutation.isPending}
                    onClick={() => joinMutation.mutate({ groupId })}
                    type="button"
                  >
                    {viewer.canJoin ? "Join group" : "Request access"}
                  </Button>
                ) : null}
                {viewer.hasPendingJoinRequest ? (
                  <Badge variant="secondary">Request pending</Badge>
                ) : null}
                {viewer.hasPendingInvite ? (
                  <Badge variant="secondary">Invitation pending</Badge>
                ) : null}
                {viewer.canLeave ? (
                  <Button
                    disabled={leaveMutation.isPending}
                    onClick={() => leaveMutation.mutate({ groupId })}
                    type="button"
                    variant="outline"
                  >
                    Leave group
                  </Button>
                ) : null}
                {viewer.canViewMembers ? (
                  <Button
                    onClick={() =>
                      void navigate({ to: "/groups/$groupId/members", params: { groupId } })
                    }
                    type="button"
                    variant="outline"
                  >
                    View members
                  </Button>
                ) : null}
                {viewer.canEditGroup ? (
                  <Button
                    onClick={() =>
                      void navigate({ to: "/groups/$groupId/edit", params: { groupId } })
                    }
                    type="button"
                    variant="outline"
                  >
                    Edit group
                  </Button>
                ) : null}
                {viewer.canInvite || viewer.canManageJoinRequests ? (
                  <Button
                    onClick={() =>
                      void navigate({ to: "/groups/$groupId/requests", params: { groupId } })
                    }
                    type="button"
                    variant="outline"
                  >
                    Requests and invitations
                  </Button>
                ) : null}
                {viewer.canCreateGroupEvent ? (
                  <Button
                    onClick={() =>
                      void navigate({ to: "/groups/$groupId/events/new", params: { groupId } })
                    }
                    type="button"
                  >
                    Create event
                  </Button>
                ) : null}
                {viewer.canDeleteGroup ? (
                  <Button
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm("Archive this group?")) {
                        deleteMutation.mutate({ groupId });
                      }
                    }}
                    type="button"
                    variant="destructive"
                  >
                    Archive group
                  </Button>
                ) : null}
              </CardContent>
            </Card>
            <MutationError error={mutationError} />
            {viewer.canViewGroupEvents ? (
              <section className="space-y-4" aria-labelledby="group-events-heading">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-semibold" id="group-events-heading">
                    {eventHeading}
                  </h2>
                  <div className="flex gap-2">
                    <Button
                      aria-pressed={eventTimeframe === "upcoming"}
                      onClick={() => setEventTimeframe("upcoming")}
                      type="button"
                      variant={eventTimeframe === "upcoming" ? "default" : "outline"}
                    >
                      Upcoming
                    </Button>
                    <Button
                      aria-pressed={eventTimeframe === "past"}
                      onClick={() => setEventTimeframe("past")}
                      type="button"
                      variant={eventTimeframe === "past" ? "default" : "outline"}
                    >
                      Past
                    </Button>
                  </div>
                </div>
                <QueryState
                  error={events.error}
                  isLoading={events.isLoading}
                  onRetry={() => void events.refetch()}
                >
                  {eventItems.length ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        {eventItems.map((event) => (
                          <GroupEventCard
                            event={event as GroupEventSummary}
                            key={event.id}
                            onOpen={() =>
                              void navigate({
                                // biome-ignore lint/security/noSecrets: Typed route template, not a secret.
                                to: "/groups/events/$groupEventId",
                                params: { groupEventId: event.id },
                              })
                            }
                          />
                        ))}
                      </div>
                      {events.hasNextPage ? (
                        <Button
                          disabled={events.isFetchingNextPage}
                          onClick={() => void events.fetchNextPage()}
                          type="button"
                          variant="outline"
                        >
                          {events.isFetchingNextPage ? "Loading more events…" : "Load more events"}
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">{emptyEventMessage}</p>
                  )}
                </QueryState>
              </section>
            ) : (
              <p className="text-muted-foreground">Join this group to view its events.</p>
            )}
          </>
        ) : null}
      </QueryState>
    </main>
  );
}
