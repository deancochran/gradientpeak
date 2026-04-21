import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { Stack } from "expo-router";
import { Activity, ChevronRight, Timer, Zap } from "lucide-react-native";
import React from "react";
import { FlatList, Pressable, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function ActivityEffortsList() {
  const navigateTo = useAppNavigate();

  const { data: efforts, isLoading, error } = api.activityEfforts.getForProfile.useQuery();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-sm text-muted-foreground">Loading efforts...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-base font-semibold text-foreground">Unable to load efforts</Text>
        <Text className="mt-2 text-sm text-muted-foreground">{error.message}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => navigateTo("/(internal)/(standard)/activity-effort-create" as any)}
              className="mr-2 rounded-full px-2 py-1"
              testID="activity-efforts-list-add-trigger"
            >
              <Text className="text-sm font-medium text-primary">Add</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={efforts}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4 gap-4"
        ListHeaderComponent={
          efforts && efforts.length > 0 ? (
            <View className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
              <Text className="text-sm text-muted-foreground">
                {efforts.length} {efforts.length === 1 ? "effort" : "efforts"}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center justify-center py-10">
            <Icon as={Activity} size={48} className="text-muted-foreground mb-4" />
            <Text className="text-lg font-medium text-foreground">No activity efforts yet</Text>
            <Text className="text-sm text-muted-foreground text-center mt-2">
              Your recorded activity efforts will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigateTo(ROUTES.ACTIVITIES.EFFORT_DETAIL(item.id) as any)}
            testID={`activity-effort-list-item-${item.id}`}
          >
            <Card className="rounded-3xl border border-border bg-card">
              <CardContent className="gap-3 p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-1">
                    <Text className="text-base font-semibold capitalize text-foreground">
                      {item.activity_category} • {item.effort_type}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {format(new Date(item.recorded_at), "MMM d, yyyy")}
                    </Text>
                  </View>
                  <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
                </View>

                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Icon as={Timer} size={16} className="text-muted-foreground" />
                    <Text className="font-medium text-foreground">{item.duration_seconds}s</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Icon as={Zap} size={16} className="text-primary" />
                    <Text className="text-lg font-bold text-foreground">
                      {item.value} {item.unit}
                    </Text>
                  </View>
                </View>
              </CardContent>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}

export default function ActivityEffortsListWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <ActivityEffortsList />
    </ErrorBoundary>
  );
}
