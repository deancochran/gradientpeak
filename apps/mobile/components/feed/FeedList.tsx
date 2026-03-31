import { Skeleton } from "@repo/ui/components/skeleton";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { api } from "@/lib/api";
import { ActivityFeedItem, FeedActivityItem } from "./ActivityFeedItem";
import { FeedEmptyState } from "./FeedEmptyState";

interface FeedListProps {
  onCommentPress?: (activityId: string) => void;
}

export function FeedList({ onCommentPress }: FeedListProps) {
  const [refreshing, setRefreshing] = useState(false);

  const {
    data,
    isLoading,
    isLoadingError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = api.feed.getFeed.useInfiniteQuery(
    { limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleLikeToggle = useCallback((activityId: string, liked: boolean) => {
    // The mutation handles optimistic updates, but we could also update the cache here if needed
  }, []);

  // Flatten pages into single array
  const feedItems = data?.pages.flatMap((page) => page.items) ?? [];

  const renderItem = useCallback(
    ({ item }: { item: FeedActivityItem }) => (
      <ActivityFeedItem
        activity={item}
        onLikeToggle={handleLikeToggle}
        onCommentPress={onCommentPress}
      />
    ),
    [handleLikeToggle, onCommentPress],
  );

  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View className="py-4 px-4">
        <Skeleton className="h-32 w-full" />
      </View>
    );
  }, [isFetchingNextPage]);

  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View className="p-4">
          <Skeleton className="h-48 w-full mb-4" />
          <Skeleton className="h-48 w-full mb-4" />
          <Skeleton className="h-48 w-full" />
        </View>
      );
    }

    if (isLoadingError) {
      return (
        <View className="p-8 items-center justify-center">
          <Text className="text-lg text-red-500 text-center">Failed to load feed</Text>
          <Text className="text-sm text-muted-foreground text-center mt-2">
            Please try again later
          </Text>
        </View>
      );
    }

    return <FeedEmptyState />;
  }, [isLoading, isLoadingError]);

  const keyExtractor = useCallback((item: FeedActivityItem) => item.id, []);

  return (
    <FlatList
      data={feedItems}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerClassName="flex-grow"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={renderFooter}
      ListEmptyComponent={renderEmpty}
    />
  );
}
