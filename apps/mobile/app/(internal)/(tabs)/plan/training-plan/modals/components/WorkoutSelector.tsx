// apps/mobile/app/(internal)/(tabs)/plan/training-plan/modals/components/WorkoutSelector.tsx

import { Text } from "@/components/ui/text";
import { Search } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";

export interface WorkoutOption {
  id: string;
  name: string;
  activity_type: string;
  estimated_duration: number;
  estimated_tss: number | null;
  description?: string | null;
}

interface WorkoutSelectorProps {
  workouts: WorkoutOption[];
  selectedWorkoutId: string | null;
  onSelect: (workout: WorkoutOption) => void;
  disabled?: boolean;
}

/**
 * WorkoutSelector Component
 *
 * Displays a searchable list of workout plans that can be scheduled.
 * Includes search filtering, activity type icons, and workout details.
 *
 * Features:
 * - Search by workout name
 * - Filter by activity type
 * - Display duration and TSS estimates
 * - Visual selection indicator
 *
 * Usage:
 * ```tsx
 * const [selected, setSelected] = useState<WorkoutOption | null>(null);
 * <WorkoutSelector
 *   workouts={workoutsList}
 *   selectedWorkoutId={selected?.id ?? null}
 *   onSelect={setSelected}
 * />
 * ```
 */
export function WorkoutSelector({
  workouts,
  selectedWorkoutId,
  onSelect,
  disabled = false,
}: WorkoutSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter workouts based on search query
  const filteredWorkouts = workouts.filter((workout) => {
    const matchesSearch = workout.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getActivityTypeLabel = (type: string): string => {
    const typeMap: Record<string, string> = {
      outdoor_run: "Run",
      outdoor_bike: "Bike",
      indoor_treadmill: "Treadmill",
      indoor_bike_trainer: "Bike Trainer",
      indoor_strength: "Strength",
      indoor_swim: "Swim",
    };
    return typeMap[type] || type;
  };

  const getActivityTypeIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      outdoor_run: "🏃",
      outdoor_bike: "🚴",
      indoor_treadmill: "🏃‍♂️",
      indoor_bike_trainer: "🚴‍♀️",
      indoor_strength: "💪",
      indoor_swim: "🏊",
    };
    return iconMap[type] || "🏋️";
  };

  const renderWorkoutItem = ({ item }: { item: WorkoutOption }) => {
    const isSelected = selectedWorkoutId === item.id;

    return (
      <Pressable
        onPress={() => !disabled && onSelect(item)}
        disabled={disabled}
        className={`
          mb-2 rounded-lg border-2 p-3
          ${isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}
          ${disabled ? "opacity-50" : ""}
        `}
      >
        <View className="flex-row items-start">
          {/* Activity Type Icon */}
          <View className="mr-3 items-center justify-center w-10 h-10 rounded-full bg-gray-100">
            <Text className="text-2xl">
              {getActivityTypeIcon(item.activity_type)}
            </Text>
          </View>

          {/* Workout Details */}
          <View className="flex-1">
            <Text
              className={`font-semibold text-base ${isSelected ? "text-blue-700" : "text-gray-900"}`}
            >
              {item.name}
            </Text>
            <Text className="text-sm text-gray-600 mt-0.5">
              {getActivityTypeLabel(item.activity_type)}
            </Text>
            {item.description && (
              <Text className="text-xs text-gray-500 mt-1" numberOfLines={2}>
                {item.description}
              </Text>
            )}
            <View className="flex-row mt-2 space-x-4">
              <Text className="text-sm text-gray-600">
                ⏱️ {formatDuration(item.estimated_duration)}
              </Text>
              {item.estimated_tss !== null && (
                <Text className="text-sm text-gray-600">
                  📊 {Math.round(item.estimated_tss)} TSS
                </Text>
              )}
            </View>
          </View>

          {/* Selection Indicator */}
          {isSelected && (
            <View className="ml-2 items-center justify-center w-6 h-6 rounded-full bg-blue-500">
              <Text className="text-white text-xs font-bold">✓</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1">
      {/* Header */}
      <Text className="text-sm font-semibold text-gray-700 mb-2">
        Select a Workout
      </Text>

      {/* Search Input */}
      <View className="relative mb-3">
        <View className="absolute left-3 top-3 z-10">
          <Search size={20} className="text-gray-400" />
        </View>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search workouts..."
          className="pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-white text-base"
          editable={!disabled}
        />
      </View>

      {/* Workout Count */}
      {searchQuery && (
        <Text className="text-sm text-gray-600 mb-2">
          {filteredWorkouts.length} workout
          {filteredWorkouts.length !== 1 ? "s" : ""} found
        </Text>
      )}

      {/* Workout List */}
      {filteredWorkouts.length === 0 ? (
        <View className="flex-1 items-center justify-center py-8">
          <Text className="text-gray-500 text-center">
            {searchQuery
              ? "No workouts match your search"
              : "No workouts available"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredWorkouts}
          renderItem={renderWorkoutItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={true}
          contentContainerClassName="pb-4"
        />
      )}
    </View>
  );
}
