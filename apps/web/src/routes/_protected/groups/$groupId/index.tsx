import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader } from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
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
  const detail = api.groups.detail.useQuery({ groupId });
  const viewer = detail.data?.viewer;
  const events = api.groups.events.list.useInfiniteQuery(
    { groupId, limit: 20, startsAfter: new Date().toISOString() },
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
  const eventItems = events.data?.pages.flatMap((page) => page.items) ?? [];

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
                <h2 className="text-2xl font-semibold" id="group-events-heading">
                  Upcoming events
                </h2>
                <QueryState
                  error={events.error}
                  isLoading={events.isLoading}
                  onRetry={() => void events.refetch()}
                >
                  {eventItems.length ? (
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
                  ) : (
                    <p className="text-muted-foreground">No upcoming events.</p>
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
