import type { ReactElement } from "react";
import { ResourceList } from "@/components/shared/ResourceList";
import type { GroupEventListItem } from "@/lib/groups";
import { GroupEventCard } from "./GroupEventCards";
import { GroupEventEmptyState, GroupEventListSkeleton } from "./GroupEventStates";

type GroupEventListProps = {
  contentContainerClassName?: string;
  emptyComponent?: ReactElement | null;
  events: GroupEventListItem[];
  hasNextPage?: boolean;
  isError?: boolean;
  isFetchingNextPage?: boolean;
  isLoading?: boolean;
  ListHeaderComponent?: ReactElement | null;
  onEventPress?: (event: GroupEventListItem) => void;
  onGroupPress?: (group: NonNullable<GroupEventListItem["group"]>) => void;
  onLoadMore?: () => void;
  onRefresh?: () => Promise<unknown> | undefined;
  refreshing?: boolean;
};

export function GroupEventList({
  contentContainerClassName,
  emptyComponent,
  events,
  hasNextPage = false,
  isError = false,
  isFetchingNextPage = false,
  isLoading = false,
  ListHeaderComponent,
  onEventPress,
  onGroupPress,
  onLoadMore,
  onRefresh,
  refreshing = false,
}: GroupEventListProps) {
  return (
    <ResourceList
      contentContainerClassName={contentContainerClassName}
      data={events}
      emptyComponent={emptyComponent ?? <GroupEventEmptyState />}
      errorDescription="Pull to refresh or try again later."
      errorTitle="Unable to load group events"
      hasNextPage={hasNextPage}
      isError={isError}
      isFetchingNextPage={isFetchingNextPage}
      isLoading={isLoading}
      keyExtractor={(item) => item.id}
      loadingComponent={<GroupEventListSkeleton />}
      loadingMoreLabel="Loading more events..."
      ListHeaderComponent={ListHeaderComponent}
      onLoadMore={onLoadMore}
      onRefresh={onRefresh}
      refreshing={refreshing}
      renderItem={(event) => (
        <GroupEventCard event={event} onGroupPress={onGroupPress} onPress={onEventPress} />
      )}
      testID="group-event-list"
    />
  );
}
