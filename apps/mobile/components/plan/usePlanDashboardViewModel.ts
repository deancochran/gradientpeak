import { useMemo } from "react";
import { type useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { type useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";

type PlanGoals = Pick<ReturnType<typeof useProfileGoals>, "goals" | "goalsCount">;
type PlanSnapshot = ReturnType<typeof useTrainingPlanSnapshot>;

type ActivePlanInput = {
  id?: string | null;
  next_event_at?: string | null;
  training_plan?: {
    name?: string | null;
  } | null;
} | null;

type OwnPlanInput = {
  id: string;
  name?: string | null;
};

type PlannedEventInput = {
  training_plan_id?: string | null;
  starts_at: string;
};

type UsePlanDashboardViewModelParams = {
  activePlan: ActivePlanInput | undefined;
  ownPlans: OwnPlanInput[] | null | undefined;
  goals: PlanGoals;
  snapshot: PlanSnapshot;
  upcomingPlannedEvents: PlannedEventInput[] | null | undefined;
  recentPlannedEvents: PlannedEventInput[] | null | undefined;
  today: Date;
};

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

export function usePlanDashboardViewModel({
  activePlan,
  ownPlans,
  goals,
  snapshot,
  upcomingPlannedEvents,
  recentPlannedEvents,
  today,
}: UsePlanDashboardViewModelParams) {
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

    const todayKey = new Date().toISOString().split("T")[0];
    return snapshot.idealCurveData.dataPoints.filter((point) =>
      typeof point.date === "string" ? point.date > todayKey : false,
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
      .filter((goal) => goal.target_date)
      .sort((left, right) => left.target_date!.localeCompare(right.target_date!))[0];

    if (nextGoal?.target_date) {
      return {
        targetCTL: 0,
        targetDate: nextGoal.target_date,
        description: `Target: ${nextGoal.title} by ${new Date(`${nextGoal.target_date}T12:00:00.000Z`).toLocaleDateString()}`,
      };
    }

    return null;
  }, [goals.goals, snapshot.idealCurveData]);

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

  const activePlansInProgress = useMemo(() => {
    const startedPlanIds = new Set(
      (recentPlannedEvents ?? [])
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

    for (const event of upcomingPlannedEvents ?? []) {
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
      .sort((left, right) => left.nextEventAt.localeCompare(right.nextEventAt));

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
  }, [activePlan, ownPlans, recentPlannedEvents, today, upcomingPlannedEvents]);

  const nextGoal = useMemo(
    () =>
      [...goalReadiness]
        .filter((item) => item.goal.target_date)
        .sort((left, right) => left.goal.target_date!.localeCompare(right.goal.target_date!))[0] ??
      null,
    [goalReadiness],
  );

  return {
    activePlansInProgress,
    fitnessHistory,
    goalMarkers,
    goalMetrics,
    goalReadiness,
    insightTimelinePoints,
    loadGuidance,
    lowReadinessExplainer,
    nextGoal,
    projectedFitness,
    weeklyLoadSummary,
    idealFitnessCurve,
  };
}
