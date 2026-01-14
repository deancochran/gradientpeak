/**
 * Activity Selection Screen
 *
 * Allows users to change activity category and location before recording starts.
 *
 * Restrictions:
 * - Only accessible if no Activity Plan is attached
 * - Once an Activity Plan is attached, category is locked to the plan's category
 * - Location can be changed at any time before recording starts
 */

import React, { useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Activity,
  Bike,
  Dumbbell,
  Footprints,
  Waves,
  Check,
} from "lucide-react-native";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { useActivityStatus } from "@/lib/hooks/useActivityRecorder";
import type {
  PublicActivityCategory,
  PublicActivityLocation,
} from "@repo/core";

const ACTIVITY_CATEGORIES: {
  value: PublicActivityCategory;
  label: string;
  icon: any;
}[] = [
  { value: "run", label: "Run", icon: Footprints },
  { value: "bike", label: "Bike", icon: Bike },
  { value: "swim", label: "Swim", icon: Waves },
  { value: "strength", label: "Strength", icon: Dumbbell },
  { value: "other", label: "Other", icon: Activity },
];

const ACTIVITY_LOCATIONS: {
  value: PublicActivityLocation;
  label: string;
}[] = [
  { value: "outdoor", label: "Outdoor" },
  { value: "indoor", label: "Indoor" },
];

export default function ActivitySelectionScreen() {
  const service = useSharedActivityRecorder();
  const { activityCategory, activityLocation } = useActivityStatus(service);

  // Check if a plan is attached (category should be locked)
  const hasPlan = !!service?.recordingMetadata?.plannedActivityId;

  const [selectedCategory, setSelectedCategory] =
    useState<PublicActivityCategory>(activityCategory);
  const [selectedLocation, setSelectedLocation] =
    useState<PublicActivityLocation>(activityLocation);

  const handleSave = () => {
    if (!service) return;

    // Update the activity category and location
    // If a plan is attached, only location changes (category is locked)
    service.selectActivityFromPayload({
      category: selectedCategory,
      location: selectedLocation,
    });

    router.back();
  };

  // Check if there are any changes (location can change even with plan attached)
  const hasChanges =
    selectedCategory !== activityCategory ||
    selectedLocation !== activityLocation;

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Info Banner - Category Locked */}
        {hasPlan && (
          <View className="bg-muted/50 p-3 rounded-lg mb-4 border border-border">
            <Text className="text-xs text-muted-foreground">
              Category is locked because an Activity Plan is attached. Detach the plan to change category.
            </Text>
          </View>
        )}

        {/* Category Section */}
        <View className="mb-6">
          <Text className="text-sm font-medium text-muted-foreground mb-3">
            Activity Category
          </Text>
          <View className="gap-3">
            {ACTIVITY_CATEGORIES.map((cat) => (
              <Pressable
                key={cat.value}
                onPress={() => !hasPlan && setSelectedCategory(cat.value)}
                disabled={hasPlan}
                className="bg-card p-4 rounded-lg border border-border"
                style={{
                  borderColor:
                    selectedCategory === cat.value
                      ? "rgb(34, 197, 94)"
                      : undefined,
                  borderWidth: selectedCategory === cat.value ? 2 : 1,
                  opacity: hasPlan && selectedCategory !== cat.value ? 0.5 : 1,
                }}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <Icon as={cat.icon} size={20} />
                    <Text className="text-base font-medium">{cat.label}</Text>
                  </View>
                  {selectedCategory === cat.value && (
                    <Icon as={Check} size={20} className="text-green-500" />
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Location Section */}
        <View className="mb-6">
          <Text className="text-sm font-medium text-muted-foreground mb-3">
            Activity Location
          </Text>
          <View className="gap-3">
            {ACTIVITY_LOCATIONS.map((loc) => (
              <Pressable
                key={loc.value}
                onPress={() => setSelectedLocation(loc.value)}
                className="bg-card p-4 rounded-lg border border-border"
                style={{
                  borderColor:
                    selectedLocation === loc.value
                      ? "rgb(34, 197, 94)"
                      : undefined,
                  borderWidth: selectedLocation === loc.value ? 2 : 1,
                }}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-medium">{loc.label}</Text>
                  {selectedLocation === loc.value && (
                    <Icon as={Check} size={20} className="text-green-500" />
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View className="p-4 border-t border-border">
        <Button
          onPress={handleSave}
          disabled={!hasChanges}
          className="w-full"
        >
          <Text className="text-primary-foreground">Save Changes</Text>
        </Button>
      </View>
    </View>
  );
}
