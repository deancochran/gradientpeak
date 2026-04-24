import { useEffect } from "react";

export function useAutoPaginateInfiniteQuery(input: {
  enabled: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown> | unknown;
}) {
  const { enabled, hasNextPage, isFetchingNextPage, fetchNextPage } = input;

  useEffect(() => {
    if (!enabled || !hasNextPage || isFetchingNextPage) {
      return;
    }

    void fetchNextPage();
  }, [enabled, fetchNextPage, hasNextPage, isFetchingNextPage]);
}
