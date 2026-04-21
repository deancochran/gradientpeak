import { type ProfileGoal, parseProfileGoalRecord } from "@repo/core";
import { useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { useAuthStore } from "@/lib/stores/auth-store";

const GOALS_PAGE_SIZE = 100;

export function useProfileGoals() {
  const profileId = useAuthStore((state) => state.profile?.id ?? null);

  const query = api.goals.list.useQuery(
    {
      profile_id: profileId ?? "",
      limit: GOALS_PAGE_SIZE,
      offset: 0,
    },
    {
      enabled: !!profileId,
      ...scheduleAwareReadQueryOptions,
    },
  );
  const goals = useMemo<ProfileGoal[]>(() => {
    if (!Array.isArray(query.data)) {
      return [];
    }

    return query.data.flatMap((goal) => {
      try {
        return [parseProfileGoalRecord(goal)];
      } catch {
        return [];
      }
    });
  }, [query.data]);

  const refetch = useCallback(async () => {
    if (!profileId) {
      return;
    }

    await query.refetch();
  }, [profileId, query.refetch]);

  return {
    profileId,
    hasProfileId: !!profileId,
    goals,
    goalsCount: goals.length,
    isLoading: !!profileId && query.isLoading,
    isFetching: !!profileId && query.isFetching,
    isError: !!profileId && query.isError,
    error: profileId ? query.error : null,
    refetch,
  };
}
