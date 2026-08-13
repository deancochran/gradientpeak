import type {
  CommonLoadResult,
  ProjectionChartPayload,
  ReadinessForecastTimeline,
} from "@repo/core";
import { trainingPlanSchema } from "@repo/core/schemas";
import { skipToken } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { useProfileGoals } from "./useProfileGoals";
import { useProfileSettings } from "./useProfileSettings";

interface UseTrainingPlanSnapshotOptions {
  curveWindow?: "overview" | "tab";
  includeInsightTimeline?: boolean;
  includeStatus?: boolean;
  includeWeeklySummaries?: boolean;
  insightWindow?: { start_date: string; end_date: string };
  planId?: string;
  timezone?: string;
}

type PlanDashboardProjectionData = {
  projection_dashboard:
    | (ProjectionChartPayload & {
        goal_forecasts: Array<{
          profile_goal_id: string;
          readiness_target: number;
          readiness_score: number | null;
          feasibility_band?: string | null;
        }>;
      })
    | null;
  readiness_forecast: ReadinessForecastTimeline | null;
  timeline: Array<{
    date: string;
    completed_load: number;
    scheduled_load: number;
    recommended_load: number;
    adherence_score?: number | null;
    boundary_state?: "below" | "within" | "above";
    boundary_reasons?: string[];
  }>;
  load_guidance?: unknown;
  projection?: { diagnostics?: { estimation?: { failed_plan_count?: number } } };
  load_comparison?: {
    weeks?: Array<{
      week_start: string;
      week_end?: string | null;
      actual_load?: number | null;
      scheduled_load?: number | null;
      recommended_load?: number | null;
    }>;
  };
  upcoming_impact?: Array<{
    activity_plan_id: string;
    title: string;
    scheduled_at: string;
    activity_category: string;
    common_load: CommonLoadResult | null;
    confidence?: string;
    explanation?: string;
  }>;
  schedule_recommendation?: {
    label: string;
    target_date: string;
    description: string;
  } | null;
  activity_plan_matches?: {
    empty_reason?: string | null;
    target_date: string;
    target_load_delta?: number | null;
    matches?: Array<{
      activity_plan_id: string;
      name: string;
      activity_category: string;
      common_load: CommonLoadResult;
      estimated_duration_seconds: number | null;
      score: number;
      target_load_delta: number;
      absolute_load_gap: number | null;
      reason_codes?: string[];
    }>;
  } | null;
};

function unavailablePlanDashboardProjection(): PlanDashboardProjectionData | undefined {
  return undefined;
}

type TrainingPlanSnapshotData = {
  id: string;
  name: string;
  description: string | null;
  content_visibility: "private" | "followers" | "public";
  created_at: string | Date;
  structure: unknown;
  structure_hash: string;
};

function isTrainingPlanSnapshotData(value: unknown): value is TrainingPlanSnapshotData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    (typeof row.created_at === "string" || row.created_at instanceof Date) &&
    typeof row.structure_hash === "string" &&
    "structure" in row
  );
}

/**
 * One current planning snapshot backed only by published athlete state, canonical
 * Common Load history, and the authoritative plan projection contract.
 */
