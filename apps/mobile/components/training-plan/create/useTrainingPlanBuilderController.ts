import { addDaysDateOnlyUtc } from "@repo/core";
import { useRouter } from "expo-router";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import type { ActivityPlan } from "@/components/shared/ActivityPlanCard";
import type {
  ActivityCategoryFilter,
  ActivityPlanSort,
} from "@/components/training-plan/create/BuilderActivityAssignmentSheetContent";
import type { BuilderSheet } from "@/components/training-plan/create/BuilderSheetTypes";
import { useBuilderSheetStack } from "@/components/training-plan/create/useBuilderSheetStack";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { diffDateOnlyDays } from "@/lib/training-plan-creation/date-utils";
import type { TrainingPlanActivityPlanFacts } from "@/lib/training-plan-creation/types";
import { useTrainingPlanCreationService } from "@/lib/training-plan-creation/useTrainingPlanCreationService";

type ActivityPlanListItem = ActivityPlan;

type TrainingPlanBuilderControllerOptions = {
  mode: "create" | "edit";
  planId?: string;
};

function toActivityPlanFacts(activityPlan: ActivityPlanListItem): TrainingPlanActivityPlanFacts {
  const isPublished =
    activityPlan.template_visibility === "public" ||
    activityPlan.is_public === true ||
    activityPlan.is_system_template === true;

  return {
    id: activityPlan.id,
    name: activityPlan.name,
    published: isPublished,
    accessible: true,
    estimatedTss: activityPlan.authoritative_metrics?.estimated_tss ?? null,
    estimatedDurationSeconds: activityPlan.authoritative_metrics?.estimated_duration ?? null,
  };
}

function toEstimatedActivityPlanFacts(
  activityPlan: ActivityPlanListItem,
  estimate?: { durationSeconds: number | null; tss: number | null } | null,
): TrainingPlanActivityPlanFacts {
  return {
    ...toActivityPlanFacts(activityPlan),
    estimatedDurationSeconds:
      estimate?.durationSeconds ?? activityPlan.authoritative_metrics?.estimated_duration ?? null,
    estimatedTss: estimate?.tss ?? activityPlan.authoritative_metrics?.estimated_tss ?? null,
  };
}

