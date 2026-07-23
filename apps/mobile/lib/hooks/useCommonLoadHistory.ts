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
  const query = api.activities.commonLoadHistory.useQuery();
  const refetch = useCallback(() => query.refetch(), [query.refetch]);

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

  if (query.data?.status === "available") {
    return {
      status: "available" as const,
      currentPlanningDate: nextDateKey(query.data.identity.endDate),
      planningTimezone: query.data.identity.planningTimezone,
      data: query.data,
      error: query.error ?? null,
      isLoading: false,
      refetch,
    };
  }

  if (query.data?.status === "unavailable") {
    return {
      status: "unavailable" as const,
      reason: query.data.reason,
      currentPlanningDate: null,
      planningTimezone: null,
      data: query.data,
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
