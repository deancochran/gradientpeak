import { trpc } from "@/lib/trpc";
import { useCallback, useMemo } from "react";

interface DateRangeInput {
  start_date: string;
  end_date: string;
}

interface UseTrainingPlanSnapshotOptions {
  planId?: string;
  includeWeeklySummaries?: boolean;
  weeklySummariesWeeksBack?: number;
  insightWindow?: DateRangeInput;
  timezone?: string;
  curveWindow?: "tab" | "overview";
}

const toDateKey = (value: Date) => value.toISOString().split("T")[0]!;

export function useTrainingPlanSnapshot(
  options: UseTrainingPlanSnapshotOptions = {},
) {
  const {
    planId,
    includeWeeklySummaries = true,
    weeklySummariesWeeksBack = 4,
    insightWindow,
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    curveWindow = "tab",
  } = options;

  const today = useMemo(() => new Date(), []);

  const defaultInsightWindow = useMemo(() => {
    const endDate = new Date(today);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 29);

    return {
      start_date: toDateKey(startDate),
      end_date: toDateKey(endDate),
    };
  }, [today]);

  const {
    data: plan,
    isLoading: isLoadingPlan,
    isError: isPlanError,
    error: planError,
    refetch: refetchPlan,
  } = trpc.trainingPlans.get.useQuery(planId ? { id: planId } : undefined);

  const {
    data: status,
    isLoading: isLoadingStatus,
    isError: isStatusError,
    error: statusError,
    refetch: refetchStatus,
  } = trpc.trainingPlans.getCurrentStatus.useQuery(undefined, {
    enabled: !!plan,
  });

  const actualCurveRange = useMemo(() => {
    if (curveWindow === "overview") {
      const ninetyDaysAgo = new Date(today);
      ninetyDaysAgo.setDate(today.getDate() - 90);

      if (!plan) {
        return {
          start_date: toDateKey(ninetyDaysAgo),
          end_date: toDateKey(today),
        };
      }

      const planStartDate = new Date(plan.created_at);
      return {
        start_date: toDateKey(
          planStartDate < ninetyDaysAgo ? planStartDate : ninetyDaysAgo,
        ),
        end_date: toDateKey(today),
      };
    }

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 30);

    return {
      start_date: toDateKey(startDate),
      end_date: toDateKey(today),
    };
  }, [curveWindow, plan, today]);

  const idealCurveRange = useMemo(() => {
    if (curveWindow === "overview") {
      const fallbackEndDate = new Date(today);
      fallbackEndDate.setDate(today.getDate() + 90);

      const structure = plan?.structure as
        | { periodization_template?: { target_date?: string } }
        | undefined;

      return {
        start_date: actualCurveRange.start_date,
        end_date: toDateKey(
          structure?.periodization_template?.target_date
            ? new Date(structure.periodization_template.target_date)
            : fallbackEndDate,
        ),
      };
    }

    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 14);

    return {
      start_date: actualCurveRange.start_date,
      end_date: toDateKey(endDate),
    };
  }, [actualCurveRange.start_date, curveWindow, plan?.structure, today]);

  const timelineWindow = insightWindow ?? defaultInsightWindow;

  const {
    data: insightTimeline,
    isLoading: isLoadingInsightTimeline,
    isError: isInsightTimelineError,
    error: insightTimelineError,
    refetch: refetchInsightTimeline,
  } = trpc.trainingPlans.getInsightTimeline.useQuery(
    {
      training_plan_id: plan?.id || "",
      start_date: timelineWindow.start_date,
      end_date: timelineWindow.end_date,
      timezone,
    },
    {
      enabled: !!plan?.id,
    },
  );

  const {
    data: actualCurveData,
    isLoading: isLoadingActualCurve,
    isError: isActualCurveError,
    error: actualCurveError,
    refetch: refetchActualCurve,
  } = trpc.trainingPlans.getActualCurve.useQuery(actualCurveRange, {
    enabled: !!plan,
  });

  const {
    data: idealCurveData,
    isLoading: isLoadingIdealCurve,
    isError: isIdealCurveError,
    error: idealCurveError,
    refetch: refetchIdealCurve,
  } = trpc.trainingPlans.getIdealCurve.useQuery(
    {
      id: plan?.id || "",
      ...idealCurveRange,
    },
    {
      enabled: !!plan?.id,
    },
  );

  const {
    data: weeklySummaries,
    isLoading: isLoadingWeeklySummaries,
    isError: isWeeklySummariesError,
    error: weeklySummariesError,
    refetch: refetchWeeklySummaries,
  } = trpc.trainingPlans.getWeeklySummary.useQuery(
    {
      training_plan_id: plan?.id || "",
      weeks_back: weeklySummariesWeeksBack,
    },
    {
      enabled: includeWeeklySummaries && !!plan?.id,
    },
  );

  const refetch = useCallback(async () => {
    await Promise.all([refetchPlan(), refetchStatus()]);
  }, [refetchPlan, refetchStatus]);

  const refetchAll = useCallback(async () => {
    const insightRefresh = plan?.id
      ? refetchInsightTimeline()
      : Promise.resolve();
    const idealRefresh = plan?.id ? refetchIdealCurve() : Promise.resolve();
    const weeklyRefresh =
      includeWeeklySummaries && plan?.id
        ? refetchWeeklySummaries()
        : Promise.resolve();

    await Promise.all([
      refetchPlan(),
      refetchStatus(),
      insightRefresh,
      refetchActualCurve(),
      idealRefresh,
      weeklyRefresh,
    ]);
  }, [
    includeWeeklySummaries,
    plan?.id,
    refetchActualCurve,
    refetchIdealCurve,
    refetchInsightTimeline,
    refetchPlan,
    refetchStatus,
    refetchWeeklySummaries,
  ]);

  const loading = {
    plan: isLoadingPlan,
    status: isLoadingStatus,
    insightTimeline: isLoadingInsightTimeline,
    actualCurve: isLoadingActualCurve,
    idealCurve: isLoadingIdealCurve,
    weeklySummaries: isLoadingWeeklySummaries,
  };

  const errors = {
    plan: isPlanError ? planError : null,
    status: isStatusError ? statusError : null,
    insightTimeline: isInsightTimelineError ? insightTimelineError : null,
    actualCurve: isActualCurveError ? actualCurveError : null,
    idealCurve: isIdealCurveError ? idealCurveError : null,
    weeklySummaries: isWeeklySummariesError ? weeklySummariesError : null,
  };

  const sharedDependencyError = errors.plan ?? errors.status;

  return {
    plan,
    status,
    insightTimeline,
    actualCurveData,
    idealCurveData,
    weeklySummaries,
    loading,
    errors,
    isLoadingSharedDependencies: loading.plan || loading.status,
    isLoadingAny:
      loading.plan ||
      loading.status ||
      loading.insightTimeline ||
      loading.actualCurve ||
      loading.idealCurve ||
      loading.weeklySummaries,
    hasSharedDependencyError: !!sharedDependencyError,
    sharedDependencyError,
    hasAnyError: !!(
      errors.plan ||
      errors.status ||
      errors.insightTimeline ||
      errors.actualCurve ||
      errors.idealCurve ||
      errors.weeklySummaries
    ),
    refetch,
    refetchAll,
    refetchers: {
      plan: refetchPlan,
      status: refetchStatus,
      insightTimeline: refetchInsightTimeline,
      actualCurve: refetchActualCurve,
      idealCurve: refetchIdealCurve,
      weeklySummaries: refetchWeeklySummaries,
    },
  };
}
