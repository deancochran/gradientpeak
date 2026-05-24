import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  calculateActivityStatsV2,
  decodePolyline,
  type IntensityTargetV2,
  type IntervalStepV2,
  type IntervalV2,
} from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { randomUUID } from "expo-crypto";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { ActivityPlanBasicsSection } from "@/components/activity-plan/ActivityPlanBasicsSection";
import { ActivityPlanRouteSection } from "@/components/activity-plan/ActivityPlanRouteSection";
import { StructureBuilderCard } from "@/components/activity-plan/structure/StructureBuilderCard";
import { StructureIntervalSheet } from "@/components/activity-plan/structure/StructureIntervalSheet";
import { useActivityPlanComposerProcess } from "@/components/activity-plan/useActivityPlanComposerProcess";
import { useActivityPlanRouteUpload } from "@/components/activity-plan/useActivityPlanRouteUpload";
import { StepEditorDialog } from "@/components/activity-plan/workout/StepEditorDialog";
import { api } from "@/lib/api";
import { buildPlanRoute } from "@/lib/constants/routes";
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

type ActivityCategory = "run" | "bike" | "swim" | "strength" | "other";
const STRUCTURE_CHART_HINT_KEY = "activity-plan-structure-chart-hint-seen-v1";

const createDefaultTarget = (category: ActivityCategory): IntensityTargetV2 => {
  if (category === "bike") {
    return { type: "%FTP", intensity: 75 };
  }
  if (category === "run") {
    return { type: "%MaxHR", intensity: 75 };
  }
  return { type: "RPE", intensity: 5 };
};

const createDefaultStep = (category: ActivityCategory): IntervalStepV2 => ({
  id: randomUUID(),
  name: "New Step",
  duration: { type: "time", seconds: 300 },
  targets: [createDefaultTarget(category)],
});

const createDefaultInterval = (category: ActivityCategory, index: number): IntervalV2 => ({
  id: randomUUID(),
  name: `Interval ${index + 1}`,
  repetitions: 1,
  steps: [createDefaultStep(category)],
});

export function ActivityPlanComposerScreen(props: ActivityPlanComposerModeContract) {
  const isEditMode = props.mode === "edit";
  const router = useRouter();
  const navigation = useNavigation();
  const allowNavigationRef = useRef(false);
  const structureStepSheetRef = useRef<BottomSheet>(null);

  const [editingIntervalId, setEditingIntervalId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedIntervalId, setSelectedIntervalId] = useState<string | null>(null);
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
    setStructure,
  } = useActivityPlanCreationStore();

  const {
    form,
    setName,
    setDescription,
    setActivityCategory,
    setRouteId,
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
            router.replace(buildPlanRoute(planId, "schedule") as any);
          },
        },
        {
          text: "View Plan",
          onPress: () => {
            router.replace(buildPlanRoute(planId) as any);
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

  const intervals = form.structure.intervals || [];

  const stepBeingEdited = useMemo(() => {
    if (!editingIntervalId || !editingStepId) {
      return undefined;
    }

    const interval = intervals.find((item) => item.id === editingIntervalId);
    return interval?.steps.find((item) => item.id === editingStepId);
  }, [editingIntervalId, editingStepId, intervals]);

  const routeQuery = api.routes.get.useQuery({ id: form.routeId! }, { enabled: !!form.routeId });
  const { isUploadingRoute, pickGpxFile } = useActivityPlanRouteUpload({
    planName: form.name,
    onRouteUploaded: setRouteId,
  });

  const structureStats = useMemo(() => {
    if (intervals.length === 0) {
      return {
        durationMs: 0,
        stepCount: 0,
        estimatedTSS: 0,
        distanceMeters: 0,
      };
    }

    const stats = calculateActivityStatsV2({ version: 2, intervals });
    let stepCount = 0;
    let distanceMeters = 0;

    intervals.forEach((interval) => {
      stepCount += interval.steps.length * interval.repetitions;
      interval.steps.forEach((step) => {
        if (step.duration.type === "distance") {
          distanceMeters += step.duration.meters * interval.repetitions;
        }
      });
    });

    return {
      durationMs: Math.round(stats.totalDuration * 1000),
      stepCount,
      estimatedTSS: stats.estimatedTSS,
      distanceMeters,
    };
  }, [intervals]);

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
    routeId: form.routeId,
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
    if (showChartCoachmark) {
      dismissChartCoachmark();
    }
    setSelectedIntervalId(intervalId);
    requestAnimationFrame(() => {
      structureStepSheetRef.current?.snapToIndex(1);
    });
  };

  const handleAddInterval = () => {
    addInterval(createDefaultInterval(form.activityCategory, intervals.length));
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

  const handleChangeIntervalRepetitions = (interval: IntervalV2, value: number) => {
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

  const handleSaveStep = (step: IntervalStepV2) => {
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

  const routeCoordinates = routeQuery.data?.polyline
    ? decodePolyline(routeQuery.data.polyline)
    : null;

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
            description={form.description}
            errors={validation.errors}
            name={form.name}
            onChangeActivityCategory={(category) =>
              setActivityCategory(category as ActivityCategory)
            }
            onChangeDescription={setDescription}
            onChangeName={setName}
          />

          <ActivityPlanRouteSection
            coordinates={routeCoordinates}
            error={validation.errors.route_id}
            isUploadingRoute={isUploadingRoute}
            onClearRoute={() => setRouteId(null)}
            onPickRoute={pickGpxFile}
            onSelectRoute={setRouteId}
            route={routeQuery.data}
            routeId={form.routeId}
          />

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
        </View>
      </NestableScrollContainer>

      <StepEditorDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        step={stepBeingEdited}
        onSave={handleSaveStep}
        activityType={form.activityCategory}
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
          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
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
          </BottomSheetScrollView>
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
