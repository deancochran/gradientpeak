import type { ActivityPlanPlanningEstimate, ActivityPlanSummary } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { FilterChip, IndexSearchBar } from "@/components/shared/IndexSearchBar";
import { SearchableBottomSheetList } from "@/components/shared/SearchableBottomSheetList";
import { omitUndefined } from "@/lib/omitUndefined";

export type ActivityCategoryFilter = "run" | "bike" | "swim" | "strength" | "other" | null;
export type ActivityPlanSort = "newest" | "oldest" | "name";

export const ACTIVITY_PLAN_SORT_OPTIONS = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "name", label: "Name" },
] as const;

const ACTIVITY_CATEGORY_OPTIONS = [
  { id: "run", label: "Running" },
  { id: "bike", label: "Cycling" },
  { id: "swim", label: "Swimming" },
  { id: "strength", label: "Strength" },
  { id: "other", label: "Other" },
] as const;

type BuilderActivityAssignmentSheetContentProps = {
  activityPlanEstimateById: Map<string, ActivityPlanPlanningEstimate>;
  activityPlanItems: ActivityPlanSummary[];
  activityPlanSort: ActivityPlanSort;
  categoryFilter: ActivityCategoryFilter;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isLoading?: boolean;
  onClearSearch: () => void;
  onFetchNextPage: () => void;
  onOpenFilters: () => void;
  onSearchChange: (value: string) => void;
  onSelectActivityPlan: (activityPlan: ActivityPlanSummary) => void;
  searchQuery: string;
};

export function BuilderActivityAssignmentSheetContent({
  activityPlanItems,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  onFetchNextPage,
  onSelectActivityPlan,
}: BuilderActivityAssignmentSheetContentProps) {
  const activityPlanItemsWithEstimates = useMemo(() => activityPlanItems, [activityPlanItems]);
  const activityPlanById = useMemo(
    () =>
      new Map(activityPlanItems.map((activityPlan) => [activityPlan.id, activityPlan] as const)),
    [activityPlanItems],
  );
  const renderActivityPlan = useCallback(
    (item: ActivityPlanSummary) => (
      <View className="pb-3">
        <ActivityPlanCard
          plan={item}
          onPress={() => onSelectActivityPlan(activityPlanById.get(item.id) ?? item)}
          testID={`training-plan-builder-activity-row-${item.id}`}
          variant="compact"
        />
      </View>
    ),
    [activityPlanById, onSelectActivityPlan],
  );

  return (
    <SearchableBottomSheetList
      {...omitUndefined({ hasNextPage })}
      data={activityPlanItemsWithEstimates}
      emptyMessage="No matching activities."
      headerInLayout
      {...omitUndefined({ isFetchingNextPage })}
      {...omitUndefined({ isLoading })}
      keyExtractor={(item) => item.id}
      loadingMessage="Loading activities..."
      onFetchNextPage={onFetchNextPage}
      pluralLabel="activities"
      renderItem={renderActivityPlan}
      sectionLabel="Tap to assign"
      singularLabel="activity"
    />
  );
}

export function BuilderActivityAssignmentSheetHeader({
  activityPlanSort,
  categoryFilter,
  onClearSearch,
  onOpenFilters,
  onSearchChange,
  searchQuery,
}: Pick<
  BuilderActivityAssignmentSheetContentProps,
  | "activityPlanSort"
  | "categoryFilter"
  | "onClearSearch"
  | "onOpenFilters"
  | "onSearchChange"
  | "searchQuery"
>) {
  return (
    <IndexSearchBar
      value={searchQuery}
      placeholder="Search activities"
      hasActiveFilters={categoryFilter !== null || activityPlanSort !== "newest"}
      onChangeText={onSearchChange}
      onClear={onClearSearch}
      onFilterPress={onOpenFilters}
      testIDPrefix="training-plan-builder-activity-picker"
    />
  );
}

type BuilderActivityFiltersSheetContentProps = {
  draftCategoryFilter: ActivityCategoryFilter;
  draftSort: ActivityPlanSort;
  onChangeCategoryFilter: (value: ActivityCategoryFilter) => void;
  onChangeSort: (value: ActivityPlanSort) => void;
};

export function BuilderActivityFiltersSheetContent({
  draftCategoryFilter,
  draftSort,
  onChangeCategoryFilter,
  onChangeSort,
}: BuilderActivityFiltersSheetContentProps) {
  return (
    <View className="gap-6" testID="training-plan-builder-activity-filter-sheet">
      <View className="gap-3">
        <Text className="text-sm font-semibold text-foreground">Sort</Text>
        <View className="flex-row flex-wrap gap-2">
          {ACTIVITY_PLAN_SORT_OPTIONS.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              isActive={draftSort === option.id}
              onPress={() => onChangeSort(option.id)}
              testID={`training-plan-builder-activity-sort-${option.id}`}
            />
          ))}
        </View>
      </View>
      <View className="gap-3">
        <Text className="text-sm font-semibold text-foreground">Activity category</Text>
        <View className="flex-row flex-wrap gap-2">
          {ACTIVITY_CATEGORY_OPTIONS.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              isActive={draftCategoryFilter === option.id}
              onPress={() =>
                onChangeCategoryFilter(draftCategoryFilter === option.id ? null : option.id)
              }
              testID={`training-plan-builder-activity-filter-activity_category-${option.id}`}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