export function useTrainingPlanSnapshot(options: UseTrainingPlanSnapshotOptions = {}) {
  const profileGoals = useProfileGoals({ loadAllPages: true });
  const profileSettings = useProfileSettings();
  const profileQuery = api.profiles.get.useQuery(undefined, scheduleAwareReadQueryOptions);
  const planQuery = api.trainingPlans.get.useQuery(
    options.planId ? { id: options.planId } : skipToken,
    scheduleAwareReadQueryOptions,
  );
  const plan = isTrainingPlanSnapshotData(planQuery.data)
    ? {
        ...planQuery.data,
        created_at:
          planQuery.data.created_at instanceof Date
            ? planQuery.data.created_at.toISOString()
            : planQuery.data.created_at,
      }
    : undefined;
  const publishedStateQuery = api.athleteIntelligence.getReadModel.useQuery(
    profileQuery.data?.id
      ? {
          profileId: profileQuery.data.id,
          sections: {
            publishedState: true,
            status: true,
            currentBaseline: { includePlanningContext: false },
            loadHistory: true,
          },
        }
      : skipToken,
    {
      enabled: Boolean(profileQuery.data?.id),
      ...scheduleAwareReadQueryOptions,
    },
  );

  const projectionInput = useMemo(() => {
    const parsed = trainingPlanSchema.safeParse(plan?.structure);
    const published = publishedStateQuery.data;
    if (!plan || !parsed.success || !published?.currentBaseline?.currentPlanningDate) {
      return null;
    }
    const { id: _structureId, ...structure } = parsed.data;
    return {
      kind: "create" as const,
      draft: {
        name: plan.name,
        description: plan.description,
        contentVisibility: plan.content_visibility,
        structure,
        previewStartDate: published.currentBaseline.currentPlanningDate,
      },
    };
  }, [plan, publishedStateQuery.data]);

  const projectionQuery = api.trainingPlans.preview.useQuery(projectionInput ?? skipToken, {
    enabled: projectionInput !== null,
    ...scheduleAwareReadQueryOptions,
  });

  const actualCurveData = useMemo(() => {
    const history = publishedStateQuery.data?.loadHistory?.result;
    return history?.status === "available" ? { dataPoints: history.points } : undefined;
  }, [publishedStateQuery.data?.loadHistory]);

  const idealCurveData = useMemo(() => {
    const projection = projectionQuery.data;
    const baseline = publishedStateQuery.data?.currentBaseline?.baseline;
    if (projection?.status !== "available" || !baseline) return undefined;
    const dataPoints = [
      {
        date: baseline.asOf.slice(0, 10),
        longTermLoad: baseline.longTermLoad,
        recentLoad: baseline.recentLoad,
        loadBalance: baseline.loadBalance,
      },
      ...projection.simulation.transitions.map((transition) => ({
        date: transition.state.asOf.slice(0, 10),
        longTermLoad: transition.state.longTermLoad,
        recentLoad: transition.state.recentLoad,
        loadBalance: transition.state.loadBalance,
      })),
    ];
    return {
      dataPoints,
      startCTL: baseline.longTermLoad,
      targetCTL: projection.simulation.projectedState.longTermLoad,
      targetDate: projection.simulation.simulatedAt.slice(0, 10),
    };
  }, [projectionQuery.data, publishedStateQuery.data?.currentBaseline?.baseline]);

  const refetch = useCallback(async () => {
    await Promise.all([planQuery.refetch(), publishedStateQuery.refetch()]);
  }, [planQuery, publishedStateQuery]);

  const refetchAll = useCallback(async () => {
    await Promise.all([
      planQuery.refetch(),
      profileQuery.refetch(),
      publishedStateQuery.refetch(),
      projectionInput ? projectionQuery.refetch() : Promise.resolve(),
    ]);
  }, [planQuery, profileQuery, projectionInput, projectionQuery, publishedStateQuery]);

  const loading = {
    plan: planQuery.isLoading,
    status: publishedStateQuery.isLoading,
    insightTimeline: false,
    actualCurve: publishedStateQuery.isLoading,
    idealCurve: projectionInput !== null && projectionQuery.isLoading,
    weeklySummaries: false,
  };
  const errors = {
    plan: planQuery.isError ? planQuery.error : null,
    status: publishedStateQuery.isError ? publishedStateQuery.error : null,
    insightTimeline: null,
    actualCurve: publishedStateQuery.isError ? publishedStateQuery.error : null,
    idealCurve: projectionQuery.isError ? projectionQuery.error : null,
    weeklySummaries: null,
  };
  const sharedDependencyError = errors.plan ?? errors.status;
  const insightTimeline = unavailablePlanDashboardProjection();

  return {
    plan,
    status: publishedStateQuery.data,
    insightTimeline,
    actualCurveData,
    idealCurveData,
    weeklySummaries: undefined,
    loading,
    errors,
    isLoadingSharedDependencies: loading.plan || loading.status,
    isLoadingAny: loading.plan || loading.status || loading.actualCurve || loading.idealCurve,
    hasSharedDependencyError: Boolean(sharedDependencyError),
    sharedDependencyError,
    hasAnyError: Boolean(errors.plan || errors.status || errors.actualCurve || errors.idealCurve),
    refetch,
    refetchAll,
    refetchers: {
      plan: planQuery.refetch,
      status: publishedStateQuery.refetch,
      insightTimeline: async () => undefined,
      actualCurve: publishedStateQuery.refetch,
      idealCurve: projectionQuery.refetch,
      weeklySummaries: async () => undefined,
    },
    profileGoals: profileGoals.goals,
    profileSettings: profileSettings.settings,
  };
}
