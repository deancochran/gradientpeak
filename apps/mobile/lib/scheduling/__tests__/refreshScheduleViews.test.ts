import { SCHEDULING_REFRESH_CONTRACT } from "@repo/api/client";
import type { Query, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { refreshScheduleViews } from "../refreshScheduleViews";

describe("refreshScheduleViews", () => {
  it("invalidates all schedule-sensitive query families", async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as unknown as QueryClient;

    await refreshScheduleViews(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(
      SCHEDULING_REFRESH_CONTRACT.eventMutation.length,
    );

    const invalidationPredicates = vi
      .mocked(queryClient.invalidateQueries)
      .mock.calls.map(([filters]) => filters?.predicate);

    for (const path of SCHEDULING_REFRESH_CONTRACT.eventMutation) {
      const query = { queryKey: [path] } as unknown as Query;
      expect(invalidationPredicates.some((predicate) => predicate?.(query))).toBe(true);
    }
  });
});
