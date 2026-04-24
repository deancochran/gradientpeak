import { type ProfileGoal, parseProfileGoalRecord } from "@repo/core";
import { useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useAutoPaginateInfiniteQuery } from "./useAutoPaginateInfiniteQuery";

const GOALS_PAGE_SIZE = 25;

interface UseProfileGoalsOptions {
  loadAllPages?: boolean;
}

export function useProfileGoals(options: UseProfileGoalsOptions = {}) {
  const profileId = useAuthStore((state) => state.profile?.id ?? null);

  const query = api.goals.list.useInfiniteQuery(
    {
      profile_id: profileId ?? "",
      limit: GOALS_PAGE_SIZE,
    },
    {
      enabled: !!profileId,
      getNextPageParam: (lastPage: any) => lastPage.nextCursor,
      ...scheduleAwareReadQueryOptions,
    },
  );

  useAutoPaginateInfiniteQuery({
    enabled: !!profileId && options.loadAllPages === true,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  });

  const goals = useMemo<ProfileGoal[]>(() => {
    const items = query.data?.pages.flatMap((page) => page.items) ?? [];

    if (!Array.isArray(items)) {
      return [];
    }

    return items.flatMap((goal) => {
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
    goalsCount: query.data?.pages[0]?.total ?? goals.length,
    isLoading: !!profileId && query.isLoading,
    isFetching: !!profileId && query.isFetching,
    isError: !!profileId && query.isError,
    error: profileId ? query.error : null,
    refetch,
  };
}
