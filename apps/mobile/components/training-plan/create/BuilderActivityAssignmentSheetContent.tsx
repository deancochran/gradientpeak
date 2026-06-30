import type { ActivityPlanPlanningEstimate } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { type ActivityPlan, ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { FilterChip, IndexSearchBar } from "@/components/shared/IndexSearchBar";
import { SearchableBottomSheetList } from "@/components/shared/SearchableBottomSheetList";

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
  activityPlanItems: ActivityPlan[];
  activityPlanSort: ActivityPlanSort;
  categoryFilter: ActivityCategoryFilter;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isLoading?: boolean;
  onClearSearch: () => void;
  onFetchNextPage: () => void;
  onOpenFilters: () => void;
  onSearchChange: (value: string) => void;
  onSelectActivityPlan: (activityPlan: ActivityPlan) => void;
  searchQuery: string;
};

export function BuilderActivityAssignmentSheetContent({
  activityPlanEstimateById,
  activityPlanItems,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  onFetchNextPage,
  onSelectActivityPlan,
}: BuilderActivityAssignmentSheetContentProps) {
  const activityPlanItemsWithEstimates = useMemo(
    () =>
      activityPlanItems.map((activityPlan) =>
        withEstimateMetrics(activityPlan, activityPlanEstimateById.get(activityPlan.id) ?? null),
      ),
    [activityPlanEstimateById, activityPlanItems],
  );
  const activityPlanById = useMemo(
    () =>
      new Map(activityPlanItems.map((activityPlan) => [activityPlan.id, activityPlan] as const)),
    [activityPlanItems],
  );
  const renderActivityPlan = useCallback(
    (item: ActivityPlan) => (
      <View className="pb-3">
        <ActivityPlanCard
          activityPlan={item}
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
      data={activityPlanItemsWithEstimates}
      emptyMessage="No matching workouts."
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      isLoading={isLoading}
      keyExtractor={(item) => item.id}
      loadingMessage="Loading workouts..."
      onFetchNextPage={onFetchNextPage}
      pluralLabel="workouts"
      renderItem={renderActivityPlan}
      sectionLabel="Tap to assign"
      singularLabel="workout"
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
      placeholder="Search workouts"
      hasActiveFilters={categoryFilter !== null || activityPlanSort !== "newest"}
      onChangeText={onSearchChange}
      onClear={onClearSearch}
      onFilterPress={onOpenFilters}
      testIDPrefix="training-plan-builder-activity-picker"
    />
  );
}

function withEstimateMetrics(
  activityPlan: ActivityPlan,
  estimate: ActivityPlanPlanningEstimate | null,
): ActivityPlan {
  if (!estimate) return activityPlan;
  return {
    ...activityPlan,
    authoritative_metrics: {
      ...activityPlan.authoritative_metrics,
      estimated_duration:
        estimate.durationSeconds ?? activityPlan.authoritative_metrics?.estimated_duration ?? null,
      estimated_tss: estimate.tss ?? activityPlan.authoritative_metrics?.estimated_tss ?? null,
      intensity_factor:
        estimate.intensityFactor ?? activityPlan.authoritative_metrics?.intensity_factor ?? null,
    },
  };
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
        <Text className="text-sm font-semibold text-foreground">Workout type</Text>
        <View className="flex-row flex-wrap gap-2">
          {ACTIVITY_CATEGORY_OPTIONS.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              isActive={draftCategoryFilter === option.id}
              onPress={() =>
                onChangeCategoryFilter(draftCategoryFilter === option.id ? null : option.id)
              }
              testID={`training-plan-builder-activity-filter-category-${option.id}`}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
