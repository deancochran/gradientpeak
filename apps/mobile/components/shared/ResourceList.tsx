import { ListSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import type { ReactElement } from "react";
import { FlatList, RefreshControl, View } from "react-native";

type ResourceListProps<TItem> = {
  contentContainerClassName?: string;
  data: TItem[];
  emptyComponent?: ReactElement | null;
  emptyDescription?: string;
  emptyTitle?: string;
  errorDescription?: string;
  errorTitle?: string;
  hasNextPage?: boolean;
  isError?: boolean;
  isFetchingNextPage?: boolean;
  isLoading?: boolean;
  keyExtractor: (item: TItem, index: number) => string;
  ListHeaderComponent?: ReactElement | null;
  loadingComponent?: ReactElement | null;
  loadingSkeletonCount?: number;
  loadingMoreLabel?: string;
  onLoadMore?: () => void;
  onRefresh?: () => Promise<unknown> | undefined;
  renderItem: (item: TItem, index: number) => ReactElement | null;
  refreshing?: boolean;
  showsVerticalScrollIndicator?: boolean;
  testID?: string;
};

function DefaultEmptyState({ description, title }: { description?: string; title?: string }) {
  return (
    <View className="items-center justify-center px-6 py-12">
      <Text className="text-center text-lg font-medium text-foreground">
        {title ?? "Nothing here yet"}
      </Text>
      {description ? (
        <Text className="mt-2 text-center text-sm text-muted-foreground">{description}</Text>
      ) : null}
    </View>
  );
}

function DefaultErrorState({ description, title }: { description?: string; title?: string }) {
  return (
    <View className="items-center justify-center px-6 py-12">
      <Text className="text-center text-lg font-medium text-destructive">
        {title ?? "Unable to load"}
      </Text>
      <Text className="mt-2 text-center text-sm text-muted-foreground">
        {description ?? "Please try again later."}
      </Text>
    </View>
  );
}

export function ResourceList<TItem>({
  contentContainerClassName = "gap-4 p-4 pb-6",
  data,
  emptyComponent,
  emptyDescription,
  emptyTitle,
  errorDescription,
  errorTitle,
  hasNextPage = false,
  isError = false,
  isFetchingNextPage = false,
  isLoading = false,
  keyExtractor,
  ListHeaderComponent,
  loadingComponent,
  loadingMoreLabel = "Loading more...",
  loadingSkeletonCount = 6,
  onLoadMore,
  onRefresh,
  refreshing = false,
  renderItem,
  showsVerticalScrollIndicator = false,
  testID,
}: ResourceListProps<TItem>) {
  const showInitialLoading = isLoading && data.length === 0;

  return (
    <FlatList
      contentContainerClassName={contentContainerClassName}
      data={showInitialLoading || isError ? [] : data}
      keyExtractor={keyExtractor}
      ListEmptyComponent={
        showInitialLoading ? (
          (loadingComponent ?? <ListSkeleton count={loadingSkeletonCount} />)
        ) : isError ? (
          <DefaultErrorState description={errorDescription} title={errorTitle} />
        ) : (
          (emptyComponent ?? (
            <DefaultEmptyState description={emptyDescription} title={emptyTitle} />
          ))
        )
      }
      ListFooterComponent={
        isFetchingNextPage ? (
          <View className="items-center py-4">
            <Text className="text-xs text-muted-foreground">{loadingMoreLabel}</Text>
          </View>
        ) : null
      }
      ListHeaderComponent={ListHeaderComponent}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          onLoadMore?.();
        }
      }}
      onEndReachedThreshold={0.5}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      renderItem={({ item, index }) => renderItem(item, index)}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      testID={testID}
    />
  );
}
