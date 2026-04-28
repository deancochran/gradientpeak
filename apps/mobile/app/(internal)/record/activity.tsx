/**
 * Activity Selection Screen
 *
 * Allows users to change activity category before recording starts.
 *
 * Restrictions:
 * - Only accessible if no Activity Plan is attached
 * - Once an Activity Plan is attached, category is locked to the plan's category
 *
 */

import type { RecordingActivityCategory } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { router } from "expo-router";
import { Activity, Bike, Check, Dumbbell, Footprints, Waves } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useActivityStatus, useRecordingState } from "@/lib/hooks/useActivityRecorder";
import { useRecordingSessionContract } from "@/lib/hooks/useRecordingConfig";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";

const ACTIVITY_CATEGORIES: {
  value: RecordingActivityCategory;
  label: string;
  icon: any;
}[] = [
  { value: "run", label: "Run", icon: Footprints },
  { value: "bike", label: "Bike", icon: Bike },
  { value: "swim", label: "Swim", icon: Waves },
  { value: "strength", label: "Strength", icon: Dumbbell },
  { value: "other", label: "Other", icon: Activity },
];

export default function ActivitySelectionScreen() {
  const service = useSharedActivityRecorder();
  const { activityCategory, gpsRecordingEnabled } = useActivityStatus(service);
  const recordingState = useRecordingState(service);
  const sessionContract = useRecordingSessionContract(service);

  // Check if a plan is attached (category should be locked)
  const hasPlan = sessionContract?.guidance.hasPlan ?? service?.hasPlan ?? false;
  const isSetupLocked = recordingState !== "pending" && recordingState !== "ready";
  const canEditActivity = sessionContract?.editing.canEditActivity ?? (!hasPlan && !isSetupLocked);

  const [selectedCategory, setSelectedCategory] =
    useState<RecordingActivityCategory>(activityCategory);
  const handleSave = () => {
    if (!service || !canEditActivity) return;

    // The service will preserve any existing plan automatically.
    service.selectActivityFromPayload({
      category: canEditActivity ? selectedCategory : activityCategory,
      gpsRecordingEnabled,
    });

    router.back();
  };

  const activityChanged = selectedCategory !== activityCategory;
  const hasChanges = activityChanged && canEditActivity;

  return (
    <View className="flex-1 bg-background" testID="record-activity-screen">
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Info Banner - Category Locked */}
        {isSetupLocked ? (
          <View className="bg-muted/50 p-3 rounded-lg mb-4 border border-border">
            <Text className="text-xs text-muted-foreground">
              Activity identity is locked after recording starts. Finish this workout to change the
              category for a new session.
            </Text>
          </View>
        ) : null}

        {hasPlan && !isSetupLocked && (
          <View className="bg-muted/50 p-3 rounded-lg mb-4 border border-border">
            <Text className="text-xs text-muted-foreground">
              Category is locked because an Activity Plan is attached. Detach the plan to change
              category.
            </Text>
          </View>
        )}

        {/* Category Section */}
        <View className="mb-6">
          <Text className="text-sm font-medium text-muted-foreground mb-3">Activity Category</Text>
          <View className="gap-3">
            {ACTIVITY_CATEGORIES.map((cat) => (
              <Pressable
                key={cat.value}
                onPress={() => canEditActivity && setSelectedCategory(cat.value)}
                disabled={!canEditActivity}
                testID={`record-activity-option-${cat.value}`}
                className="bg-card p-4 rounded-lg border border-border"
                style={{
                  borderColor: selectedCategory === cat.value ? "rgb(34, 197, 94)" : undefined,
                  borderWidth: selectedCategory === cat.value ? 2 : 1,
                  opacity: !canEditActivity && selectedCategory !== cat.value ? 0.5 : 1,
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
      </ScrollView>

      {/* Save Button */}
      <View className="p-4 border-t border-border">
        <Button
          onPress={handleSave}
          disabled={!hasChanges}
          className="w-full"
          testID="record-activity-save-button"
        >
          <Text className="text-primary-foreground">
            {canEditActivity ? "Save Changes" : "Locked For This Session"}
          </Text>
        </Button>
      </View>
    </View>
  );
}
