import { createQueryClient } from "@repo/api/react";
import { dehydrate, hydrate, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { createWebQueryClient } from "./query-client";

describe("web route cache policy", () => {
  it("does not change mobile defaults", () => {
    const mobile = createQueryClient();
    const web = createWebQueryClient();
    expect(mobile.getDefaultOptions().queries?.retry).toBe(3);
    expect(web.getDefaultOptions().queries?.refetchOnMount).toBe(true);
    expect(mobile.getDefaultOptions().queries?.refetchOnMount).toBeTypeOf("function");
  });

  it("round trips rich SSR data into an isolated browser cache", () => {
    const server = createWebQueryClient();
    const browser = createWebQueryClient();
    const otherRequest = createWebQueryClient();
    const data = { at: new Date("2026-11-03T12:00:00Z"), values: new Map([["load", 42]]) };
    server.setQueryData(["private-detail"], data);
    hydrate(browser, JSON.parse(JSON.stringify(dehydrate(server))));
    expect(browser.getQueryData(["private-detail"])).toEqual(data);
    expect(otherRequest.getQueryData(["private-detail"])).toBeUndefined();
    server.clear();
    browser.clear();
    otherRequest.clear();
  });

  it("reuses a fresh loader query when its component mounts, including schedules", async () => {
    const client = createWebQueryClient();
    const queryFn = vi.fn().mockResolvedValue({ days: [] });
    const options = {
      queryKey: [["calendar", "range"], { input: { from: "2026-11-03" }, type: "query" }],
      queryFn,
    };
    await client.fetchQuery(options);
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => undefined);
    expect(observer.getCurrentResult().data).toEqual({ days: [] });
    expect(queryFn).toHaveBeenCalledTimes(1);
    unsubscribe();
    client.clear();
  });

  it("refreshes stale data on remount without discarding cached data", async () => {
    const client = createWebQueryClient();
    const queryFn = vi.fn().mockResolvedValue("fresh");
    const options = { queryKey: ["library"], queryFn, staleTime: 1000 };
    client.setQueryData(options.queryKey, "cached", { updatedAt: Date.now() - 2000 });
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => undefined);
    expect(observer.getCurrentResult().data).toBe("cached");
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("fresh"));
    expect(queryFn).toHaveBeenCalledTimes(1);
    unsubscribe();
    client.clear();
  });

  it("does not retry permanent client errors and bounds transient retries", () => {
    const retry = createWebQueryClient().getDefaultOptions().queries?.retry;
    if (typeof retry !== "function") throw new Error("Expected web retry policy");
    for (const httpStatus of [400, 401, 403, 404, 409, 412, 422]) {
      expect(retry(0, Object.assign(new Error("private"), { data: { httpStatus } }))).toBe(false);
    }
    expect(retry(0, new Error("network"))).toBe(true);
    expect(retry(1, new Error("network"))).toBe(false);
    expect(
      createWebQueryClient()
        .getDefaultOptions()
        .dehydrate?.shouldRedactErrors?.(new Error("private")),
    ).toBe(true);
  });
});
