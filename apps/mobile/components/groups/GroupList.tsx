import type { ReactElement } from "react";
import { ResourceList } from "@/components/shared/ResourceList";
import type { DisplayGroupViewerState, GroupListItem } from "@/lib/groups";
import { GroupCard, GroupCompactCard } from "./GroupCards";
import { GroupEmptyState, GroupListSkeleton } from "./GroupStates";

type GroupListProps = {
  contentContainerClassName?: string;
  groups: GroupListItem[];
  emptyComponent?: ReactElement;
  hasNextPage?: boolean;
  isError?: boolean;
  isFetchingNextPage?: boolean;
  isLoading?: boolean;
  ListHeaderComponent?: ReactElement | null;
  onGroupPress?: (group: GroupListItem) => void;
  onLoadMore?: () => void;
  onRefresh?: () => Promise<unknown> | undefined;
  refreshing?: boolean;
  variant?: "default" | "compact";
  viewerByGroupId?: Record<string, DisplayGroupViewerState | null | undefined>;
};

export function GroupList({
  contentContainerClassName,
  emptyComponent,
  groups,
  hasNextPage = false,
  isError = false,
  isFetchingNextPage = false,
  isLoading = false,
  ListHeaderComponent,
  onGroupPress,
  onLoadMore,
  onRefresh,
  refreshing = false,
  variant = "default",
  viewerByGroupId,
}: GroupListProps) {
  const CardComponent = variant === "compact" ? GroupCompactCard : GroupCard;

  return (
    <ResourceList
      contentContainerClassName={contentContainerClassName}
      data={groups}
      emptyComponent={emptyComponent ?? <GroupEmptyState />}
      errorDescription="Pull to refresh or try again later."
      errorTitle="Unable to load groups"
      hasNextPage={hasNextPage}
      isError={isError}
      isFetchingNextPage={isFetchingNextPage}
      isLoading={isLoading}
      keyExtractor={(item) => item.id}
      loadingComponent={<GroupListSkeleton />}
      loadingMoreLabel="Loading more groups..."
      ListHeaderComponent={ListHeaderComponent}
      onLoadMore={onLoadMore}
      onRefresh={onRefresh}
      refreshing={refreshing}
      renderItem={(group) => (
        <CardComponent
          group={group}
          onPress={onGroupPress}
          viewer={viewerByGroupId?.[group.id] ?? null}
        />
      )}
      testID="group-list"
    />
  );
}
