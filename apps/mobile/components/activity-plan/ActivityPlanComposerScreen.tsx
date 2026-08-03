import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type ActivityPlanInterval,
  type ActivityPlanIntervalStep,
  type ActivityPlanSegment,
  type ActivityPlanTargetAnchors,
  type ActivityTargetCategory,
  type AthletePerformanceTargetFacts,
  activityPlanStructureSchema,
  calculateActivityPlanStats,
  compileActivityPlan,
  getAvailablePerformanceTargetValue,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { randomUUID } from "expo-crypto";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { ActivityPlanBasicsSection } from "@/components/activity-plan/ActivityPlanBasicsSection";
import { StepEditorDialog } from "@/components/activity-plan/activity/StepEditorDialog";
import { findActivitySegmentForInterval } from "@/components/activity-plan/activityPlanSelection";
import { StructureBuilderCard } from "@/components/activity-plan/structure/StructureBuilderCard";
import { StructureIntervalSheet } from "@/components/activity-plan/structure/StructureIntervalSheet";
import { useActivityPlanBasicsForm } from "@/components/activity-plan/useActivityPlanBasicsForm";
import { useActivityPlanComposerProcess } from "@/components/activity-plan/useActivityPlanComposerProcess";
import { APP_BOTTOM_SHEET_PRESENTATIONS, AppBottomSheet } from "@/components/shared/AppBottomSheet";
import { createDefaultActivityPlanStep } from "@/lib/activityPlanDefaults";
import { api } from "@/lib/api";
import { useActivityPlanForm } from "@/lib/hooks/forms/useActivityPlanForm";
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

function activityCategoryHeartRateValue(
  snapshot: AthletePerformanceTargetFacts | undefined,
  metric: "lthr" | "max_hr",
  activityCategory: ActivityTargetCategory,
): number | undefined {
  if (activityCategory !== "bike" && activityCategory !== "run" && activityCategory !== "swim") {
    return undefined;
  }
  const fact =
    metric === "lthr"
      ? snapshot?.heartRate[activityCategory].lthr
      : snapshot?.heartRate[activityCategory].maxHr;
  return fact?.status === "available" ? fact.valueBpm : undefined;
}

const createDefaultInterval = (
  activity_category: ActivityCategory,
  index: number,
  anchors: ActivityPlanTargetAnchors,
): ActivityPlanInterval => ({
  id: randomUUID(),
  name: `Interval ${index + 1}`,
  repetitions: 1,
  steps: [createDefaultActivityPlanStep({ activityCategory: activity_category, anchors })],
});

