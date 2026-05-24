import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
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
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function ActivityPlansListScreen() {
  const navigateTo = useAppNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "run" | "bike" | "swim" | "strength" | "other" | null
  >(null);
  const [draftCategoryFilter, setDraftCategoryFilter] = useState<typeof categoryFilter>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const { data, isLoading, error } = api.activityPlans.list.useQuery({
    ownerScope: "own",
    includeOwnOnly: true,
    includeSystemTemplates: false,
    search: searchQuery.trim() || undefined,
    activityCategories: categoryFilter ? [categoryFilter] : undefined,
    limit: 100,
  });

  const plans = data?.items ?? [];

  return (
    <View className="flex-1 bg-background" testID="activity-plans-list-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => navigateTo(ROUTES.PLAN.CREATE_ACTIVITY_PLAN.INDEX as any)}
              className="mr-2 rounded-full px-2 py-1"
              testID="activity-plans-list-create-trigger"
            >
              <Text className="text-sm font-medium text-primary">Create</Text>
            </Pressable>
          ),
        }}
      />
      <IndexSearchBar
        value={searchQuery}
        placeholder="Search activity plans"
        hasActiveFilters={categoryFilter !== null}
        onChangeText={setSearchQuery}
        onClear={() => setSearchQuery("")}
        onFilterPress={() => {
          setDraftCategoryFilter(categoryFilter);
          setIsFilterSheetOpen(true);
        }}
        testIDPrefix="activity-plans-list"
      />
      <ResourceList
        data={plans}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-4 p-4 pb-6"
        ListHeaderComponent={
          <IndexResultsSummary
            count={plans.length}
            singularLabel="activity plan"
            pluralLabel="activity plans"
          />
        }
        emptyComponent={
          <View className="items-center justify-center py-12">
            <Text className="text-lg font-medium text-foreground">No activity plans yet</Text>
            <Text className="mt-2 text-center text-sm text-muted-foreground">
              Your activity plans will appear here.
            </Text>
          </View>
        }
        errorDescription={error?.message}
        errorTitle="Unable to load activity plans"
        isError={Boolean(error)}
        isLoading={isLoading}
        renderItem={(item) => (
          <ActivityPlanCard
            activityPlan={item as any}
            onPress={() => navigateTo(ROUTES.PLAN.PLAN_DETAIL(item.id) as any)}
            testID={`activity-plan-list-item-${item.id}`}
            variant="compact"
          />
        )}
      />
      <IndexFilterSheet
        visible={isFilterSheetOpen}
        title="Activity Plan Filters"
        description="Refine your activity plans list."
        isResetDisabled={draftCategoryFilter === null}
        onReset={() => setDraftCategoryFilter(null)}
        onApply={() => {
          setCategoryFilter(draftCategoryFilter);
          setIsFilterSheetOpen(false);
        }}
        onClose={() => setIsFilterSheetOpen(false)}
        testID="activity-plans-list-filter-sheet"
      >
        <FilterSection title="Activity plan type">
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
                    draftCategoryFilter === option.id ? null : (option.id as any),
                  )
                }
                testID={`activity-plans-list-filter-category-${option.id}`}
              />
            ))}
          </View>
        </FilterSection>
      </IndexFilterSheet>
    </View>
  );
}

export default function ActivityPlansListScreenWithBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ActivityPlansListScreen />
    </ErrorBoundary>
  );
}
