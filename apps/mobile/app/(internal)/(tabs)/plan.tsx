import {
  buildGoalCreatePayload,
  buildGoalDraftFromGoal,
  buildGoalUpdatePayload,
  buildMilestoneEventCreateInput,
  buildMilestoneEventUpdatePatch,
  createEmptyGoalDraft,
  formatGoalTypeLabel,
  getGoalObjectiveSummary,
} from "@repo/core";
import { invalidateGoalQueries } from "@repo/api/react";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { Settings } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { type GoalEditorDraft, GoalEditorModal } from "@/components/goals";
import { AppHeader } from "@/components/shared";
import { ROUTES } from "@/lib/constants/routes";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { refreshPlanTabData } from "@/lib/scheduling/refreshScheduleViews";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";

function getDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function formatReadiness(readinessPercent: number | null) {
  if (typeof readinessPercent !== "number" || Number.isNaN(readinessPercent)) {
    return "--";
  }

  const rounded = Math.round(readinessPercent);
  return `${rounded}%`;
}

function formatScore(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }

  return `${Math.round(value)}%`;
}

function formatLoadModeLabel(mode: string | null | undefined) {
  return mode === "goal_driven" ? "Based on your goal" : "Based on recent load";
}

function formatReasonLabel(reason: string) {
  const map: Record<string, string> = {
    boundary_overreach: "Keep workouts steady this week",
    capacity_pressure: "Increase weekly volume slowly",
    timeline_pressure: "Goal date is aggressive",
    low_confidence: "Need more training data",
  };
  return map[reason] ?? reason.replace(/_/g, " ");
}

function formatFallbackMode(mode: string | null | undefined) {
  if (!mode) {
    return null;
  }

  return mode.replace(/_/g, " ");
}

function formatPriorityLabel(priority: number | undefined | null) {
  if (typeof priority !== "number") return "Medium";
  if (priority >= 8) return "High";
  if (priority >= 5) return "Medium";
  return "Low";
}

function formatEffectiveTargetCopy(goalAssessment: any) {
  const firstTarget = Array.isArray(goalAssessment?.target_scores)
    ? goalAssessment.target_scores[0]
    : null;
  const effectiveTarget = firstTarget?.effective_target;

  if (!effectiveTarget) {
    return null;
  }

  if (effectiveTarget.surplus_applied) {
    return "Planning slightly above your target to build a buffer.";
  }

  if (effectiveTarget.rationale_code === "effective_target_surplus_suppressed_low_support") {
    return "Keeping target steady until readiness improves.";
  }

  return "On track for your target.";
}

function getWeekStart(value: Date) {
  const date = new Date(value);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diff);
  return date;
}

function getWeekEnd(weekStart: Date) {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
}