export function ActivityPlanComposerScreen(props: ActivityPlanComposerModeContract) {
  const isEditMode = props.mode === "edit";
  const router = useRouter();
  const navigation = useNavigation();
  const allowNavigationRef = useRef(false);
  const performanceModelAsOf = useRef(new Date().toISOString()).current;

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
    isEditBlocked,
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
  const performanceTargetsQuery = api.profiles.getPerformanceTargets.useQuery({
    asOf: performanceModelAsOf,
  });
  const targetAnchors = useMemo<ActivityPlanTargetAnchors>(
    () => ({
      ftpWatts:
        performanceTargetsQuery.data === undefined
          ? undefined
          : (getAvailablePerformanceTargetValue(
              performanceTargetsQuery.data.cycling.planningThresholdPower,
            ) ?? undefined),
      maxHeartRateBpm: activityCategoryHeartRateValue(
        performanceTargetsQuery.data,
        "max_hr",
        form.activityCategory,
      ),
      thresholdHeartRateBpm: activityCategoryHeartRateValue(
        performanceTargetsQuery.data,
        "lthr",
        form.activityCategory,
      ),
    }),
    [form.activityCategory, performanceTargetsQuery.data],
  );
  const stepBeingEdited = useMemo(() => {
    if (!editingIntervalId || !editingStepId) {
      return undefined;
    }

    const interval = intervals.find((item) => item.id === editingIntervalId);
    return interval?.steps.find((item) => item.id === editingStepId);
  }, [editingIntervalId, editingStepId, intervals]);

  const structureStats = useMemo(() => {
    const parsed = activityPlanStructureSchema.safeParse(form.structure);
    if (!parsed.success) {
      return { durationMs: 0, stepCount: 0, distanceMeters: 0 };
    }
    const stats = calculateActivityPlanStats(compileActivityPlan(parsed.data), {
      cyclingFtpWatts:
        performanceTargetsQuery.data === undefined
          ? undefined
          : (getAvailablePerformanceTargetValue(
              performanceTargetsQuery.data.cycling.planningThresholdPower,
            ) ?? undefined),
    });

    return {
      durationMs: Math.round((stats.duration.exactElapsedSeconds ?? 0) * 1000),
      stepCount: stats.occurrenceCount,
      distanceMeters: stats.duration.activity_categories.reduce(
        (sum, item) => sum + item.distanceMeters,
        0,
      ),
    };
  }, [form.structure, performanceTargetsQuery.data]);

  const selectedInterval = selectedIntervalId
    ? intervals.find((interval) => interval.id === selectedIntervalId)
    : undefined;
  const selectedIntervalIndex = selectedInterval
    ? intervals.findIndex((interval) => interval.id === selectedInterval.id)
    : -1;

  useActivityPlanComposerProcess({
    activityCategory: form.activityCategory,
    allowNavigationRef,
    canSubmit,
    description: form.description,
    isEditMode,
    isEditBlocked,
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

  const openIntervalSheet = (intervalId: string) => {
    const owningSegment = findActivitySegmentForInterval(activitySegments, intervalId);
    if (!owningSegment) return;
    if (showChartCoachmark) {
      dismissChartCoachmark();
    }
    setSelectedSegmentId(owningSegment.id);
    setSelectedIntervalId(intervalId);
  };

  const handleAddInterval = () => {
    if (!selectedActivitySegment) return;
    addInterval(
      createDefaultInterval(
        selectedActivitySegment.activity_category,
        intervals.length,
        targetAnchors,
      ),
      selectedActivitySegment.id,
    );
  };

  const handleAddSegment = (role: ActivityPlanSegment["role"]) => {
    const id = randomUUID();
    const segment: ActivityPlanSegment =
      role === "activity"
        ? {
            id,
            role,
            name: `Activity ${activitySegments.length + 1}`,
            activity_category: form.activityCategory,
            intervals: [createDefaultInterval(form.activityCategory, 0, targetAnchors)],
          }
        : {
            id,
            role,
            name: "Rest",
            duration: { type: "time", seconds: 60 },
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
    }
    showUndoToast("Interval deleted", () => {
      setStructure(previousStructure);
      setSelectedIntervalId(intervalId);
    });
  };

  const handleDeleteStep = (intervalId: string, stepId: string) => {
    const previousStructure = form.structure;
    removeStepFromInterval(intervalId, stepId);
    showUndoToast("Step deleted", () => {
      setStructure(previousStructure);
      setSelectedIntervalId(intervalId);
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

  if (isEditBlocked) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          Plan unavailable
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          This plan cannot be safely edited on mobile.
        </Text>
        <Button onPress={() => router.back()}>
          <Text>Back to plans</Text>
        </Button>
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
            activityCategory={form.activityCategory}
            activityCategoryError={validation.errors.activity_category}
            form={basicsForm}
            onChangeActivityCategory={(activity_category) => {
              const nextCategory = activity_category as ActivityCategory;
              if (nextCategory === form.activityCategory) return;
              Alert.alert(
                "Change plan activity category?",
                "Changing the activity category preserves your current targets. Review any activity-category-specific targets in each step before saving.",
                [
                  { text: "Keep current activity category", style: "cancel" },
                  {
                    text: "Change activity category",
                    style: "destructive",
                    onPress: () => setActivityCategory(nextCategory),
                  },
                ],
              );
            }}
          />

          <View className="gap-3 rounded-lg border border-border bg-card p-3">
            <Text className="text-base font-semibold text-foreground">Ordered segments</Text>
            {form.structure.segments.map((segment, index) => (
              <Pressable
                key={segment.id}
                onPress={() => segment.role === "activity" && setSelectedSegmentId(segment.id)}
                accessibilityRole={segment.role === "activity" ? "button" : undefined}
                accessibilityLabel={
                  segment.role === "activity"
                    ? `Select ${segment.name}, ${segment.activity_category}, ${segment.intervals.length} interval${segment.intervals.length === 1 ? "" : "s"}`
                    : undefined
                }
                accessibilityState={
                  segment.role === "activity"
                    ? { selected: selectedActivitySegment?.id === segment.id }
                    : undefined
                }
                className={`rounded-lg border p-3 ${selectedActivitySegment?.id === segment.id ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <View className="flex-1">
                    <Text className="font-medium text-foreground">{segment.name}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {segment.role === "activity"
                        ? `${segment.activity_category} · ${segment.intervals.length} interval${segment.intervals.length === 1 ? "" : "s"}`
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
        onSave={(step) => handleSaveStep(step)}
        activityCategory={selectedActivitySegment?.activity_category ?? form.activityCategory}
        targetAnchors={targetAnchors}
      />

      <AppBottomSheet
        visible={Boolean(selectedInterval)}
        title={selectedInterval ? `Interval ${selectedIntervalIndex + 1}` : "Interval"}
        showCloseAction
        initialSnapIndex={APP_BOTTOM_SHEET_PRESENTATIONS.inspector.initialSnapIndex}
        snapPoints={APP_BOTTOM_SHEET_PRESENTATIONS.inspector.snapPoints}
        onClose={() => {
          setSelectedIntervalId(null);
        }}
      >
        {selectedInterval ? (
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
              setSelectedIntervalId(null);
            }}
            onDuplicateInterval={() => copyInterval(selectedInterval.id)}
            onDeleteInterval={() => handleRemoveInterval(selectedInterval.id)}
            onDeleteStep={(stepId) => {
              handleDeleteStep(selectedInterval.id, stepId);
            }}
            onEditStep={(stepId) => {
              openEditStep(selectedInterval.id, stepId);
              setSelectedIntervalId(null);
            }}
          />
        ) : null}
      </AppBottomSheet>

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
