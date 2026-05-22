import { useCallback, useState } from "react";
import { api } from "@/lib/api";

export function useFeedListController() {
  const [refreshing, setRefreshing] = useState(false);
  const feedQuery = api.feed.getFeed.useInfiniteQuery(
    { limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );

  const feedItems = feedQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await feedQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [feedQuery.refetch]);

  const handleLoadMore = useCallback(() => {
    if (!feedQuery.hasNextPage || feedQuery.isFetchingNextPage) {
      return;
    }

    void feedQuery.fetchNextPage();
  }, [feedQuery.fetchNextPage, feedQuery.hasNextPage, feedQuery.isFetchingNextPage]);

  return {
    feedItems,
    handleLoadMore,
    handleRefresh,
    hasNextPage: feedQuery.hasNextPage,
    isFetchingNextPage: feedQuery.isFetchingNextPage,
    isLoading: feedQuery.isLoading,
    isLoadingError: feedQuery.isLoadingError,
    refreshing,
  };
}
