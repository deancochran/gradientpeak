import { useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { useProfileGoals } from "./useProfileGoals";
import { useProfileSettings } from "./useProfileSettings";

interface DateRangeInput {
  start_date: string;
  end_date: string;
}

interface UseTrainingPlanSnapshotOptions {
  includeStatus?: boolean;
  planId?: string;
  includeWeeklySummaries?: boolean;
  weeklySummariesWeeksBack?: number;
  insightWindow?: DateRangeInput;
  timezone?: string;
  curveWindow?: "tab" | "overview";
}

type TrainingPlanSnapshotData = {
  id: string;
  created_at: string;
  structure?: {
    periodization_template?: {
      target_date?: string;
    };
  };
};

const isTrainingPlanSnapshotData = (value: unknown): value is TrainingPlanSnapshotData => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (
    "id" in value &&
    typeof value.id === "string" &&
    "created_at" in value &&
    typeof value.created_at === "string"
  );
};

const toDateKey = (value: Date) => value.toISOString().split("T")[0]!;

export function useTrainingPlanSnapshot(options: UseTrainingPlanSnapshotOptions = {}) {
  const {
    includeStatus = true,
    planId,
    includeWeeklySummaries = true,
    weeklySummariesWeeksBack = 4,
    insightWindow,
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    curveWindow = "tab",
  } = options;
  const profileGoals = useProfileGoals();
  const profileSettings = useProfileSettings();

  const today = useMemo(() => new Date(), []);

  const defaultInsightWindow = useMemo(() => {
    const latestGoalTargetDate = [...profileGoals.goals]
      .map((goal) => goal.target_date)
      .filter((value): value is string => !!value)
      .sort((a, b) => a.localeCompare(b))
      .at(-1);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 30);

    const fallbackEndDate = new Date(today);
    fallbackEndDate.setDate(today.getDate() + 365);

    let endDate = fallbackEndDate;
    if (latestGoalTargetDate) {
      const goalDate = new Date(`${latestGoalTargetDate}T12:00:00.000Z`);
      if (!Number.isNaN(goalDate.getTime())) {
        endDate = goalDate;
        endDate.setDate(endDate.getDate() + 30);
      }
    }

    const normalizedEndDate =
      Number.isNaN(endDate.getTime()) || endDate < startDate ? fallbackEndDate : endDate;

    const maxEndDate = new Date(startDate);
    maxEndDate.setDate(startDate.getDate() + 364);

    const cappedEndDate = normalizedEndDate > maxEndDate ? maxEndDate : normalizedEndDate;

    return {
      start_date: toDateKey(startDate),
      end_date: toDateKey(cappedEndDate),
    };
  }, [profileGoals.goals, today]);

  const {
    data: plan,
    isLoading: isLoadingPlan,
    isError: isPlanError,
    error: planError,
    refetch: refetchPlan,
  } = api.trainingPlans.get.useQuery(
    planId ? { id: planId } : undefined,
    scheduleAwareReadQueryOptions,
  );

  const planSnapshot = useMemo(() => {
    if (!isTrainingPlanSnapshotData(plan)) {
      return undefined;
    }

    return plan;
  }, [plan]);

  const {
    data: status,
    isLoading: isLoadingStatus,
    isError: isStatusError,
    error: statusError,
    refetch: refetchStatus,
  } = api.trainingPlans.getCurrentStatus.useQuery(undefined, {
    enabled: includeStatus && !!planSnapshot,
    ...scheduleAwareReadQueryOptions,
  });

  const actualCurveRange = useMemo(() => {
    if (curveWindow === "overview") {
      const ninetyDaysAgo = new Date(today);
      ninetyDaysAgo.setDate(today.getDate() - 90);

      if (!planSnapshot) {
        return {
          start_date: toDateKey(ninetyDaysAgo),
          end_date: toDateKey(today),
        };
      }

      const planStartDate = new Date(planSnapshot.created_at);
      return {
        start_date: toDateKey(planStartDate < ninetyDaysAgo ? planStartDate : ninetyDaysAgo),
        end_date: toDateKey(today),
      };
    }

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 30);

    return {
      start_date: toDateKey(startDate),
      end_date: toDateKey(today),
    };
  }, [curveWindow, planSnapshot, today]);

  const idealCurveRange = useMemo(() => {
    const latestGoalTargetDate = [...profileGoals.goals]
      .map((goal) => goal.target_date)
      .filter((value): value is string => !!value)
      .sort((a, b) => a.localeCompare(b))
      .at(-1);

    if (curveWindow === "overview") {
      const fallbackEndDate = new Date(today);
      fallbackEndDate.setDate(today.getDate() + 90);

      const structure = planSnapshot?.structure;

      return {
        start_date: actualCurveRange.start_date,
        end_date: toDateKey(
          latestGoalTargetDate
            ? new Date(`${latestGoalTargetDate}T12:00:00.000Z`)
            : structure?.periodization_template?.target_date
              ? new Date(structure.periodization_template.target_date)
              : fallbackEndDate,
        ),
      };
    }

    const endDate = new Date(today);
    if (latestGoalTargetDate) {
      const goalDate = new Date(`${latestGoalTargetDate}T12:00:00.000Z`);
      if (!Number.isNaN(goalDate.getTime())) {
        endDate.setTime(goalDate.getTime());
        endDate.setDate(endDate.getDate() + 30);
      } else {
        endDate.setDate(today.getDate() + 30);
      }
    } else {
      endDate.setDate(today.getDate() + 30);
    }

    return {
      start_date: actualCurveRange.start_date,
      end_date: toDateKey(endDate),
    };
  }, [
    actualCurveRange.start_date,
    curveWindow,
    planSnapshot?.structure,
    profileGoals.goals,
    today,
  ]);

  const timelineWindow = insightWindow ?? defaultInsightWindow;

  const {
    data: insightTimeline,
    isLoading: isLoadingInsightTimeline,
    isError: isInsightTimelineError,
    error: insightTimelineError,
    refetch: refetchInsightTimeline,
  } = api.trainingPlans.getInsightTimeline.useQuery(
    {
      ...(planSnapshot?.id ? { training_plan_id: planSnapshot.id } : {}),
      start_date: timelineWindow.start_date,
      end_date: timelineWindow.end_date,
      timezone,
    },
    {
      enabled: true,
      ...scheduleAwareReadQueryOptions,
    },
  );

  const {
    data: actualCurveData,
    isLoading: isLoadingActualCurve,
    isError: isActualCurveError,
    error: actualCurveError,
    refetch: refetchActualCurve,
  } = api.trainingPlans.getActualCurve.useQuery(actualCurveRange, {
    enabled: !!planSnapshot,
    ...scheduleAwareReadQueryOptions,
  });

  const {
    data: idealCurveData,
    isLoading: isLoadingIdealCurve,
    isError: isIdealCurveError,
    error: idealCurveError,
    refetch: refetchIdealCurve,
  } = api.trainingPlans.getIdealCurve.useQuery(
    {
      id: planSnapshot?.id || "",
      ...idealCurveRange,
    },
    {
      enabled: !!planSnapshot?.id,
      ...scheduleAwareReadQueryOptions,
    },
  );

  const {
    data: weeklySummaries,
    isLoading: isLoadingWeeklySummaries,
    isError: isWeeklySummariesError,
    error: weeklySummariesError,
    refetch: refetchWeeklySummaries,
  } = api.trainingPlans.getWeeklySummary.useQuery(
    {
      training_plan_id: planSnapshot?.id || "",
      weeks_back: weeklySummariesWeeksBack,
    },
    {
      enabled: includeWeeklySummaries && !!planSnapshot?.id,
      ...scheduleAwareReadQueryOptions,
    },
  );

  const refetch = useCallback(async () => {
    await Promise.all([refetchPlan(), includeStatus ? refetchStatus() : Promise.resolve()]);
  }, [includeStatus, refetchPlan, refetchStatus]);

  const refetchAll = useCallback(async () => {
    const insightRefresh = refetchInsightTimeline();
    const idealRefresh = planSnapshot?.id ? refetchIdealCurve() : Promise.resolve();
    const weeklyRefresh =
      includeWeeklySummaries && planSnapshot?.id ? refetchWeeklySummaries() : Promise.resolve();

    await Promise.all([
      refetchPlan(),
      includeStatus ? refetchStatus() : Promise.resolve(),
      insightRefresh,
      refetchActualCurve(),
      idealRefresh,
      weeklyRefresh,
    ]);
  }, [
    includeStatus,
    includeWeeklySummaries,
    planSnapshot?.id,
    refetchActualCurve,
    refetchIdealCurve,
    refetchInsightTimeline,
    refetchPlan,
    refetchStatus,
    refetchWeeklySummaries,
  ]);

  const loading = {
    plan: isLoadingPlan,
    status: includeStatus ? isLoadingStatus : false,
    insightTimeline: isLoadingInsightTimeline,
    actualCurve: isLoadingActualCurve,
    idealCurve: isLoadingIdealCurve,
    weeklySummaries: isLoadingWeeklySummaries,
  };

  const errors = {
    plan: isPlanError ? planError : null,
    status: includeStatus && isStatusError ? statusError : null,
    insightTimeline: isInsightTimelineError ? insightTimelineError : null,
    actualCurve: isActualCurveError ? actualCurveError : null,
    idealCurve: isIdealCurveError ? idealCurveError : null,
    weeklySummaries: isWeeklySummariesError ? weeklySummariesError : null,
  };

  const sharedDependencyError = errors.plan ?? errors.status;

  return {
    plan: planSnapshot,
    status: includeStatus ? status : undefined,
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
      status: includeStatus ? refetchStatus : async () => undefined,
      insightTimeline: refetchInsightTimeline,
      actualCurve: refetchActualCurve,
      idealCurve: refetchIdealCurve,
      weeklySummaries: refetchWeeklySummaries,
    },
    profileGoals: profileGoals.goals,
    profileSettings: profileSettings.settings,
  };
}
