import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type ActivityPlanInterval,
  type ActivityPlanTargetAnchors,
  type ActivityTargetCategory,
  type AthletePerformanceTargetFacts,
  activityPlanStructureSchema,
  calculateActivityPlanStats,
  compileActivityPlan,
  createUnavailableAthletePerformanceTargetFacts,
  getAvailablePerformanceTargetValue,
} from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { randomUUID } from "expo-crypto";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, useWindowDimensions, View } from "react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityPlanBasicsSection } from "@/components/activity-plan/ActivityPlanBasicsSection";
import { findActivitySegmentForInterval } from "@/components/activity-plan/activityPlanSelection";
import { StructureBuilderCard } from "@/components/activity-plan/structure/StructureBuilderCard";
import { StructureIntervalSheet } from "@/components/activity-plan/structure/StructureIntervalSheet";
import { useActivityPlanBasicsForm } from "@/components/activity-plan/useActivityPlanBasicsForm";
import { useActivityPlanComposerProcess } from "@/components/activity-plan/useActivityPlanComposerProcess";
import { createDefaultActivityPlanStep } from "@/lib/activityPlanDefaults";
import { api } from "@/lib/api";
import { useActivityPlanForm } from "@/lib/hooks/forms/useActivityPlanForm";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import { useAuthStore } from "@/lib/stores/auth-store";

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
  steps: [
    createDefaultActivityPlanStep({
      activityCategory: activity_category,
      anchors,
    }),
  ],
});

