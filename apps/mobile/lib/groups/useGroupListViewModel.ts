import { useMemo } from "react";
import { api } from "@/lib/api";
import type { GroupListItem, MyGroupInvitation } from "./types";

const GROUP_LIST_PAGE_SIZE = 20;

type UseGroupListViewModelOptions = {
  kind?: "discoverable" | "mine" | "invitations";
  search?: string;
};

export function useGroupListViewModel({
  kind = "discoverable",
  search,
}: UseGroupListViewModelOptions = {}) {
  const discoverableQuery = api.groups.listDiscoverable.useInfiniteQuery(
    { limit: GROUP_LIST_PAGE_SIZE, search: search?.trim() || undefined },
    {
      enabled: kind === "discoverable",
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const myGroupsQuery = api.groups.myGroups.useInfiniteQuery(
    { limit: GROUP_LIST_PAGE_SIZE, search: search?.trim() || undefined },
    {
      enabled: kind === "mine",
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const invitationsQuery = api.groups.myInvitations.useInfiniteQuery(
    { limit: GROUP_LIST_PAGE_SIZE, search: search?.trim() || undefined },
    {
      enabled: kind === "invitations",
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const activeQuery =
    kind === "mine" ? myGroupsQuery : kind === "invitations" ? invitationsQuery : discoverableQuery;

  const groups = useMemo<GroupListItem[]>(() => {
    if (kind === "invitations") {
      return (
        invitationsQuery.data?.pages.flatMap((page) =>
          page.items.map((invitation) => invitation.group),
        ) ?? []
      );
    }

    return activeQuery.data?.pages.flatMap((page) => page.items as GroupListItem[]) ?? [];
  }, [activeQuery.data, invitationsQuery.data, kind]);

  const invitations = useMemo<MyGroupInvitation[]>(() => {
    return invitationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  }, [invitationsQuery.data]);

  return {
    groups,
    invitations,
    isLoading: activeQuery.isLoading,
    isFetching: activeQuery.isFetching,
    isError: activeQuery.isError,
    error: activeQuery.error,
    hasNextPage: activeQuery.hasNextPage,
    isFetchingNextPage: activeQuery.isFetchingNextPage,
    fetchNextPage: activeQuery.fetchNextPage,
    refetch: activeQuery.refetch,
  };
}
