import { ActivityTypeSelector } from "@/components/ActivityPlan/ActivityTypeSelector";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import {
  calculateAverageIF,
  calculateTotalDuration,
  calculateTotalTSS,
  flattenPlanSteps,
  getDefaultUserSettings,
} from "@repo/core";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Pressable, View } from "react-native";

/**
 * Format duration in milliseconds to readable string
 */
function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}min`
    : `${hours}h`;
}

export default function CreateActivityPlanScreen() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get state and actions from Zustand store
  const {
    name,
    description,
    activityType,
    structure,
    setName,
    setDescription,
    setActivityType,
    reset,
  } = useActivityPlanCreationStore();

  const steps = useMemo(() => structure.steps || [], [structure.steps]);

  // Calculate metrics from structure - these are read-only derived values
  const metrics = useMemo(() => {
    const flatSteps = flattenPlanSteps(steps);
    const durationMs = calculateTotalDuration(flatSteps);

    // Get default user settings for TSS/IF calculations
    const userSettings = getDefaultUserSettings(activityType);
    const totalTSS = calculateTotalTSS(steps, userSettings);
    const averageIF = calculateAverageIF(steps, userSettings);

    return {
      stepCount: flatSteps.length,
      duration: durationMs,
      durationFormatted: formatDuration(durationMs),
      tss: totalTSS,
      if: averageIF,
    };
  }, [steps, activityType]);

  // Clean up store when navigating away from creation flow
  React.useEffect(() => {
    return () => {
      // Only reset if we're actually leaving the creation flow
      // (not just navigating to sub-pages)
      const currentRoute = router.canGoBack() ? "sub" : "main";
      if (currentRoute === "main") {
        reset();
      }
    };
  }, [reset]);

  /**
   * Handle navigating to structure editor
   */
  const handleEditStructure = () => {
    // No need to pass params - structure page will use the store
    router.push({
      pathname:
        "/(internal)/(tabs)/plan/create_activity_plan/structure/" as any,
    });
  };

  /**
   * Handle cancel - go back without saving
   */
  const handleCancel = () => {
    Alert.alert(
      "Discard Activity Plan",
      "Are you sure you want to discard this activity plan?",
      [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            reset(); // Reset the store
            router.back();
          },
        },
      ],
    );
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async () => {
    // Validate required fields
    if (!name.trim()) {
      Alert.alert("Validation Error", "Activity name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const finalData = {
        name,
        description,
        activity_type: activityType,
        structure,
        estimated_duration: Math.round(metrics.duration / 60000) || 0,
        estimated_tss: Math.round(metrics.tss) || 0,
      };

      // TODO: Save to database via API/tRPC
      console.log("Saving activity plan:", finalData);

      // Show success message
      Alert.alert("Success", "Activity plan saved successfully!", [
        {
          text: "OK",
          onPress: () => {
            reset(); // Reset the store after successful save
            router.back();
          },
        },
      ]);
    } catch (error) {
      console.error("Error saving activity plan:", error);
      Alert.alert("Error", "Failed to save activity plan. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header with Cancel, Title, and Submit buttons */}
      <View className="bg-card border-b border-border">
        <View className="flex-row items-center justify-between px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onPress={handleCancel}
            disabled={isSubmitting}
          >
            <Text>Cancel</Text>
          </Button>

          <Text className="text-lg font-semibold">Create Activity Plan</Text>

          <Button
            variant="default"
            size="sm"
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text className="text-primary-foreground font-medium">
              {isSubmitting ? "Saving..." : "Save"}
            </Text>
          </Button>
        </View>
      </View>

      {/* Compact Form - No scrolling needed */}
      <View className="flex-1 p-4 gap-4">
        {/* Row 1: Activity Type Icon + Name Input */}
        <View className="flex-row gap-3">
          <ActivityTypeSelector
            value={activityType}
            onChange={setActivityType}
            compact
          />

          <Input
            value={name}
            onChangeText={setName}
            placeholder="Activity name"
            className="flex-1 h-[48px]"
          />
        </View>

        {/* Row 2: Description */}
        <Textarea
          value={description}
          onChangeText={setDescription}
          placeholder="Description (optional)"
          className="min-h-[60px] max-h-[80px]"
          multiline
          numberOfLines={2}
          scrollEnabled={true}
        />

        {/* Combined Structure + Metrics Card */}
        <Card className="flex-1">
          <CardContent className="p-4 flex-1">
            <Pressable onPress={handleEditStructure} className="flex-1">
              {/* Metrics Row - Minimal and elegant */}
              <View className="flex-row items-center gap-4 mb-3">
                <View className="flex-row items-center gap-1">
                  <Text className="text-xs text-muted-foreground">
                    Duration:
                  </Text>
                  <Text className="text-sm font-medium">
                    {metrics.durationFormatted || "0min"}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text className="text-xs text-muted-foreground">TSS:</Text>
                  <Text className="text-sm font-medium">
                    {Math.round(metrics.tss) || 0}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text className="text-xs text-muted-foreground">IF:</Text>
                  <Text className="text-sm font-medium">
                    {metrics.if.toFixed(2)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Text className="text-xs text-muted-foreground">Steps:</Text>
                  <Text className="text-sm font-medium">
                    {metrics.stepCount}
                  </Text>
                </View>
              </View>

              {/* Structure Preview */}
              {steps.length === 0 ? (
                <View className="flex-1 items-center justify-center py-12">
                  <Text className="text-base text-muted-foreground mb-2">
                    No structure defined
                  </Text>
                  <Text className="text-sm text-muted-foreground text-center mb-4">
                    Tap to add steps and intervals
                  </Text>
                  <View className="bg-muted rounded-lg px-6 py-3">
                    <Text className="text-sm font-medium">+ Add Structure</Text>
                  </View>
                </View>
              ) : (
                <View className="flex-1">
                  <TimelineChart
                    structure={structure}
                    height={120}
                    onStepPress={handleEditStructure}
                  />
                  <View className="mt-3 p-2 bg-muted/50 rounded-lg">
                    <Text className="text-xs text-muted-foreground text-center">
                      Tap to edit structure
                    </Text>
                  </View>
                </View>
              )}
            </Pressable>
          </CardContent>
        </Card>
      </View>
    </View>
  );
}
