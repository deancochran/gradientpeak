import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { HeaderTextAction } from "@/components/shared/HeaderAction";
import { IndexFilterSheet } from "@/components/shared/IndexFilterSheet";
import {
  FilterChip,
  FilterSection,
  IndexResultsSummary,
  IndexSearchBar,
} from "@/components/shared/IndexSearchBar";
import { ResourceList } from "@/components/shared/ResourceList";
import { TrainingPlanCard } from "@/components/shared/TrainingPlanCard";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function TrainingPlansListScreen() {
  const navigateTo = useAppNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<
    "private" | "followers" | "public" | null
  >(null);
  const [draftVisibilityFilter, setDraftVisibilityFilter] = useState<typeof visibilityFilter>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const {
    data,
    error,
    isError,
    isFetching,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = api.trainingPlans.list.useInfiniteQuery(
    {
      ownerScope: "own",
      includeOwnOnly: true,
      includeSystemTemplates: false,
      search: searchQuery.trim() || undefined,
      visibility: visibilityFilter ?? undefined,
      limit: 25,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const sortedPlans = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const planCount = data?.pages[0]?.total ?? sortedPlans.length;
  const hasActiveQuery = searchQuery.trim().length > 0 || visibilityFilter !== null;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View className="flex-1 bg-background" testID="training-plans-list-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderTextAction
              accessibilityLabel="Create training plan"
              label="Create"
              onPress={() => navigateTo(ROUTES.PLAN.TRAINING_PLAN.CREATE)}
              testID="training-plans-list-create-trigger"
            />
          ),
        }}
      />
      <IndexSearchBar
        value={searchQuery}
        placeholder="Search training plans"
        hasActiveFilters={visibilityFilter !== null}
        onChangeText={setSearchQuery}
        onClear={() => setSearchQuery("")}
        onFilterPress={() => {
          setDraftVisibilityFilter(visibilityFilter);
          setIsFilterSheetOpen(true);
        }}
        testIDPrefix="training-plans-list"
      />
      <ResourceList
        testID="training-plans-list-content"
        data={sortedPlans}
        errorDescription={error?.message ?? "Please try again."}
        errorTitle="Unable to load training plans"
        contentContainerClassName="gap-4 p-4 pb-6"
        emptyComponent={
          <View testID="training-plans-list-empty-state">
            <EmptyStateCard
              title="No training plans yet"
              description="Your saved training plans will appear here."
            />
          </View>
        }
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isError={isError}
        isLoading={isLoading}
        isEmptyFiltered={hasActiveQuery}
        isRetrying={isFetching}
        keyExtractor={(plan) => plan.id}
        ListHeaderComponent={
          <IndexResultsSummary
            count={planCount}
            singularLabel="plan"
            testID="training-plans-list-summary"
          />
        }
        loadingMoreLabel="Loading more plans..."
        onLoadMore={() => void fetchNextPage()}
        onRefresh={handleRefresh}
        onRetry={refetch}
        refreshing={refreshing}
        renderItem={(plan) => (
          <View testID={`training-plans-list-item-${plan.id}`}>
            <TrainingPlanCard
              plan={plan}
              onPress={() => navigateTo(ROUTES.PLAN.TRAINING_PLAN.DETAIL(plan.id))}
            />
          </View>
        )}
      />
      <IndexFilterSheet
        visible={isFilterSheetOpen}
        title="Training Plan Filters"
        description="Refine your training plans list."
        isResetDisabled={draftVisibilityFilter === null}
        onReset={() => setDraftVisibilityFilter(null)}
        onApply={() => {
          setVisibilityFilter(draftVisibilityFilter);
          setIsFilterSheetOpen(false);
        }}
        onClose={() => setIsFilterSheetOpen(false)}
        testID="training-plans-list-filter-sheet"
      >
        <FilterSection title="Visibility">
          <View className="flex-row flex-wrap gap-2">
            {[
              { id: "private", label: "Private" },
              { id: "followers", label: "Followers" },
              { id: "public", label: "Public" },
            ].map((option) => (
              <FilterChip
                key={option.id}
                label={option.label}
                isActive={draftVisibilityFilter === option.id}
                onPress={() =>
                  setDraftVisibilityFilter(
                    draftVisibilityFilter === option.id
                      ? null
                      : (option.id as typeof visibilityFilter),
                  )
                }
                testID={`training-plans-list-filter-visibility-${option.id}`}
              />
            ))}
          </View>
        </FilterSection>
      </IndexFilterSheet>
    </View>
  );
}

export default function TrainingPlansListScreenWithBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <TrainingPlansListScreen />
    </ErrorBoundary>
  );
}
