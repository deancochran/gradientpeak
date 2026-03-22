/**
 * Activity Plan Picker Page
 *
 * Full-screen page for selecting/detaching activity plans during recording.
 * Accessed via navigation from footer "Activity Plan" tile.
 *
 * Features:
 * - Display list of today's planned activities
 * - Search and filter functionality
 * - "Detach Plan" option if plan currently attached
 * - Plan selection overrides current category if different
 * - Standard back navigation via header
 * - Recording continues in background
 */

import type { PublicActivityCategory } from "@repo/supabase";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { router } from "expo-router";
import { CalendarDays, Check, Search } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useActivityStatus, usePlan } from "@/lib/hooks/useActivityRecorder";
import { useRecordingConfiguration } from "@/lib/hooks/useRecordingConfiguration";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { trpc } from "@/lib/trpc";

const CATEGORY_OPTIONS: {
  value: PublicActivityCategory | "all";
  label: string;
}[] = [
  { value: "all", label: "All Categories" },
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
  { value: "swim", label: "Swim" },
  { value: "strength", label: "Strength" },
  { value: "other", label: "Other" },
];

export default function PlanPickerPage() {
  const service = useSharedActivityRecorder();
  const plan = usePlan(service);
  const { activityCategory, gpsRecordingEnabled } = useActivityStatus(service);
  const { attachPlan, detachPlan } = useRecordingConfiguration(service);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<PublicActivityCategory | "all">("all");

  // Fetch today's planned events
  const { data: plannedActivities, isLoading } = trpc.events.getToday.useQuery();

  // Filter planned activities by search and category filter
  const filteredPlannedActivities = React.useMemo(() => {
    if (!plannedActivities) return [];

    return plannedActivities.filter((pa) => {
      // Category filter
      if (categoryFilter !== "all" && pa.activity_plan?.activity_category !== categoryFilter) {
        return false;
      }

      // Search filter (searches name and description)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const name = pa.activity_plan?.name?.toLowerCase() || "";
        const description = pa.activity_plan?.description?.toLowerCase() || "";

        if (!name.includes(query) && !description.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [plannedActivities, searchQuery, categoryFilter]);

  // Handle planned activity selection
  const handlePlanPress = useCallback(
    (eventId: string, planCategory: PublicActivityCategory) => {
      // If plan's category differs from current category, update category first
      if (service && planCategory !== activityCategory) {
        console.log(
          `[PlanPicker] Plan category (${planCategory}) differs from current (${activityCategory}). Updating category.`,
        );
        service.selectActivityFromPayload({
          category: planCategory,
          gpsRecordingEnabled,
        });
      }

      attachPlan(eventId);
      router.back();
    },
    [attachPlan, service, activityCategory, gpsRecordingEnabled],
  );

  // Handle detach plan
  const handleDetach = useCallback(() => {
    detachPlan();
    router.back();
  }, [detachPlan]);

  const currentEventId = service?.recordingMetadata?.eventId;

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Search Input */}
        <View className="mb-3">
          <View className="relative">
            <Icon
              as={Search}
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10"
              style={{ top: "50%", transform: [{ translateY: -9 }] }}
            />
            <Input
              placeholder="Search plans..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="pl-10"
            />
          </View>
        </View>

        {/* Category Filter Dropdown */}
        <View className="mb-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
            <View className="flex-row gap-2">
              {CATEGORY_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setCategoryFilter(option.value)}
                  className="px-3 py-2 rounded-full border border-border"
                  style={{
                    backgroundColor:
                      categoryFilter === option.value ? "rgb(34, 197, 94)" : undefined,
                  }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{
                      color: categoryFilter === option.value ? "white" : undefined,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Loading State */}
        {isLoading && (
          <View className="items-center justify-center py-8">
            <ActivityIndicator size="large" />
            <Text className="text-sm text-muted-foreground mt-2">Loading plans...</Text>
          </View>
        )}

        {/* Detach Plan Option (if plan attached) */}
        {!isLoading && currentEventId && (
          <Pressable
            onPress={handleDetach}
            className="bg-card p-4 rounded-lg border border-border mb-3"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-base font-medium text-destructive">
                  Detach Current Activity Plan
                </Text>
                <Text className="text-sm text-muted-foreground mt-1">
                  Remove activity plan from this workout
                </Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* Planned Activities List */}
        {!isLoading && filteredPlannedActivities && filteredPlannedActivities.length > 0 ? (
          <View className="gap-3 pb-6">
            {filteredPlannedActivities.map((plannedActivity) => (
              <PlannedActivityListItem
                key={plannedActivity.id}
                plannedActivity={plannedActivity as any}
                isSelected={plannedActivity.id === currentEventId}
                onPress={() =>
                  handlePlanPress(
                    plannedActivity.id,
                    plannedActivity.activity_plan?.activity_category as PublicActivityCategory,
                  )
                }
              />
            ))}
          </View>
        ) : (
          !isLoading && (
            <EmptyStateCard
              icon={CalendarDays}
              title={
                searchQuery || categoryFilter !== "all"
                  ? "No matching activities found"
                  : "No planned activities for today"
              }
              description={
                searchQuery || categoryFilter !== "all"
                  ? "Try adjusting your search or filter"
                  : "Schedule activities from the Plan tab"
              }
              iconSize={32}
            />
          )
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Planned Activity List Item Component
 */
interface PlannedActivityListItemProps {
  plannedActivity: {
    id: string;
    scheduled_date: string;
    activity_plan: {
      id: string;
      name: string;
      description: string | null;
      activity_category: string;
    } | null;
  };
  isSelected: boolean;
  onPress: () => void;
}

function PlannedActivityListItem({
  plannedActivity,
  isSelected,
  onPress,
}: PlannedActivityListItemProps) {
  const activityPlan = plannedActivity.activity_plan;

  // Format the scheduled time
  const scheduledTime = new Date(plannedActivity.scheduled_date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <Pressable
      onPress={onPress}
      className="bg-card p-4 rounded-lg border border-border"
      style={{
        borderColor: isSelected ? "rgb(34, 197, 94)" : undefined,
        borderWidth: isSelected ? 2 : 1,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1">
            <Text className="text-xs text-muted-foreground">{scheduledTime}</Text>
            {activityPlan && (
              <>
                <Text className="text-xs text-muted-foreground">•</Text>
                <Text className="text-xs text-muted-foreground capitalize">
                  {activityPlan.activity_category}
                </Text>
              </>
            )}
          </View>
          <Text className="text-base font-medium">{activityPlan?.name || "Unnamed Activity"}</Text>
          {activityPlan?.description && (
            <Text className="text-sm text-muted-foreground mt-1">{activityPlan.description}</Text>
          )}
        </View>

        {isSelected && <Icon as={Check} size={20} className="text-green-500 ml-2" />}
      </View>
    </Pressable>
  );
}
