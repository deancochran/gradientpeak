import { useMemo } from "react";
import { api } from "@/lib/api";

export function useGroupEventDetailViewModel(groupEventId: string | null | undefined) {
  const startsAfter = useMemo(() => new Date().toISOString(), []);
  const detailQuery = api.groups.events.detail.useQuery(
    { groupEventId: groupEventId ?? "" },
    { enabled: Boolean(groupEventId) },
  );
  const event = detailQuery.data?.event ?? null;
  const isRecurring = Boolean(event?.is_recurring_series || event?.is_recurring_occurrence);
  const seriesOccurrencesQuery = api.groups.events.seriesOccurrences.useInfiniteQuery(
    {
      groupEventId: groupEventId ?? "",
      startsAfter,
      limit: 10,
    },
    {
      enabled: Boolean(groupEventId && event && isRecurring),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const seriesOccurrences = useMemo(
    () => seriesOccurrencesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [seriesOccurrencesQuery.data],
  );

  return {
    detailQuery,
    event,
    error: detailQuery.error,
    isError: detailQuery.isError,
    isLoading: detailQuery.isLoading,
    refetch: detailQuery.refetch,
    seriesOccurrences,
    seriesOccurrencesQuery,
  };
}
