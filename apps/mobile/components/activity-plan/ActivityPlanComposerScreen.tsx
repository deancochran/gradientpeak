import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  calculateActivityStatsV2,
  decodePolyline,
  type IntensityTargetV2,
  type IntervalStepV2,
  type IntervalV2,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { useNavigation, useRouter } from "expo-router";
import { MapPin, Upload, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import MapView, { Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { ActivityCategorySelector } from "@/components/ActivityPlan/ActivityCategorySelector";
import { StepEditorDialog } from "@/components/ActivityPlan/StepEditorDialog";
import { StructureBuilderCard } from "@/components/activity-plan/structure/StructureBuilderCard";
import { StructureIntervalSheet } from "@/components/activity-plan/structure/StructureIntervalSheet";
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
  const initialSignatureRef = useRef<string | null>(null);
  const structureStepSheetRef = useRef<BottomSheet>(null);

  const [editingIntervalId, setEditingIntervalId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isUploadingRoute, setIsUploadingRoute] = useState(false);
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

  const utils = api.useUtils();

  const uploadRouteMutation = api.routes.upload.useMutation({
    onSuccess: (data) => {
      setRouteId(data.id);
      setIsUploadingRoute(false);
      utils.routes.invalidate();
    },
    onError: () => {
      Alert.alert("Error", "Failed to upload route. Please try again.");
      setIsUploadingRoute(false);
    },
  });

  const {
    form,
    setName,
    setDescription,
    setActivityCategory,
    setRouteId,
    setNotes,
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
            router.push(buildPlanRoute(planId, "schedule") as any);
          },
        },
        {
          text: "View Plan",
          onPress: () => {
            router.push(buildPlanRoute(planId) as any);
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

  const formSignature = useMemo(
    () =>
      JSON.stringify({
        name: form.name,
        description: form.description,
        activityCategory: form.activityCategory,
        structure: form.structure,
        routeId: form.routeId,
        notes: form.notes,
      }),
    [form],
  );

  useEffect(() => {
    if (isLoading || initialSignatureRef.current) {
      return;
    }
    initialSignatureRef.current = formSignature;
  }, [isLoading, formSignature]);

  const isDirty =
    initialSignatureRef.current !== null && initialSignatureRef.current !== formSignature;

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
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (allowNavigationRef.current || !isDirty || isSubmitting) {
        return;
      }

      event.preventDefault();
      Alert.alert("Discard changes?", "Your edits will be lost.", [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            allowNavigationRef.current = true;
            navigation.dispatch(event.data.action);
          },
        },
      ]);
    });

    return unsubscribe;
  }, [navigation, isDirty, isSubmitting]);

  useEffect(() => {
    navigation.setOptions({
      title: isEditMode ? "Edit Activity Plan" : "Create Activity Plan",
      headerRight: () => (
        <Button
          variant="ghost"
          size="sm"
          onPress={submit}
          disabled={!canSubmit || isLoading || isSubmitting}
        >
          <Text className="text-primary font-semibold">{isSubmitting ? "Saving..." : "Save"}</Text>
        </Button>
      ),
    });
  }, [navigation, isEditMode, submit, canSubmit, isLoading, isSubmitting]);

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

  const handlePickGpxFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/gpx+xml", "text/xml", "application/xml"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const file = result.assets[0];
      const response = await fetch(file.uri);
      const content = await response.text();
      const fileName = file.name.replace(/\.gpx$/i, "");

      setIsUploadingRoute(true);
      uploadRouteMutation.mutate({
        name: fileName,
        description: `Uploaded for ${form.name || "activity plan"}`,
        activityCategory: form.activityCategory,
        fileContent: content,
        fileName: file.name,
      });
    } catch {
      Alert.alert("Error", "Failed to read GPX file");
      setIsUploadingRoute(false);
    }
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

  const firstBlockingError = Object.values(validation.errors)[0];
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
          <Card>
            <CardContent className="p-4 gap-3">
              <Text className="font-semibold">Basics</Text>

              <View className="flex-row gap-3">
                <ActivityCategorySelector
                  value={form.activityCategory}
                  onChange={(category) => setActivityCategory(category as ActivityCategory)}
                  compact
                />
                <Input
                  value={form.name}
                  onChangeText={setName}
                  placeholder="Plan name"
                  className="flex-1 h-[48px]"
                />
              </View>
              {validation.errors.name ? (
                <Text className="text-xs text-destructive">{validation.errors.name}</Text>
              ) : null}

              {validation.errors.activity_category ? (
                <Text className="text-xs text-destructive">
                  {validation.errors.activity_category}
                </Text>
              ) : null}

              <Textarea
                value={form.description}
                onChangeText={setDescription}
                placeholder="Description (optional)"
                className="min-h-[64px]"
              />

              <Textarea
                value={form.notes}
                onChangeText={setNotes}
                placeholder="Notes (optional)"
                className="min-h-[64px]"
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="font-semibold">Route (Optional)</Text>
                {!!form.routeId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => setRouteId(null)}
                    disabled={isUploadingRoute}
                  >
                    <Icon as={X} size={16} className="text-muted-foreground" />
                  </Button>
                )}
              </View>

              {!form.routeId ? (
                <Button variant="outline" onPress={handlePickGpxFile} disabled={isUploadingRoute}>
                  <Icon as={Upload} size={16} className="text-foreground" />
                  <Text className="text-foreground ml-2">
                    {isUploadingRoute ? "Uploading..." : "Upload GPX File"}
                  </Text>
                </Button>
              ) : routeQuery.data ? (
                <View className="border border-border rounded-lg overflow-hidden">
                  {routeCoordinates && routeCoordinates.length > 0 ? (
                    <View className="h-28">
                      <MapView
                        style={{ flex: 1 }}
                        provider={PROVIDER_DEFAULT}
                        scrollEnabled={false}
                        zoomEnabled={false}
                        pitchEnabled={false}
                        rotateEnabled={false}
                        initialRegion={{
                          latitude:
                            routeCoordinates[Math.floor(routeCoordinates.length / 2)].latitude,
                          longitude:
                            routeCoordinates[Math.floor(routeCoordinates.length / 2)].longitude,
                          latitudeDelta: 0.05,
                          longitudeDelta: 0.05,
                        }}
                      >
                        <Polyline
                          coordinates={routeCoordinates}
                          strokeColor="#3b82f6"
                          strokeWidth={3}
                        />
                      </MapView>
                    </View>
                  ) : null}
                  <View className="p-3">
                    <Text className="font-medium">{routeQuery.data.name}</Text>
                    <View className="flex-row items-center gap-3 mt-1">
                      <View className="flex-row items-center gap-1">
                        <Icon as={MapPin} size={12} className="text-muted-foreground" />
                        <Text className="text-xs text-muted-foreground">
                          {((routeQuery.data.total_distance ?? 0) / 1000).toFixed(1)} km
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <Text className="text-xs text-muted-foreground">Loading route...</Text>
              )}
            </CardContent>
          </Card>

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

          {firstBlockingError ? (
            <Text className="text-xs text-destructive">{firstBlockingError}</Text>
          ) : null}

          <Button onPress={submit} disabled={!canSubmit || isLoading || isSubmitting}>
            <Text className="text-primary-foreground font-semibold">
              {isSubmitting ? "Saving..." : isEditMode ? "Save changes" : "Create activity plan"}
            </Text>
          </Button>
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
