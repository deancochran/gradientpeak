import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { ListSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { format } from "date-fns";
import { Stack } from "expo-router";
import { Activity, ChevronRight } from "lucide-react-native";
import React, { useState } from "react";
import { RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDistance(meters: number): string {
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

function ActivitiesScreen() {
  const navigateTo = useAppNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 20;

  // Query paginated activities
  const {
    data: activitiesData,
    isLoading,
    refetch,
  } = api.activities.listPaginated.useQuery({
    limit,
    offset: page * limit,
    sort_by: "date",
    sort_order: "desc",
  });

  const activities = activitiesData?.items || [];
  const hasMore = activitiesData?.hasMore || false;
  const total = activitiesData?.total || 0;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleActivityPress = (activityId: string) => {
    navigateTo(`/activity-detail?id=${activityId}` as any);
  };

  const handleLoadMore = () => {
    if (hasMore && !isLoading) {
      setPage((prev) => prev + 1);
    }
  };

  const getActivityIcon = (type: string) => {
    if (type === "run") return "🏃";
    if (type === "bike") return "🚴";
    if (type === "swim") return "🏊";
    if (type === "strength") return "💪";
    return "🎯";
  };

  if (isLoading && page === 0) {
    return (
      <ScrollView className="flex-1 bg-background" testID="activities-list-loading">
        <View className="p-4">
          <ListSkeleton count={8} />
        </View>
      </ScrollView>
    );
  }

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
      {/* Activity Count */}
      {total > 0 && (
        <View className="px-4 pt-4">
          <View className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
            <Text className="text-sm text-muted-foreground">
              {total} {total === 1 ? "activity" : "activities"}
            </Text>
          </View>
        </View>
      )}

      {/* Activity List */}
      <ScrollView
        testID="activities-list-content"
        className="flex-1"
        contentContainerClassName="p-4 gap-3"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const isCloseToBottom =
            layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
          if (isCloseToBottom && hasMore && !isLoading) {
            handleLoadMore();
          }
        }}
        scrollEventThrottle={400}
      >
        {activities.length === 0 ? (
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
        ) : (
          <>
            {activities.map((activity) => (
              <TouchableOpacity
                key={activity.id}
                onPress={() => handleActivityPress(activity.id)}
                activeOpacity={0.7}
                testID={`activities-list-item-${activity.id}`}
              >
                <Card className="rounded-3xl border border-border bg-card">
                  <CardContent className="p-4">
                    <View className="flex-row items-start gap-3 mb-3">
                      <View className="h-10 w-10 rounded-full bg-primary/10 items-center justify-center">
                        <Text className="text-xl">{getActivityIcon(activity.type)}</Text>
                      </View>

                      <View className="flex-1 gap-1">
                        <Text className="text-base font-semibold text-foreground">
                          {activity.name}
                        </Text>
                        <View className="flex-row items-center gap-1.5 mt-1 flex-wrap">
                          <Text className="text-xs text-muted-foreground">
                            {format(new Date(activity.started_at), "MMM d, yyyy • h:mm a")}
                          </Text>
                          {activity.device_manufacturer && (
                            <>
                              <Text className="text-xs text-muted-foreground">•</Text>
                              <Text className="text-xs text-muted-foreground">
                                {activity.device_manufacturer} {activity.device_product || ""}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>

                      <Icon as={ChevronRight} size={20} className="text-muted-foreground" />
                    </View>

                    {activity.notes && (
                      <Text className="text-sm text-muted-foreground mb-3" numberOfLines={2}>
                        {activity.notes}
                      </Text>
                    )}

                    <View className="flex-row items-center gap-4 flex-wrap">
                      {activity.distance_meters > 0 && (
                        <View>
                          <Text className="text-xs text-muted-foreground">Distance</Text>
                          <Text className="text-sm font-semibold text-foreground">
                            {formatDistance(activity.distance_meters)}
                          </Text>
                        </View>
                      )}
                      <View>
                        <Text className="text-xs text-muted-foreground">Duration</Text>
                        <Text className="text-sm font-semibold text-foreground">
                          {formatDuration(activity.duration_seconds)}
                        </Text>
                      </View>
                      {activity.derived?.tss !== null && activity.derived?.tss !== undefined && (
                        <View>
                          <Text className="text-xs text-muted-foreground">TSS</Text>
                          <Text className="text-sm font-semibold text-primary">
                            {Math.round(activity.derived.tss)}
                          </Text>
                        </View>
                      )}
                      {activity.avg_power && (
                        <View>
                          <Text className="text-xs text-muted-foreground">Avg Power</Text>
                          <Text className="text-sm font-semibold text-foreground">
                            {Math.round(activity.avg_power)}W
                          </Text>
                        </View>
                      )}
                      {activity.avg_heart_rate && (
                        <View>
                          <Text className="text-xs text-muted-foreground">Avg HR</Text>
                          <Text className="text-sm font-semibold text-foreground">
                            {Math.round(activity.avg_heart_rate)} bpm
                          </Text>
                        </View>
                      )}
                    </View>
                  </CardContent>
                </Card>
              </TouchableOpacity>
            ))}

            {/* Load More */}
            {hasMore && (
              <View className="py-4 items-center">
                {isLoading ? (
                  <Text className="text-sm text-muted-foreground">Loading more...</Text>
                ) : (
                  <Button variant="outline" onPress={handleLoadMore}>
                    <Text>Load More</Text>
                  </Button>
                )}
              </View>
            )}

            {/* End of List */}
            {!hasMore && activities.length > 0 && (
              <View className="py-4">
                <Text className="text-center text-sm text-muted-foreground">
                  You&apos;ve reached the end
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
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
