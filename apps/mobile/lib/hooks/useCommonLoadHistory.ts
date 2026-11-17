import { skipToken } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "@/lib/api";

function nextDateKey(dateKey: string): string | null {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Reads common Load history from the server-owned profile planning-time boundary.
 * The device clock and cached profile are intentionally not inputs to this query.
 */
export function useCommonLoadHistory() {
  const profile = api.profiles.get.useQuery();
  const query = api.athleteIntelligence.getReadModel.useQuery(
    profile.data
      ? {
          profileId: profile.data.id,
          sections: {
            status: true,
            currentBaseline: { includePlanningContext: false },
            loadHistory: true,
          },
        }
      : skipToken,
    { enabled: Boolean(profile.data) },
  );
  const refetch = useCallback(() => query.refetch(), [query.refetch]);
  const history = query.data?.loadHistory?.result;

  if (query.isLoading) {
    return {
      status: "loading" as const,
      currentPlanningDate: null,
      planningTimezone: null,
      data: null,
      error: null,
      isLoading: true,
      refetch,
    };
  }

  if (history?.status === "available") {
    return {
      status: "available" as const,
      currentPlanningDate:
        query.data?.currentBaseline?.currentPlanningDate ?? nextDateKey(history.identity.endDate),
      planningTimezone:
        query.data?.currentBaseline?.planningTimezone ?? history.identity.planningTimezone,
      data: history,
      error: query.error ?? null,
      isLoading: false,
      refetch,
    };
  }

  if (history?.status === "unavailable") {
    return {
      status: "unavailable" as const,
      reason: history.reason,
      currentPlanningDate: null,
      planningTimezone: null,
      data: history,
      error: query.error ?? null,
      isLoading: false,
      refetch,
    };
  }

  if (query.data && history === undefined) {
    return {
      status: "unavailable" as const,
      reason: "published_state_not_current" as const,
      currentPlanningDate: query.data.currentBaseline?.currentPlanningDate ?? null,
      planningTimezone: query.data.currentBaseline?.planningTimezone ?? null,
      data: null,
      error: query.error ?? null,
      isLoading: false,
      refetch,
    };
  }

  if (query.error) {
    return {
      status: "error" as const,
      currentPlanningDate: null,
      planningTimezone: null,
      data: null,
      error: query.error,
      isLoading: false,
      refetch,
    };
  }

  return {
    status: "loading" as const,
    currentPlanningDate: null,
    planningTimezone: null,
    data: null,
    error: null,
    isLoading: true,
    refetch,
  };
}
