import { skipToken } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { api } from "@/lib/api";
import { toDateKeyInTimeZone } from "@/lib/calendar/dateMath";
import { useAuth } from "./useAuth";

const MAX_PLANNING_DAY_MS = 48 * 60 * 60 * 1_000;
const PLANNING_BOUNDARY_PROBE_MS = 15 * 60 * 1_000;

export function getCurrentPlanningDate(now: Date, planningTimezone: string): string {
  return toDateKeyInTimeZone(now, planningTimezone);
}

export function millisecondsUntilNextPlanningDay(now: Date, planningTimezone: string): number {
  const currentPlanningDate = getCurrentPlanningDate(now, planningTimezone);
  const nowMs = now.getTime();
  const deadline = nowMs + MAX_PLANNING_DAY_MS;
  let lowerBound = nowMs;
  let upperBound = Math.min(deadline, nowMs + PLANNING_BOUNDARY_PROBE_MS);

  while (
    upperBound < deadline &&
    getCurrentPlanningDate(new Date(upperBound), planningTimezone) === currentPlanningDate
  ) {
    lowerBound = upperBound;
    upperBound = Math.min(deadline, upperBound + PLANNING_BOUNDARY_PROBE_MS);
  }

  if (getCurrentPlanningDate(new Date(upperBound), planningTimezone) === currentPlanningDate) {
    throw new RangeError("Unable to locate the next planning-day boundary");
  }

  let low = lowerBound + 1;
  let high = upperBound;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (getCurrentPlanningDate(new Date(middle), planningTimezone) === currentPlanningDate) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low - nowMs;
}

function safeCurrentPlanningDate(planningTimezone: string | null): string | null {
  if (!planningTimezone) return null;
  try {
    return getCurrentPlanningDate(new Date(), planningTimezone);
  } catch {
    return null;
  }
}

function useCurrentPlanningDate(planningTimezone: string | null): string | null {
  const [planningDateState, setPlanningDateState] = useState(() => ({
    planningTimezone,
    planningDate: safeCurrentPlanningDate(planningTimezone),
  }));
  const stateRef = useRef(planningDateState);
  stateRef.current = planningDateState;

  const currentState =
    planningDateState.planningTimezone === planningTimezone
      ? planningDateState
      : {
          planningTimezone,
          planningDate: safeCurrentPlanningDate(planningTimezone),
        };

  useEffect(() => {
    if (!planningTimezone) {
      const nextState = { planningTimezone, planningDate: null };
      stateRef.current = nextState;
      setPlanningDateState(nextState);
      return;
    }

    const refreshPlanningDate = () => {
      const nextPlanningDate = safeCurrentPlanningDate(planningTimezone);
      const current = stateRef.current;
      if (
        current.planningTimezone !== planningTimezone ||
        current.planningDate !== nextPlanningDate
      ) {
        const nextState = { planningTimezone, planningDate: nextPlanningDate };
        stateRef.current = nextState;
        setPlanningDateState(nextState);
      }
    };

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const scheduleNextPlanningDay = () => {
      if (timeout) clearTimeout(timeout);
      let delay: number;
      try {
        delay = millisecondsUntilNextPlanningDay(new Date(), planningTimezone);
      } catch {
        return;
      }
      timeout = setTimeout(() => {
        refreshPlanningDate();
        scheduleNextPlanningDay();
      }, delay);
    };

    refreshPlanningDate();
    scheduleNextPlanningDay();
    const appStateSubscription = AppState?.addEventListener?.("change", (state) => {
      if (state === "active") {
        refreshPlanningDate();
        scheduleNextPlanningDay();
      }
    });

    return () => {
      if (timeout) clearTimeout(timeout);
      appStateSubscription?.remove();
    };
  }, [planningTimezone]);

  return currentState.planningDate;
}

export function useCommonLoadHistory() {
  const { profile, profileError, profileLoading, refreshProfile } = useAuth();
  const planningTimezone =
    !profileLoading && !profileError && profile?.planning_timezone
      ? profile.planning_timezone
      : null;
  const currentPlanningDate = useCurrentPlanningDate(planningTimezone);
  const input =
    planningTimezone && currentPlanningDate
      ? {
          current_planning_date: currentPlanningDate,
          planning_timezone: planningTimezone,
        }
      : null;
  const query = api.activities.commonLoadHistory.useQuery(input ?? skipToken);
  const refetch = useCallback(
    () => (input ? query.refetch() : refreshProfile()),
    [input, query.refetch, refreshProfile],
  );

  if (profileLoading) {
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

  if (profileError) {
    return {
      status: "error" as const,
      currentPlanningDate: null,
      planningTimezone: null,
      data: null,
      error: profileError,
      isLoading: false,
      refetch,
    };
  }

  if (!planningTimezone || !currentPlanningDate) {
    return {
      status: "unavailable" as const,
      reason: planningTimezone
        ? ("invalid_planning_timezone" as const)
        : ("missing_planning_timezone" as const),
      currentPlanningDate: null,
      planningTimezone: null,
      data: null,
      error: null,
      isLoading: false,
      refetch,
    };
  }

  if (query.isLoading) {
    return {
      status: "loading" as const,
      currentPlanningDate,
      planningTimezone,
      data: null,
      error: null,
      isLoading: true,
      refetch,
    };
  }

  if (query.data?.status === "available") {
    return {
      status: "available" as const,
      currentPlanningDate,
      planningTimezone,
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
      currentPlanningDate,
      planningTimezone,
      data: query.data,
      error: query.error ?? null,
      isLoading: false,
      refetch,
    };
  }

  if (query.error) {
    return {
      status: "error" as const,
      currentPlanningDate,
      planningTimezone,
      data: null,
      error: query.error,
      isLoading: false,
      refetch,
    };
  }

  return {
    status: "loading" as const,
    currentPlanningDate,
    planningTimezone,
    data: null,
    error: null,
    isLoading: true,
    refetch,
  };
}
