import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import React, { useMemo, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
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
  const [visibilityFilter, setVisibilityFilter] = useState<"private" | "public" | null>(null);
  const [draftVisibilityFilter, setDraftVisibilityFilter] = useState<typeof visibilityFilter>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    api.trainingPlans.list.useInfiniteQuery(
      {
        ownerScope: "own",
        includeOwnOnly: true,
        includeSystemTemplates: false,
        search: searchQuery.trim() || undefined,
        visibility: visibilityFilter ?? undefined,
        limit: 25,
      },
      {
        getNextPageParam: (lastPage: any) => lastPage.nextCursor,
      },
    );

  const sortedPlans = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const planCount = data?.pages[0]?.total ?? sortedPlans.length;

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
            <TouchableOpacity
              onPress={() => navigateTo(ROUTES.PLAN.TRAINING_PLAN.CREATE as any)}
              className="mr-2 rounded-full px-2 py-1"
              testID="training-plans-list-create-trigger"
            >
              <Text className="text-sm font-medium text-primary">Create</Text>
            </TouchableOpacity>
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
        isLoading={isLoading}
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
        refreshing={refreshing}
        renderItem={(plan) => (
          <View testID={`training-plans-list-item-${plan.id}`}>
            <TrainingPlanCard
              plan={plan as any}
              onPress={() => navigateTo(ROUTES.PLAN.TRAINING_PLAN.DETAIL(plan.id) as any)}
              variant="default"
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
