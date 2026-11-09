import { afterEach, describe, expect, it, vi } from "vitest";
import { prefetchSecondary } from "./secondary-prefetch";

afterEach(() => vi.unstubAllGlobals());

describe("non-Suspense secondary prefetch", () => {
  it("does not race server-rendered pending content against hydration", () => {
    const fetch = vi.fn().mockResolvedValue(undefined);
    prefetchSecondary(fetch);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("starts immediately on client navigation and handles imperative rejection", async () => {
    vi.stubGlobal("window", {});
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    prefetchSecondary(fetch);
    expect(fetch).toHaveBeenCalledOnce();
    await Promise.resolve();
  });
});
