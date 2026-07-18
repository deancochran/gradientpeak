// gradientpeak/apps/mobile/app/(internal)/(tabs)/trends/components/ActivityListModal.tsx

import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Activity, Calendar, X, Zap } from "lucide-react-native";
import { useEffect } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { api } from "@/lib/api";
import { formatEstimatedTss } from "@/lib/estimatedMetrics";
import { useAuth } from "@/lib/hooks/useAuth";

interface ActivityListModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  dateFrom: string;
  dateTo: string;
  intensityZone?: string;
  onClose: () => void;
  onActivityPress?: (activityId: string) => void;
}

function getDerivedActivityMetric(
  activity: { derived?: { tss?: number | null; intensity_factor?: number | null } | null },
  key: "tss" | "intensity_factor",
) {
  return activity.derived?.[key] ?? null;
}

/**
 * Modal for displaying filtered activities with drill-down from trends
 * Simple, stable navigation pattern for enterprise reliability
 */
export function ActivityListModal({
  visible,
  title,
  subtitle,
  dateFrom,
  dateTo,
  intensityZone,
  onClose,
  onActivityPress,
}: ActivityListModalProps) {
  const { profile, user } = useAuth();
  const activityOwner = user?.id
    ? {
        avatar_url: profile?.avatar_url ?? null,
        id: user.id,
        username: profile?.username ?? user.email?.split("@")[0] ?? "You",
      }
    : null;

  // Fetch activities for the date range
  const {
    data: activitiesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = api.activities.listPaginated.useInfiniteQuery(
    {
      date_from: dateFrom,
      date_to: dateTo,
      limit: 50,
    },
    {
      enabled: visible,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const activities = activitiesData?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (!visible || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, visible]);

  // Filter by intensity zone if specified
  const filteredActivities = intensityZone
    ? activities.filter((activity) => {
        const rawIf = getDerivedActivityMetric(activity, "intensity_factor");
        if (rawIf == null) return false;
        const if_value = rawIf;
        // Map intensity factor to zones
        switch (intensityZone) {
          case "recovery":
            return if_value < 0.55;
          case "endurance":
            return if_value >= 0.55 && if_value < 0.75;
          case "tempo":
            return if_value >= 0.75 && if_value < 0.85;
          case "threshold":
            return if_value >= 0.85 && if_value < 0.95;
          case "vo2max":
            return if_value >= 0.95 && if_value < 1.05;
          case "anaerobic":
            return if_value >= 1.05 && if_value < 1.15;
          case "neuromuscular":
            return if_value >= 1.15;
          default:
            return true;
        }
      })
    : activities;

  const formatDate = (value: string | Date) => {
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const handleActivityPress = (activityId: string) => {
    onClose();

    if (onActivityPress) {
      InteractionManager.runAfterInteractions(() => {
        onActivityPress(activityId);
      });
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="bg-background border-b border-border px-4 pt-12 pb-4">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-1">
              <Text className="text-xl font-bold text-foreground">{title}</Text>
              {subtitle && <Text className="text-sm text-muted-foreground mt-1">{subtitle}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} className="ml-4 p-2 rounded-full bg-muted">
              <Icon as={X} size={20} className="text-muted-foreground" />
            </TouchableOpacity>
          </View>

          {/* Filter info */}
          <View className="flex-row items-center gap-2 mt-2">
            <View className="flex-row items-center gap-1 px-2 py-1 bg-muted rounded">
              <Icon as={Calendar} size={12} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">
                {formatDate(dateFrom)} - {formatDate(dateTo)}
              </Text>
            </View>
            {intensityZone && (
              <View className="flex-row items-center gap-1 px-2 py-1 bg-muted rounded">
                <Icon as={Zap} size={12} className="text-muted-foreground" />
                <Text className="text-xs text-muted-foreground capitalize">{intensityZone}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Activity List */}
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
            <Text className="text-muted-foreground mt-2">Loading activities...</Text>
          </View>
        ) : filteredActivities.length === 0 ? (
          <View className="flex-1 justify-center p-6">
            <EmptyStateCard
              icon={Activity}
              title="No Activities Found"
              description={
                intensityZone
                  ? `No activities in the ${intensityZone} zone for this period`
                  : "No activities found for this date range"
              }
              iconSize={32}
            />
          </View>
        ) : (
          <ScrollView className="flex-1">
            <View className="p-4">
              {/* Summary */}
              <View className="bg-muted border border-border rounded-lg p-4 mb-4">
                <View className="flex-row items-center justify-around">
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-foreground">
                      {filteredActivities.length}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-1">Activities</Text>
                  </View>
                  <View className="w-px h-8 bg-border" />
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-foreground">
                      {formatEstimatedTss(
                        filteredActivities.reduce(
                          (sum, a) => sum + (getDerivedActivityMetric(a, "tss") || 0),
                          0,
                        ),
                        { includeUnit: false },
                      )}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-1">Total TSS</Text>
                  </View>
                  <View className="w-px h-8 bg-border" />
                  <View className="items-center">
                    <Text className="text-2xl font-bold text-foreground">
                      {formatDuration(
                        filteredActivities.reduce(
                          (sum, activity) =>
                            sum + (activity.active_ms ?? activity.elapsed_ms) / 1000,
                          0,
                        ),
                      )}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-1">Total Time</Text>
                  </View>
                </View>
              </View>

              {/* Activity Cards */}
              <View className="gap-3">
                {filteredActivities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    dateMode="absolute"
                    onPress={() => handleActivityPress(activity.id)}
                    owner={activityOwner}
                    variant="list"
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
