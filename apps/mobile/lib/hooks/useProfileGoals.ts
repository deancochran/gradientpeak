import { type ProfileGoal, parseProfileGoalRecord } from "@repo/core";
import { useCallback, useMemo } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc";
import { scheduleAwareReadQueryOptions } from "@/lib/trpc/scheduleQueryOptions";

const GOALS_PAGE_SIZE = 100;

export type MobileProfileGoal = ProfileGoal & {
  target_date: string | null;
};

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

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
      ...scheduleAwareReadQueryOptions,
    },
  );
  const today = useMemo(() => new Date(), []);
  const milestoneWindow = useMemo(() => {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 730);

    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() + 3650);

    return {
      date_from: toDateKey(start),
      date_to: toDateKey(end),
    };
  }, [today]);
  const milestoneEventsQuery = trpc.events.list.useQuery(
    {
      event_types: ["custom", "race_target", "race"],
      include_adhoc: true,
      date_from: milestoneWindow.date_from,
      date_to: milestoneWindow.date_to,
      limit: 500,
    },
    {
      enabled: !!profileId,
      ...scheduleAwareReadQueryOptions,
    },
  );

  const goals = useMemo<MobileProfileGoal[]>(() => {
    if (!Array.isArray(query.data)) {
      return [];
    }

    const eventsById = new Map(
      (milestoneEventsQuery.data?.items ?? []).map((event) => [event.id, event]),
    );

    return query.data.flatMap((goal) => {
      try {
        const parsed = parseProfileGoalRecord(goal);
        const milestoneEvent = eventsById.get(parsed.milestone_event_id);
        return [
          {
            ...parsed,
            target_date: milestoneEvent?.starts_at?.slice(0, 10) ?? null,
          },
        ];
      } catch {
        return [];
      }
    });
  }, [milestoneEventsQuery.data?.items, query.data]);

  const refetch = useCallback(async () => {
    if (!profileId) {
      return;
    }

    await Promise.all([query.refetch(), milestoneEventsQuery.refetch()]);
  }, [milestoneEventsQuery.refetch, profileId, query.refetch]);

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
