import { Text } from "@repo/ui/components/text";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { ResourceList } from "@/components/shared/ResourceList";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { FeedEmptyState } from "./FeedEmptyState";
import { useFeedListController } from "./useFeedListController";

interface FeedListProps {
  onCommentPress?: (activityId: string) => void;
}

export function FeedList({ onCommentPress }: FeedListProps) {
  const navigateTo = useAppNavigate();
  const {
    hasNextPage,
    handleLoadMore,
    handleRefresh,
    feedItems,
    isFetchingNextPage,
    isLoading,
    isLoadingError,
    isRetrying,
    refreshing,
  } = useFeedListController();

  return (
    <ResourceList
      contentContainerClassName="gap-3 p-4 pb-6"
      data={feedItems}
      emptyComponent={<FeedEmptyState />}
      errorTitle="Failed to load feed"
      hasNextPage={hasNextPage}
      isError={isLoadingError}
      isFetchingNextPage={isFetchingNextPage}
      isLoading={isLoading}
      isRetrying={isRetrying}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <>
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Latest activity
          </Text>
          <Text className="text-sm text-muted-foreground">
            Catch up on the athletes you follow.
          </Text>
        </>
      }
      loadingSkeletonCount={3}
      onLoadMore={handleLoadMore}
      onRefresh={handleRefresh}
      onRetry={handleRefresh}
      refreshing={refreshing}
      renderItem={(item) => (
        <ActivityCard
          activity={item}
          dateMode="absolute"
          onCommentPress={() =>
            onCommentPress ? onCommentPress(item.id) : navigateTo(`/activity-detail?id=${item.id}`)
          }
          onPress={() => navigateTo(`/activity-detail?id=${item.id}`)}
        />
      )}
    />
  );
}
