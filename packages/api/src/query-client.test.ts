import type { Query, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { apiCacheTagSchema } from "./contracts/cache-receipts";
import {
  API_CACHE_TAG_QUERY_KEYS,
  createQueryClient,
  IDEMPOTENT_INGESTION_MUTATION_RETRY_OPTIONS,
  invalidatePostActivityIngestionQueries,
  invalidateReceiptCacheTags,
  invalidateSchedulingQueries,
  isSchedulingSensitiveQueryKey,
  queryKeysForCacheTags,
  SCHEDULING_REFRESH_CONTRACT,
} from "./query-client";
import { appRouter } from "./routers";

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
    for (const procedure of ["getCurrentState", "getLoadRange"]) {
      const query = {
        queryKey: [["athleteIntelligence", procedure]],
      } as unknown as Query;
      expect(predicates.some((predicate) => predicate(query))).toBe(true);
    }
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

describe("Server cache-tag client contract", () => {
  it("maps every server cache tag to its exact tRPC Query key prefix", () => {
    expect(API_CACHE_TAG_QUERY_KEYS).toEqual({
      "activities.getById": [["activities", "getById"]],
      "activities.listPaginated": [["activities", "listPaginated"]],
      "activityFiles.getIngestionStatus": [["activityFiles", "getIngestionStatus"]],
      "activityPlans.getById": [["activityPlans", "getById"]],
      "athleteIntelligence.getCurrentState": [["athleteIntelligence", "getCurrentState"]],
      "athleteIntelligence.getLoadRange": [["athleteIntelligence", "getLoadRange"]],
      "athleteIntelligence.getThresholdEvidence": [["athleteIntelligence", "getThresholdEvidence"]],
      "athleteIntelligence.getTrainingEffects": [["athleteIntelligence", "getTrainingEffects"]],
      "calendar.day": [["calendar", "day"]],
      "calendar.range": [["calendar", "range"]],
      "home.getDashboard": [["home", "getDashboard"]],
      "plannedSessions.range": [["plannedSessions", "range"]],
      "trainingPlans.get": [["trainingPlans", "get"]],
      "trainingPlans.getPlanTabProjection": [["trainingPlans", "getPlanTabProjection"]],
      "trainingPlans.getPlanningLedger": [["trainingPlans", "getPlanningLedger"]],
      "trainingPlans.list": [["trainingPlans", "list"]],
    });
    expect(Object.keys(API_CACHE_TAG_QUERY_KEYS).sort()).toEqual(
      [...apiCacheTagSchema.options].sort(),
    );
    for (const queryKey of Object.values(API_CACHE_TAG_QUERY_KEYS)) {
      const procedureName = queryKey[0].join(".");
      expect(Object.hasOwn(appRouter._def.procedures, procedureName), procedureName).toBe(true);
    }
  });

  it("invalidates all cached inputs named by a mutation receipt without a client tag map", async () => {
    const queryClient = createQueryClient();
    const receipt = { cache_tags: apiCacheTagSchema.options } as const;

    for (const [index, queryKey] of queryKeysForCacheTags(receipt.cache_tags).entries()) {
      queryClient.setQueryData(
        [...queryKey, { input: { fixture: index }, type: "query" }],
        `fixture-${index}`,
      );
    }
    const unrelatedKey = [["profiles", "get"], { input: {}, type: "query" }] as const;
    queryClient.setQueryData(unrelatedKey, "unrelated");

    await invalidateReceiptCacheTags(queryClient, receipt);

    for (const queryKey of queryKeysForCacheTags(receipt.cache_tags)) {
      const matches = queryClient.getQueryCache().findAll({ queryKey });
      expect(matches).toHaveLength(1);
      expect(matches[0]?.state.isInvalidated).toBe(true);
    }
    expect(queryClient.getQueryCache().find({ queryKey: unrelatedKey })?.state.isInvalidated).toBe(
      false,
    );
  });

  it("deduplicates repeated receipt tags before invalidation", () => {
    expect(queryKeysForCacheTags(["calendar.range", "calendar.range"])).toEqual([
      [["calendar", "range"]],
    ]);
  });
});

describe("Shared mutation retry contract", () => {
  it("does not automatically replay mutations after an ambiguous failure", async () => {
    const queryClient = createQueryClient();
    const mutationFn = vi.fn(async () => {
      throw new Error("response lost");
    });
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: [["plannedSessions", "move"]],
      mutationFn,
    });

    await expect(mutation.execute(undefined)).rejects.toThrow("response lost");
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it("offers one explicit replay for proven idempotent ingestion mutations", async () => {
    const queryClient = createQueryClient();
    const mutationFn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce("accepted");
    const mutation = queryClient.getMutationCache().build(queryClient, {
      ...IDEMPOTENT_INGESTION_MUTATION_RETRY_OPTIONS,
      retryDelay: 0,
      mutationFn,
    });

    await expect(mutation.execute(undefined)).resolves.toBe("accepted");
    expect(mutationFn).toHaveBeenCalledTimes(2);
    expect(IDEMPOTENT_INGESTION_MUTATION_RETRY_OPTIONS).toEqual({
      retry: 1,
      retryDelay: 1000,
    });
  });
});
