import { RepeatCard } from "@/components/ActivityPlan/RepeatCard";
import { StepCard } from "@/components/ActivityPlan/StepCard";
import { StepEditorDialog } from "@/components/ActivityPlan/StepEditorDialog";
import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import {
  calculateTotalDuration,
  flattenPlanSteps,
  type Step,
  type StepOrRepetition,
} from "@repo/core";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, View } from "react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function StructureEditScreen() {
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const isMountedRef = useRef(true);

  // Get state and actions from Zustand store
  const {
    activityType,
    structure,
    addStep,
    addRepeat,
    updateStep,
    removeStep,
    reorderSteps,
  } = useActivityPlanCreationStore();

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
   * Handle opening the add menu
   */
  const handleOpenAddMenu = useCallback(() => {
    if (!isMountedRef.current) return;
    setAddMenuOpen(true);
  }, []);

  /**
   * Handle adding a step via the add menu
   */
  const handleAddStep = useCallback(() => {
    if (!isMountedRef.current) return;
    setAddMenuOpen(false);
    console.log("🔘 Add Step button pressed - opening dialog for new step");
    setEditingStepIndex(null);
    setEditDialogOpen(true);
  }, []);

  /**
   * Handle adding a repetition block via the add menu
   */
  const handleAddRepetition = useCallback(() => {
    try {
      if (!isMountedRef.current) return;
      setAddMenuOpen(false);

      console.log("🔄 Navigating to repeat editor");

      // Navigate to repeat editing page
      router.push({
        pathname:
          "/(internal)/(tabs)/plan/create_activity_plan/structure/repeat/" as any,
        params: {
          repeatIndex: steps.length.toString(), // New repeat will be at the end
        },
      });
    } catch (error) {
      console.error("❌ Error navigating to repeat editor:", error);
      Alert.alert("Error", "Failed to open repeat editor. Please try again.");
    }
  }, [steps.length]);

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
          updateStep(editingStepIndex, step);
        } else {
          // Adding new step
          console.log("➕ Adding new step");
          addStep(step);
        }

        setEditDialogOpen(false);
        setEditingStepIndex(null);

        if (isMountedRef.current) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        console.log("✅ Step saved successfully");
      } catch (error) {
        console.error("❌ Error saving step:", error);
        Alert.alert("Error", "Failed to save step. Please try again.");
      }
    },
    [editingStepIndex, addStep, updateStep],
  );

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
          pathname:
            "/(internal)/(tabs)/plan/create_activity_plan/structure/repeat/" as any,
          params: {
            repeatIndex: index.toString(),
          },
        });
      } catch (error) {
        console.error("❌ Error navigating to repeat editor:", error);
        Alert.alert("Error", "Failed to open repeat editor. Please try again.");
      }
    },
    [steps],
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
              removeStep(index);

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
    [steps, removeStep],
  );

  /**
   * Handle reordering steps via drag and drop
   */
  const handleDragEnd = useCallback(
    ({ data }: { data: StepOrRepetition[] }) => {
      reorderSteps(data);
    },
    [reorderSteps],
  );

  /**
   * Handle back navigation
   */
  const handleBack = useCallback(() => {
    // Store is automatically saved, just navigate back
    router.back();
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
      {/* Minimal Header with Back, Title, and + button */}
      <View className="bg-card border-b border-border">
        <View className="flex-row items-center justify-between px-4 py-3">
          <Button variant="ghost" size="sm" onPress={handleBack}>
            <Text>Back</Text>
          </Button>

          <View className="items-center">
            <Text className="text-lg font-semibold">Edit Structure</Text>
            <Text className="text-xs text-muted-foreground">
              {metrics.stepCount} steps • {metrics.durationFormatted}
            </Text>
          </View>

          <Button variant="ghost" size="sm" onPress={handleOpenAddMenu}>
            <Text>+</Text>
          </Button>
        </View>
      </View>

      {/* Horizontal Timeline - Static, minimal vertical space */}
      <View className="bg-card border-b border-border px-4 py-3">
        <TimelineChart
          structure={structure}
          selectedStepIndex={selectedStepIndex}
          onStepPress={(index) => {
            if (isMountedRef.current) {
              setSelectedStepIndex(index);
            }
          }}
          height={60}
        />
      </View>

      {/* Structure List - Takes remaining space, scrollable */}
      <View className="flex-1">
        {steps.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-lg text-muted-foreground text-center mb-2">
              No steps added yet
            </Text>
            <Text className="text-sm text-muted-foreground text-center mb-6">
              Tap the + button to add steps or repetition blocks
            </Text>
            <Button
              variant="default"
              onPress={handleOpenAddMenu}
              className="px-8"
            >
              <Text className="text-primary-foreground">+ Add Step</Text>
            </Button>
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
              contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            />
          </GestureHandlerRootView>
        )}
      </View>

      {/* Add Menu Dialog */}
      <AlertDialog open={addMenuOpen} onOpenChange={setAddMenuOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add to Structure</AlertDialogTitle>
            <AlertDialogDescription>
              Choose what you want to add to your activity structure
            </AlertDialogDescription>
          </AlertDialogHeader>
          <View className="gap-3 py-4">
            <Button
              variant="outline"
              onPress={handleAddStep}
              className="w-full justify-start"
            >
              <Text className="text-base">Add Step</Text>
            </Button>
            <Button
              variant="outline"
              onPress={handleAddRepetition}
              className="w-full justify-start"
            >
              <Text className="text-base">Add Repeat Block</Text>
            </Button>
          </View>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>Cancel</Text>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