function PlanDashboardScreen() {
  const router = useRouter();
  const utils = api.useUtils();
  const [refreshing, setRefreshing] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [showGoalModal, setShowGoalModal] = useState(false);

  const { data: activePlan, refetch: refetchActivePlan } =
    api.trainingPlans.getActivePlan.useQuery(undefined, scheduleAwareReadQueryOptions);
  const { data: ownPlans } = api.trainingPlans.list.useQuery(
    {
      includeOwnOnly: true,
      includeSystemTemplates: false,
    },
    scheduleAwareReadQueryOptions,
  );

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getDateKey(today), [today]);

  const recentWindowStart = useMemo(() => {
    const start = new Date(today);
    start.setDate(start.getDate() - 45);
    return getDateKey(start);
  }, [today]);

  const upcomingWindowEnd = useMemo(() => {
    const end = new Date(today);
    end.setDate(end.getDate() + 365);
    return getDateKey(end);
  }, [today]);

  const upcomingPlannedEventsQuery = api.events.list.useQuery(
    {
      include_adhoc: false,
      date_from: todayKey,
      date_to: upcomingWindowEnd,
      limit: 500,
    },
    scheduleAwareReadQueryOptions,
  );

  const recentPlannedEventsQuery = api.events.list.useQuery(
    {
      include_adhoc: false,
      date_from: recentWindowStart,
      date_to: todayKey,
      limit: 500,
    },
    scheduleAwareReadQueryOptions,
  );

  const snapshot = useTrainingPlanSnapshot({ planId: activePlan?.id });
  const goals = useProfileGoals();
  const lastProjectionRefreshKeyRef = useRef<string | null>(null);

  const createGoalMutation = api.goals.create.useMutation({
    onSuccess: async () => {
      await Promise.all([invalidateGoalQueries(utils), goals.refetch()]);
      setShowGoalModal(false);
      setEditingGoalId(null);
    },
  });

  const updateGoalMutation = api.goals.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        invalidateGoalQueries(utils, { includeEventDetail: true }),
        goals.refetch(),
      ]);
      setShowGoalModal(false);
      setEditingGoalId(null);
    },
  });
  const createMilestoneEventMutation = api.events.create.useMutation();
  const updateMilestoneEventMutation = api.events.update.useMutation();

  const draftGoal = useMemo(() => {
    if (!editingGoalId) {
      return createEmptyGoalDraft() satisfies GoalEditorDraft;
    }

    const goal = goals.goals.find((item) => item.id === editingGoalId);
    if (!goal) {
      return createEmptyGoalDraft() satisfies GoalEditorDraft;
    }

    return buildGoalDraftFromGoal({
      goal,
      targetDate: goal.target_date,
    });
  }, [editingGoalId, goals.goals]);

  const isGoalSaving =
    createGoalMutation.isPending ||
    updateGoalMutation.isPending ||
    createMilestoneEventMutation.isPending ||
    updateMilestoneEventMutation.isPending;

  const fitnessHistory = useMemo(
    () => snapshot.actualCurveData?.dataPoints ?? [],
    [snapshot.actualCurveData?.dataPoints],
  );

  const idealFitnessCurve = useMemo(
    () => snapshot.idealCurveData?.dataPoints ?? [],
    [snapshot.idealCurveData?.dataPoints],
  );

  const projectedFitness = useMemo(() => {
    if (!snapshot.idealCurveData?.dataPoints) return [];
    const today = new Date().toISOString().split("T")[0];
    return snapshot.idealCurveData.dataPoints.filter((point) =>
      typeof point.date === "string" ? point.date > today : false,
    );
  }, [snapshot.idealCurveData?.dataPoints]);

  const goalMetrics = useMemo(() => {
    if (snapshot.idealCurveData?.targetCTL && snapshot.idealCurveData?.targetDate) {
      return {
        targetCTL: snapshot.idealCurveData.targetCTL,
        targetDate: snapshot.idealCurveData.targetDate,
        description: `Target: ${snapshot.idealCurveData.targetCTL} CTL by ${new Date(snapshot.idealCurveData.targetDate).toLocaleDateString()}`,
      };
    }

    const nextGoal = [...goals.goals]
      .filter((g) => g.target_date)
      .sort((a, b) => a.target_date!.localeCompare(b.target_date!))[0];

    if (nextGoal?.target_date) {
      return {
        targetCTL: 0,
        targetDate: nextGoal.target_date,
        description: `Target: ${nextGoal.title} by ${new Date(nextGoal.target_date + "T12:00:00.000Z").toLocaleDateString()}`,
      };
    }

    return null;
  }, [snapshot.idealCurveData, goals.goals]);

  const goalMarkers = useMemo(
    () =>
      goals.goals
        .filter(
          (goal): goal is typeof goal & { target_date: string } =>
            typeof goal.target_date === "string" && goal.target_date.length > 0,
        )
        .sort((left, right) => left.target_date.localeCompare(right.target_date))
        .map((goal) => ({
          id: goal.id,
          targetDate: goal.target_date,
          label: goal.title,
        })),
    [goals.goals],
  );

  const goalReadiness = useMemo(() => {
    const idealCurve = snapshot.idealCurveData;
    const dataPoints = idealCurve?.dataPoints ?? [];
    const startCtl =
      typeof idealCurve?.startCTL === "number" ? idealCurve.startCTL : (dataPoints[0]?.ctl ?? 0);
    const targetCtl = typeof idealCurve?.targetCTL === "number" ? idealCurve.targetCTL : null;
    const lastPoint = dataPoints[dataPoints.length - 1] ?? null;

    return goals.goals.map((goal) => {
      const goalTargetDate = goal.target_date;

      const projectedAtGoal = goalTargetDate
        ? (dataPoints.find(
            (point) => typeof point?.date === "string" && point.date >= goalTargetDate,
          ) ?? lastPoint)
        : lastPoint;

      let readinessPercent: number | null = null;
      if (projectedAtGoal && typeof targetCtl === "number") {
        const numerator = projectedAtGoal.ctl - startCtl;
        const denominator = targetCtl - startCtl;

        readinessPercent =
          denominator === 0
            ? projectedAtGoal.ctl >= targetCtl
              ? 100
              : 0
            : Math.max(0, (numerator / denominator) * 100);
      }

      return {
        goal,
        readinessPercent,
        projectedCtl: projectedAtGoal?.ctl ?? null,
        targetCtl,
      };
    });
  }, [goals.goals, snapshot.idealCurveData]);

  const insightTimelinePoints = useMemo(
    () => snapshot.insightTimeline?.timeline ?? [],
    [snapshot.insightTimeline],
  );

  const loadGuidance = snapshot.insightTimeline?.load_guidance;
  const visibleGoalCount = Math.max(goals.goalsCount, loadGuidance?.goal_count ?? 0);

  const weeklyLoadSummary = useMemo(() => {
    if (insightTimelinePoints.length === 0) {
      return null;
    }

    const now = new Date();
    const currentStart = getWeekStart(now);
    const currentEnd = getWeekEnd(currentStart);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - 7);
    const previousEnd = getWeekEnd(previousStart);

    let currentActual = 0;
    let currentPlanned = 0;
    let currentRecommended = 0;
    let previousActual = 0;

    for (const point of insightTimelinePoints) {
      const pointDate = new Date(`${point.date}T12:00:00.000Z`);
      if (Number.isNaN(pointDate.getTime())) {
        continue;
      }

      if (pointDate >= currentStart && pointDate <= currentEnd) {
        currentActual += point.actual_tss || 0;
        currentPlanned += point.scheduled_tss || 0;
        currentRecommended += point.ideal_tss || 0;
      }

      if (pointDate >= previousStart && pointDate <= previousEnd) {
        previousActual += point.actual_tss || 0;
      }
    }

    const primaryLoad = Math.round(currentActual > 0 ? currentActual : currentPlanned);
    const vsLastWeek = Math.round(primaryLoad - previousActual);

    return {
      primaryLoad,
      vsLastWeek,
      currentPlanned,
      currentRecommended,
    };
  }, [insightTimelinePoints]);

  const projectionInsight = useMemo(() => {
    if (!weeklyLoadSummary) {
      return "Add planned or completed workouts to unlock training load guidance.";
    }

    const { currentPlanned, currentRecommended } = weeklyLoadSummary;
    const isBaselineMode = loadGuidance?.mode !== "goal_driven";
    if (currentRecommended <= 0 && currentPlanned <= 0) {
      return isBaselineMode
        ? "Add planned workouts to shape a baseline recommendation for this week."
        : "Add planned workouts to compare your week against your recommended load.";
    }

    if (currentRecommended <= 0) {
      return "Recommended load is calibrating. Keep logging sessions this week.";
    }

    const delta = currentPlanned - currentRecommended;
    const deltaPercent = Math.round((Math.abs(delta) / currentRecommended) * 100);

    if (Math.abs(delta) <= currentRecommended * 0.1) {
      return "You're on track. Planned workouts align with your recommendation.";
    }

    if (delta > 0) {
      return `Planned load is ${deltaPercent}% above your recommended range this week.`;
    }

    return `Planned load is ${deltaPercent}% below your recommended range this week.`;
  }, [loadGuidance?.mode, weeklyLoadSummary]);

  const fallbackGoalReadinessScore = useMemo(() => {
    if ((loadGuidance?.dated_goal_count ?? 0) <= 0) {
      return null;
    }

    const idealCurve = snapshot.idealCurveData;
    const dataPoints = idealCurve?.dataPoints ?? [];
    if (dataPoints.length === 0) {
      return null;
    }

    const startCtl =
      typeof idealCurve?.startCTL === "number" ? idealCurve.startCTL : (dataPoints[0]?.ctl ?? 0);
    const targetCtl = typeof idealCurve?.targetCTL === "number" ? idealCurve.targetCTL : null;
    const lastCtl = dataPoints[dataPoints.length - 1]?.ctl ?? null;

    if (targetCtl === null || lastCtl === null) {
      return null;
    }

    const denominator = targetCtl - startCtl;
    if (denominator === 0) {
      return lastCtl >= targetCtl ? 100 : 0;
    }

    return Math.max(0, ((lastCtl - startCtl) / denominator) * 100);
  }, [loadGuidance?.dated_goal_count, snapshot.idealCurveData]);

  const physiologicalReadinessSummary = useMemo(() => {
    const scoredGoals = goalReadiness.filter(
      (item): item is typeof item & { readinessPercent: number } =>
        typeof item.readinessPercent === "number" && Number.isFinite(item.readinessPercent),
    );

    if (scoredGoals.length === 0) {
      if (typeof fallbackGoalReadinessScore === "number") {
        return {
          score: fallbackGoalReadinessScore,
          interpretation:
            "Goal-based readiness is available, but the detailed goal list is still syncing on this screen.",
        };
      }

      return {
        score: null,
        interpretation: "Add a dated goal to estimate how ready your body is for the target event.",
      };
    }

    const averageScore =
      scoredGoals.reduce((sum, item) => sum + item.readinessPercent, 0) / scoredGoals.length;

    return {
      score: averageScore,
      interpretation:
        averageScore >= 90
          ? "Your projected fitness is closely matched to your current goal demands."
          : averageScore >= 70
            ? "Your projected fitness is moving in the right direction, with more work still needed."
            : "Your projected fitness is still building toward your goal demands. Low readiness usually means the goal is too soon, or your sustainable weekly training capacity is still below the event demand.",
    };
  }, [fallbackGoalReadinessScore, goalReadiness]);

  const lowReadinessExplainer = useMemo(() => {
    const hasLowReadinessGoal = goalReadiness.some(
      (item) =>
        typeof item.readinessPercent === "number" &&
        Number.isFinite(item.readinessPercent) &&
        item.readinessPercent < 70,
    );

    return hasLowReadinessGoal
      ? "Low readiness usually reflects one of two constraints: the goal date is too soon to build safely, or your current sustainable weekly capacity is still too low even with more runway."
      : null;
  }, [goalReadiness]);

  const planningConfidenceSummary = useMemo(() => {
    const summary = snapshot.insightTimeline?.readiness_summary;

    if (!summary) {
      return {
        score: null,
        interpretation:
          "Keep logging workouts and planned sessions so the model can trust the projection more.",
      };
    }

    return {
      score: summary.score,
      interpretation: summary.interpretation,
    };
  }, [snapshot.insightTimeline?.readiness_summary]);

  const projectionGoalAssessments =
    ((snapshot.idealCurveData as any)?.goal_assessments as any[]) ?? [];

  const projectionExplainability = useMemo(() => {
    const diagnostics = snapshot.insightTimeline?.projection?.diagnostics;
    const fallback = formatFallbackMode(diagnostics?.fallback_mode);
    const confidence = diagnostics?.confidence;
    const confidencePercent =
      typeof confidence?.overall === "number" ? Math.round(confidence.overall * 100) : null;
    const evidenceState = confidence?.evidence_state ?? null;
    const feasibility = snapshot.insightTimeline?.plan_feasibility;
    const feasibilityReason = feasibility?.reasons?.[0]
      ? formatReasonLabel(feasibility.reasons[0])
      : null;
    const firstGoalAssessment = projectionGoalAssessments[0];

    return {
      fallback,
      confidencePercent,
      evidenceState,
      feasibilityState: feasibility?.state ?? null,
      feasibilityReason,
      effectiveTargetCopy: formatEffectiveTargetCopy(firstGoalAssessment),
    };
  }, [projectionGoalAssessments, snapshot.insightTimeline]);

  const goalExplainabilityById = useMemo(() => {
    const goalFeasibilityById = new Map(
      (snapshot.insightTimeline?.goal_feasibility ?? []).map((goalAssessment) => [
        goalAssessment.goal_id,
        goalAssessment,
      ]),
    );
    const goalAssessmentById = new Map(
      projectionGoalAssessments.map((goalAssessment) => [goalAssessment.goal_id, goalAssessment]),
    );

    return new Map(
      goals.goals.map((goal) => {
        const feasibility = goalFeasibilityById.get(goal.id);
        const assessment = goalAssessmentById.get(goal.id);

        return [
          goal.id,
          {
            feasibilityState: feasibility?.state ?? null,
            feasibilityReason: feasibility?.reasons?.[0]
              ? formatReasonLabel(feasibility.reasons[0])
              : null,
            effectiveTargetCopy: formatEffectiveTargetCopy(assessment),
          },
        ];
      }),
    );
  }, [goals.goals, projectionGoalAssessments, snapshot.insightTimeline?.goal_feasibility]);

  const activePlansInProgress = useMemo(() => {
    const upcomingEvents = upcomingPlannedEventsQuery.data?.items ?? [];
    const recentEvents = recentPlannedEventsQuery.data?.items ?? [];

    const startedPlanIds = new Set(
      recentEvents
        .map((event) => event.training_plan_id)
        .filter((value): value is string => typeof value === "string"),
    );

    const ownPlanNameById = new Map(
      (ownPlans ?? []).map((plan) => [plan.id, plan.name ?? "Training Plan"]),
    );

    const plansById = new Map<
      string,
      { id: string; nextEventAt: string; plannedEventCount: number }
    >();

    for (const event of upcomingEvents) {
      if (!event.training_plan_id) {
        continue;
      }

      const existing = plansById.get(event.training_plan_id);
      if (!existing) {
        plansById.set(event.training_plan_id, {
          id: event.training_plan_id,
          nextEventAt: event.starts_at,
          plannedEventCount: 1,
        });
        continue;
      }

      if (event.starts_at < existing.nextEventAt) {
        existing.nextEventAt = event.starts_at;
      }
      existing.plannedEventCount += 1;
    }

    const summaries = [...plansById.values()]
      .map((plan) => ({
        ...plan,
        statusLabel: startedPlanIds.has(plan.id) ? "In progress" : "Scheduled",
        name:
          (activePlan?.id === plan.id ? activePlan.training_plan?.name : undefined) ??
          ownPlanNameById.get(plan.id) ??
          "Training Plan",
      }))
      .sort((a, b) => a.nextEventAt.localeCompare(b.nextEventAt));

    if (summaries.length === 0 && activePlan?.id) {
      return [
        {
          id: activePlan.id,
          name: activePlan.training_plan?.name ?? "Current Plan",
          statusLabel: "In progress",
          nextEventAt: activePlan.next_event_at ?? today.toISOString(),
          plannedEventCount: 0,
        },
      ];
    }

    return summaries;
  }, [
    activePlan?.id,
    activePlan?.next_event_at,
    activePlan?.training_plan?.name,
    ownPlans,
    recentPlannedEventsQuery.data?.items,
    today,
    upcomingPlannedEventsQuery.data?.items,
  ]);

  useEffect(() => {
    const refreshKey = [
      activePlan?.id ?? "",
      String(upcomingPlannedEventsQuery.dataUpdatedAt ?? 0),
      String(recentPlannedEventsQuery.dataUpdatedAt ?? 0),
    ].join(":");

    if (!activePlan?.id) {
      lastProjectionRefreshKeyRef.current = refreshKey;
      return;
    }

    if (!upcomingPlannedEventsQuery.dataUpdatedAt && !recentPlannedEventsQuery.dataUpdatedAt) {
      return;
    }

    if (lastProjectionRefreshKeyRef.current === refreshKey) {
      return;
    }

    lastProjectionRefreshKeyRef.current = refreshKey;
    void Promise.all([refetchActivePlan(), snapshot.refetchAll()]);
  }, [
    activePlan?.id,
    recentPlannedEventsQuery.dataUpdatedAt,
    refetchActivePlan,
    snapshot.refetchAll,
    upcomingPlannedEventsQuery.dataUpdatedAt,
  ]);

  const planSnapshotSummary = useMemo(() => {
    const primaryPlan = activePlansInProgress[0] ?? null;
    return {
      goalCount: visibleGoalCount,
      planLabel: primaryPlan?.statusLabel ?? "No active plan",
      upcomingCount: primaryPlan?.plannedEventCount ?? 0,
    };
  }, [activePlansInProgress, visibleGoalCount]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshPlanTabData({
      refetchActivePlan,
      refetchSnapshot: snapshot.refetchAll,
      refetchGoals: goals.refetch,
      refetchUpcomingEvents: upcomingPlannedEventsQuery.refetch,
      refetchRecentEvents: recentPlannedEventsQuery.refetch,
    });
    setRefreshing(false);
  };

  const handleSubmitGoal = async (draft: GoalEditorDraft) => {
    if (!goals.profileId) {
      return;
    }

    try {
      const existingGoal = editingGoalId
        ? goals.goals.find((goal) => goal.id === editingGoalId)
        : null;

      const milestoneEventId = existingGoal?.milestone_event_id;
      const resolvedMilestoneEventId = milestoneEventId
        ? milestoneEventId
        : (
            await createMilestoneEventMutation.mutateAsync({
              ...buildMilestoneEventCreateInput({
                draft,
                trainingPlanId: activePlan?.id ?? null,
              }),
              lifecycle: { status: "scheduled" },
              read_only: false,
            })
          ).id;

      if (milestoneEventId) {
        await updateMilestoneEventMutation.mutateAsync({
          id: milestoneEventId,
          patch: buildMilestoneEventUpdatePatch({
            draft,
            trainingPlanId: activePlan?.id ?? null,
          }),
        });
      }

      if (editingGoalId) {
        await updateGoalMutation.mutateAsync({
          id: editingGoalId,
          data: buildGoalUpdatePayload({
            draft,
            milestoneEventId: resolvedMilestoneEventId,
          }),
        });
        return;
      }

      await createGoalMutation.mutateAsync(
        buildGoalCreatePayload({
          draft,
          profileId: goals.profileId,
          milestoneEventId: resolvedMilestoneEventId,
        }),
      );
    } catch (error) {
      Alert.alert(
        "Unable to save goal",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  return (
    <View className="flex-1 bg-background" testID="plan-screen">
      <AppHeader title="Plan" />
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View className="px-4 py-4 gap-4">
          <Card testID="plan-projection-card">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Forecasted Projection</CardTitle>
              <TouchableOpacity
                testID="projection-settings-button"
                onPress={() => router.push(ROUTES.PLAN.TRAINING_PREFERENCES as any)}
                className="rounded-full bg-primary/10 p-2"
                activeOpacity={0.8}
              >
                <Icon as={Settings} size={18} className="text-primary" />
              </TouchableOpacity>
            </CardHeader>
            <CardContent className="gap-3">
              {weeklyLoadSummary ? (
                <View className="rounded-md border border-border/60 bg-muted/20 px-3 py-3 gap-1">
                  <View className="flex-row items-end justify-between">
                    <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      This week&apos;s load
                    </Text>
                    <Text
                      className={`text-xs font-medium ${weeklyLoadSummary.vsLastWeek >= 0 ? "text-emerald-600" : "text-muted-foreground"}`}
                    >
                      {weeklyLoadSummary.vsLastWeek >= 0 ? "+" : ""}
                      {weeklyLoadSummary.vsLastWeek} vs last week
                    </Text>
                  </View>
                  <Text className="text-2xl font-semibold text-foreground">
                    {weeklyLoadSummary.primaryLoad} TSS
                  </Text>
                  <Text className="text-sm text-muted-foreground mt-1">
                    Recommended this week: {Math.round(weeklyLoadSummary.currentRecommended)} TSS.{" "}
                    {formatLoadModeLabel(loadGuidance?.mode)}.
                  </Text>
                </View>
              ) : null}

              {(() => {
                const nextGoal = [...goalReadiness]
                  .filter((g) => g.goal.target_date)
                  .sort((a, b) => a.goal.target_date!.localeCompare(b.goal.target_date!))[0];

                if (!nextGoal) return null;

                return (
                  <View className="rounded-md border border-border/60 bg-muted/20 px-3 py-3 gap-1">
                    <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Next Goal
                    </Text>
                    <Text className="text-sm font-semibold text-foreground">
                      {nextGoal.goal.title}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {new Date(nextGoal.goal.target_date + "T12:00:00.000Z").toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        },
                      )}
                    </Text>
                  </View>
                );
              })()}

              <View testID="plan-projection-chart">
                <PlanVsActualChart
                  timeline={insightTimelinePoints}
                  actualData={fitnessHistory}
                  projectedData={projectedFitness}
                  idealData={idealFitnessCurve}
                  goalMarkers={goalMarkers}
                  goalMetrics={goalMetrics}
                  height={360}
                  showLegend
                />
              </View>
            </CardContent>
          </Card>

          <Card testID="plan-goals-card">
            <CardHeader>
              <CardTitle>Goals</CardTitle>
            </CardHeader>
            <CardContent className="gap-3">
              {lowReadinessExplainer ? (
                <Text className="text-xs text-muted-foreground">{lowReadinessExplainer}</Text>
              ) : null}
              {goalReadiness.length === 0 ? (
                <Text className="text-sm text-muted-foreground">
                  {(loadGuidance?.goal_count ?? 0) > 0
                    ? "Goal data is available and the detailed goal list is still syncing on this screen."
                    : "No profile goals yet. Add one to start planning with intent."}
                </Text>
              ) : (
                goalReadiness.map(({ goal, readinessPercent, projectedCtl }) => (
                  <TouchableOpacity
                    key={goal.id}
                    onPress={() => router.push(ROUTES.PLAN.GOAL_DETAIL(goal.id) as any)}
                    className="rounded-md border border-border bg-card px-3 py-3"
                    activeOpacity={0.8}
                    testID={`plan-goal-row-${goal.id}`}
                  >
                    {(() => {
                      const explainability = goalExplainabilityById.get(goal.id);

                      return (
                        <View className="flex-row items-start justify-between gap-3">
                          <View className="flex-1 gap-1">
                            <Text className="text-sm font-semibold text-foreground">
                              {goal.title}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              {formatGoalTypeLabel(goal)} · Priority:{" "}
                              {formatPriorityLabel(goal.priority)}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              {getGoalObjectiveSummary(goal)}
                            </Text>
                            <Text className="text-xs text-muted-foreground">
                              {goal.target_date
                                ? `Target: ${new Date(goal.target_date + "T12:00:00.000Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                                : "No target date set"}
                            </Text>
                          </View>
                          <View className="items-end gap-2">
                            <Text className="text-base font-semibold text-primary">
                              {formatReadiness(readinessPercent)}
                            </Text>
                            <Text className="text-[11px] text-muted-foreground">Readiness</Text>
                            {projectedCtl != null ? (
                              <Text className="text-[11px] text-muted-foreground">
                                CTL {Math.round(projectedCtl)}
                              </Text>
                            ) : null}
                            {projectedCtl == null ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onPress={() => router.push(ROUTES.CALENDAR as any)}
                              >
                                <Text>Log</Text>
                              </Button>
                            ) : null}
                          </View>
                        </View>
                      );
                    })()}
                  </TouchableOpacity>
                ))
              )}
              <Button
                variant="outline"
                onPress={() => {
                  setEditingGoalId(null);
                  setShowGoalModal(true);
                }}
                testID="plan-add-goal-button"
              >
                <Text>Add Goal</Text>
              </Button>
            </CardContent>
          </Card>

          <Card testID="plan-current-plan-card">
            <CardHeader>
              <CardTitle>Current Plan</CardTitle>
            </CardHeader>
            <CardContent className="gap-3">
              {activePlansInProgress.length === 0 ? (
                <Text className="text-sm text-muted-foreground" testID="plan-current-plan-empty">
                  No training plans are currently scheduled or in progress.
                </Text>
              ) : (
                <View
                  className="rounded-md border border-border bg-card px-3 py-3 gap-1"
                  testID="plan-current-plan-summary"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <Text
                      className="text-sm font-semibold text-foreground flex-1"
                      testID="plan-current-plan-name"
                    >
                      {activePlansInProgress[0]?.name}
                    </Text>
                    <Text
                      className="text-xs font-medium text-primary"
                      testID="plan-current-plan-status"
                    >
                      {activePlansInProgress[0]?.statusLabel}
                    </Text>
                  </View>
                  <Text
                    className="text-xs text-muted-foreground"
                    testID="plan-current-plan-next-event"
                  >
                    Next session{" "}
                    {new Date(
                      activePlansInProgress[0]?.nextEventAt ?? today.toISOString(),
                    ).toLocaleDateString()}
                    {(activePlansInProgress[0]?.plannedEventCount ?? 0) > 0
                      ? ` · ${activePlansInProgress[0]?.plannedEventCount} upcoming`
                      : ""}
                  </Text>
                  {activePlansInProgress.length > 1 ? (
                    <Text
                      className="text-xs text-muted-foreground"
                      testID="plan-current-plan-overflow-count"
                    >
                      +{activePlansInProgress.length - 1} more scheduled plans
                    </Text>
                  ) : null}
                </View>
              )}
              <View className="flex-row gap-2">
                <Button
                  className="flex-1"
                  onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.LIST as any)}
                  testID="plan-manage-plans-button"
                >
                  <Text className="text-primary-foreground">Manage Plans</Text>
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onPress={() => router.push(ROUTES.CALENDAR as any)}
                  testID="plan-open-calendar-button"
                >
                  <Text>Open Calendar</Text>
                </Button>
              </View>
            </CardContent>
          </Card>
        </View>
      </ScrollView>

      <GoalEditorModal
        visible={showGoalModal}
        initialValue={draftGoal}
        title={editingGoalId ? "Edit Goal" : "Add Goal"}
        submitLabel={editingGoalId ? "Save Changes" : "Create Goal"}
        isSubmitting={isGoalSaving}
        onClose={() => {
          setShowGoalModal(false);
          setEditingGoalId(null);
        }}
        onSubmit={handleSubmitGoal}
      />
    </View>
  );
}

export default function PlanDashboardWithBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <PlanDashboardScreen />
    </ErrorBoundary>
  );
}
