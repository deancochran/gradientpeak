import { RepeatCard } from "@/components/ActivityPlan/RepeatCard";
import { StepCard } from "@/components/ActivityPlan/StepCard";
import { StepEditorDialog } from "@/components/ActivityPlan/StepEditorDialog";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  calculateTotalDuration,
  flattenPlanSteps,
  type Step,
  type StepOrRepetition,
} from "@repo/core";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { Plus, Save } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function StructureEditScreen() {
  const params = useLocalSearchParams();

  // Ensure activityType is a string
  const activityType = Array.isArray(params.activityType)
    ? params.activityType[0]
    : params.activityType || "outdoor_run";
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const isMountedRef = useRef(true);

  // Parse initial structure from params
  const initialStructure = useMemo(() => {
    try {
      const structureData = Array.isArray(params.structureData)
        ? params.structureData[0]
        : params.structureData;
      return structureData ? JSON.parse(structureData) : { steps: [] };
    } catch {
      return { steps: [] };
    }
  }, [params.structureData]);

  const [structure, setStructure] = useState(initialStructure);

  const steps = useMemo(() => structure.steps || [], [structure.steps]);

  // Calculate metrics from structure
  const metrics = useMemo(() => {
    const flatSteps = flattenPlanSteps(steps);
    const durationMs = calculateTotalDuration(flatSteps);

    return {
      stepCount: flatSteps.length,
      duration: durationMs,
      durationFormatted: formatDuration(durationMs),
    };
  }, [steps]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  /**
   * Handle opening step editor for new step
   */
  const handleAddStepWithEditor = useCallback(() => {
    if (!isMountedRef.current) return;
    console.log("🔘 Add Step button pressed - opening dialog for new step");
    console.log("🔘 Current activityType:", activityType);
    console.log("🔘 Current steps count:", steps.length);
    setEditingStepIndex(null);
    setEditDialogOpen(true);
    console.log("🔘 Dialog state set to open, editingStepIndex set to null");
  }, [activityType, steps.length]);

  /**
   * Handle editing an existing step
   */
  const handleEditStep = useCallback((index: number) => {
    if (!isMountedRef.current) return;
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

        console.log("💾 Saving step:", step);

        if (editingStepIndex !== null) {
          // Editing existing step
          console.log("📝 Updating existing step at index:", editingStepIndex);
          const newSteps = [...steps];
          newSteps[editingStepIndex] = step;
          setStructure({ steps: newSteps });
        } else {
          // Adding new step
          console.log("➕ Adding new step");
          setStructure({ steps: [...steps, step] });
        }

        setEditDialogOpen(false);
        setEditingStepIndex(null);
        setHasChanges(true);

        if (isMountedRef.current) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        console.log("✅ Step saved successfully");
      } catch (error) {
        console.error("❌ Error saving step:", error);
        Alert.alert("Error", "Failed to save step. Please try again.");
      }
    },
    [editingStepIndex, steps],
  );

  /**
   * Handle adding a repetition block - navigate to repeat editor
   */
  const handleAddRepetition = useCallback(() => {
    try {
      if (!isMountedRef.current) return;

      console.log("🔄 Navigating to repeat editor");

      // Navigate to repeat editing page
      router.push({
        pathname: "/plan/create_activity_plan/repeat" as any,
        params: {
          activityType: activityType,
          repeatIndex: steps.length.toString(),
        },
      });
    } catch (error) {
      console.error("❌ Error navigating to repeat editor:", error);
      Alert.alert("Error", "Failed to open repeat editor. Please try again.");
    }
  }, [activityType, steps.length]);

  /**
   * Handle editing an existing repetition
   */
  const handleEditRepetition = useCallback(
    (index: number) => {
      try {
        if (!isMountedRef.current) return;

        const repetition = steps[index];
        if (repetition.type !== "repetition") return;

        console.log("📝 Navigating to repeat editor for existing repeat");

        router.push({
          pathname: "/plan/create_activity_plan/repeat" as any,
          params: {
            activityType: activityType,
            repeatIndex: index.toString(),
            repeatData: JSON.stringify(repetition),
          },
        });
      } catch (error) {
        console.error("❌ Error navigating to repeat editor:", error);
        Alert.alert("Error", "Failed to open repeat editor. Please try again.");
      }
    },
    [activityType, steps],
  );

  /**
   * Handle deleting a step or repetition
   */
  const handleDeleteStep = useCallback(
    (index: number) => {
      const item = steps[index];
      const itemType = item.type === "step" ? "step" : "repetition";

      Alert.alert(
        `Delete ${itemType}`,
        `Are you sure you want to delete this ${itemType}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              const newSteps = steps.filter((_: any, i: number) => i !== index);
              setStructure({ steps: newSteps });
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
    },
    [steps],
  );

  /**
   * Handle reordering steps via drag and drop
   */
  const handleDragEnd = useCallback(
    ({ data }: { data: StepOrRepetition[] }) => {
      setStructure({ steps: data });
      setHasChanges(true);
    },
    [],
  );

  /**
   * Handle saving and going back
   */
  const handleSave = useCallback(() => {
    // Pass the updated structure back via route params
    router.back();
    // In a real app, you'd use proper state management or route params
    // For now, we'll just go back and the parent will need to handle this
  }, []);

  /**
   * Render a single step item
   */
  const renderStepItem = useCallback(
    ({
      item,
      drag,
      isActive,
      getIndex,
    }: RenderItemParams<StepOrRepetition>) => {
      const index = getIndex();

      // Handle repetition blocks
      if (item.type === "repetition") {
        return (
          <ScaleDecorator>
            <RepeatCard
              repetition={item}
              index={index!}
              isActive={isActive}
              onPress={() => {
                if (isMountedRef.current && index !== undefined) {
                  setSelectedStepIndex(index);
                }
              }}
              onLongPress={drag}
              onDelete={() => {
                if (isMountedRef.current && index !== undefined) {
                  handleDeleteStep(index);
                }
              }}
              onEdit={() => {
                if (isMountedRef.current && index !== undefined) {
                  handleEditRepetition(index);
                }
              }}
              isDraggable
            />
          </ScaleDecorator>
        );
      }

      // Handle regular steps
      return (
        <ScaleDecorator>
          <StepCard
            step={item}
            index={index!}
            isActive={isActive}
            onPress={() => {
              if (isMountedRef.current && index !== undefined) {
                setSelectedStepIndex(index);
              }
            }}
            onLongPress={drag}
            onDelete={() => {
              if (isMountedRef.current && index !== undefined) {
                handleDeleteStep(index);
              }
            }}
            onEdit={() => {
              if (isMountedRef.current && index !== undefined) {
                handleEditStep(index);
              }
            }}
            isDraggable
          />
        </ScaleDecorator>
      );
    },
    [handleDeleteStep, handleEditStep, handleEditRepetition],
  );

  return (
    <View className="flex-1 bg-background">
      {/* Header with Save Button */}
      <View className="bg-card border-b border-border px-4 py-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-lg font-semibold">Edit Structure</Text>
            <Text className="text-sm text-muted-foreground">
              {metrics.stepCount} steps • {metrics.durationFormatted}
            </Text>
          </View>
          <Button onPress={handleSave} disabled={!hasChanges} className="px-4">
            <Icon
              as={Save}
              size={16}
              className="text-primary-foreground mr-2"
            />
            <Text className="text-primary-foreground">Save</Text>
          </Button>
        </View>
      </View>

      <ScrollView className="flex-1">
        <View className="p-4">
          {/* Timeline Chart */}
          <Card className="mb-4">
            <CardContent className="p-4">
              <Text className="font-semibold mb-4">Timeline</Text>
              <TimelineChart
                structure={structure}
                selectedStepIndex={selectedStepIndex}
                onStepPress={(index) => {
                  if (isMountedRef.current) {
                    setSelectedStepIndex(index);
                  }
                }}
                height={100}
              />
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <View className="flex-row gap-3 mb-6">
            <Button
              variant="outline"
              onPress={handleAddStepWithEditor}
              className="flex-1"
            >
              <Plus size={16} className="text-foreground" />
              <Text className="ml-1">Add Step</Text>
            </Button>
            <Button
              variant="outline"
              onPress={handleAddRepetition}
              className="flex-1"
            >
              <Text>Add Rep</Text>
            </Button>
          </View>

          {/* Structure List */}
          <Card>
            <CardContent className="p-4">
              <Text className="font-semibold mb-4">Structure</Text>

              {steps.length === 0 ? (
                <View className="py-12 items-center">
                  <Text className="text-muted-foreground text-center mb-2">
                    No steps added yet
                  </Text>
                  <View className="p-8">
                    <Text className="text-sm text-muted-foreground text-center">
                      Add individual steps or repetition blocks to build your
                      workout
                    </Text>
                  </View>
                </View>
              ) : (
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <DraggableFlatList
                    data={steps}
                    renderItem={renderStepItem}
                    keyExtractor={(item, index) =>
                      item.type === "step" ? `step-${index}` : `repeat-${index}`
                    }
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
        step={
          editingStepIndex !== null
            ? (steps[editingStepIndex] as Step)
            : undefined
        }
        onSave={handleSaveStep}
        activityType={activityType}
      />
    </View>
  );
}
