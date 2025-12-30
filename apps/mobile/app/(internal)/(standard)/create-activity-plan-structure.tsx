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
import {
  type IntervalV2,
  type IntervalStepV2,
} from "@repo/core/schemas/activity_plan_v2";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Menu, Plus, TrendingUp } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { randomUUID } from "expo-crypto";

export default function StructureEditScreen() {
  const [editingIntervalId, setEditingIntervalId] = useState<string | null>(
    null,
  );
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [intervalWizardOpen, setIntervalWizardOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [collapsedIntervals, setCollapsedIntervals] = useState<Set<string>>(
    new Set(),
  );
  const [renamingIntervalId, setRenamingIntervalId] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const isMountedRef = useRef(true);

  // Get state and actions from Zustand store
  const {
    activityCategory,
    structure,
    addInterval,
    updateInterval,
    removeInterval,
    addStepToInterval,
    updateStepInInterval,
    removeStepFromInterval,
  } = useActivityPlanCreationStore();

  const intervals = useMemo(
    () => structure.intervals || [],
    [structure.intervals],
  );

  // Calculate metrics from structure
  const metrics = useMemo(() => {
    let totalSteps = 0;
    let durationMs = 0;

    for (const interval of intervals) {
      totalSteps += interval.steps.length * interval.repetitions;
      for (const step of interval.steps) {
        durationMs += getDurationMs(step.duration) * interval.repetitions;
      }
    }

    return {
      stepCount: totalSteps,
      duration: durationMs,
      durationFormatted: formatDuration(durationMs),
    };
  }, [intervals]);

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
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}min`
      : `${hours}h`;
  }

  const handleToggleIntervalCollapse = useCallback((intervalId: string) => {
    setCollapsedIntervals((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(intervalId)) {
        newSet.delete(intervalId);
      } else {
        newSet.add(intervalId);
      }
      return newSet;
    });
  }, []);

  const handleRenameInterval = useCallback(
    (intervalId: string, currentName: string) => {
      setRenamingIntervalId(intervalId);
      setRenameValue(currentName);
    },
    [],
  );

  const handleRenameConfirm = useCallback(() => {
    if (renamingIntervalId && renameValue.trim()) {
      const interval = intervals.find((i) => i.id === renamingIntervalId);
      if (interval) {
        updateInterval(renamingIntervalId, {
          ...interval,
          name: renameValue.trim(),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    setRenamingIntervalId(null);
    setRenameValue("");
  }, [renamingIntervalId, renameValue, intervals, updateInterval]);

  const handleDeleteInterval = useCallback(
    (intervalId: string) => {
      const interval = intervals.find((i) => i.id === intervalId);
      if (!interval) return;

      Alert.alert(
        "Delete Interval",
        `Are you sure you want to delete "${interval.name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              removeInterval(intervalId);
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
            },
          },
        ],
      );
    },
    [intervals, removeInterval],
  );

  const handleAddStep = useCallback(() => {
    if (!isMountedRef.current) return;
    setAddMenuOpen(false);
    setEditingIntervalId(null);
    setEditingStepId(null);
    setEditDialogOpen(true);
  }, []);

  const handleAddInterval = useCallback(() => {
    if (!isMountedRef.current) return;
    setAddMenuOpen(false);
    setIntervalWizardOpen(true);
  }, []);

  const handleEditStep = useCallback((intervalId: string, stepId: string) => {
    if (!isMountedRef.current) return;
    setEditingIntervalId(intervalId);
    setEditingStepId(stepId);
    setEditDialogOpen(true);
  }, []);

  const handleSaveStep = useCallback(
    (step: IntervalStepV2) => {
      try {
        if (!isMountedRef.current) return;

        if (editingIntervalId && editingStepId) {
          // Editing existing step
          updateStepInInterval(editingIntervalId, editingStepId, step);
        } else {
          // Adding new step - create a new interval with 1 repetition
          const newInterval: IntervalV2 = {
            id: randomUUID(),
            name: step.name,
            repetitions: 1,
            steps: [step],
          };
          addInterval(newInterval);
        }

        setEditDialogOpen(false);
        setEditingIntervalId(null);
        setEditingStepId(null);

        if (isMountedRef.current) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (error) {
        console.error("❌ Error saving step:", error);
        Alert.alert("Error", "Failed to save step. Please try again.");
      }
    },
    [editingIntervalId, editingStepId, addInterval, updateStepInInterval],
  );

  const handleSaveInterval = useCallback(
    (newInterval: IntervalV2) => {
      if (!isMountedRef.current) return;
      addInterval(newInterval);
      setIntervalWizardOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [addInterval],
  );

  const handleDeleteStep = useCallback(
    (intervalId: string, stepId: string) => {
      const interval = intervals.find((i) => i.id === intervalId);
      const step = interval?.steps.find((s) => s.id === stepId);
      if (!step) return;

      Alert.alert(
        "Delete Step",
        `Are you sure you want to delete "${step.name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              removeStepFromInterval(intervalId, stepId);
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
    [intervals, removeStepFromInterval],
  );

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const editingStep = useMemo(() => {
    if (!editingIntervalId || !editingStepId) return undefined;
    const interval = intervals.find((i) => i.id === editingIntervalId);
    return interval?.steps.find((s) => s.id === editingStepId);
  }, [editingIntervalId, editingStepId, intervals]);

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
              <Text className="text-lg font-semibold">
                {metrics.durationFormatted}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-xs text-muted-foreground">Intervals</Text>
              <Text className="text-lg font-semibold">{intervals.length}</Text>
            </View>
          </View>
        </View>

        {/* Timeline Preview */}
        {intervals.length > 0 && (
          <View className="px-4 py-3 border-b border-border">
            <TimelineChart structure={structure} compact />
          </View>
        )}

        {/* Content */}
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {intervals.length === 0 ? (
            <View className="flex-1 items-center justify-center p-8 mt-20">
              <TrendingUp size={48} className="text-muted-foreground mb-4" />
              <Text className="text-lg font-semibold text-center mb-2">
                No Intervals Yet
              </Text>
              <Text className="text-sm text-muted-foreground text-center mb-6">
                Add intervals to build your workout structure
              </Text>
              <Button onPress={handleAddStep}>
                <Plus size={18} className="text-primary-foreground mr-2" />
                <Text className="text-primary-foreground">
                  Add First Interval
                </Text>
              </Button>
            </View>
          ) : (
            <View className="pb-6">
              {intervals.map((interval) => {
                const isCollapsed = collapsedIntervals.has(interval.id);

                return (
                  <View key={interval.id}>
                    <SegmentHeader
                      segmentName={interval.name}
                      steps={interval.steps}
                      repetitions={interval.repetitions}
                      isCollapsed={isCollapsed}
                      onToggleCollapse={() =>
                        handleToggleIntervalCollapse(interval.id)
                      }
                      onRename={() =>
                        handleRenameInterval(interval.id, interval.name)
                      }
                      onDelete={() => handleDeleteInterval(interval.id)}
                    />

                    {!isCollapsed && (
                      <View className="bg-background">
                        {interval.steps.map((step) => {
                          return (
                            <StepCard
                              key={step.id}
                              step={step}
                              onPress={() =>
                                handleEditStep(interval.id, step.id)
                              }
                              onEdit={() =>
                                handleEditStep(interval.id, step.id)
                              }
                              onDelete={() =>
                                handleDeleteStep(interval.id, step.id)
                              }
                              index={0}
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
              <Button
                onPress={handleAddStep}
                variant="outline"
                className="w-full"
              >
                <Plus size={18} className="text-foreground mr-2" />
                <Text>Single Step</Text>
              </Button>

              <Button
                onPress={handleAddInterval}
                variant="outline"
                className="w-full"
              >
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

        {/* Rename Interval Dialog */}
        <AlertDialog
          open={!!renamingIntervalId}
          onOpenChange={(open) => !open && setRenamingIntervalId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rename Interval</AlertDialogTitle>
              <AlertDialogDescription>
                Enter a new name for this interval
              </AlertDialogDescription>
            </AlertDialogHeader>

            <View className="py-4">
              <TextInput
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Interval name"
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
