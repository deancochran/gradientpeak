import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import { Activity } from "lucide-react-native";
import React, { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { IndexFilterSheet } from "@/components/shared/IndexFilterSheet";
import {
  FilterChip,
  FilterSection,
  IndexResultsSummary,
  IndexSearchBar,
} from "@/components/shared/IndexSearchBar";
import { ResourceList } from "@/components/shared/ResourceList";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function ActivitiesScreen() {
  const navigateTo = useAppNavigate();
  const { profile, user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "run" | "bike" | "swim" | "strength" | "other" | null
  >(null);
  const [draftCategoryFilter, setDraftCategoryFilter] = useState<typeof categoryFilter>(null);
  const [sortBy, setSortBy] = useState<"date" | "distance" | "duration" | "tss">("date");
  const [draftSortBy, setDraftSortBy] = useState<typeof sortBy>("date");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const limit = 20;

  // Query paginated activities
  const {
    data: activitiesData,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = api.activities.listPaginated.useInfiniteQuery(
    {
      limit,
      search: searchQuery.trim() || undefined,
      activity_category: categoryFilter ?? undefined,
      sort_by: sortBy,
      sort_order: "desc",
    },
    {
      getNextPageParam: (lastPage: any) => lastPage.nextCursor,
    },
  );

  const activities = activitiesData?.pages.flatMap((page) => page.items) || [];
  const activityOwner = user?.id
    ? {
        avatar_url: profile?.avatar_url ?? null,
        id: user.id,
        username: profile?.username ?? user.email?.split("@")[0] ?? "You",
      }
    : null;
  const hasMore = activitiesData?.pages[activitiesData.pages.length - 1]?.hasMore || false;
  const total = activitiesData?.pages[0]?.total || 0;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleActivityPress = (activityId: string) => {
    navigateTo(`/activity-detail?id=${activityId}` as any);
  };

  const handleLoadMore = () => {
    if (hasMore && !isFetchingNextPage) {
      void fetchNextPage();
    }
  };

  return (
    <View className="flex-1 bg-background" testID="activities-list-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigateTo(ROUTES.ACTIVITIES.IMPORT as any)}
              className="mr-2 rounded-full px-2 py-1"
              testID="activities-list-import-trigger"
            >
              <Text className="text-sm font-medium text-primary">Import</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <IndexSearchBar
        value={searchQuery}
        placeholder="Search activities"
        hasActiveFilters={categoryFilter !== null || sortBy !== "date"}
        onChangeText={setSearchQuery}
        onClear={() => setSearchQuery("")}
        onFilterPress={() => {
          setDraftCategoryFilter(categoryFilter);
          setDraftSortBy(sortBy);
          setIsFilterSheetOpen(true);
        }}
        testIDPrefix="activities-list"
      />
      <ResourceList
        testID="activities-list-content"
        contentContainerClassName="gap-4 p-4 pb-6"
        data={activities}
        emptyComponent={
          <View
            className="flex-1 items-center justify-center py-12"
            testID="activities-list-empty-state"
          >
            <EmptyStateCard
              icon={Activity}
              title="No activities yet"
              description="Recorded activities will appear here."
              iconSize={64}
              iconColor="text-primary"
            />
          </View>
        }
        hasNextPage={hasMore}
        isFetchingNextPage={isFetchingNextPage}
        isLoading={isLoading}
        keyExtractor={(activity) => activity.id}
        ListHeaderComponent={<IndexResultsSummary count={total} singularLabel="activity" />}
        loadingSkeletonCount={8}
        onLoadMore={handleLoadMore}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        renderItem={(activity) => (
          <ActivityCard
            activity={activity as any}
            dateMode="absolute"
            onPress={() => handleActivityPress(activity.id)}
            owner={activityOwner}
            showLike
            testID={`activities-list-item-${activity.id}`}
            variant="list"
          />
        )}
      />
      <IndexFilterSheet
        visible={isFilterSheetOpen}
        title="Activity Filters"
        description="Refine your activities list."
        isResetDisabled={draftCategoryFilter === null && draftSortBy === "date"}
        onReset={() => {
          setDraftCategoryFilter(null);
          setDraftSortBy("date");
        }}
        onApply={() => {
          setCategoryFilter(draftCategoryFilter);
          setSortBy(draftSortBy);
          setIsFilterSheetOpen(false);
        }}
        onClose={() => setIsFilterSheetOpen(false)}
        testID="activities-list-filter-sheet"
      >
        <FilterSection title="Activity type">
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
                    draftCategoryFilter === option.id ? null : (option.id as typeof categoryFilter),
                  )
                }
                testID={`activities-list-filter-category-${option.id}`}
              />
            ))}
          </View>
        </FilterSection>
        <FilterSection title="Sort">
          <View className="flex-row flex-wrap gap-2">
            {[
              { id: "date", label: "Date" },
              { id: "distance", label: "Distance" },
              { id: "duration", label: "Duration" },
              { id: "tss", label: "TSS" },
            ].map((option) => (
              <FilterChip
                key={option.id}
                label={option.label}
                isActive={draftSortBy === option.id}
                onPress={() => setDraftSortBy(option.id as typeof sortBy)}
                testID={`activities-list-filter-sort-${option.id}`}
              />
            ))}
          </View>
        </FilterSection>
      </IndexFilterSheet>
    </View>
  );
}

export default function ActivitiesScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ActivitiesScreen />
    </ErrorBoundary>
  );
}
