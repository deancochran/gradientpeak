import { LoadingButton } from "@repo/ui/components/loading";
import { ListSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { type ReactElement, useRef, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

type ResourceListProps<TItem> = {
  contentContainerClassName?: string;
  data: TItem[];
  emptyComponent?: ReactElement | null;
  emptyDescription?: string;
  filteredEmptyDescription?: string;
  filteredEmptyTitle?: string;
  emptyTitle?: string;
  errorDescription?: string;
  errorTitle?: string;
  hasNextPage?: boolean;
  isError?: boolean;
  isFetchingNextPage?: boolean;
  isLoading?: boolean;
  isEmptyFiltered?: boolean;
  isRetrying?: boolean;
  keyExtractor: (item: TItem, index: number) => string;
  ListHeaderComponent?: ReactElement | null;
  loadingComponent?: ReactElement | null;
  loadingSkeletonCount?: number;
  loadingMoreLabel?: string;
  onLoadMore?: () => void;
  onRefresh?: () => Promise<unknown> | undefined;
  onRetry?: () => Promise<unknown> | unknown;
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

export function DefaultErrorState({
  description,
  isRetrying = false,
  onRetry,
  title,
}: {
  description?: string;
  isRetrying?: boolean;
  onRetry?: () => Promise<unknown> | unknown;
  title?: string;
}) {
  return (
    <View className="items-center justify-center px-6 py-12">
      <Text className="text-center text-lg font-medium text-destructive">
        {title ?? "Unable to load"}
      </Text>
      <Text className="mt-2 text-center text-sm text-muted-foreground">
        {description ?? "Please try again later."}
      </Text>
      {onRetry ? (
        <RetryButton className="mt-4" isRetrying={isRetrying} label="Try again" onRetry={onRetry} />
      ) : null}
    </View>
  );
}

export function ResourceListErrorNotice({
  description,
  isRetrying = false,
  onRetry,
}: {
  description?: string;
  isRetrying?: boolean;
  onRetry?: () => Promise<unknown> | unknown;
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2"
    >
      <Text className="flex-1 text-sm text-destructive">
        {description ?? "Some results could not be refreshed."}
      </Text>
      {onRetry ? <RetryButton isRetrying={isRetrying} label="Retry" onRetry={onRetry} /> : null}
    </View>
  );
}

function RetryButton({
  className,
  isRetrying,
  label,
  onRetry,
}: {
  className?: string;
  isRetrying: boolean;
  label: string;
  onRetry: () => Promise<unknown> | unknown;
}) {
  const retryInFlight = useRef(false);
  const [isLocallyRetrying, setIsLocallyRetrying] = useState(false);
  const isPending = isRetrying || isLocallyRetrying;

  const handleRetry = () => {
    if (isPending || retryInFlight.current) return;

    retryInFlight.current = true;
    let result: unknown;
    try {
      result = onRetry();
    } catch {
      retryInFlight.current = false;
      return;
    }

    if (!isPromiseLike(result)) {
      retryInFlight.current = false;
      return;
    }

    setIsLocallyRetrying(true);
    void Promise.resolve(result)
      .catch(() => undefined)
      .finally(() => {
        retryInFlight.current = false;
        setIsLocallyRetrying(false);
      });
  };

  return (
    <LoadingButton
      loading={isPending}
      loadingLabel="Retrying"
      onPress={handleRetry}
      size="sm"
      variant="outline"
      {...(className === undefined ? {} : { className })}
    >
      {label}
    </LoadingButton>
  );
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

export function getResourceListMode({
  dataLength,
  isError,
  isLoading,
}: {
  dataLength: number;
  isError: boolean;
  isLoading: boolean;
}) {
  if (dataLength === 0 && isLoading) return "loading" as const;
  if (dataLength === 0 && isError) return "error" as const;
  if (dataLength === 0) return "empty" as const;
  return "data" as const;
}

export function ResourceList<TItem>({
  contentContainerClassName = "gap-4 p-4 pb-6",
  data,
  emptyComponent,
  emptyDescription,
  filteredEmptyDescription = "Try adjusting your search or filters.",
  filteredEmptyTitle = "No matching results",
  emptyTitle,
  errorDescription,
  errorTitle,
  hasNextPage = false,
  isError = false,
  isFetchingNextPage = false,
  isLoading = false,
  isEmptyFiltered = false,
  isRetrying = false,
  keyExtractor,
  ListHeaderComponent,
  loadingComponent,
  loadingMoreLabel = "Loading more...",
  loadingSkeletonCount = 6,
  onLoadMore,
  onRefresh,
  onRetry,
  refreshing = false,
  renderItem,
  showsVerticalScrollIndicator = false,
  testID,
}: ResourceListProps<TItem>) {
  const mode = getResourceListMode({ dataLength: data.length, isError, isLoading });
  const showInitialLoading = mode === "loading";
  const showInitialError = mode === "error";

  return (
    <FlatList
      contentContainerClassName={contentContainerClassName}
      data={showInitialLoading || showInitialError ? [] : data}
      keyExtractor={keyExtractor}
      ListEmptyComponent={
        showInitialLoading ? (
          (loadingComponent ?? <ListSkeleton count={loadingSkeletonCount} />)
        ) : showInitialError ? (
          <DefaultErrorState
            isRetrying={isRetrying}
            {...(errorDescription === undefined ? {} : { description: errorDescription })}
            {...(onRetry === undefined ? {} : { onRetry })}
            {...(errorTitle === undefined ? {} : { title: errorTitle })}
          />
        ) : isEmptyFiltered ? (
          <DefaultEmptyState description={filteredEmptyDescription} title={filteredEmptyTitle} />
        ) : (
          (emptyComponent ?? (
            <DefaultEmptyState
              {...(emptyDescription === undefined ? {} : { description: emptyDescription })}
              {...(emptyTitle === undefined ? {} : { title: emptyTitle })}
            />
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
      ListHeaderComponent={
        isError && data.length > 0 ? (
          <View className="gap-3">
            <ResourceListErrorNotice
              isRetrying={isRetrying}
              {...(errorDescription === undefined ? {} : { description: errorDescription })}
              {...(onRetry === undefined ? {} : { onRetry })}
            />
            {ListHeaderComponent}
          </View>
        ) : (
          ListHeaderComponent
        )
      }
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
