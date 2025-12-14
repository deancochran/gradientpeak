import { IntervalWizard } from "@/components/ActivityPlan/IntervalWizard";
import { SegmentHeader } from "@/components/ActivityPlan/SegmentHeader";
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
import { getDurationMs } from "@/lib/utils/durationConversion";
import { groupStepsBySegment, type PlanStepV2 } from "@repo/core/schemas/activity_plan_v2";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Menu, Plus, TrendingUp } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, TextInput, View } from "react-native";

export default function StructureEditScreen() {
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [intervalWizardOpen, setIntervalWizardOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [collapsedSegments, setCollapsedSegments] = useState<Set<string>>(new Set());
  const [renamingSegment, setRenamingSegment] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const isMountedRef = useRef(true);

  // Get state and actions from Zustand store
  const {
    activityCategory,
    structure,
    addStep,
    addSteps,
    updateStep,
    removeStep,
    removeSteps,
    updateSegmentName,
    removeSegment,
  } = useActivityPlanCreationStore();

  const steps = useMemo(() => structure.steps || [], [structure.steps]);

  // Group steps by segment
  const segmentedSteps = useMemo(() => {
    return groupStepsBySegment(steps);
  }, [steps]);

  // Calculate metrics from structure
  const metrics = useMemo(() => {
    const durationMs = steps.reduce((total, step) => {
      return total + getDurationMs(step.duration);
    }, 0);

    return {
      stepCount: steps.length,
      duration: durationMs,
      durationFormatted: formatDuration(durationMs),
    };
  }, [steps]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function formatDuration(ms: number): string {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) {
      return `${minutes}min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  }

  const handleToggleSegmentCollapse = useCallback((segmentName: string) => {
    setCollapsedSegments((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(segmentName)) {
        newSet.delete(segmentName);
      } else {
        newSet.add(segmentName);
      }
      return newSet;
    });
  }, []);

  const handleRenameSegment = useCallback((oldName: string) => {
    setRenamingSegment(oldName);
    setRenameValue(oldName);
  }, []);

  const handleRenameConfirm = useCallback(() => {
    if (renamingSegment && renameValue.trim()) {
      updateSegmentName(renamingSegment, renameValue.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setRenamingSegment(null);
    setRenameValue("");
  }, [renamingSegment, renameValue, updateSegmentName]);

  const handleDeleteSegment = useCallback(
    (segmentName: string) => {
      removeSegment(segmentName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [removeSegment],
  );

  const handleAddStep = useCallback((segmentName?: string) => {
    if (!isMountedRef.current) return;
    setAddMenuOpen(false);
    setEditingStepIndex(null);
    setEditDialogOpen(true);
  }, []);

  const handleAddInterval = useCallback(() => {
    if (!isMountedRef.current) return;
    setAddMenuOpen(false);
    setIntervalWizardOpen(true);
  }, []);

  const handleEditStep = useCallback((globalIndex: number) => {
    if (!isMountedRef.current) return;
    setEditingStepIndex(globalIndex);
    setEditDialogOpen(true);
  }, []);

  const handleSaveStep = useCallback(
    (step: PlanStepV2) => {
      try {
        if (!isMountedRef.current) return;

        if (editingStepIndex !== null) {
          updateStep(editingStepIndex, step);
        } else {
          addStep(step);
        }

        setEditDialogOpen(false);
        setEditingStepIndex(null);

        if (isMountedRef.current) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (error) {
        console.error("❌ Error saving step:", error);
        Alert.alert("Error", "Failed to save step. Please try again.");
      }
    },
    [editingStepIndex, addStep, updateStep],
  );

  const handleSaveInterval = useCallback(
    (intervalSteps: PlanStepV2[]) => {
      if (!isMountedRef.current) return;
      addSteps(intervalSteps);
      setIntervalWizardOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [addSteps],
  );

  const handleDeleteStep = useCallback(
    (globalIndex: number) => {
      const step = steps[globalIndex];

      Alert.alert(
        "Delete Step",
        `Are you sure you want to delete "${step.name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              removeStep(globalIndex);
              if (isMountedRef.current) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            },
          },
        ],
      );
    },
    [steps, removeStep],
  );

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const editingStep = editingStepIndex !== null ? steps[editingStepIndex] : undefined;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className="flex-1 bg-background">
        {/* Header */}
        <View className="border-b border-border">
          <View className="flex-row items-center justify-between px-4 py-3">
            <Pressable onPress={handleBack} hitSlop={10}>
              <Text className="text-lg text-primary">Back</Text>
            </Pressable>

            <Text className="text-lg font-semibold">Structure</Text>

            <Pressable
              onPress={() => setAddMenuOpen(true)}
              hitSlop={10}
              className="active:opacity-50"
            >
              <Plus size={24} className="text-primary" />
            </Pressable>
          </View>

          {/* Metrics Bar */}
          <View className="flex-row items-center justify-around px-4 py-3 bg-muted/50">
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Steps</Text>
              <Text className="text-lg font-semibold">{metrics.stepCount}</Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Duration</Text>
              <Text className="text-lg font-semibold">{metrics.durationFormatted}</Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Segments</Text>
              <Text className="text-lg font-semibold">{segmentedSteps.length}</Text>
            </View>
          </View>
        </View>

        {/* Timeline Preview */}
        {steps.length > 0 && (
          <View className="px-4 py-3 border-b border-border">
            <TimelineChart structure={structure} compact />
          </View>
        )}

        {/* Content */}
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {steps.length === 0 ? (
            <View className="flex-1 items-center justify-center p-8 mt-20">
              <TrendingUp size={48} className="text-muted-foreground mb-4" />
              <Text className="text-lg font-semibold text-center mb-2">
                No Steps Yet
              </Text>
              <Text className="text-sm text-muted-foreground text-center mb-6">
                Add steps to build your workout structure
              </Text>
              <Button onPress={handleAddStep}>
                <Plus size={18} className="text-primary-foreground mr-2" />
                <Text className="text-primary-foreground">Add First Step</Text>
              </Button>
            </View>
          ) : (
            <View className="pb-6">
              {segmentedSteps.map((segment, segmentIdx) => {
                const isCollapsed = collapsedSegments.has(segment.segmentName);

                // Calculate global indices for steps in this segment
                let globalStartIndex = 0;
                for (let i = 0; i < segmentIdx; i++) {
                  globalStartIndex += segmentedSteps[i].steps.length;
                }

                return (
                  <View key={`${segment.segmentName}-${segmentIdx}`}>
                    <SegmentHeader
                      segmentName={segment.segmentName}
                      steps={segment.steps}
                      isCollapsed={isCollapsed}
                      onToggleCollapse={() =>
                        handleToggleSegmentCollapse(segment.segmentName)
                      }
                      onRename={() => handleRenameSegment(segment.segmentName)}
                      onDelete={() => handleDeleteSegment(segment.segmentName)}
                    />

                    {!isCollapsed && (
                      <View className="bg-background">
                        {segment.steps.map((step, stepIdx) => {
                          const globalIndex = globalStartIndex + stepIdx;
                          return (
                            <StepCard
                              key={globalIndex}
                              step={step}
                              index={globalIndex}
                              onPress={() => handleEditStep(globalIndex)}
                              onEdit={() => handleEditStep(globalIndex)}
                              onDelete={() => handleDeleteStep(globalIndex)}
                            />
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Step Editor Dialog */}
        <StepEditorDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          step={editingStep}
          onSave={handleSaveStep}
          activityType={activityCategory}
        />

        {/* Interval Wizard */}
        <IntervalWizard
          open={intervalWizardOpen}
          onOpenChange={setIntervalWizardOpen}
          onSave={handleSaveInterval}
        />

        {/* Add Menu Dialog */}
        <AlertDialog open={addMenuOpen} onOpenChange={setAddMenuOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Add to Structure</AlertDialogTitle>
              <AlertDialogDescription>
                Choose what you'd like to add to your workout
              </AlertDialogDescription>
            </AlertDialogHeader>

            <View className="gap-3 py-4">
              <Button onPress={handleAddStep} variant="outline" className="w-full">
                <Plus size={18} className="text-foreground mr-2" />
                <Text>Single Step</Text>
              </Button>

              <Button onPress={handleAddInterval} variant="outline" className="w-full">
                <Menu size={18} className="text-foreground mr-2" />
                <Text>Interval Set</Text>
              </Button>
            </View>

            <AlertDialogFooter>
              <AlertDialogCancel>
                <Text>Cancel</Text>
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rename Segment Dialog */}
        <AlertDialog open={!!renamingSegment} onOpenChange={(open) => !open && setRenamingSegment(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rename Segment</AlertDialogTitle>
              <AlertDialogDescription>
                Enter a new name for this segment
              </AlertDialogDescription>
            </AlertDialogHeader>

            <View className="py-4">
              <TextInput
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Segment name"
                className="border border-border rounded-lg px-4 py-3 text-base"
                autoFocus
                onSubmitEditing={handleRenameConfirm}
              />
            </View>

            <AlertDialogFooter>
              <AlertDialogCancel>
                <Text>Cancel</Text>
              </AlertDialogCancel>
              <Button onPress={handleRenameConfirm}>
                <Text className="text-primary-foreground">Rename</Text>
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// Import GestureHandlerRootView
import { GestureHandlerRootView } from "react-native-gesture-handler";
