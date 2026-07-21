import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  GroupCard,
  MutationError,
  QueryState,
  type WebGroupSummary,
} from "../../../components/groups/group-ui";
import { api } from "../../../lib/api/client";

export const Route = createFileRoute("/_protected/groups/")({ component: GroupsLibraryPage });

type LibraryTab = "upcoming" | "joined" | "owned" | "discover" | "invitations" | "requests";

const tabs: Array<[LibraryTab, string]> = [
  ["upcoming", "Upcoming events"],
  ["joined", "Joined"],
  ["owned", "Owned"],
  ["discover", "Discover"],
  ["invitations", "Invitations"],
  ["requests", "Requests"],
];

function GroupsLibraryPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const [tab, setTab] = useState<LibraryTab>("upcoming");
  const [search, setSearch] = useState("");
  const mine = api.groups.myGroups.useInfiniteQuery(
    { limit: 30 },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const discover = api.groups.listDiscoverable.useInfiniteQuery(
    { limit: 30, search: search.trim() || undefined },
    { enabled: tab === "discover", getNextPageParam: (page) => page.nextCursor },
  );
  const invitations = api.groups.myInvitations.useInfiniteQuery(
    { limit: 30 },
    { enabled: tab === "invitations", getNextPageParam: (page) => page.nextCursor },
  );
  const requests = api.groups.myJoinRequests.useInfiniteQuery(
    { limit: 30 },
    { enabled: tab === "requests", getNextPageParam: (page) => page.nextCursor },
  );
  const upcoming = api.groups.events.myUpcomingGroupEvents.useInfiniteQuery(
    { limit: 30, startsAfter: new Date().toISOString() },
    { enabled: tab === "upcoming", getNextPageParam: (page) => page.nextCursor },
  );
  const joinMutation = api.groups.joinOrRequest.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const acceptMutation = api.groups.acceptInvite.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const declineMutation = api.groups.declineInvite.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const cancelRequestMutation = api.groups.cancelJoinRequest.useMutation({
    onSuccess: () => utils.groups.invalidate(),
  });
  const mutationError =
    joinMutation.error ??
    acceptMutation.error ??
    declineMutation.error ??
    cancelRequestMutation.error;
  const myGroups = (mine.data?.pages.flatMap((page) => page.items) ?? []) as WebGroupSummary[];
  const visibleMine = myGroups.filter((group) =>
    tab === "owned"
      ? group.viewerMembershipRole === "owner"
      : group.viewerMembershipRole !== "owner",
  );

  const openGroup = (groupId: string) =>
    void navigate({ to: "/groups/$groupId", params: { groupId } });

  return (
    <main className="container mx-auto max-w-6xl space-y-6 py-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Groups</h1>
          <p className="text-sm text-muted-foreground">
            Train together, manage memberships, and coordinate group events.
          </p>
        </div>
        <Button onClick={() => void navigate({ to: "/groups/new" })} type="button">
          Create group
        </Button>
      </header>
      <div aria-label="Group library sections" className="flex flex-wrap gap-2" role="tablist">
        {tabs.map(([value, label]) => (
          <Button
            aria-selected={tab === value}
            key={value}
            onClick={() => setTab(value)}
            role="tab"
            type="button"
            variant={tab === value ? "default" : "outline"}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === "discover" ? (
        <Input
          aria-label="Search groups"
          placeholder="Search groups"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}
      <MutationError error={mutationError} />

      {tab === "joined" || tab === "owned" ? (
        <QueryState
          error={mine.error}
          isLoading={mine.isLoading}
          onRetry={() => void mine.refetch()}
        >
          <GroupGrid groups={visibleMine} onOpen={openGroup} />
          <LoadMore query={mine} />
        </QueryState>
      ) : null}
      {tab === "discover" ? (
        <QueryState
          error={discover.error}
          isLoading={discover.isLoading}
          onRetry={() => void discover.refetch()}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(discover.data?.pages.flatMap((page) => page.items) ?? []).map((group) => (
              <div className="space-y-2" key={group.id}>
                <GroupCard group={group as WebGroupSummary} onOpen={() => openGroup(group.id)} />
                {group.viewer.canJoin || group.viewer.canRequestToJoin ? (
                  <Button
                    disabled={joinMutation.isPending}
                    onClick={() => joinMutation.mutate({ groupId: group.id })}
                    type="button"
                    variant="secondary"
                  >
                    {group.viewer.canJoin ? "Join group" : "Request access"}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          <LoadMore query={discover} />
        </QueryState>
      ) : null}
      {tab === "invitations" ? (
        <QueryState
          error={invitations.error}
          isLoading={invitations.isLoading}
          onRetry={() => void invitations.refetch()}
        >
          <div className="space-y-3">
            {(invitations.data?.pages.flatMap((page) => page.items) ?? []).map((invitation) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                key={invitation.id}
              >
                <button
                  className="font-semibold hover:underline"
                  onClick={() => openGroup(invitation.group.id)}
                  type="button"
                >
                  {invitation.group.name}
                </button>
                <div className="flex gap-2">
                  <Button
                    disabled={acceptMutation.isPending}
                    onClick={() =>
                      acceptMutation.mutate(
                        { invitationId: invitation.id },
                        { onSuccess: () => toast.success("Invitation accepted") },
                      )
                    }
                    type="button"
                  >
                    Accept
                  </Button>
                  <Button
                    disabled={declineMutation.isPending}
                    onClick={() => declineMutation.mutate({ invitationId: invitation.id })}
                    type="button"
                    variant="outline"
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <LoadMore query={invitations} />
        </QueryState>
      ) : null}
      {tab === "requests" ? (
        <QueryState
          error={requests.error}
          isLoading={requests.isLoading}
          onRetry={() => void requests.refetch()}
        >
          <div className="space-y-3">
            {(requests.data?.pages.flatMap((page) => page.items) ?? []).map((request) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                key={request.id}
              >
                <button
                  className="font-semibold hover:underline"
                  onClick={() => openGroup(request.group.id)}
                  type="button"
                >
                  {request.group.name}
                </button>
                <Button
                  disabled={cancelRequestMutation.isPending}
                  onClick={() => cancelRequestMutation.mutate({ requestId: request.id })}
                  type="button"
                  variant="outline"
                >
                  Cancel request
                </Button>
              </div>
            ))}
          </div>
          <LoadMore query={requests} />
        </QueryState>
      ) : null}
      {tab === "upcoming" ? (
        <QueryState
          error={upcoming.error}
          isLoading={upcoming.isLoading}
          onRetry={() => void upcoming.refetch()}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {(upcoming.data?.pages.flatMap((page) => page.items) ?? []).map((event) => (
              <article className="space-y-2 rounded-xl border p-4" key={event.id}>
                <p className="text-sm text-muted-foreground">{event.group?.name}</p>
                <h2 className="text-lg font-semibold">{event.title}</h2>
                <p>{new Date(event.starts_at).toLocaleString()}</p>
                <Button
                  onClick={() =>
                    void navigate({
                      to: "/groups/events/$groupEventId",
                      params: { groupEventId: event.id },
                    })
                  }
                  type="button"
                  variant="outline"
                >
                  View event
                </Button>
              </article>
            ))}
          </div>
          <LoadMore query={upcoming} />
        </QueryState>
      ) : null}
    </main>
  );
}

function GroupGrid({
  groups,
  onOpen,
}: {
  groups: WebGroupSummary[];
  onOpen: (id: string) => void;
}) {
  if (groups.length === 0)
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        No groups in this section.
      </p>
    );
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <GroupCard group={group} key={group.id} onOpen={() => onOpen(group.id)} />
      ))}
    </div>
  );
}

function LoadMore({
  query,
}: {
  query: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
  };
}) {
  return query.hasNextPage ? (
    <Button
      disabled={query.isFetchingNextPage}
      onClick={() => void query.fetchNextPage()}
      type="button"
      variant="outline"
    >
      {query.isFetchingNextPage ? "Loading…" : "Load more"}
    </Button>
  ) : null;
}
