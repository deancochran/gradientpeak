import { StepCard } from "@/components/ActivityPlan/StepCard";
import { StepEditorDialog } from "@/components/ActivityPlan/StepEditorDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import {
  calculateTotalDuration,
  createDefaultStep,
  flattenPlanSteps,
  type Step,
  type StepOrRepetition,
} from "@repo/core";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Plus, Save } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RepeatEditScreen() {
  const params = useLocalSearchParams();

  // Parse parameters
  const activityType = Array.isArray(params.activityType)
    ? params.activityType[0]
    : params.activityType || "outdoor_run";

  const initialRepeatData = useMemo(() => {
    try {
      const data = Array.isArray(params.repeatData)
        ? params.repeatData[0]
        : params.repeatData;
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }, [params.repeatData]);

  // State management

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const isMountedRef = useRef(true);

  // Initialize repeat structure
  const [repeat, setRepeat] = useState<StepOrRepetition>(() => {
    if (initialRepeatData) {
      return initialRepeatData;
    }

    // Create default repeat with work/rest pattern
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

  /**
   * Handle opening step editor for new step
   */
  const handleAddStepWithEditor = useCallback(() => {
    if (!isMountedRef.current) return;
    console.log("➕ Opening step editor for new step");
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
        setHasChanges(true);

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
                setHasChanges(true);

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
        setHasChanges(true);
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
        setHasChanges(true);
      } catch (error) {
        console.error("❌ Error updating repeat count:", error);
      }
    },
    [steps],
  );

  /**
   * Handle saving and navigating back
   */
  const handleSave = useCallback(() => {
    try {
      if (!isMountedRef.current) return;

      console.log("💾 Saving repeat and navigating back");

      // Navigate back with the updated repeat data
      router.back();

      // Note: In a real implementation, you'd pass the data back through navigation params
      // or use a state management solution like Zustand

      if (isMountedRef.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("❌ Error saving repeat:", error);
      Alert.alert("Error", "Failed to save repeat. Please try again.");
    }
  }, []);

  /**
   * Handle canceling without saving
   */
  const handleCancel = useCallback(() => {
    if (hasChanges) {
      Alert.alert(
        "Discard Changes",
        "You have unsaved changes. Are you sure you want to go back?",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ],
      );
    } else {
      router.back();
    }
  }, [hasChanges]);

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
        />
      </ScaleDecorator>
    );
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-border bg-background">
        <Button
          variant="ghost"
          size="sm"
          onPress={handleCancel}
          className="p-2"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </Button>

        <Text className="text-lg font-medium">Edit Repeat</Text>

        <Button onPress={handleSave} size="sm">
          <Save size={16} className="text-primary-foreground" />
          <Text className="text-primary-foreground ml-1">Save</Text>
        </Button>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Repeat Settings */}
        <Card className="mb-4">
          <CardHeader>
            <Text className="text-lg font-medium">Repeat Settings</Text>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="flex-row items-center gap-4">
              <View className="flex-1">
                <Label nativeID="repeat-count">Repeat Count</Label>
                <Input
                  value={repeatCount.toString()}
                  onChangeText={handleRepeatCountChange}
                  keyboardType="numeric"
                  placeholder="5"
                  aria-labelledby="repeat-count"
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm text-muted-foreground mb-1">
                  Total Duration
                </Text>
                <Text className="text-lg font-medium">
                  {formatDuration(metrics.totalDuration / 60000)}
                </Text>
              </View>
            </View>

            <View className="flex-row justify-between">
              <Text className="text-sm text-muted-foreground">
                {metrics.stepCount} steps per repeat
              </Text>
              <Text className="text-sm text-muted-foreground">
                {formatDuration(metrics.stepDuration / 60000)} per repeat
              </Text>
            </View>
          </CardContent>
        </Card>

        {/* Steps in Repeat */}
        <View className="flex-1">
          <Card>
            <CardHeader>
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-medium">Steps in Repeat</Text>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={handleAddStepWithEditor}
                >
                  <Plus size={16} className="text-foreground" />
                  <Text className="ml-1">Add Step</Text>
                </Button>
              </View>
            </CardHeader>
            <CardContent style={{ minHeight: 200 }}>
              {steps.length === 0 ? (
                <View className="py-12 items-center">
                  <Text className="text-muted-foreground text-center mb-2">
                    No steps in this repeat
                  </Text>
                  <View className="p-8">
                    <Text className="text-sm text-muted-foreground text-center">
                      Add steps to define what happens in each repetition
                    </Text>
                  </View>
                </View>
              ) : (
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <DraggableFlatList
                    data={steps}
                    renderItem={renderStepItem}
                    keyExtractor={(item, index) => `step-${index}`}
                    onDragEnd={handleDragEnd}
                    scrollEnabled={false}
                  />
                </GestureHandlerRootView>
              )}
            </CardContent>
          </Card>
        </View>
      </ScrollView>

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
