import type { CanonicalSport } from "@repo/core";
import { type Href, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { GoalListItem } from "@/components/plan/GoalListItem";
import {
  FilterChip,
  FilterSection,
  IndexFilterSheet,
  IndexResultsSummary,
  IndexSearchBar,
} from "@/components/shared";
import { HeaderTextAction } from "@/components/shared/HeaderAction";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/ScreenState";
import { toDateKey } from "@/lib/calendar/dateMath";
import { ROUTES } from "@/lib/constants/routes";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function getDateKey(value: Date) {
  return toDateKey(value);
}

function sortGoalsByNextDate<T extends { target_date?: string | null }>(
  goals: T[],
  todayKey: string,
) {
  const datedGoals = goals.flatMap((goal) =>
    typeof goal.target_date === "string" ? [{ ...goal, target_date: goal.target_date }] : [],
  );
  const upcoming = datedGoals
    .filter((goal) => goal.target_date >= todayKey)
    .sort((left, right) => left.target_date.localeCompare(right.target_date));
  const past = datedGoals
    .filter((goal) => goal.target_date < todayKey)
    .sort((left, right) => right.target_date.localeCompare(left.target_date));
  const undated = goals.filter((goal) => !goal.target_date);

  return [...upcoming, ...past, ...undated];
}

function GoalsListScreen() {
  const navigateTo = useAppNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CanonicalSport | null>(null);
  const [draftCategoryFilter, setDraftCategoryFilter] = useState<typeof categoryFilter>(null);
  const [sortBy, setSortBy] = useState<"created_at" | "target_date" | "priority">("target_date");
  const [draftSortBy, setDraftSortBy] = useState<typeof sortBy>("target_date");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const goals = useProfileGoals({
    loadAllPages: true,
    search: searchQuery.trim(),
    activityCategory: categoryFilter ?? undefined,
    sortBy,
    sortOrder: sortBy === "priority" ? "desc" : "asc",
  });
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getDateKey(today), [today]);
  const orderedGoals = useMemo(
    () => (sortBy === "target_date" ? sortGoalsByNextDate(goals.goals, todayKey) : goals.goals),
    [goals.goals, sortBy, todayKey],
  );

  if (goals.isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="goals-list-loading"
      >
        <LoadingState message="Loading goals..." />
      </View>
    );
  }

  if (goals.isError) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        testID="goals-list-error"
      >
        <ErrorState
          description="Check your connection and try again."
          onAction={() => void goals.refetch()}
          title="Goals could not be loaded"
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" testID="goals-list-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderTextAction
              accessibilityLabel="Create goal"
              label="Create"
              onPress={() => navigateTo(ROUTES.GOALS.CREATE as Href)}
              testID="goals-list-create-button"
            />
          ),
        }}
      />
      <IndexSearchBar
        value={searchQuery}
        placeholder="Search goals"
        hasActiveFilters={categoryFilter !== null || sortBy !== "target_date"}
        onChangeText={setSearchQuery}
        onClear={() => setSearchQuery("")}
        onFilterPress={() => {
          setDraftCategoryFilter(categoryFilter);
          setDraftSortBy(sortBy);
          setIsFilterSheetOpen(true);
        }}
        testIDPrefix="goals-list"
      />
      <FlatList
        data={orderedGoals}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-3 p-4 pb-6"
        refreshControl={
          <RefreshControl refreshing={goals.isFetching} onRefresh={() => void goals.refetch()} />
        }
        ListHeaderComponent={
          <IndexResultsSummary count={orderedGoals.length} singularLabel="goal" />
        }
        ListEmptyComponent={
          <EmptyState
            description="Create a goal to start shaping your plan."
            testID="goals-list-empty"
            title="No goals yet"
          />
        }
        renderItem={({ item }) => (
          <GoalListItem
            goal={item}
            label={item.target_date && item.target_date >= todayKey ? "Upcoming" : "Goal"}
            onPress={() => navigateTo(ROUTES.GOALS.DETAIL(item.id) as Href)}
            testID={`goals-list-row-${item.id}`}
          />
        )}
      />
      <IndexFilterSheet
        visible={isFilterSheetOpen}
        title="Goal Filters"
        description="Refine your goals list."
        isResetDisabled={draftCategoryFilter === null && draftSortBy === "target_date"}
        onReset={() => {
          setDraftCategoryFilter(null);
          setDraftSortBy("target_date");
        }}
        onApply={() => {
          setCategoryFilter(draftCategoryFilter);
          setSortBy(draftSortBy);
          setIsFilterSheetOpen(false);
        }}
        onClose={() => setIsFilterSheetOpen(false)}
        testID="goals-list-filter-sheet"
      >
        <FilterSection title="Goal type">
          <View className="flex-row flex-wrap gap-2">
            {[
              { id: "run", label: "Running" },
              { id: "bike", label: "Cycling" },
              { id: "swim", label: "Swimming" },
              { id: "strength", label: "Strength" },
              { id: "other", label: "Other" },
            ].map((option) => (
              <FilterChip
                key={option.id}
                label={option.label}
                isActive={draftCategoryFilter === option.id}
                onPress={() =>
                  setDraftCategoryFilter(
                    draftCategoryFilter === option.id ? null : (option.id as CanonicalSport),
                  )
                }
                testID={`goals-list-filter-category-${option.id}`}
              />
            ))}
          </View>
        </FilterSection>
        <FilterSection title="Sort">
          <View className="flex-row flex-wrap gap-2">
            {[
              { id: "target_date", label: "Target date" },
              { id: "priority", label: "Priority" },
              { id: "created_at", label: "Created" },
            ].map((option) => (
              <FilterChip
                key={option.id}
                label={option.label}
                isActive={draftSortBy === option.id}
                onPress={() => setDraftSortBy(option.id as typeof sortBy)}
                testID={`goals-list-filter-sort-${option.id}`}
              />
            ))}
          </View>
        </FilterSection>
      </IndexFilterSheet>
    </View>
  );
}

export default function GoalsListScreenWithBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <GoalsListScreen />
    </ErrorBoundary>
  );
}
