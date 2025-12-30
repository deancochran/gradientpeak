import { StepCard } from "@/components/ActivityPlan/StepCard";
import { StepEditorDialog } from "@/components/ActivityPlan/StepEditorDialog";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import {
  type DurationV2,
  type IntervalV2,
  type IntervalStepV2,
  formatDurationCompact,
} from "@repo/core";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, View } from "react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { randomUUID } from "expo-crypto";

/**
 * REPEAT EDITOR FOR V2 SCHEMA (INTERVAL-BASED)
 *
 * In V2, intervals store steps and repetitions natively.
 * This page allows users to:
 * 1. Define a pattern of steps (e.g., work/rest)
 * 2. Specify how many times to repeat
 * 3. Save as an IntervalV2 object with repetitions property
 *
 * When editing an existing interval:
 * - We load the interval by ID
 * - User can edit the steps and repetitions
 * - Update the interval in the store
 */

function getDurationSeconds(duration: DurationV2): number {
  switch (duration.type) {
    case "time":
      return duration.seconds;
    case "distance":
      return duration.meters / 2.5; // Rough estimate
    case "repetitions":
      return duration.count * 30; // Rough estimate
    case "untilFinished":
      return 0;
    default:
      return 0;
  }
}

export default function RepeatEditScreen() {
  const params = useLocalSearchParams();

  // Get interval ID from params (if editing existing)
  const intervalId = useMemo(() => {
    const id = Array.isArray(params.intervalId)
      ? params.intervalId[0]
      : params.intervalId;
    return id || null;
  }, [params.intervalId]);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const isMountedRef = useRef(true);

  // Get state and actions from Zustand store
  const {
    activityCategory,
    structure,
    addInterval,
    updateInterval,
    reorderStepsInInterval,
  } = useActivityPlanCreationStore();

  // Initialize interval from existing or create new
  const [localInterval, setLocalInterval] = useState<IntervalV2>(() => {
    if (intervalId) {
      // Editing existing interval
      const existing = structure.intervals.find((i) => i.id === intervalId);
      if (existing) {
        return { ...existing };
      }
    }

    // Create new default interval (work/rest pattern)
    return {
      id: randomUUID(),
      name: `Interval ${Date.now()}`,
      repetitions: 5,
      steps: [
        {
          id: randomUUID(),
          name: "Work",
          duration: { type: "time", seconds: 120 },
          targets: [{ type: "%FTP", intensity: 95 }],
        },
        {
          id: randomUUID(),
          name: "Rest",
          duration: { type: "time", seconds: 60 },
          targets: [{ type: "%FTP", intensity: 55 }],
        },
      ],
    };
  });

  // Calculate metrics
  const metrics = useMemo(() => {
    let stepDurationSeconds = 0;
    for (const step of localInterval.steps) {
      stepDurationSeconds += getDurationSeconds(step.duration);
    }
    const totalDurationSeconds =
      stepDurationSeconds * localInterval.repetitions;

    return {
      stepCount: localInterval.steps.length,
      stepDurationSeconds,
      totalDurationSeconds,
      repeatCount: localInterval.repetitions,
    };
  }, [localInterval.steps, localInterval.repetitions]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Handle opening step editor for new step
   */
  const handleAddStep = useCallback(() => {
    if (!isMountedRef.current) return;
    console.log("➕ Opening step editor for new step in pattern");
    setEditingStepIndex(null);
    setEditDialogOpen(true);
  }, []);

  /**
   * Handle editing an existing step
   */
  const handleEditStep = useCallback((index: number) => {
    if (!isMountedRef.current) return;
    console.log("📝 Opening step editor for step at index:", index);
    setEditingStepIndex(index);
    setEditDialogOpen(true);
  }, []);

  /**
   * Handle saving step from editor
   */
  const handleSaveStep = useCallback(
    (step: IntervalStepV2) => {
      try {
        if (!isMountedRef.current) return;

        console.log("💾 Saving step in pattern:", step);

        let newSteps: IntervalStepV2[];

        if (editingStepIndex !== null) {
          // Editing existing step
          console.log("📝 Updating existing step at index:", editingStepIndex);
          newSteps = [...localInterval.steps];
          newSteps[editingStepIndex] = step;
        } else {
          // Adding new step
          console.log("➕ Adding new step to pattern");
          const newStep: IntervalStepV2 = {
            ...step,
            id: step.id || randomUUID(),
          };
          newSteps = [...localInterval.steps, newStep];
        }

        setLocalInterval({
          ...localInterval,
          steps: newSteps,
        });

        setEditDialogOpen(false);
        setEditingStepIndex(null);

        if (isMountedRef.current) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        console.log("✅ Step saved successfully in pattern");
      } catch (error) {
        console.error("❌ Error saving step in pattern:", error);
        Alert.alert("Error", "Failed to save step. Please try again.");
      }
    },
    [editingStepIndex, localInterval],
  );

  /**
   * Handle deleting a step
   */
  const handleDeleteStep = useCallback(
    (index: number) => {
      try {
        if (!isMountedRef.current) return;

        Alert.alert(
          "Delete Step",
          "Are you sure you want to delete this step from the pattern?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => {
                const newSteps = localInterval.steps.filter(
                  (_, i) => i !== index,
                );
                setLocalInterval({
                  ...localInterval,
                  steps: newSteps,
                });

                if (isMountedRef.current) {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                }
              },
            },
          ],
        );
      } catch (error) {
        console.error("❌ Error deleting step:", error);
        Alert.alert("Error", "Failed to delete step. Please try again.");
      }
    },
    [localInterval],
  );

  /**
   * Handle drag and drop reordering
   */
  const handleDragEnd = useCallback(
    ({ data }: { data: IntervalStepV2[] }) => {
      try {
        if (!isMountedRef.current) return;

        setLocalInterval({
          ...localInterval,
          steps: data,
        });
      } catch (error) {
        console.error("❌ Error reordering steps:", error);
      }
    },
    [localInterval],
  );

  /**
   * Handle updating repeat count
   */
  const handleRepeatCountChange = useCallback(
    (text: string) => {
      try {
        const count = parseInt(text);
        if (isNaN(count) || count < 1) return;

        setLocalInterval({
          ...localInterval,
          repetitions: count,
        });
      } catch (error) {
        console.error("❌ Error updating repeat count:", error);
      }
    },
    [localInterval],
  );

  /**
   * Handle updating interval name
   */
  const handleNameChange = useCallback(
    (text: string) => {
      setLocalInterval({
        ...localInterval,
        name: text,
      });
    },
    [localInterval],
  );

  /**
   * Handle saving the interval to store
   */
  const handleSaveInterval = useCallback(() => {
    try {
      if (!isMountedRef.current) return;

      console.log("💾 Saving interval to store");

      if (intervalId) {
        // Update existing interval
        console.log("📝 Updating existing interval:", intervalId);
        updateInterval(intervalId, localInterval);
      } else {
        // Add new interval
        console.log("➕ Adding new interval");
        addInterval(localInterval);
      }

      // Navigate back
      router.back();

      if (isMountedRef.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      console.log("✅ Interval saved successfully");
    } catch (error) {
      console.error("❌ Error saving interval:", error);
      Alert.alert("Error", "Failed to save interval. Please try again.");
    }
  }, [intervalId, localInterval, updateInterval, addInterval]);

  /**
   * Handle back navigation without saving
   */
  const handleCancel = useCallback(() => {
    try {
      if (!isMountedRef.current) return;

      Alert.alert(
        "Discard Changes?",
        "Are you sure you want to discard your changes?",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              router.back();
            },
          },
        ],
      );
    } catch (error) {
      console.error("❌ Error navigating back:", error);
    }
  }, []);

  /**
   * Render a single step item
   */
  const renderStepItem = ({
    item: step,
    drag,
    isActive,
    getIndex,
  }: RenderItemParams<IntervalStepV2>) => {
    const index = getIndex();
    return (
      <ScaleDecorator>
        <StepCard
          step={step}
          index={index!}
          isActive={isActive}
          onPress={() => {}}
          onLongPress={drag}
          onEdit={() => handleEditStep(index!)}
          onDelete={() => handleDeleteStep(index!)}
          isDraggable
        />
      </ScaleDecorator>
    );
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header with Cancel, Title, and Save button */}
      <View className="bg-card border-b border-border">
        <View className="flex-row items-center justify-between px-4 py-3">
          <Button variant="ghost" size="sm" onPress={handleCancel}>
            <Text>Cancel</Text>
          </Button>

          <View className="items-center">
            <Text className="text-lg font-semibold">Edit Interval</Text>
            <Text className="text-xs text-muted-foreground">
              {metrics.stepCount} steps × {metrics.repeatCount} ={" "}
              {formatDurationCompact(metrics.totalDurationSeconds)}
            </Text>
          </View>

          <Button variant="ghost" size="sm" onPress={handleSaveInterval}>
            <Text className="text-primary">Save</Text>
          </Button>
        </View>
      </View>

      {/* Interval Name Input */}
      <View className="bg-card border-b border-border px-4 py-3">
        <Label
          nativeID="interval-name"
          className="text-xs text-muted-foreground mb-1"
        >
          Interval Name
        </Label>
        <Input
          value={localInterval.name}
          onChangeText={handleNameChange}
          placeholder="Interval name"
          aria-labelledby="interval-name"
          className="text-base"
        />
      </View>

      {/* Repeat Count Input */}
      <View className="bg-card border-b border-border px-4 py-3">
        <View className="flex-row items-center gap-4">
          <View className="flex-1">
            <Label
              nativeID="repeat-count"
              className="text-xs text-muted-foreground mb-1"
            >
              Repeat Count
            </Label>
            <Input
              value={localInterval.repetitions.toString()}
              onChangeText={handleRepeatCountChange}
              keyboardType="numeric"
              placeholder="5"
              aria-labelledby="repeat-count"
              className="text-base"
            />
          </View>
          <View className="flex-1">
            <Text className="text-xs text-muted-foreground mb-1">
              Per Repeat
            </Text>
            <Text className="text-base font-medium">
              {formatDurationCompact(metrics.stepDurationSeconds)}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xs text-muted-foreground mb-1">Total</Text>
            <Text className="text-base font-medium">
              {formatDurationCompact(metrics.totalDurationSeconds)}
            </Text>
          </View>
        </View>
      </View>

      {/* Horizontal Timeline - Shows pattern */}
      <View className="bg-card border-b border-border px-4 py-3">
        <Text className="text-xs text-muted-foreground mb-2">
          Pattern Preview (1 cycle)
        </Text>
        <TimelineChart
          structure={{
            version: 2,
            intervals: [{ ...localInterval, repetitions: 1 }],
          }}
          onStepPress={(index) => {
            if (isMountedRef.current) {
              handleEditStep(index);
            }
          }}
          height={60}
        />
      </View>

      <Separator />

      {/* Steps List - Pattern steps only */}
      <View className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 bg-muted/30">
          <Text className="text-sm font-medium">Pattern Steps</Text>
          <Button variant="outline" size="sm" onPress={handleAddStep}>
            <Text>+ Add Step</Text>
          </Button>
        </View>

        {localInterval.steps.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-lg text-muted-foreground text-center mb-2">
              No steps in pattern
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-6">
              Add steps to create your interval pattern
            </Text>
            <Button variant="default" onPress={handleAddStep} className="px-8">
              <Text className="text-primary-foreground">+ Add Step</Text>
            </Button>
          </View>
        ) : (
          <GestureHandlerRootView style={{ flex: 1 }}>
            <DraggableFlatList
              data={localInterval.steps}
              renderItem={renderStepItem}
              keyExtractor={(item) => item.id}
              onDragEnd={handleDragEnd}
              contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            />
          </GestureHandlerRootView>
        )}
      </View>

      {/* Step Editor Dialog */}
      <StepEditorDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        step={
          editingStepIndex !== null
            ? localInterval.steps[editingStepIndex]
            : undefined
        }
        onSave={handleSaveStep}
        activityType={activityCategory}
      />
    </View>
  );
}
