import { QueryClient } from "@tanstack/react-query";
import { createTRPCQueryUtils } from "@trpc/react-query";
import { describe, expect, it, vi } from "vitest";
import { loadRouteQuery } from "./route-loading";

describe("loadRouteQuery", () => {
  it("awaits a cold read and propagates its failure", async () => {
    const queryClient = new QueryClient();
    const failure = new Error("offline");
    const fetch = vi.fn<() => Promise<string>>().mockRejectedValue(failure);

    await expect(loadRouteQuery(() => queryClient.getQueryData(["activity"]), fetch)).rejects.toBe(
      failure,
    );
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps cached data renderable while starting a handled revalidation", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["activity"], { id: "activity-1" });
    const fetch = vi.fn<() => Promise<{ id: string }>>().mockRejectedValue(new Error("offline"));

    await expect(
      loadRouteQuery(() => queryClient.getQueryData<{ id: string }>(["activity"]), fetch),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(["activity"])).toEqual({ id: "activity-1" });
  });

  it("maps only cold tRPC NOT_FOUND errors to the router not-found boundary", async () => {
    const error = Object.assign(new Error("missing"), { data: { code: "NOT_FOUND" } });

    await expect(
      loadRouteQuery(
        () => undefined,
        () => Promise.reject(error),
      ),
    ).rejects.toMatchObject({ isNotFound: true });
  });

  it("uses tRPC infinite cache keys and refreshes only cached pages", async () => {
    const queryClient = new QueryClient();
    const query = vi.fn(async (_path: string, input: { cursor?: string | null }) => ({
      items: [input.cursor ?? "first"],
      nextCursor: input.cursor === "second" ? undefined : "second",
    }));
    const apiUtils = createTRPCQueryUtils({
      queryClient,
      client: { [Symbol.for("trpc_untypedClient")]: { query } } as never,
    });
    const input = { limit: 20 };
    const options = { getNextPageParam: (page: { nextCursor?: string }) => page.nextCursor };

    await apiUtils.activities.listPaginated.fetchInfinite(input, options);
    expect(query).toHaveBeenCalledTimes(1);
    expect(apiUtils.activities.listPaginated.getInfiniteData(input)?.pages).toHaveLength(1);

    apiUtils.activities.listPaginated.setInfiniteData(input, {
      pages: [
        { items: ["first"], nextCursor: "second" },
        { items: ["second"], nextCursor: undefined },
      ],
      pageParams: [null, "second"],
    });
    query.mockClear();

    await apiUtils.activities.listPaginated.fetchInfinite(input, options);
    expect(query).toHaveBeenCalledTimes(2);
    expect(apiUtils.activities.listPaginated.getInfiniteData(input)?.pages).toHaveLength(2);
  });
});
