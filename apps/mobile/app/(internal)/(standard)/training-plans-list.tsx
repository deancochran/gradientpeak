import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { ListSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { TrainingPlanCard } from "@/components/shared/TrainingPlanCard";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function TrainingPlansListScreen() {
  const navigateTo = useAppNavigate();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    api.trainingPlans.list.useInfiniteQuery(
      {
        ownerScope: "own",
        includeOwnOnly: true,
        includeSystemTemplates: false,
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

  if (isLoading) {
    return (
      <ScrollView className="flex-1 bg-background" testID="training-plans-list-loading">
        <View className="p-4">
          <ListSkeleton count={6} />
        </View>
      </ScrollView>
    );
  }

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
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 py-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (
            layoutMeasurement.height + contentOffset.y >= contentSize.height - 160 &&
            hasNextPage &&
            !isFetchingNextPage
          ) {
            void fetchNextPage();
          }
        }}
        scrollEventThrottle={16}
      >
        {planCount > 0 ? (
          <View
            className="rounded-2xl border border-border bg-muted/20 px-4 py-3"
            testID="training-plans-list-summary"
          >
            <Text className="text-sm text-muted-foreground">
              {planCount} {planCount === 1 ? "plan" : "plans"}
            </Text>
          </View>
        ) : null}

        {planCount === 0 ? (
          <View testID="training-plans-list-empty-state">
            <EmptyStateCard
              title="No training plans yet"
              description="Your saved training plans will appear here."
            />
          </View>
        ) : (
          sortedPlans.map((plan) => {
            return (
              <View key={plan.id} testID={`training-plans-list-item-${plan.id}`}>
                <TrainingPlanCard
                  plan={plan as any}
                  onPress={() => navigateTo(ROUTES.PLAN.TRAINING_PLAN.DETAIL(plan.id) as any)}
                  variant="default"
                  headerAccessory={
                    <Icon as={ChevronRight} size={18} className="mt-1 text-muted-foreground" />
                  }
                />
              </View>
            );
          })
        )}
        {isFetchingNextPage ? (
          <View className="items-center py-4">
            <Text className="text-xs text-muted-foreground">Loading more plans...</Text>
          </View>
        ) : null}
      </ScrollView>
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