export function ActivityPlanComposerScreen(props: ActivityPlanComposerModeContract) {
  const isEditMode = props.mode === "edit";
  const router = useRouter();
  const navigation = useNavigation();
  const allowNavigationRef = useRef(false);
  const reloadFromServerRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const performanceModelAsOf = useRef(new Date().toISOString()).current;
  const { width } = useWindowDimensions();
  const { bottom: bottomSafeAreaInset } = useSafeAreaInsets();

  const [selectedIntervalId, setSelectedIntervalId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [showChartCoachmark, setShowChartCoachmark] = useState(false);
  const [legacyDetailsOpen, setLegacyDetailsOpen] = useState(false);
  const [undoState, setUndoState] = useState<{
    message: string;
    onUndo: () => void;
  } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    addInterval,
    removeInterval,
    updateInterval,
    copyInterval,
    reorderIntervals,
    updateSegment,
    removeSegment,
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
    editStatus,
    hydrationVersion,
    reloadFromServer,
    retryLoad,
    submitError,
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
            router.replace({
              pathname: "/activity-plan-detail",
              params: { planId },
            });
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
    onConflict: () => {
      Alert.alert(
        "Plan changed elsewhere",
        "Your edits are still on this screen. Reloading will replace them with the latest saved plan.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Reload server plan",
            onPress: () => void reloadFromServerRef.current(),
          },
        ],
      );
    },
  });
  reloadFromServerRef.current = reloadFromServer;
  const submittingRef = useRef(isSubmitting);
  submittingRef.current = isSubmitting;

  const basicsForm = useActivityPlanBasicsForm({
    description: form.description,
    name: form.name,
    nameError: validation.errors.name,
    onDescriptionChange: setDescription,
    onNameChange: setName,
  });

  const showUndoToast = (message: string, onUndo: () => void) => {
    // Store actions are synchronous. Capture the post-deletion root, then compare at
    // action time so even a same-turn mutation cannot be overwritten by this inverse.
    const undoStructure = useActivityPlanCreationStore.getState().structure;
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    const undo = () => {
      if (submittingRef.current) return;
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = null;
      }
      if (useActivityPlanCreationStore.getState().structure !== undoStructure) {
        Alert.alert(
          "Undo expired",
          "The plan structure changed after deletion. Undo is unavailable so your later changes are kept.",
        );
      } else {
        onUndo();
      }
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
  const hasLegacySections = form.structure.segments.length > 1;
  const selectedActivitySegment =
    activitySegments.find((segment) => segment.id === selectedSegmentId) ?? activitySegments[0];
  const intervals = selectedActivitySegment?.intervals ?? [];
  const profileId = useAuthStore((state) => state.profile?.id ?? state.user?.id ?? null);
  const publishedStateQuery = api.athleteIntelligence.getReadModel.useQuery(
    {
      profileId: profileId ?? "",
      sections: { publishedState: true, status: true },
    },
    { enabled: profileId !== null },
  );
  const performanceTargets = useMemo(
    () =>
      publishedStateQuery.data?.publishedState?.performanceTargets
        ? publishedStateQuery.data.publishedState.performanceTargets
        : createUnavailableAthletePerformanceTargetFacts(
            publishedStateQuery.data?.publishedState?.publishedAt ?? performanceModelAsOf,
          ),
    [performanceModelAsOf, publishedStateQuery.data],
  );
  const targetAnchors = useMemo<ActivityPlanTargetAnchors>(
    () => ({
      ftpWatts: getAvailablePerformanceTargetValue(performanceTargets.thresholds.bike) ?? undefined,
      maxHeartRateBpm: activityCategoryHeartRateValue(
        performanceTargets,
        "max_hr",
        form.activityCategory,
      ),
      thresholdHeartRateBpm: activityCategoryHeartRateValue(
        performanceTargets,
        "lthr",
        form.activityCategory,
      ),
    }),
    [form.activityCategory, performanceTargets],
  );

  const structureStats = useMemo(() => {
    const parsed = activityPlanStructureSchema.safeParse(form.structure);
    if (!parsed.success) {
      return {
        durationMs: null,
        hasOpenDuration: false,
        hasPartialDuration: false,
        stepCount: 0,
        distanceMeters: 0,
      };
    }
    const stats = calculateActivityPlanStats(compileActivityPlan(parsed.data));

    return {
      durationMs:
        stats.duration.exactElapsedSeconds === null
          ? null
          : Math.round(stats.duration.exactElapsedSeconds * 1000),
      hasOpenDuration: stats.duration.openOccurrenceCount > 0,
      hasPartialDuration:
        stats.duration.openOccurrenceCount > 0 &&
        stats.duration.timedActiveSeconds + stats.duration.restSeconds > 0,
      stepCount: stats.occurrenceCount,
      distanceMeters: stats.duration.activity_categories.reduce(
        (sum, item) => sum + item.distanceMeters,
        0,
      ),
    };
  }, [form.structure]);

  const selectedInterval = selectedIntervalId
    ? intervals.find((interval) => interval.id === selectedIntervalId)
    : undefined;

  useActivityPlanComposerProcess({
    activityCategory: form.activityCategory,
    allowNavigationRef,
    canSubmit: canSubmit && !selectedInterval,
    description: form.description,
    isEditMode,
    isEditBlocked,
    hydrationVersion,
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
    const interval = createDefaultInterval(
      form.structure.activity_category,
      intervals.length,
      targetAnchors,
    );
    addInterval(interval, selectedActivitySegment.id);
    setSelectedIntervalId(interval.id);
  };

  const handleRemoveSegment = (segmentId: string) => {
    const previousStructure = useActivityPlanCreationStore.getState().structure;
    const segment = previousStructure.segments.find((item) => item.id === segmentId);
    if (
      !segment ||
      (segment.role === "activity" &&
        previousStructure.segments.filter((item) => item.role === "activity").length <= 1)
    )
      return;
    removeSegment(segmentId);
    if (selectedSegmentId === segmentId) setSelectedSegmentId(null);
    showUndoToast("Activity plan section deleted", () => setStructure(previousStructure));
  };

  const handleRemoveInterval = (intervalId: string) => {
    const previousStructure = useActivityPlanCreationStore.getState().structure;
    removeInterval(intervalId);
    if (selectedIntervalId === intervalId) {
      setSelectedIntervalId(null);
    }
    showUndoToast("Interval deleted", () => {
      setStructure(previousStructure);
      setSelectedIntervalId(intervalId);
    });
  };

  const requestRemoveInterval = (intervalId: string) => {
    Alert.alert("Delete interval?", "This removes the interval from this plan.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => handleRemoveInterval(intervalId),
      },
    ]);
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
    const canRetry = editStatus === "error";
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          Plan unavailable
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          {canRetry
            ? "The latest plan could not be loaded. Your changes have been kept."
            : "This plan uses an unsupported activity structure and was not changed."}
        </Text>
        {canRetry ? (
          <Button onPress={() => void retryLoad()}>
            <Text>Retry</Text>
          </Button>
        ) : null}
        <Button onPress={() => router.back()}>
          <Text>Back to plans</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {isSubmitting ? <Text accessibilityLiveRegion="polite">Saving activity plan...</Text> : null}
      {submitError ? (
        <Text accessibilityRole="alert" className="px-6 text-destructive">
          {submitError}
        </Text>
      ) : null}
      <NestableScrollContainer
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: width < 390 ? 20 : 24,
          paddingTop: 16,
          paddingBottom: Math.max(24, bottomSafeAreaInset + 16),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="w-full gap-4"
          pointerEvents={isSubmitting ? "none" : "auto"}
          accessibilityElementsHidden={isSubmitting}
          importantForAccessibility={isSubmitting ? "no-hide-descendants" : "auto"}
        >
          <View className="rounded-3xl border border-border bg-card p-4">
            <ActivityPlanBasicsSection
              disabled={isSubmitting}
              activityCategory={form.activityCategory}
              activityCategoryError={validation.errors.activity_category}
              form={basicsForm}
              onChangeActivityCategory={(activity_category) => {
                const nextCategory = activity_category as ActivityCategory;
                if (nextCategory === form.activityCategory) return;
                Alert.alert(
                  "Change plan activity category?",
                  "Changing the activity category preserves your current durations and targets. Correct any incompatible values in each step before saving.",
                  [
                    { text: "Keep current activity category", style: "cancel" },
                    {
                      text: "Change activity category",
                      style: "destructive",
                      onPress: () => {
                        if (!submittingRef.current) setActivityCategory(nextCategory);
                      },
                    },
                  ],
                );
              }}
            />
          </View>

          {Object.entries(validation.errors)
            .filter(
              ([key]) =>
                !["name", "activity_category", "segments", "intervals"].includes(key) &&
                !key.startsWith("step:") &&
                !key.startsWith("interval:"),
            )
            .map(([key, message]) => (
              <Text key={key} accessibilityRole="alert" className="text-sm text-destructive">
                {key}: {message}
              </Text>
            ))}

          {hasLegacySections ? (
            <View className="gap-2">
              <Text className="text-xs font-medium text-muted-foreground">
                Activity plan sections
              </Text>
              {form.structure.segments.map((segment) => (
                <Pressable
                  key={segment.id}
                  onPress={() => segment.role === "activity" && setSelectedSegmentId(segment.id)}
                  accessibilityRole={segment.role === "activity" ? "button" : undefined}
                  accessibilityLabel={
                    segment.role === "activity"
                      ? `Open ${segment.name}, ${form.structure.activity_category}, ${segment.intervals.length} interval${segment.intervals.length === 1 ? "" : "s"}`
                      : undefined
                  }
                  accessibilityState={
                    segment.role === "activity"
                      ? { selected: selectedActivitySegment?.id === segment.id }
                      : undefined
                  }
                  className={`rounded-md border px-3 py-2 ${selectedActivitySegment?.id === segment.id ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="flex-1">
                      <Text className="font-medium text-foreground">{segment.name}</Text>
                      <Text className="text-xs text-muted-foreground">
                        {segment.role === "activity"
                          ? `${form.structure.activity_category} · ${segment.intervals.length} interval${segment.intervals.length === 1 ? "" : "s"}`
                          : `${segment.role} · ${Math.round(segment.duration.seconds / 60)} min`}
                      </Text>
                    </View>
                  </View>
                  {legacyDetailsOpen ? (
                    <View className="mt-3 gap-2">
                      <Text className="text-xs font-medium text-muted-foreground">
                        Section name
                      </Text>
                      <Input
                        editable={!isSubmitting}
                        accessibilityLabel={`Section name ${segment.name}`}
                        maxLength={100}
                        onChangeText={(name) => updateSegment(segment.id, { ...segment, name })}
                        value={segment.name}
                      />
                      <Text className="text-xs font-medium text-muted-foreground">
                        Section notes
                      </Text>
                      <Textarea
                        editable={!isSubmitting}
                        accessibilityLabel={`Section notes ${segment.name}`}
                        maxLength={1000}
                        numberOfLines={2}
                        onChangeText={(notes) => updateSegment(segment.id, { ...segment, notes })}
                        value={segment.notes ?? ""}
                      />
                      {segment.role !== "activity" || activitySegments.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={() => handleRemoveSegment(segment.id)}
                        >
                          <Text className="text-destructive">Remove section</Text>
                        </Button>
                      ) : null}
                    </View>
                  ) : null}
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
                            duration: {
                              type: "time",
                              seconds: segment.duration.seconds + 60,
                            },
                          })
                        }
                      >
                        <Text>+1 min</Text>
                      </Button>
                    </View>
                  ) : null}
                </Pressable>
              ))}
              <Button
                accessibilityLabel="Legacy section details"
                onPress={() => setLegacyDetailsOpen((open) => !open)}
                size="sm"
                variant="ghost"
              >
                <Text className="text-muted-foreground">
                  {legacyDetailsOpen ? "Hide section details" : "Section details"}
                </Text>
              </Button>
            </View>
          ) : null}

          {selectedActivitySegment ? (
            <StructureBuilderCard
              structure={form.structure}
              segmentId={selectedActivitySegment.id}
              intervals={intervals}
              structureStats={structureStats}
              validationErrors={validation.errors}
              selectedIntervalId={selectedIntervalId}
              showChartCoachmark={showChartCoachmark}
              onAddInterval={handleAddInterval}
              onDismissChartCoachmark={dismissChartCoachmark}
              onDuplicateInterval={(intervalId) => copyInterval(intervalId)}
              onDeleteInterval={requestRemoveInterval}
              onReorderIntervals={(nextIntervals) =>
                reorderIntervals(nextIntervals, selectedActivitySegment.id)
              }
              onTimelineIntervalPress={openIntervalSheet}
            />
          ) : null}
        </View>
      </NestableScrollContainer>

      {selectedInterval ? (
        <StructureIntervalSheet
          key={selectedInterval.id}
          interval={selectedInterval}
          activityCategory={form.structure.activity_category}
          targetAnchors={targetAnchors}
          onClose={() => setSelectedIntervalId(null)}
          onCommit={(interval) => {
            updateInterval(interval.id, interval);
            setSelectedIntervalId(null);
          }}
        />
      ) : null}

      {undoState ? (
        <View className="absolute bottom-4 left-4 right-4 rounded-lg border border-border bg-card px-3 py-2">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-sm text-foreground">{undoState.message}</Text>
            <Pressable
              disabled={isSubmitting}
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