export function useTrainingPlanBuilderController({
  mode,
  planId,
}: TrainingPlanBuilderControllerOptions) {
  const router = useRouter();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activityPlanSearchQuery, setActivityPlanSearchQuery] = useState("");
  const debouncedActivityPlanSearchQuery = useDebouncedValue(activityPlanSearchQuery, 250);
  const [activityPlanCategoryFilter, setActivityPlanCategoryFilter] =
    useState<ActivityCategoryFilter>(null);
  const [activityPlanSort, setActivityPlanSort] = useState<ActivityPlanSort>("newest");
  const [pendingSessionDraftId, setPendingSessionDraftId] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [chartExtraWeeks, setChartExtraWeeks] = useState(0);
  const sheetStack = useBuilderSheetStack<BuilderSheet>();

  const builder = useTrainingPlanCreationService({
    mode,
    planId,
    activityPlanPicker: {
      enabled: selectedSessionId !== null,
      searchQuery: debouncedActivityPlanSearchQuery,
      activityCategoryFilter: activityPlanCategoryFilter,
      sort: activityPlanSort,
      selectedSessionId,
    },
    onCreated: (createdPlan) => {
      router.replace({ pathname: "/training-plan-detail", params: { id: createdPlan.id } });
    },
    onCreateError: (error) => {
      Alert.alert("Could not create plan", error.message || "Try again after reviewing the plan.");
    },
    onUpdated: (updatedPlan) => {
      router.replace({ pathname: "/training-plan-detail", params: { id: updatedPlan.id } });
    },
    onUpdateError: (error) => {
      Alert.alert("Could not update plan", error.message || "Try again after reviewing the plan.");
    },
  });

  const selectedSession = selectedSessionId
    ? builder.actions.getSessionById(selectedSessionId)
    : null;
  const isSaving = builder.derived.savePlan.isPending;
  const extendChartEnd = useCallback(
    () => setChartExtraWeeks((count) => Math.min(count + 4, 52)),
    [],
  );
  const extendChartStart = useCallback(() => undefined, []);
  const selectWeekStart = useCallback((weekStart: string) => {
    startTransition(() => {
      setSelectedWeekStart(weekStart);
      setSelectedDate(weekStart);
    });
  }, []);
  const selectDate = useCallback(
    (date: string) => {
      startTransition(() => {
        setSelectedDate(date);
        setSelectedWeekStart((currentWeekStart) => {
          const matchingWeek = builder.derived.projection.chart.weeks.find(
            (week) => date >= week.weekStart && date <= week.weekEnd,
          );
          return matchingWeek?.weekStart ?? currentWeekStart;
        });
      });
    },
    [builder.derived.projection.chart.weeks],
  );
  const chartReview = useMemo(() => {
    const baseChart = builder.derived.projection.chart;
    const weeks = [...baseChart.weeks];
    const lastWeek = weeks.at(-1);
    for (let index = 0; index < chartExtraWeeks && lastWeek; index += 1) {
      const previous = weeks.at(-1) ?? lastWeek;
      const weekStart = addDaysDateOnlyUtc(previous.weekStart, 7);
      weeks.push({
        ...previous,
        weekStart,
        weekEnd: addDaysDateOnlyUtc(weekStart, 6),
        label: `Week ${weeks.length + 1}`,
        completedLoad: null,
        plannedLoad: 0,
        tentativePlannedLoad: null,
        targetLoad: previous.targetLoad,
        fitness: null,
        scheduledFitness: previous.scheduledFitness,
        targetFitness: previous.targetFitness,
        fatigue: previous.fatigue,
        form: previous.form,
        isCurrent: false,
        isSelected: false,
      });
    }
    const selectedStart =
      selectedWeekStart ??
      weeks.find((week) => week.isSelected)?.weekStart ??
      weeks[0]?.weekStart ??
      null;
    const selectedIndex = Math.max(
      0,
      weeks.findIndex((week) => week.weekStart === selectedStart),
    );
    const selectedWeek = selectedIndex >= 0 ? (weeks[selectedIndex] ?? null) : null;
    const resolvedSelectedDate =
      selectedDate &&
      selectedWeek &&
      selectedDate >= selectedWeek.weekStart &&
      selectedDate <= selectedWeek.weekEnd
        ? selectedDate
        : (selectedWeek?.weekStart ?? null);
    const selectedDayOffset = resolvedSelectedDate
      ? Math.max(0, diffDateOnlyDays(builder.state.scheduling.startDate, resolvedSelectedDate))
      : null;

    return {
      chart: {
        ...baseChart,
        weeks: weeks.every((week) => week.isSelected === (week.weekStart === selectedStart))
          ? weeks
          : weeks.map((week) => ({ ...week, isSelected: week.weekStart === selectedStart })),
      },
      selectedWeek,
      selectedWeekIndex: selectedWeek ? selectedIndex : 0,
      selectedDate: resolvedSelectedDate,
      selectedDayOffset,
      selectedWeekStart: selectedWeek?.weekStart ?? null,
      extendEnd: extendChartEnd,
      extendStart: extendChartStart,
      selectDate,
      selectWeekStart,
    };
  }, [
    builder.derived.projection.chart,
    builder.state.scheduling.startDate,
    chartExtraWeeks,
    extendChartEnd,
    extendChartStart,
    selectDate,
    selectWeekStart,
    selectedDate,
    selectedWeekStart,
  ]);

  useEffect(() => {
    if (!selectedWeekStart) return;
    if (chartReview.chart.weeks.some((week) => week.weekStart === selectedWeekStart)) return;
    setSelectedWeekStart(chartReview.chart.weeks[0]?.weekStart ?? null);
  }, [chartReview.chart.weeks, selectedWeekStart]);
  useEffect(() => {
    if (!selectedDate) return;
    if (chartReview.chart.dailyPoints.some((point) => point.date === selectedDate)) return;
    setSelectedDate(chartReview.selectedDate);
  }, [chartReview.chart.dailyPoints, chartReview.selectedDate, selectedDate]);
  const activityPlansById = useMemo(
    () =>
      Object.fromEntries(
        builder.activityPlanItems.map((activityPlan) => [activityPlan.id, activityPlan] as const),
      ),
    [builder.activityPlanItems],
  );

  const addSession = useCallback(() => {
    const nextOffsetDays =
      builder.derived.summary.sessionCount === 0 ? 0 : builder.derived.summary.durationDays;
    const session = builder.actions.addSession(nextOffsetDays);
    setSelectedSessionId(session.localId);
    setPendingSessionDraftId(session.localId);
    sheetStack.openSheet("activityAssignment");
  }, [
    builder.actions,
    builder.derived.summary.durationDays,
    builder.derived.summary.sessionCount,
    sheetStack.openSheet,
  ]);

  const addSessionAtOffset = useCallback(
    (offsetDays: number) => {
      const session = builder.actions.addSession(Math.max(0, offsetDays));
      setSelectedSessionId(session.localId);
      setPendingSessionDraftId(session.localId);
      sheetStack.openSheet("activityAssignment");
    },
    [builder.actions, sheetStack.openSheet],
  );

  const applyStructureProposal = useCallback(() => {
    builder.actions.addProposedStructure();
  }, [builder.actions]);

  const handleSave = useCallback(async () => {
    if (!builder.derived.saveReadiness.canSave) {
      Alert.alert(
        "Plan needs attention",
        builder.derived.saveReadiness.blockers.map((blocker) => blocker.message).join("\n"),
      );
      return;
    }

    await builder.derived.savePlan.execute();
  }, [
    builder.derived.savePlan,
    builder.derived.saveReadiness.blockers,
    builder.derived.saveReadiness.canSave,
  ]);

  const selectActivityPlan = useCallback(
    (activityPlan: ActivityPlanListItem) => {
      if (!selectedSessionId) return;
      builder.actions.assignActivityPlan(
        selectedSessionId,
        toEstimatedActivityPlanFacts(
          activityPlan,
          builder.activityPlanEstimateById.get(activityPlan.id),
        ),
      );
      if (pendingSessionDraftId === selectedSessionId) {
        setPendingSessionDraftId(null);
      }
      sheetStack.openSheet("session");
    },
    [
      builder.activityPlanEstimateById,
      builder.actions,
      pendingSessionDraftId,
      selectedSessionId,
      sheetStack.openSheet,
    ],
  );

  const cancelPendingSessionDraft = useCallback(() => {
    if (!pendingSessionDraftId) return;
    const pendingSession = builder.actions.getSessionById(pendingSessionDraftId);
    if (pendingSession && !pendingSession.activityPlan) {
      builder.actions.removeSession(pendingSessionDraftId);
      if (selectedSessionId === pendingSessionDraftId) {
        setSelectedSessionId(null);
      }
    }
    setPendingSessionDraftId(null);
  }, [builder.actions, pendingSessionDraftId, selectedSessionId]);

  const removeSelectedSession = useCallback(() => {
    if (!selectedSession) return;
    builder.actions.removeSession(selectedSession.localId);
    setSelectedSessionId(null);
    sheetStack.closeSheet();
  }, [builder.actions, selectedSession, sheetStack.closeSheet]);

  const applyActivityFiltersDraft = useCallback(
    ({
      categoryFilter,
      sort,
    }: {
      categoryFilter: ActivityCategoryFilter;
      sort: ActivityPlanSort;
    }) => {
      setActivityPlanCategoryFilter(categoryFilter);
      setActivityPlanSort(sort);
    },
    [],
  );

  const header = useMemo(
    () => ({
      title: mode === "edit" ? "Edit training plan" : "Create training plan",
      primaryLabel: builder.derived.savePlan.label,
      primaryDisabled: !builder.derived.savePlan.canSave || isSaving,
      isSaving,
      showDoneAction: false,
      done: () => undefined,
      save: handleSave,
    }),
    [builder.derived.savePlan.canSave, builder.derived.savePlan.label, handleSave, isSaving, mode],
  );
  const selection = useMemo(
    () => ({
      session: selectedSession,
      sessionId: selectedSessionId,
      removeSession: removeSelectedSession,
      setSessionId: setSelectedSessionId,
    }),
    [removeSelectedSession, selectedSession, selectedSessionId],
  );
  const activityPicker = useMemo(
    () => ({
      categoryFilter: activityPlanCategoryFilter,
      estimateById: builder.activityPlanEstimateById,
      searchQuery: activityPlanSearchQuery,
      sort: activityPlanSort,
      plansById: activityPlansById,
      applyFiltersDraft: applyActivityFiltersDraft,
      selectPlan: selectActivityPlan,
      setSearchQuery: setActivityPlanSearchQuery,
    }),
    [
      activityPlanCategoryFilter,
      activityPlanSearchQuery,
      activityPlanSort,
      activityPlansById,
      applyActivityFiltersDraft,
      builder.activityPlanEstimateById,
      selectActivityPlan,
    ],
  );
  const actions = useMemo(
    () => ({
      addSession,
      addSessionAtOffset,
      applyStructureProposal,
      cancelPendingSessionDraft,
      handleSave,
    }),
    [addSession, addSessionAtOffset, applyStructureProposal, cancelPendingSessionDraft, handleSave],
  );

  return {
    actions,
    activityPicker,
    builder,
    chartReview,
    header,
    isSaving,
    selection,
    sheetStack,
  };
}

export type TrainingPlanBuilderController = ReturnType<typeof useTrainingPlanBuilderController>;
