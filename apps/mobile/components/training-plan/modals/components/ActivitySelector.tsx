// apps/mobile/app/(internal)/(tabs)/plan/training-plan/modals/components/ActivitySelector.tsx

import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { CircleCheck } from "lucide-react-native";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { EmptyState } from "@/components/shared/ScreenState";
import { SearchField } from "@/components/shared/SearchField";

export interface ActivityOption {
  id: string;
  name: string;
  activity_category: string;
  authoritative_metrics?: {
    estimated_duration?: number | null;
    estimated_tss?: number | null;
  } | null;
  description?: string | null;
}

interface ActivitySelectorProps {
  activities: ActivityOption[];
  selectedActivityId: string | null;
  onSelect: (activity: ActivityOption) => void;
  disabled?: boolean;
}

/**
 * ActivitySelector Component
 *
 * Displays a searchable list of activity plans that can be scheduled.
 * Includes search filtering and canonical activity plan cards.
 *
 * Features:
 * - Search by activity name
 * - Display compact activity plan cards
 * - Visual selection indicator
 *
 * Usage:
 * ```tsx
 * const [selected, setSelected] = useState<ActivityOption | null>(null);
 * <ActivitySelector
 *   activities={activitiesList}
 *   selectedActivityId={selected?.id ?? null}
 *   onSelect={setSelected}
 * />
 * ```
 */
export function ActivitySelector({
  activities,
  selectedActivityId,
  onSelect,
  disabled = false,
}: ActivitySelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter activities based on search query
  const filteredActivities = activities.filter((activity) => {
    const matchesSearch = activity.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const renderActivityItem = ({ item }: { item: ActivityOption }) => {
    const isSelected = selectedActivityId === item.id;

    return (
      <View
        accessibilityState={{ disabled, selected: isSelected }}
        className={`mb-3 rounded-xl ${isSelected ? "border-2 border-primary p-0.5" : ""} ${disabled ? "opacity-50" : ""}`}
        pointerEvents={disabled ? "none" : "auto"}
        testID={`activity-selector-option-${item.id}`}
      >
        <ActivityPlanCard
          activityPlan={item}
          onPress={() => onSelect(item)}
          testID={`activity-selector-activity-plan-${item.id}`}
          variant="compact"
        />
        {isSelected ? (
          <View
            className="absolute bottom-2 right-2 rounded-full bg-primary p-1"
            pointerEvents="none"
          >
            <Icon as={CircleCheck} className="text-primary-foreground" size={16} />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View className="flex-1">
      {/* Header */}
      <Text className="text-sm font-semibold text-foreground mb-2">Select an Activity</Text>

      {/* Search Input */}
      <View className="relative mb-3">
        <SearchField
          accessibilityLabel="Search activities"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder="Search activities..."
          className="h-12 text-base"
          editable={!disabled}
        />
      </View>

      {/* Activity Count */}
      {searchQuery && (
        <Text className="text-sm text-muted-foreground mb-2">
          {filteredActivities.length} activity
          {filteredActivities.length !== 1 ? "s" : ""} found
        </Text>
      )}

      {/* Activity List */}
      {filteredActivities.length === 0 ? (
        <EmptyState
          description={
            searchQuery ? "Try a different activity name." : "Add an activity plan to schedule it."
          }
          title={searchQuery ? "No activities match your search" : "No activities available"}
        />
      ) : (
        <FlatList
          data={filteredActivities}
          renderItem={renderActivityItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={true}
          contentContainerClassName="pb-4"
        />
      )}
    </View>
  );
}
