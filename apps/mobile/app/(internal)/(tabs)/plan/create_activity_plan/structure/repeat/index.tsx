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
  type PlanStepV2,
  calculateTotalDurationSecondsV2,
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

/**
 * REPEAT EDITOR FOR V2 SCHEMA
 *
 * In V2, repetitions are expanded into flat steps at creation time.
 * This page allows users to:
 * 1. Define a pattern of steps (e.g., work/rest)
 * 2. Specify how many times to repeat
 * 3. Generate the flattened steps with proper metadata
 * 4. Add all generated steps to the store
 *
 * When editing an existing repeat:
 * - We identify steps by segmentName + originalRepetitionCount
 * - User can edit the pattern and regenerate all steps
 * - Old steps are removed and new ones are added
 */

interface RepeatPattern {
  steps: PlanStepV2[];
  repeatCount: number;
  segmentName: string;
}

export default function RepeatEditScreen() {
  const params = useLocalSearchParams();

  // Get segment name from params (identifies which repeat we're editing)
  const segmentName = useMemo(() => {
    const name = Array.isArray(params.segmentName)
      ? params.segmentName[0]
      : params.segmentName;
    return name || `Repeat ${Date.now()}`;
  }, [params.segmentName]);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const isMountedRef = useRef(true);

  // Get state and actions from Zustand store
  const { activityCategory, structure, addSteps, removeSteps, reorderSteps } =
    useActivityPlanCreationStore();

  // Initialize pattern from existing steps or create new
  const [pattern, setPattern] = useState<RepeatPattern>(() => {
    // Check if we're editing existing repeat steps
    const existingSteps = structure.steps.filter(
      (step) =>
        step.segmentName === segmentName && step.originalRepetitionCount,
    );

    if (existingSteps.length > 0) {
      // Extract the pattern from existing expanded steps
      const repeatCount = existingSteps[0]?.originalRepetitionCount || 5;
      const stepsPerRepeat = existingSteps.length / repeatCount;

      // Get just the first cycle as the pattern
      const patternSteps = existingSteps.slice(0, stepsPerRepeat);

      return {
        steps: patternSteps.map((step) => ({
          name: step.name,
          duration: step.duration,
          targets: step.targets,
          notes: step.notes,
          description: step.description,
        })),
        repeatCount,
        segmentName,
      };
    }

    // Create new default pattern (work/rest)
    return {
      steps: [
        {
          name: "Work",
          duration: { type: "time", seconds: 120 },
          targets: [{ type: "%FTP", intensity: 95 }],
        },
        {
          name: "Rest",
          duration: { type: "time", seconds: 60 },
          targets: [{ type: "%FTP", intensity: 55 }],
        },
      ],
      repeatCount: 5,
      segmentName,
    };
  });

  // Calculate metrics
  const metrics = useMemo(() => {
    const stepDurationSeconds = calculateTotalDurationSecondsV2(pattern.steps);
    const totalDurationSeconds = stepDurationSeconds * pattern.repeatCount;

    return {
      stepCount: pattern.steps.length,
      stepDurationSeconds,
      totalDurationSeconds,
      repeatCount: pattern.repeatCount,
    };
  }, [pattern.steps, pattern.repeatCount]);

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
    (step: PlanStepV2) => {
      try {
        if (!isMountedRef.current) return;

        console.log("💾 Saving step in pattern:", step);

        let newSteps: PlanStepV2[];

        if (editingStepIndex !== null) {
          // Editing existing step
          console.log("📝 Updating existing step at index:", editingStepIndex);
          newSteps = [...pattern.steps];
          newSteps[editingStepIndex] = step;
        } else {
          // Adding new step
          console.log("➕ Adding new step to pattern");
          newSteps = [...pattern.steps, step];
        }

        setPattern({
          ...pattern,
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
    [editingStepIndex, pattern],
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
                const newSteps = pattern.steps.filter((_, i) => i !== index);
                setPattern({
                  ...pattern,
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
    [pattern],
  );

  /**
   * Handle drag and drop reordering
   */
  const handleDragEnd = useCallback(
    ({ data }: { data: PlanStepV2[] }) => {
      try {
        if (!isMountedRef.current) return;

        setPattern({
          ...pattern,
          steps: data,
        });
      } catch (error) {
        console.error("❌ Error reordering steps:", error);
      }
    },
    [pattern],
  );

  /**
   * Handle updating repeat count
   */
  const handleRepeatCountChange = useCallback(
    (text: string) => {
      try {
        const count = parseInt(text);
        if (isNaN(count) || count < 1) return;

        setPattern({
          ...pattern,
          repeatCount: count,
        });
      } catch (error) {
        console.error("❌ Error updating repeat count:", error);
      }
    },
    [pattern],
  );

  /**
   * Generate expanded steps from pattern
   */
  const generateExpandedSteps = useCallback((): PlanStepV2[] => {
    const expandedSteps: PlanStepV2[] = [];

    for (let i = 0; i < pattern.repeatCount; i++) {
      for (let j = 0; j < pattern.steps.length; j++) {
        const step = pattern.steps[j];
        if (!step) continue;

        expandedSteps.push({
          name: step.name,
          duration: step.duration,
          targets: step.targets,
          notes: step.notes,
          description: step.description,
          segmentName: pattern.segmentName,
          segmentIndex: i,
          originalRepetitionCount: pattern.repeatCount,
        });
      }
    }

    return expandedSteps;
  }, [pattern]);

  /**
   * Handle saving the repeat to store
   */
  const handleSaveRepeat = useCallback(() => {
    try {
      if (!isMountedRef.current) return;

      console.log("💾 Saving repeat pattern to store");

      // Remove old steps with this segment name
      const oldStepIndices = structure.steps
        .map((step, idx) =>
          step.segmentName === segmentName &&
          step.originalRepetitionCount !== undefined
            ? idx
            : -1,
        )
        .filter((idx) => idx !== -1);

      if (oldStepIndices.length > 0) {
        console.log("🗑️ Removing old repeat steps:", oldStepIndices.length);
        removeSteps(oldStepIndices);
      }

      // Generate and add new steps
      const expandedSteps = generateExpandedSteps();
      console.log("✨ Adding new expanded steps:", expandedSteps.length);
      addSteps(expandedSteps);

      // Navigate back
      router.back();

      if (isMountedRef.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      console.log("✅ Repeat saved successfully");
    } catch (error) {
      console.error("❌ Error saving repeat:", error);
      Alert.alert("Error", "Failed to save repeat. Please try again.");
    }
  }, [
    structure.steps,
    segmentName,
    removeSteps,
    generateExpandedSteps,
    addSteps,
  ]);

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
  }: RenderItemParams<PlanStepV2>) => {
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
            <Text className="text-lg font-semibold">Edit Repeat</Text>
            <Text className="text-xs text-muted-foreground">
              {metrics.stepCount} steps × {metrics.repeatCount} ={" "}
              {formatDurationCompact(metrics.totalDurationSeconds)}
            </Text>
          </View>

          <Button variant="ghost" size="sm" onPress={handleSaveRepeat}>
            <Text className="text-primary">Save</Text>
          </Button>
        </View>
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
              value={pattern.repeatCount.toString()}
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
          structure={{ version: 2, steps: pattern.steps }}
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

        {pattern.steps.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-lg text-muted-foreground text-center mb-2">
              No steps in pattern
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-6">
              Add steps to create your repeat pattern
            </Text>
            <Button variant="default" onPress={handleAddStep} className="px-8">
              <Text className="text-primary-foreground">+ Add Step</Text>
            </Button>
          </View>
        ) : (
          <GestureHandlerRootView style={{ flex: 1 }}>
            <DraggableFlatList
              data={pattern.steps}
              renderItem={renderStepItem}
              keyExtractor={(item, index) => `pattern-step-${index}`}
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
            ? pattern.steps[editingStepIndex]
            : undefined
        }
        onSave={handleSaveStep}
        activityType={activityCategory}
      />
    </View>
  );
}
