import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import React from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { EntityOwnerRow } from "@/components/shared/EntityOwnerRow";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function ActivityPlansListScreen() {
  const navigateTo = useAppNavigate();
  const { data, isLoading, error } = api.activityPlans.list.useQuery({
    ownerScope: "own",
    includeOwnOnly: true,
    includeSystemTemplates: false,
    limit: 100,
  });

  const plans = data?.items ?? [];

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-base font-semibold text-foreground">
          Unable to load activity plans
        </Text>
        <Text className="mt-2 text-sm text-muted-foreground">{error.message}</Text>
      </View>
    );
  }

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
      <FlatList
        data={plans}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-4 p-4 pb-6"
        ListHeaderComponent={
          plans.length > 0 ? (
            <View className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
              <Text className="text-sm text-muted-foreground">
                {plans.length} {plans.length === 1 ? "activity plan" : "activity plans"}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-12">
            <Text className="text-lg font-medium text-foreground">No activity plans yet</Text>
            <Text className="mt-2 text-center text-sm text-muted-foreground">
              Your activity plans will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          return (
            <Pressable
              onPress={() => navigateTo(ROUTES.PLAN.PLAN_DETAIL(item.id) as any)}
              testID={`activity-plan-list-item-${item.id}`}
            >
              <View className="gap-3 rounded-3xl border border-border bg-card p-4">
                <ActivityPlanCard activityPlan={item as any} variant="default" />
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-xs text-muted-foreground">
                    {item.template_visibility === "public" ? "Public template" : "Private plan"}
                  </Text>
                </View>
                {item.owner ? <EntityOwnerRow owner={item.owner} subtitle="Plan owner" /> : null}
              </View>
            </Pressable>
          );
        }}
      />
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
