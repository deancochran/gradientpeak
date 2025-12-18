import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { RouteSelector } from "@/components/Routes/RouteSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { ROUTES } from "@/lib/constants/routes";
import { useActivityPlanForm } from "@/lib/hooks/forms/useActivityPlanForm";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import { formatDuration } from "@/lib/utils/dates";
import {
  ActivityCategorySelector,
  ActivityLocationSelector,
} from "@/components/ActivityPlan/ActivityCategorySelector";
import {
  calculateActivityStatsV2,
  type ActivityPlanStructureV2,
} from "@repo/core";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

export default function CreateActivityPlanScreen() {
  const router = useRouter();
  // Use form hook for state management and submission
  const {
    form,
    setName,
    setDescription,
    setActivityLocation,
    setActivityCategory,
    setRouteId,
    metrics,
    submit,
    cancel,
    isSubmitting,
  } = useActivityPlanForm({
    onSuccess: (planId) => {
      Alert.alert("Success", "Activity plan saved successfully!", [
        {
          text: "Schedule Now",
          onPress: () => {
            router.push({
              pathname: ROUTES.PLAN.SCHEDULE_ACTIVITY,
              params: { activityPlanId: planId },
            });
          },
        },
        {
          text: "Done",
          onPress: () => {
            router.back();
          },
        },
      ]);
    },
    onError: (error) => {
      Alert.alert("Error", "Failed to save activity plan. Please try again.");
    },
  });

  const {
    name,
    description,
    activityLocation,
    activityCategory,
    structure,
    routeId,
  } = form;

  // Get direct access to store structure for chart display
  const storeStructure = useActivityPlanCreationStore(
    (state) => state.structure,
  );

  const steps = useMemo(() => structure.steps || [], [structure.steps]);

  // Calculate additional metrics (TSS/IF) from V2 structure
  const additionalMetrics = useMemo(() => {
    if (steps.length === 0) {
      return { tss: 0, if: 0 };
    }

    const structureV2: ActivityPlanStructureV2 = {
      version: 2,
      steps,
    };

    const stats = calculateActivityStatsV2(structureV2);

    return {
      tss: stats.tss,
      if: stats.intensityFactor,
    };
  }, [steps]);

  /**
   * Handle navigating to structure editor
   */
  const handleEditStructure = () => {
    router.push(ROUTES.PLAN.CREATE_ACTIVITY_PLAN.STRUCTURE);
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header with Cancel, Title, and Submit buttons */}
      <View className="bg-card border-b border-border">
        <View className="flex-row items-center justify-between px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onPress={cancel}
            disabled={isSubmitting}
          >
            <Text>Cancel</Text>
          </Button>

          <Text className="text-lg font-semibold">Create Activity Plan</Text>

          <Button
            variant="default"
            size="sm"
            onPress={submit}
            disabled={isSubmitting}
          >
            <Text className="text-primary-foreground font-medium">
              {isSubmitting ? "Saving..." : "Save"}
            </Text>
          </Button>
        </View>
      </View>

      {/* Form with ScrollView */}
      <ScrollView className="flex-1 p-4">
        <View className="gap-4 pb-6">
          {/* Row 1: Activity Category Icon + Name Input */}
          <View className="flex-row gap-3">
            <ActivityCategorySelector
              value={activityCategory}
              onChange={setActivityCategory}
              compact
            />

            <Input
              value={name}
              onChangeText={setName}
              placeholder="Activity name"
              className="flex-1 h-[48px]"
            />
          </View>

          {/* Row 1.5: Activity Location */}
          <View>
            <ActivityLocationSelector
              value={activityLocation}
              onChange={setActivityLocation}
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

          {/* Route Selector */}
          <RouteSelector
            activityCategory={activityCategory}
            selectedRouteId={routeId}
            onSelectRoute={setRouteId}
          />

          {/* Combined Structure + Metrics Card */}
          <Card>
            <CardContent className="p-4 flex-1">
              <Pressable onPress={handleEditStructure} className="flex-1">
                {/* Metrics Row - Minimal and elegant */}
                <View className="flex-row items-center gap-4 mb-3">
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs text-muted-foreground">
                      Duration:
                    </Text>
                    <Text className="text-sm font-medium">
                      {formatDuration(metrics.duration) || "0min"}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs text-muted-foreground">TSS:</Text>
                    <Text className="text-sm font-medium">
                      {Math.round(additionalMetrics.tss) || 0}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs text-muted-foreground">IF:</Text>
                    <Text className="text-sm font-medium">
                      {additionalMetrics.if.toFixed(2)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs text-muted-foreground">
                      Steps:
                    </Text>
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
                      <Text className="text-sm font-medium">
                        + Add Structure
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View className="flex-1">
                    <TimelineChart
                      structure={storeStructure}
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
      </ScrollView>
    </View>
  );
}
