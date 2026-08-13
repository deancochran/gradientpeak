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
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Feed
        </Text>
      }
      loadingSkeletonCount={3}
      onLoadMore={handleLoadMore}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      renderItem={(item) => (
        <ActivityCard
          activity={item}
          dateMode="absolute"
          onCommentPress={onCommentPress ? () => onCommentPress(item.id) : undefined}
          onPress={() => navigateTo(`/activity-detail?id=${item.id}`)}
          showLike
        />
      )}
    />
  );
}
