import BottomSheet, { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type ActivityPlanInterval,
  type ActivityPlanIntervalStep,
  type ActivityPlanSegmentV3,
  type ActivityPlanTargetAnchors,
  type ActivityTargetCategory,
  activityPlanStructureSchemaV3,
  calculateActivityPlanStats,
  compileActivityPlanV3,
  getActivityPlanDefaultTarget,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { randomUUID } from "expo-crypto";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { ActivityPlanBasicsSection } from "@/components/activity-plan/ActivityPlanBasicsSection";
import { findActivitySegmentForInterval } from "@/components/activity-plan/activityPlanSelection";
import { StructureBuilderCard } from "@/components/activity-plan/structure/StructureBuilderCard";
import { StructureIntervalSheet } from "@/components/activity-plan/structure/StructureIntervalSheet";
import { useActivityPlanBasicsForm } from "@/components/activity-plan/useActivityPlanBasicsForm";
import { useActivityPlanComposerProcess } from "@/components/activity-plan/useActivityPlanComposerProcess";
import { StepEditorDialog } from "@/components/activity-plan/workout/StepEditorDialog";
import { AppBottomSheetContent } from "@/components/shared/AppBottomSheet";
import { api } from "@/lib/api";
import { useActivityPlanForm } from "@/lib/hooks/forms/useActivityPlanForm";
import { useAuth } from "@/lib/hooks/useAuth";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";

export type ActivityPlanComposerModeContract =
  | {
      mode: "create";
      planId?: never;
    }
  | {
      mode: "edit";
      planId: string;
    };

type ActivityCategory = ActivityTargetCategory;
const STRUCTURE_CHART_HINT_KEY = "activity-plan-structure-chart-hint-seen-v1";

const createDefaultStep = (
  category: ActivityCategory,
  anchors: ActivityPlanTargetAnchors,
): ActivityPlanIntervalStep => ({
  id: randomUUID(),
  name: "New Step",
  duration: { type: "time", seconds: 300 },
  targets: [getActivityPlanDefaultTarget({ activityCategory: category, anchors })],
});

const createDefaultInterval = (
  category: ActivityCategory,
  index: number,
  anchors: ActivityPlanTargetAnchors,
): ActivityPlanInterval => ({
  id: randomUUID(),
  name: `Interval ${index + 1}`,
  repetitions: 1,
  steps: [createDefaultStep(category, anchors)],
});

export function ActivityPlanComposerScreen(props: ActivityPlanComposerModeContract) {
  const isEditMode = props.mode === "edit";
  const router = useRouter();
  const navigation = useNavigation();
  const { profile } = useAuth();
  const allowNavigationRef = useRef(false);
  const structureStepSheetRef = useRef<BottomSheet>(null);

  const [editingIntervalId, setEditingIntervalId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedIntervalId, setSelectedIntervalId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [showChartCoachmark, setShowChartCoachmark] = useState(false);
  const [undoState, setUndoState] = useState<{
    message: string;
    onUndo: () => void;
  } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    addInterval,
    addStepToInterval,
    updateStepInInterval,
    removeInterval,
    removeStepFromInterval,
    updateInterval,
    copyInterval,
    addSegment,
    updateSegment,
    removeSegment,
    reorderSegments,
    setStructure,
  } = useActivityPlanCreationStore();

  const {
    form,
    setName,
    setDescription,
    setActivityCategory,
    submit,
    validation,
    canSubmit,
    isSubmitting,
    isLoading,
  } = useActivityPlanForm({
    planId: isEditMode ? props.planId : undefined,
    onSuccess: (planId) => {
      allowNavigationRef.current = true;
      if (isEditMode) {
        Alert.alert("Success", "Activity plan updated successfully.");
        router.back();
        return;
      }

      Alert.alert("Success", "Activity plan created successfully!", [
        {
          text: "Schedule Now",
          onPress: () => {
            router.replace({
              pathname: "/activity-plan-detail",
              params: { planId, action: "schedule" },
            });
          },
        },
        {
          text: "View Plan",
          onPress: () => {
            router.replace({ pathname: "/activity-plan-detail", params: { planId } });
          },
        },
      ]);
    },
    onError: () => {
      Alert.alert(
        "Error",
        `Failed to ${isEditMode ? "update" : "save"} activity plan. Please try again.`,
      );
    },
  });

  const basicsForm = useActivityPlanBasicsForm({
    description: form.description,
    name: form.name,
    nameError: validation.errors.name,
    onDescriptionChange: setDescription,
    onNameChange: setName,
  });

  const showUndoToast = (message: string, onUndo: () => void) => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    const undo = () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = null;
      }
      onUndo();
      setUndoState(null);
    };

    setUndoState({ message, onUndo: undo });
    undoTimeoutRef.current = setTimeout(() => {
      setUndoState(null);
      undoTimeoutRef.current = null;
    }, 5000);
  };

  const dismissChartCoachmark = () => {
    setShowChartCoachmark(false);
    AsyncStorage.setItem(STRUCTURE_CHART_HINT_KEY, "1").catch(() => null);
  };

  const activitySegments = form.structure.segments.filter((segment) => segment.role === "activity");
  const selectedActivitySegment =
    activitySegments.find((segment) => segment.id === selectedSegmentId) ?? activitySegments[0];
  const intervals = selectedActivitySegment?.intervals ?? [];
  const maxHrMetrics = api.profileMetrics.list.useQuery({ metric_type: "max_hr", limit: 1 });
  const maxHeartRateBpm = useMemo(
    () => maxHrMetrics.data?.items.find((metric) => metric.metric_type === "max_hr")?.value,
    [maxHrMetrics.data?.items],
  );
  const targetAnchors = useMemo<ActivityPlanTargetAnchors>(
    () => ({
      ftpWatts: profile?.ftp,
      maxHeartRateBpm,
      thresholdHeartRateBpm: profile?.threshold_hr,
    }),
    [maxHeartRateBpm, profile?.ftp, profile?.threshold_hr],
  );
  const stepBeingEdited = useMemo(() => {
    if (!editingIntervalId || !editingStepId) {
      return undefined;
    }

    const interval = intervals.find((item) => item.id === editingIntervalId);
    return interval?.steps.find((item) => item.id === editingStepId);
  }, [editingIntervalId, editingStepId, intervals]);

  const structureStats = useMemo(() => {
    const parsed = activityPlanStructureSchemaV3.safeParse(form.structure);
    if (!parsed.success) {
      return { durationMs: 0, stepCount: 0, estimatedTSS: 0, distanceMeters: 0 };
    }
    const stats = calculateActivityPlanStats(compileActivityPlanV3(parsed.data), {
      cyclingFtpWatts: profile?.ftp ?? undefined,
    });

    return {
      durationMs: Math.round((stats.duration.exactElapsedSeconds ?? 0) * 1000),
      stepCount: stats.occurrenceCount,
      estimatedTSS: 0,
      distanceMeters: stats.duration.categories.reduce((sum, item) => sum + item.distanceMeters, 0),
    };
  }, [form.structure, profile?.ftp]);

  const selectedInterval = selectedIntervalId
    ? intervals.find((interval) => interval.id === selectedIntervalId)
    : undefined;
  const selectedIntervalIndex = selectedInterval
    ? intervals.findIndex((interval) => interval.id === selectedInterval.id)
    : -1;
  const structureStepSheetSnapPoints = useMemo(() => ["68%", "92%"], []);

  useActivityPlanComposerProcess({
    activityCategory: form.activityCategory,
    allowNavigationRef,
    canSubmit,
    description: form.description,
    isEditMode,
    isLoading,
    isSubmitting,
    name: form.name,
    navigation,
    notes: form.notes,
    structure: form.structure,
    submit,
  });

  useEffect(() => {
    AsyncStorage.getItem(STRUCTURE_CHART_HINT_KEY)
      .then((value) => {
        if (!value) {
          setShowChartCoachmark(true);
        }
      })
      .catch(() => {
        setShowChartCoachmark(true);
      });

    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedInterval) {
      structureStepSheetRef.current?.close();
    }
  }, [selectedInterval]);

  const openIntervalSheet = (intervalId: string) => {
    const owningSegment = findActivitySegmentForInterval(activitySegments, intervalId);
    if (!owningSegment) return;
    if (showChartCoachmark) {
      dismissChartCoachmark();
    }
    setSelectedSegmentId(owningSegment.id);
    setSelectedIntervalId(intervalId);
    requestAnimationFrame(() => {
      structureStepSheetRef.current?.snapToIndex(1);
    });
  };

  const handleAddInterval = () => {
    if (!selectedActivitySegment) return;
    addInterval(
      createDefaultInterval(selectedActivitySegment.category, intervals.length, targetAnchors),
      selectedActivitySegment.id,
    );
  };

  const handleAddSegment = (role: ActivityPlanSegmentV3["role"]) => {
    const id = randomUUID();
    const segment: ActivityPlanSegmentV3 =
      role === "activity"
        ? {
            id,
            role,
            name: `Activity ${activitySegments.length + 1}`,
            category: form.activityCategory,
            intervals: [createDefaultInterval(form.activityCategory, 0, targetAnchors)],
          }
        : {
            id,
            role,
            name: role === "transition" ? "Transition" : "Rest",
            duration: { type: "time", seconds: role === "transition" ? 300 : 60 },
          };
    addSegment(segment);
    if (role === "activity") setSelectedSegmentId(id);
  };

  const moveSegment = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= form.structure.segments.length) return;
    const segments = [...form.structure.segments];
    const currentSegment = segments[index];
    const targetSegment = segments[target];
    if (!currentSegment || !targetSegment) return;
    [segments[index], segments[target]] = [targetSegment, currentSegment];
    reorderSegments(segments);
  };

  const handleRemoveInterval = (intervalId: string) => {
    const previousStructure = form.structure;
    removeInterval(intervalId);
    if (selectedIntervalId === intervalId) {
      setSelectedIntervalId(null);
      structureStepSheetRef.current?.close();
    }
    showUndoToast("Interval deleted", () => {
      setStructure(previousStructure);
      setSelectedIntervalId(intervalId);
      requestAnimationFrame(() => {
        structureStepSheetRef.current?.snapToIndex(1);
      });
    });
  };

  const handleDeleteStep = (intervalId: string, stepId: string) => {
    const previousStructure = form.structure;
    removeStepFromInterval(intervalId, stepId);
    showUndoToast("Step deleted", () => {
      setStructure(previousStructure);
      setSelectedIntervalId(intervalId);
      requestAnimationFrame(() => {
        structureStepSheetRef.current?.snapToIndex(1);
      });
    });
  };

  const handleChangeIntervalRepetitions = (interval: ActivityPlanInterval, value: number) => {
    updateInterval(interval.id, {
      ...interval,
      repetitions: Number.isFinite(value) ? value : 0,
    });
  };

  const openAddStep = (intervalId: string) => {
    setEditingIntervalId(intervalId);
    setEditingStepId(null);
    setEditDialogOpen(true);
  };

  const openEditStep = (intervalId: string, stepId: string) => {
    setEditingIntervalId(intervalId);
    setEditingStepId(stepId);
    setEditDialogOpen(true);
  };

  const handleSaveStep = (step: ActivityPlanIntervalStep) => {
    if (!editingIntervalId) {
      return;
    }

    if (editingStepId) {
      updateStepInInterval(editingIntervalId, editingStepId, step);
    } else {
      addStepToInterval(editingIntervalId, step);
    }

    setEditDialogOpen(false);
    setEditingIntervalId(null);
    setEditingStepId(null);
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-3">Loading plan...</Text>
      </View>
    );
  }

  const issueMaps = (() => {
    const intervalIssues: Record<string, { interval: number; step: number; total: number }> = {};
    const stepIssueCountsByInterval: Record<string, Record<string, number>> = {};

    Object.entries(validation.errors).forEach(([key]) => {
      if (key.startsWith("interval:")) {
        const [, intervalId] = key.split(":");
        if (!intervalId) {
          return;
        }
        const current = intervalIssues[intervalId] ?? {
          interval: 0,
          step: 0,
          total: 0,
        };
        current.interval += 1;
        current.total += 1;
        intervalIssues[intervalId] = current;
        return;
      }

      if (key.startsWith("step:")) {
        const [, intervalId, stepId] = key.split(":");
        if (!intervalId || !stepId) {
          return;
        }
        const current = intervalIssues[intervalId] ?? {
          interval: 0,
          step: 0,
          total: 0,
        };
        current.step += 1;
        current.total += 1;
        intervalIssues[intervalId] = current;

        const stepIssues = stepIssueCountsByInterval[intervalId] ?? {};
        stepIssues[stepId] = (stepIssues[stepId] ?? 0) + 1;
        stepIssueCountsByInterval[intervalId] = stepIssues;
      }
    });

    return {
      intervalIssues,
      stepIssueCountsByInterval,
    };
  })();

  return (
    <View className="flex-1 bg-background">
      <NestableScrollContainer className="flex-1 p-4" showsVerticalScrollIndicator={false}>
        <View className="gap-4 pb-10">
          <ActivityPlanBasicsSection
            activityCategory={selectedActivitySegment?.category ?? form.activityCategory}
            activityCategoryError={validation.errors.activity_category}
            form={basicsForm}
            onChangeActivityCategory={(category) => {
              const nextCategory = category as ActivityCategory;
              setActivityCategory(nextCategory);
              if (selectedActivitySegment) {
                updateSegment(selectedActivitySegment.id, {
                  ...selectedActivitySegment,
                  category: nextCategory,
                });
              }
            }}
          />

          <View className="gap-3 rounded-lg border border-border bg-card p-3">
            <Text className="text-base font-semibold text-foreground">Ordered segments</Text>
            {form.structure.segments.map((segment, index) => (
              <Pressable
                key={segment.id}
                onPress={() => segment.role === "activity" && setSelectedSegmentId(segment.id)}
                className={`rounded-lg border p-3 ${selectedActivitySegment?.id === segment.id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <View className="flex-1">
                    <Text className="font-medium text-foreground">{segment.name}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {segment.role === "activity"
                        ? `${segment.category} · ${segment.intervals.length} interval${segment.intervals.length === 1 ? "" : "s"}`
                        : `${segment.role} · ${Math.round(segment.duration.seconds / 60)} min`}
                    </Text>
                  </View>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => moveSegment(index, -1)}
                    disabled={index === 0}
                  >
                    <Text>↑</Text>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => moveSegment(index, 1)}
                    disabled={index === form.structure.segments.length - 1}
                  >
                    <Text>↓</Text>
                  </Button>
                  <Button variant="ghost" size="sm" onPress={() => removeSegment(segment.id)}>
                    <Text>Remove</Text>
                  </Button>
                </View>
                {segment.role !== "activity" ? (
                  <View className="mt-2 flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() =>
                        updateSegment(segment.id, {
                          ...segment,
                          duration: {
                            type: "time",
                            seconds: Math.max(1, segment.duration.seconds - 60),
                          },
                        })
                      }
                    >
                      <Text>-1 min</Text>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() =>
                        updateSegment(segment.id, {
                          ...segment,
                          duration: { type: "time", seconds: segment.duration.seconds + 60 },
                        })
                      }
                    >
                      <Text>+1 min</Text>
                    </Button>
                  </View>
                ) : null}
              </Pressable>
            ))}
            <View className="flex-row flex-wrap gap-2">
              <Button variant="outline" size="sm" onPress={() => handleAddSegment("activity")}>
                <Text>Add activity</Text>
              </Button>
              <Button variant="outline" size="sm" onPress={() => handleAddSegment("transition")}>
                <Text>Add transition</Text>
              </Button>
              <Button variant="outline" size="sm" onPress={() => handleAddSegment("rest")}>
                <Text>Add rest</Text>
              </Button>
            </View>
          </View>

          {selectedActivitySegment ? (
            <StructureBuilderCard
              structure={form.structure}
              intervals={intervals}
              structureStats={structureStats}
              validationErrors={validation.errors}
              selectedIntervalId={selectedIntervalId}
              showChartCoachmark={showChartCoachmark}
              onAddInterval={handleAddInterval}
              onDismissChartCoachmark={dismissChartCoachmark}
              onTimelineIntervalPress={openIntervalSheet}
            />
          ) : null}
        </View>
      </NestableScrollContainer>

      <StepEditorDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        step={stepBeingEdited}
        onSave={(step) =>
          handleSaveStep({
            ...step,
            targets: step.targets ?? [
              getActivityPlanDefaultTarget({
                activityCategory: selectedActivitySegment?.category ?? form.activityCategory,
                anchors: targetAnchors,
              }),
            ],
          })
        }
        activityType={selectedActivitySegment?.category ?? form.activityCategory}
        targetAnchors={targetAnchors}
      />

      <BottomSheet
        ref={structureStepSheetRef}
        index={-1}
        snapPoints={structureStepSheetSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        onClose={() => {
          setSelectedIntervalId(null);
        }}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.45}
            pressBehavior="close"
          />
        )}
      >
        {selectedInterval ? (
          <AppBottomSheetContent paddingHorizontal={0} paddingTop={0} paddingBottom={24}>
            <StructureIntervalSheet
              interval={selectedInterval}
              intervalIndex={selectedIntervalIndex >= 0 ? selectedIntervalIndex : 0}
              intervalIssue={issueMaps.intervalIssues[selectedInterval.id]}
              stepIssueCounts={issueMaps.stepIssueCountsByInterval[selectedInterval.id] ?? {}}
              onAdjustRepetitions={(delta) =>
                handleChangeIntervalRepetitions(
                  selectedInterval,
                  selectedInterval.repetitions + delta,
                )
              }
              onAddStep={() => {
                openAddStep(selectedInterval.id);
                structureStepSheetRef.current?.close();
              }}
              onDuplicateInterval={() => copyInterval(selectedInterval.id)}
              onDeleteInterval={() => {
                handleRemoveInterval(selectedInterval.id);
                structureStepSheetRef.current?.close();
              }}
              onDeleteStep={(stepId) => {
                handleDeleteStep(selectedInterval.id, stepId);
              }}
              onEditStep={(stepId) => {
                openEditStep(selectedInterval.id, stepId);
                structureStepSheetRef.current?.close();
              }}
            />
          </AppBottomSheetContent>
        ) : null}
      </BottomSheet>

      {undoState ? (
        <View className="absolute bottom-4 left-4 right-4 rounded-lg border border-border bg-card px-3 py-2">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-sm text-foreground">{undoState.message}</Text>
            <Pressable
              onPress={undoState.onUndo}
              className="min-h-11 items-center justify-center rounded-md px-3"
              accessibilityRole="button"
              accessibilityLabel="Undo"
              accessibilityHint="Restores the deleted item"
            >
              <Text className="text-sm font-semibold text-primary">Undo</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
