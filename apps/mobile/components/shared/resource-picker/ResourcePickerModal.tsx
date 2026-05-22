import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { Search } from "lucide-react-native";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppFormModal } from "@/components/shared/AppFormModal";
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
      getNextPageParam: (lastPage: any) => lastPage.nextCursor,
    },
  );

  const query = scope === "routes" ? routeQuery : activityPlanQuery;
  const items = useMemo<ResourcePickerItem[]>(() => {
    if (scope === "routes") {
      return (
        routeQuery.data?.pages.flatMap((page) => page.items.map(mapRouteToResourcePickerItem)) ?? []
      );
    }

    return (
      activityPlanQuery.data?.pages.flatMap((page: any) =>
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
        <View className="relative">
          <View className="absolute left-3 top-3 z-10">
            <Icon as={Search} size={18} className="text-muted-foreground" />
          </View>
          <Input
            accessibilityLabel={getPlaceholder(scope)}
            onChangeText={setSearchQuery}
            placeholder={getPlaceholder(scope)}
            style={{ paddingLeft: 40 }}
            value={searchQuery}
          />
        </View>
        <Text className="text-xs text-muted-foreground">
          {items.length} {scope === "routes" ? "routes" : "activity plans"} available
        </Text>
      </View>

      {query.isLoading ? (
        <View className="items-center justify-center py-8">
          <ActivityIndicator />
          <Text className="mt-2 text-sm text-muted-foreground">Loading...</Text>
        </View>
      ) : items.length === 0 ? (
        <View className="rounded-2xl border border-dashed border-border p-4">
          <Text className="text-center text-sm text-muted-foreground">
            {getEmptyLabel(scope, hasSearch)}
          </Text>
        </View>
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
