import type { ProfileGoal } from "@repo/core";
import {
  buildRecordedHistoryVisuals,
  normalizeRecordedGoalActivities,
  RECORDED_HISTORY_MAX_PAGES,
  RECORDED_HISTORY_PAGE_SIZE,
  recordedHistoryPageState,
  recordedHistoryWindow,
} from "@repo/core/goals/recorded-history-visuals";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

export function useRecordedGoalHistory(goal: ProfileGoal, timezone: string | null | undefined) {
  const [asOf] = useState(() => new Date().toISOString());
  const window = useMemo(() => recordedHistoryWindow(asOf, timezone), [asOf, timezone]);
  const query = api.activities.listPaginated.useInfiniteQuery(
    {
      limit: RECORDED_HISTORY_PAGE_SIZE,
      activity_category: goal.activity_category,
      composition_mode: "single_only",
      date_from: window?.startsAt,
      date_to: window?.endsAt,
      sort_by: "date",
      sort_order: "asc",
    },
    {
      enabled: window !== null,
      retry: false,
      getNextPageParam: (last, pages) =>
        last.hasMore && pages.length < RECORDED_HISTORY_MAX_PAGES ? last.nextCursor : undefined,
    },
  );
  const pages = query.data?.pages;
  const last = pages?.at(-1);
  const pageState = recordedHistoryPageState({
    pageCount: pages?.length ?? 0,
    hasMore: last?.hasMore ?? true,
    hasCursor: Boolean(last?.nextCursor),
    fetching: query.isFetching,
    failed: query.isError,
  });
  useEffect(() => {
    if (
      window &&
      (pages?.length ?? 0) < RECORDED_HISTORY_MAX_PAGES &&
      pageState.canContinue &&
      !query.isFetching
    )
      void query.fetchNextPage();
  }, [window, pageState.canContinue, query.isFetching, query.fetchNextPage, pages?.length]);
  const visuals = useMemo(
    () =>
      window
        ? buildRecordedHistoryVisuals({
            category: goal.activity_category,
            objective: goal.objective,
            window,
            complete: pageState.complete,
            activities: normalizeRecordedGoalActivities(
              (pages ?? []).slice(0, RECORDED_HISTORY_MAX_PAGES).flatMap((page) => page.items),
            ),
          })
        : null,
    [window, goal.activity_category, goal.objective, pages, pageState.complete],
  );
  return {
    window,
    visuals,
    state: window ? pageState.state : "timezone",
    hasPages: Boolean(pages?.length),
    retry: () => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()),
  };
}
