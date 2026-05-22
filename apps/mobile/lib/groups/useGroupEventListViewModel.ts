import { useMemo } from "react";
import { api } from "@/lib/api";

const GROUP_EVENT_PAGE_SIZE = 20;

type UseGroupEventListViewModelOptions = {
  enabled?: boolean;
  groupId: string | null | undefined;
  includeCancelled?: boolean;
  limit?: number;
  startsAfter?: string;
  startsBefore?: string;
};

export function useGroupEventListViewModel({
  enabled = true,
  groupId,
  includeCancelled = false,
  limit = GROUP_EVENT_PAGE_SIZE,
  startsAfter,
  startsBefore,
}: UseGroupEventListViewModelOptions) {
  const eventsQuery = api.groups.events.list.useInfiniteQuery(
    {
      groupId: groupId ?? "",
      includeCancelled,
      limit,
      startsAfter,
      startsBefore,
    },
    {
      enabled: enabled && Boolean(groupId),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [eventsQuery.data],
  );

  return {
    events,
    eventsQuery,
    hasNextPage: Boolean(eventsQuery.hasNextPage),
    isError: eventsQuery.isError,
    isFetchingNextPage: eventsQuery.isFetchingNextPage,
    isLoading: eventsQuery.isLoading,
    refetch: eventsQuery.refetch,
  };
}

type UseMyUpcomingGroupEventsViewModelOptions = Omit<UseGroupEventListViewModelOptions, "groupId">;

export function useMyUpcomingGroupEventsViewModel({
  enabled = true,
  includeCancelled = false,
  limit = GROUP_EVENT_PAGE_SIZE,
  startsAfter,
  startsBefore,
}: UseMyUpcomingGroupEventsViewModelOptions = {}) {
  const eventsQuery = api.groups.events.myUpcomingGroupEvents.useInfiniteQuery(
    {
      includeCancelled,
      limit,
      startsAfter,
      startsBefore,
    },
    {
      enabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [eventsQuery.data],
  );

  return {
    events,
    eventsQuery,
    hasNextPage: Boolean(eventsQuery.hasNextPage),
    isError: eventsQuery.isError,
    isFetching: eventsQuery.isFetching,
    isFetchingNextPage: eventsQuery.isFetchingNextPage,
    isLoading: eventsQuery.isLoading,
    fetchNextPage: eventsQuery.fetchNextPage,
    refetch: eventsQuery.refetch,
  };
}
