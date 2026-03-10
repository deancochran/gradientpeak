import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc";
import { profileGoalSchema, type ProfileGoal } from "@repo/core";
import { useCallback, useMemo } from "react";

const GOALS_PAGE_SIZE = 100;

export function useProfileGoals() {
  const profileId = useAuthStore((state) => state.profile?.id ?? null);

  const query = trpc.goals.list.useQuery(
    {
      profile_id: profileId ?? "",
      limit: GOALS_PAGE_SIZE,
      offset: 0,
    },
    {
      enabled: !!profileId,
    },
  );

  const goals = useMemo<ProfileGoal[]>(() => {
    if (!Array.isArray(query.data)) {
      return [];
    }

    return query.data.flatMap((goal) => {
      const parsed = profileGoalSchema.safeParse(goal);
      return parsed.success ? [parsed.data] : [];
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
