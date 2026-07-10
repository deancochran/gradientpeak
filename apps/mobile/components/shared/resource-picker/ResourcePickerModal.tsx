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

type ResourcePickerModalProps = {
  description?: string;
  footerAction?: ReactNode;
  onClose: () => void;
  onSelect: (item: ResourcePickerItem) => void;
  scope: ResourcePickerScope;
  selectedId?: string | null;
  selectedIds?: string[];
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
  description,
  footerAction,
  onClose,
  onSelect,
  scope,
  selectedId,
  selectedIds,
  title,
  visible,
}: ResourcePickerModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
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
      includeEstimation: true,
      includeSystemTemplates: true,
      limit: PAGE_SIZE,
      ownerScope: "all",
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
  const items = useMemo<ResourcePickerItem[]>(() => {
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

  if (!visible) return null;

  return (
    <AppFormModal
      description={description ?? getDefaultDescription(scope)}
      footerContent={footerAction ? <View className="gap-2">{footerAction}</View> : undefined}
      onClose={onClose}
      scrollProps={{ contentContainerClassName: "gap-3 p-4" }}
      title={title}
    >
      <View className="gap-2">
        <SearchField
          accessibilityLabel={getPlaceholder(scope)}
          onChangeText={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder={getPlaceholder(scope)}
          value={searchQuery}
        />
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs text-muted-foreground">
            {items.length} {scope === "routes" ? "routes" : "activity plans"} available
          </Text>
          <InlineLoadingStatus loading={isUpdatingItems} label="Updating..." />
        </View>
      </View>

      {query.isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title={getEmptyLabel(scope, hasSearch)} />
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
