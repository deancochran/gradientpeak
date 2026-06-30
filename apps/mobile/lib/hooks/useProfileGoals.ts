import { type ProfileGoal, parseProfileGoalRecord } from "@repo/core";
import { useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useAutoPaginateInfiniteQuery } from "./useAutoPaginateInfiniteQuery";

const GOALS_PAGE_SIZE = 25;

interface UseProfileGoalsOptions {
  enabled?: boolean;
  loadAllPages?: boolean;
  search?: string;
  activityCategory?: "run" | "bike" | "swim" | "other";
  sortBy?: "created_at" | "target_date" | "priority";
  sortOrder?: "asc" | "desc";
}

export function useProfileGoals(options: UseProfileGoalsOptions = {}) {
  const profileId = useAuthStore((state) => state.profile?.id ?? null);
  const isEnabled = options.enabled ?? true;

  const query = api.goals.list.useInfiniteQuery(
    {
      profile_id: profileId ?? "",
      search: options.search || undefined,
      activity_category: options.activityCategory,
      sort_by: options.sortBy ?? "created_at",
      sort_order: options.sortOrder ?? "desc",
      limit: GOALS_PAGE_SIZE,
    },
    {
      enabled: isEnabled && !!profileId,
      getNextPageParam: (lastPage: { nextCursor?: string | null }) => lastPage.nextCursor,
      ...scheduleAwareReadQueryOptions,
    },
  );

  useAutoPaginateInfiniteQuery({
    enabled: isEnabled && !!profileId && options.loadAllPages === true,
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
    if (!isEnabled || !profileId) {
      return;
    }

    await query.refetch();
  }, [isEnabled, profileId, query.refetch]);

  return {
    profileId,
    hasProfileId: isEnabled && !!profileId,
    goals,
    goalsCount: query.data?.pages[0]?.total ?? goals.length,
    isLoading: isEnabled && !!profileId && query.isLoading,
    isFetching: isEnabled && !!profileId && query.isFetching,
    isError: isEnabled && !!profileId && query.isError,
    error: isEnabled && profileId ? query.error : null,
    dataUpdatedAt: query.dataUpdatedAt,
    refetch,
  };
}
