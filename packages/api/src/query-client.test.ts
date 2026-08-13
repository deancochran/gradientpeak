import type { Query, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  createQueryClient,
  invalidatePostActivityIngestionQueries,
  invalidateSchedulingQueries,
  isSchedulingSensitiveQueryKey,
  SCHEDULING_REFRESH_CONTRACT,
} from "./query-client";

const ledgerKey = [
  ["trainingPlans", "getPlanningLedger"],
  { input: { anchorDate: "2026-08-13", period: "day" }, type: "query" },
] as const;

describe("Plan scheduling cache contract", () => {
  it("includes the planning ledger in every scheduling mutation scope", () => {
    for (const paths of Object.values(SCHEDULING_REFRESH_CONTRACT)) {
      expect(paths).toContainEqual(["trainingPlans", "getPlanningLedger"]);
    }
    expect(isSchedulingSensitiveQueryKey(ledgerKey)).toBe(true);
  });

  it("invalidates matching ledger queries for scheduling and activity ingestion", async () => {
    const predicates: Array<(query: Query) => boolean> = [];
    const queryClient = {
      invalidateQueries: vi.fn(async ({ predicate }) => {
        if (predicate) predicates.push(predicate);
      }),
    } as unknown as QueryClient;

    await invalidateSchedulingQueries(queryClient, "eventMutation");
    await invalidatePostActivityIngestionQueries(queryClient);
    const ledgerQuery = { queryKey: ledgerKey } as unknown as Query;
    expect(predicates.filter((predicate) => predicate(ledgerQuery))).toHaveLength(2);
  });

  it("applies the short stale window and always-on mount/reconnect policy to ledgers", () => {
    const queryClient = createQueryClient();
    const query = queryClient.getQueryCache().build(queryClient, {
      queryKey: ledgerKey,
      queryFn: async () => null,
    });
    const defaults = queryClient.getDefaultOptions().queries;
    const staleTime = defaults?.staleTime;
    const refetchOnMount = defaults?.refetchOnMount;
    const refetchOnReconnect = defaults?.refetchOnReconnect;

    expect(typeof staleTime === "function" ? staleTime(query as unknown as Query) : staleTime).toBe(
      30_000,
    );
    expect(
      typeof refetchOnMount === "function"
        ? refetchOnMount(query as unknown as Query)
        : refetchOnMount,
    ).toBe("always");
    expect(
      typeof refetchOnReconnect === "function"
        ? refetchOnReconnect(query as unknown as Query)
        : refetchOnReconnect,
    ).toBe("always");
  });
});
