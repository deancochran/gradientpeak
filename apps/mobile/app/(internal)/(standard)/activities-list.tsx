import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { EmptyStateCard, ListSkeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { PublicActivityCategory } from "@repo/core";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import { Activity, ChevronRight } from "lucide-react-native";
import React, { useState } from "react";
import {
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

type SortBy = "date" | "distance" | "duration" | "tss";

const ACTIVITY_TYPES: {
  value: PublicActivityCategory;
  label: string;
  icon: string;
}[] = [
  { value: "run", label: "Run", icon: "🏃" },
  { value: "bike", label: "Bike", icon: "🚴" },
  { value: "swim", label: "Swim", icon: "🏊" },
  { value: "strength", label: "Strength", icon: "💪" },
  { value: "other", label: "Other", icon: "🎯" },
];

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
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedType, setSelectedType] =
    useState<PublicActivityCategory>("bike");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [page, setPage] = useState(0);
  const limit = 20;

  // Query paginated activities
  const {
    data: activitiesData,
    isLoading,
    refetch,
  } = trpc.activities.listPaginated.useQuery({
    limit,
    offset: page * limit,
    activity_category: selectedType === "bike" ? undefined : selectedType,
    sort_by: sortBy,
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
    router.push(`/activity-detail?id=${activityId}` as any);
  };

  const handleLoadMore = () => {
    if (hasMore && !isLoading) {
      setPage((prev) => prev + 1);
    }
  };

  const handleTypeChange = (type: PublicActivityCategory) => {
    setSelectedType(type);
    setPage(0); // Reset to first page
  };

  const getActivityIcon = (type: string) => {
    const activityType = ACTIVITY_TYPES.find((t) => t.value === type);
    return activityType?.icon || "🎯";
  };

  const getActivityColor = (type: string) => {
    const colors: Record<string, string> = {
      run: "text-orange-500",
      bike: "text-blue-500",
      swim: "text-cyan-500",
      strength: "text-purple-500",
      other: "text-gray-500",
    };
    return colors[type] || "text-gray-500";
  };

  if (isLoading && page === 0) {
    return (
      <ScrollView className="flex-1 bg-background">
        <View className="p-4">
          <ListSkeleton count={8} />
        </View>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Filter Chips */}
      <View className="bg-card border-b border-border">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-4 py-3 gap-2"
        >
          {ACTIVITY_TYPES.map((type) => (
            <TouchableOpacity
              key={type.value}
              onPress={() => handleTypeChange(type.value)}
              className={`px-4 py-2 rounded-full border ${
                selectedType === type.value
                  ? "bg-primary border-primary"
                  : "bg-background border-border"
              }`}
            >
              <Text
                className={`font-medium ${
                  selectedType === type.value
                    ? "text-primary-foreground"
                    : "text-foreground"
                }`}
              >
                {type.icon} {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Activity Count */}
      {total > 0 && (
        <View className="px-4 py-3 bg-muted/30">
          <Text className="text-sm text-muted-foreground">
            {total} {total === 1 ? "activity" : "activities"} found
          </Text>
        </View>
      )}

      {/* Activity List */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 gap-3"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const isCloseToBottom =
            layoutMeasurement.height + contentOffset.y >=
            contentSize.height - 100;
          if (isCloseToBottom && hasMore && !isLoading) {
            handleLoadMore();
          }
        }}
        scrollEventThrottle={400}
      >
        {activities.length === 0 ? (
          <View className="flex-1 items-center justify-center py-12">
            <EmptyStateCard
              icon={Activity}
              title="No Activities Found"
              description="Start recording activities to see them here"
              actionLabel="Record Activity"
              onAction={() => router.push("/record" as any)}
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
              >
                <Card>
                  <CardContent className="p-4">
                    {/* Header with avatar, username, metadata */}
                    <View className="flex-row items-start gap-3 mb-3">
                      <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                        <Text className="text-xl">
                          {getActivityIcon(activity.type)}
                        </Text>
                      </View>

                      <View className="flex-1">
                        {/* Username (or user info if available) */}
                        <Text className="text-sm font-semibold text-foreground">
                          You
                        </Text>

                        {/* Metadata Row: Date + Device + Location */}
                        <View className="flex-row items-center gap-1.5 mt-1 flex-wrap">
                          <Text className="text-xs text-muted-foreground">
                            {format(
                              new Date(activity.started_at),
                              "MMM d, yyyy • h:mm a",
                            )}
                          </Text>
                          {activity.device_manufacturer && (
                            <>
                              <Text className="text-xs text-muted-foreground">
                                •
                              </Text>
                              <Text className="text-xs text-muted-foreground">
                                {activity.device_manufacturer}{" "}
                                {activity.device_product || ""}
                              </Text>
                            </>
                          )}
                          {activity.location && (
                            <>
                              <Text className="text-xs text-muted-foreground">
                                •
                              </Text>
                              <Text className="text-xs text-muted-foreground capitalize">
                                {activity.location}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>

                      {/* Chevron */}
                      <Icon
                        as={ChevronRight}
                        size={20}
                        className="text-muted-foreground"
                      />
                    </View>

                    {/* Activity Name */}
                    <Text className="text-base font-semibold text-foreground mb-1">
                      {activity.name}
                    </Text>

                    {/* Notes (if any) */}
                    {activity.notes && (
                      <Text
                        className="text-sm text-muted-foreground mb-3"
                        numberOfLines={2}
                      >
                        {activity.notes}
                      </Text>
                    )}

                    {/* Key Metrics */}
                    <View className="flex-row items-center gap-4 flex-wrap">
                      {activity.distance_meters > 0 && (
                        <View>
                          <Text className="text-xs text-muted-foreground uppercase">
                            Distance
                          </Text>
                          <Text className="text-sm font-semibold">
                            {formatDistance(activity.distance_meters)}
                          </Text>
                        </View>
                      )}
                      <View>
                        <Text className="text-xs text-muted-foreground uppercase">
                          Duration
                        </Text>
                        <Text className="text-sm font-semibold">
                          {formatDuration(activity.duration_seconds)}
                        </Text>
                      </View>
                      {activity.training_stress_score !== null &&
                        activity.training_stress_score !== undefined && (
                          <View>
                            <Text className="text-xs text-muted-foreground uppercase">
                              TSS
                            </Text>
                            <Text className="text-sm font-semibold text-primary">
                              {Math.round(activity.training_stress_score)}
                            </Text>
                          </View>
                        )}
                      {activity.avg_power && (
                        <View>
                          <Text className="text-xs text-muted-foreground uppercase">
                            Avg Power
                          </Text>
                          <Text className="text-sm font-semibold">
                            {Math.round(activity.avg_power)}W
                          </Text>
                        </View>
                      )}
                      {activity.avg_heart_rate && (
                        <View>
                          <Text className="text-xs text-muted-foreground uppercase">
                            Avg HR
                          </Text>
                          <Text className="text-sm font-semibold">
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
                  <Text className="text-sm text-muted-foreground">
                    Loading more...
                  </Text>
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
                  You've reached the end
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
