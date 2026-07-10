import { InlineLoadingStatus } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { keepPreviousData } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppFormModal } from "@/components/shared/AppFormModal";
import { EmptyState, LoadingState } from "@/components/shared/ScreenState";
import { SearchField } from "@/components/shared/SearchField";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import {
  mapActivityPlanToResourcePickerItem,
  mapRouteToResourcePickerItem,
  ResourcePickerResultRow,
} from "./ResourcePickerResultRow";
import type { ResourcePickerItem, ResourcePickerScope } from "./resourcePickerTypes";

type ActivityPlanQueryOptions = {
  includeEstimation?: boolean;
  includeSystemTemplates?: boolean;
  limit?: number;
  ownerScope?: "all" | "own";
};

export type ResourcePickerRenderContext = {
  allItems: ResourcePickerItem[];
  error: unknown;
  hasSearch: boolean;
  isLoading: boolean;
  items: ResourcePickerItem[];
  refetch: () => void;
};

type ResourcePickerModalProps = {
  activityPlanQueryOptions?: ActivityPlanQueryOptions;
  description?: string;
  filterItems?: (items: ResourcePickerItem[]) => ResourcePickerItem[];
  filterSlot?: (context: ResourcePickerRenderContext) => ReactNode;
  footerAction?: ReactNode;
  footerSlot?: ReactNode;
  onClose: () => void;
  onSearchQueryChange?: (query: string) => void;
  onSelect: (item: ResourcePickerItem) => void;
  recommendationSlot?: (context: ResourcePickerRenderContext) => ReactNode;
  searchQuery?: string;
  searchTestID?: string;
  scope: ResourcePickerScope;
  selectedId?: string | null;
  selectedIds?: string[];
  testID?: string;
  title: string;
  visible: boolean;
};

const PAGE_SIZE = 25;

function getDefaultDescription(scope: ResourcePickerScope) {
  return scope === "routes"
    ? "Search routes visible to your profile."
    : "Search activity plans visible to your profile.";
}

function getPlaceholder(scope: ResourcePickerScope) {
  return scope === "routes" ? "Search routes" : "Search activity plans";
}

function getEmptyLabel(scope: ResourcePickerScope, hasSearch: boolean) {
  if (hasSearch) {
    return scope === "routes"
      ? "No routes match that search."
      : "No activity plans match that search.";
  }
  return scope === "routes" ? "No visible routes found." : "No visible activity plans found.";
}

export function ResourcePickerModal({
  activityPlanQueryOptions,
  description,
  filterItems,
  filterSlot,
  footerAction,
  footerSlot,
  onClose,
  onSearchQueryChange,
  onSelect,
  recommendationSlot,
  searchQuery: controlledSearchQuery,
  searchTestID,
  scope,
  selectedId,
  selectedIds,
  testID,
  title,
  visible,
}: ResourcePickerModalProps) {
  const [uncontrolledSearchQuery, setUncontrolledSearchQuery] = useState("");
  const searchQuery = controlledSearchQuery ?? uncontrolledSearchQuery;
  const setSearchQuery = (query: string) => {
    if (controlledSearchQuery === undefined) {
      setUncontrolledSearchQuery(query);
    }
    onSearchQueryChange?.(query);
  };
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);
  const hasSearch = debouncedSearch.length > 0;

  const routeQuery = api.routes.list.useInfiniteQuery(
    {
      limit: PAGE_SIZE,
      ownerScope: "all",
      search: hasSearch ? debouncedSearch : undefined,
      sort_by: "newest",
    },
    {
      enabled: visible && scope === "routes",
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    },
  );

  const activityPlanQuery = api.activityPlans.list.useInfiniteQuery(
    {
      includeEstimation: activityPlanQueryOptions?.includeEstimation ?? true,
      includeSystemTemplates: activityPlanQueryOptions?.includeSystemTemplates ?? true,
      limit: activityPlanQueryOptions?.limit ?? PAGE_SIZE,
      ownerScope: activityPlanQueryOptions?.ownerScope ?? "all",
      search: hasSearch ? debouncedSearch : undefined,
    },
    {
      enabled: visible && scope === "activityPlans",
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    },
  );

  const query = scope === "routes" ? routeQuery : activityPlanQuery;
  const isUpdatingItems = query.isFetching && !query.isLoading && !query.isFetchingNextPage;
  const unfilteredItems = useMemo<ResourcePickerItem[]>(() => {
    if (scope === "routes") {
      return (
        routeQuery.data?.pages.flatMap((page) => page.items.map(mapRouteToResourcePickerItem)) ?? []
      );
    }

    return (
      activityPlanQuery.data?.pages.flatMap((page) =>
        (page.items ?? []).map(mapActivityPlanToResourcePickerItem),
      ) ?? []
    );
  }, [activityPlanQuery.data?.pages, routeQuery.data?.pages, scope]);
  const items = useMemo(
    () => (filterItems ? filterItems(unfilteredItems) : unfilteredItems),
    [filterItems, unfilteredItems],
  );
  const renderContext: ResourcePickerRenderContext = {
    allItems: unfilteredItems,
    error: query.error,
    hasSearch,
    isLoading: query.isLoading,
    items,
    refetch: () => void query.refetch(),
  };

  if (!visible) return null;

  return (
    <AppFormModal
      description={description ?? getDefaultDescription(scope)}
      footerContent={
        footerSlot ?? (footerAction ? <View className="gap-2">{footerAction}</View> : undefined)
      }
      onClose={onClose}
      scrollProps={{ contentContainerClassName: "gap-3 p-4" }}
      testID={testID}
      title={title}
    >
      <View className="gap-2">
        <SearchField
          accessibilityLabel={getPlaceholder(scope)}
          onChangeText={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder={getPlaceholder(scope)}
          testID={searchTestID}
          value={searchQuery}
        />
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs text-muted-foreground">
            {items.length} {scope === "routes" ? "routes" : "activity plans"} available
          </Text>
          <InlineLoadingStatus loading={isUpdatingItems} label="Updating..." />
        </View>
        {filterSlot?.(renderContext)}
      </View>

      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <View className="gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-4">
          <Text className="text-sm font-medium text-destructive">Could not load resources.</Text>
          <Pressable
            accessibilityRole="button"
            className="self-start rounded-md border border-border bg-background px-3 py-2"
            onPress={() => void query.refetch()}
          >
            <Text className="text-xs font-medium text-foreground">Try again</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <EmptyState title={getEmptyLabel(scope, hasSearch)} />
      ) : recommendationSlot ? (
        recommendationSlot(renderContext)
      ) : (
        <View className="gap-2">
          {items.map((item) => (
            <ResourcePickerResultRow
              key={item.id}
              isSelected={selectedIds ? selectedIds.includes(item.id) : item.id === selectedId}
              item={item}
              onPress={() => onSelect(item)}
              scope={scope}
            />
          ))}
        </View>
      )}

      {query.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 items-center justify-center rounded-md border border-border px-3 py-2"
          disabled={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        >
          <Text className="text-sm font-semibold text-foreground">
            {query.isFetchingNextPage ? "Loading more..." : "Load more"}
          </Text>
        </Pressable>
      ) : null}
    </AppFormModal>
  );
}
