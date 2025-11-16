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
  calculateTotalDuration,
  createDefaultStep,
  flattenPlanSteps,
  type Step,
  type StepOrRepetition,
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

export default function RepeatEditScreen() {
  const params = useLocalSearchParams();

  // Get the repeat index from navigation params (set by structure page)
  const repeatIndex = useMemo(() => {
    const idx = Array.isArray(params.repeatIndex)
      ? params.repeatIndex[0]
      : params.repeatIndex;
    return idx !== undefined ? parseInt(idx) : null;
  }, [params.repeatIndex]);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [isNewRepeat, setIsNewRepeat] = useState(false);
  const isMountedRef = useRef(true);

  // Get state and actions from Zustand store
  const { activityType, structure, addRepeat, updateRepeatAtIndex } =
    useActivityPlanCreationStore();

  // Initialize or get existing repeat
  const [repeat, setRepeat] = useState<StepOrRepetition>(() => {
    if (repeatIndex !== null && repeatIndex < structure.steps.length) {
      // Editing existing repeat
      const existingRepeat = structure.steps[repeatIndex];
      if (existingRepeat.type === "repetition") {
        return existingRepeat;
      }
    }

    // Create new default repeat with work/rest pattern
    setIsNewRepeat(true);
    const workStep = createDefaultStep({
      activityType,
      position: 1,
      totalSteps: 2,
    });
    workStep.name = "Work";
    workStep.duration = { type: "time", value: 2, unit: "minutes" };

    const restStep = createDefaultStep({
      activityType,
      position: 0,
      totalSteps: 2,
    });
    restStep.name = "Rest";
    restStep.duration = { type: "time", value: 1, unit: "minutes" };

    return {
      type: "repetition",
      repeat: 5,
      steps: [workStep, restStep],
    };
  });

  const steps = useMemo(() => {
    return repeat.type === "repetition" ? repeat.steps || [] : [];
  }, [repeat]);

  const repeatCount = useMemo(() => {
    return repeat.type === "repetition" ? repeat.repeat : 1;
  }, [repeat]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const flatSteps = flattenPlanSteps(steps);
    const stepDuration = calculateTotalDuration(flatSteps);
    const totalDuration = stepDuration * repeatCount;

    return {
      stepCount: steps.length,
      stepDuration,
      totalDuration,
      repeatCount,
    };
  }, [steps, repeatCount]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Save repeat to store when it changes
  useEffect(() => {
    if (repeat.type === "repetition" && steps.length > 0) {
      if (
        !isNewRepeat &&
        repeatIndex !== null &&
        repeatIndex < structure.steps.length
      ) {
        // Update existing repeat
        updateRepeatAtIndex(repeatIndex, repeat);
      }
    }
  }, [
    repeat,
    repeatIndex,
    updateRepeatAtIndex,
    steps.length,
    isNewRepeat,
    structure.steps.length,
  ]);

  // Add new repeat to store only once when first created
  useEffect(() => {
    if (isNewRepeat && repeat.type === "repetition" && steps.length > 0) {
      addRepeat(repeat);
      setIsNewRepeat(false); // Mark as added
    }
  }, [isNewRepeat, repeat, addRepeat, steps.length]);

  /**
   * Format duration for display
   */
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  /**
   * Handle opening step editor for new step
   */
  const handleAddStep = useCallback(() => {
    if (!isMountedRef.current) return;
    console.log("➕ Opening step editor for new step in repeat");
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
    (step: Step) => {
      try {
        if (!isMountedRef.current) return;

        console.log("💾 Saving step in repeat:", step);

        let newSteps: Step[];

        if (editingStepIndex !== null) {
          // Editing existing step
          console.log("📝 Updating existing step at index:", editingStepIndex);
          newSteps = [...steps];
          newSteps[editingStepIndex] = step;
        } else {
          // Adding new step
          console.log("➕ Adding new step to repeat");
          newSteps = [...steps, step];
        }

        setRepeat({
          type: "repetition",
          repeat: repeatCount,
          steps: newSteps,
        });

        setEditDialogOpen(false);
        setEditingStepIndex(null);

        if (isMountedRef.current) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        console.log("✅ Step saved successfully in repeat");
      } catch (error) {
        console.error("❌ Error saving step in repeat:", error);
        Alert.alert("Error", "Failed to save step. Please try again.");
      }
    },
    [editingStepIndex, steps, repeatCount],
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
          "Are you sure you want to delete this step?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => {
                const newSteps = steps.filter((_, i) => i !== index);
                setRepeat({
                  type: "repetition",
                  repeat: repeatCount,
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
    [steps, repeatCount],
  );

  /**
   * Handle drag and drop reordering
   */
  const handleDragEnd = useCallback(
    ({ data }: { data: Step[] }) => {
      try {
        if (!isMountedRef.current) return;

        setRepeat({
          type: "repetition",
          repeat: repeatCount,
          steps: data,
        });
      } catch (error) {
        console.error("❌ Error reordering steps:", error);
      }
    },
    [repeatCount],
  );

  /**
   * Handle updating repeat count
   */
  const handleRepeatCountChange = useCallback(
    (text: string) => {
      try {
        const count = parseInt(text);
        if (isNaN(count) || count < 1) return;

        setRepeat({
          type: "repetition",
          repeat: count,
          steps,
        });
      } catch (error) {
        console.error("❌ Error updating repeat count:", error);
      }
    },
    [steps],
  );

  /**
   * Handle back navigation
   */
  const handleBack = useCallback(() => {
    try {
      if (!isMountedRef.current) return;

      console.log("🔙 Navigating back");

      // Data is already saved to store
      router.back();

      if (isMountedRef.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("❌ Error navigating back:", error);
      Alert.alert("Error", "Failed to go back. Please try again.");
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
  }: RenderItemParams<Step>) => {
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
      {/* Minimal Header with Back, Title, and + Step button */}
      <View className="bg-card border-b border-border">
        <View className="flex-row items-center justify-between px-4 py-3">
          <Button variant="ghost" size="sm" onPress={handleBack}>
            <Text>Back</Text>
          </Button>

          <View className="items-center">
            <Text className="text-lg font-semibold">Edit Repeat</Text>
            <Text className="text-xs text-muted-foreground">
              {metrics.stepCount} steps × {repeatCount} ={" "}
              {formatDuration(metrics.totalDuration / 60000)}
            </Text>
          </View>

          <Button variant="ghost" size="sm" onPress={handleAddStep}>
            <Text>+</Text>
          </Button>
        </View>
      </View>

      {/* Repeat Count Input - Minimal */}
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
              value={repeatCount.toString()}
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
              {formatDuration(metrics.stepDuration / 60000)}
            </Text>
          </View>
        </View>
      </View>

      {/* Horizontal Timeline - Just for repeated steps */}
      <View className="bg-card border-b border-border px-4 py-3">
        <TimelineChart
          structure={{ steps }}
          onStepPress={(index) => {
            if (isMountedRef.current) {
              handleEditStep(index);
            }
          }}
          height={60}
        />
      </View>

      <Separator />

      {/* Steps List - Takes remaining space */}
      <View className="flex-1">
        {steps.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-lg text-muted-foreground text-center mb-2">
              No steps in this repeat
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-6">
              Tap the + button to add steps
            </Text>
            <Button variant="default" onPress={handleAddStep} className="px-8">
              <Text className="text-primary-foreground">+ Add Step</Text>
            </Button>
          </View>
        ) : (
          <GestureHandlerRootView style={{ flex: 1 }}>
            <DraggableFlatList
              data={steps}
              renderItem={renderStepItem}
              keyExtractor={(item, index) => `step-${index}`}
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
        step={editingStepIndex !== null ? steps[editingStepIndex] : undefined}
        onSave={handleSaveStep}
        activityType={activityType}
      />
    </View>
  );
}
