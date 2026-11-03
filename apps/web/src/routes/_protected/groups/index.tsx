import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  GroupCard,
  MutationError,
  QueryState,
  type WebGroupSummary,
} from "../../../components/groups/group-ui";
import { api } from "../../../lib/api/client";
import { loadRouteQuery } from "../../../lib/api/route-loading";
import {
  createDiscoverableGroupsInput,
  createMyGroupsInput,
  createMyInvitationsInput,
  createMyJoinRequestsInput,
  createUpcomingGroupEventsInput,
  type GroupLibraryTab,
  getInfiniteQueryPageCount,
  isGroupLibraryTab,
} from "../../../lib/groups-query-inputs";
import { GROUP_SEARCH_MAX_LENGTH, normalizeGroupSearch } from "../../../lib/groups-search";

type LibraryTab = GroupLibraryTab;

const tabs: Array<[LibraryTab, string]> = [
  ["upcoming", "Upcoming events"],
  ["joined", "Joined"],
  ["owned", "Owned"],
  ["discover", "Discover"],
  ["invitations", "Invitations"],
  ["requests", "Requests"],
];

export const Route = createFileRoute("/_protected/groups/")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: normalizeGroupSearch(search.q),
    tab: isGroupLibraryTab(search.tab) ? search.tab : undefined,
  }),
  loaderDeps: ({ search }) => ({
    q: search.q,
    tab: search.tab ?? "upcoming",
  }),
  loader: async ({ context, deps }) => {
    const upcomingWindowStart = new Date().toISOString();
    if (deps.tab === "discover") {
      const input = createDiscoverableGroupsInput(deps.q);
      const getCached = () => context.apiUtils.groups.listDiscoverable.getInfiniteData(input);
      await loadRouteQuery(getCached, () =>
        context.apiUtils.groups.listDiscoverable.fetchInfinite(input, {
          pages: getInfiniteQueryPageCount(getCached()),
          getNextPageParam: (page) => page.nextCursor,
        }),
      );
    } else if (deps.tab === "joined" || deps.tab === "owned") {
      const input = createMyGroupsInput();
      const getCached = () => context.apiUtils.groups.myGroups.getInfiniteData(input);
      await loadRouteQuery(getCached, () =>
        context.apiUtils.groups.myGroups.fetchInfinite(input, {
          pages: getInfiniteQueryPageCount(getCached()),
          getNextPageParam: (page) => page.nextCursor,
        }),
      );
    } else if (deps.tab === "invitations") {
      const input = createMyInvitationsInput();
      const getCached = () => context.apiUtils.groups.myInvitations.getInfiniteData(input);
      await loadRouteQuery(getCached, () =>
        context.apiUtils.groups.myInvitations.fetchInfinite(input, {
          pages: getInfiniteQueryPageCount(getCached()),
          getNextPageParam: (page) => page.nextCursor,
        }),
      );
    } else if (deps.tab === "requests") {
      const input = createMyJoinRequestsInput();
      const getCached = () => context.apiUtils.groups.myJoinRequests.getInfiniteData(input);
      await loadRouteQuery(getCached, () =>
        context.apiUtils.groups.myJoinRequests.fetchInfinite(input, {
          pages: getInfiniteQueryPageCount(getCached()),
          getNextPageParam: (page) => page.nextCursor,
        }),
      );
    } else {
      const input = createUpcomingGroupEventsInput(upcomingWindowStart);
      const getCached = () =>
        context.apiUtils.groups.events.myUpcomingGroupEvents.getInfiniteData(input);
      await loadRouteQuery(getCached, () =>
        context.apiUtils.groups.events.myUpcomingGroupEvents.fetchInfinite(input, {
          pages: getInfiniteQueryPageCount(getCached()),
          getNextPageParam: (page) => page.nextCursor,
        }),
      );
    }
    return { upcomingWindowStart };
  },
  component: GroupsLibraryPage,
});

function GroupsLibraryPage() {
  const navigate = Route.useNavigate();
  const utils = api.useUtils();
  const { q: search, tab: selectedTab } = Route.useSearch();
  const tab = selectedTab ?? "upcoming";
  const [searchDraft, setSearchDraft] = useState(search ?? "");
  const { upcomingWindowStart } = Route.useLoaderData();

  useEffect(() => {
    setSearchDraft(search ?? "");
  }, [search]);

  useEffect(() => {
    if (tab !== "discover" || searchDraft === (search ?? "")) return;

    const timeout = window.setTimeout(() => {
      void navigate({
        replace: true,
        search: (previous) => ({ ...previous, q: normalizeGroupSearch(searchDraft) }),
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [navigate, search, searchDraft, tab]);
  const mine = api.groups.myGroups.useInfiniteQuery(createMyGroupsInput(), {
    getNextPageParam: (page) => page.nextCursor,
  });
  const discover = api.groups.listDiscoverable.useInfiniteQuery(
    createDiscoverableGroupsInput(search),
    { enabled: tab === "discover", getNextPageParam: (page) => page.nextCursor },
  );
  const invitations = api.groups.myInvitations.useInfiniteQuery(createMyInvitationsInput(), {
    enabled: tab === "invitations",
    getNextPageParam: (page) => page.nextCursor,
  });
  const requests = api.groups.myJoinRequests.useInfiniteQuery(createMyJoinRequestsInput(), {
    enabled: tab === "requests",
    getNextPageParam: (page) => page.nextCursor,
  });
  const upcoming = api.groups.events.myUpcomingGroupEvents.useInfiniteQuery(
    createUpcomingGroupEventsInput(upcomingWindowStart),
    { enabled: tab === "upcoming", getNextPageParam: (page) => page.nextCursor, retry: 2 },
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
            onClick={() => void navigate({ search: (previous) => ({ ...previous, tab: value }) })}
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
          maxLength={GROUP_SEARCH_MAX_LENGTH}
          placeholder="Search groups"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
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
          {(invitations.data?.pages.flatMap((page) => page.items) ?? []).length ? (
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
          ) : (
            <EmptyGroupList message="No pending invitations." />
          )}
          <LoadMore query={invitations} />
        </QueryState>
      ) : null}
      {tab === "requests" ? (
        <QueryState
          error={requests.error}
          isLoading={requests.isLoading}
          onRetry={() => void requests.refetch()}
        >
          {(requests.data?.pages.flatMap((page) => page.items) ?? []).length ? (
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
          ) : (
            <EmptyGroupList message="No pending access requests." />
          )}
          <LoadMore query={requests} />
        </QueryState>
      ) : null}
      {tab === "upcoming" ? (
        <QueryState
          error={upcoming.error}
          isLoading={upcoming.isLoading}
          onRetry={() => void upcoming.refetch()}
        >
          {(upcoming.data?.pages.flatMap((page) => page.items) ?? []).length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {(upcoming.data?.pages.flatMap((page) => page.items) ?? []).map((event) => (
                <article className="space-y-2 rounded-xl border p-4" key={event.id}>
                  <p className="text-sm text-muted-foreground">{event.group?.name}</p>
                  <h2 className="text-lg font-semibold">{event.title}</h2>
                  <p>{new Date(event.starts_at).toLocaleString()}</p>
                  <Button
                    onClick={() =>
                      void navigate({
                        // biome-ignore lint/security/noSecrets: Typed route template, not a secret.
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
          ) : (
            <EmptyGroupList message="No upcoming group events. Join a group or create an event to plan your next session together." />
          )}
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

function EmptyGroupList({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
      {message}
    </p>
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
