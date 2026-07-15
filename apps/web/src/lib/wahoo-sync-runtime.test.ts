import { describe, expect, it, vi } from "vitest";
import { createSupabaseWahooRouteStorage } from "./wahoo-sync-runtime";

vi.mock("@repo/db/client", () => ({ db: {} }));

function createStorageDownload(result: { data: Blob | null; error: unknown }) {
  const download = vi.fn().mockResolvedValue(result);
  const from = vi.fn(() => ({ download }));
  return { download, from, storage: { from } };
}

describe("createSupabaseWahooRouteStorage", () => {
  it("returns null only for a definite missing route artifact", async () => {
    const { download, from, storage } = createStorageDownload({
      data: null,
      error: { message: "Object not found", status: 404, statusCode: "404" },
    });

    await expect(
      createSupabaseWahooRouteStorage(storage).downloadRouteGpx("routes/missing.gpx"),
    ).resolves.toBeNull();
    expect(from).toHaveBeenCalledWith("routes");
    expect(download).toHaveBeenCalledWith("routes/missing.gpx");
  });

  it("throws transient storage download errors", async () => {
    const transientError = { message: "Storage unavailable", status: 503, statusCode: "503" };
    const { storage } = createStorageDownload({ data: null, error: transientError });

    await expect(
      createSupabaseWahooRouteStorage(storage).downloadRouteGpx("routes/retry.gpx"),
    ).rejects.toBe(transientError);
  });

  it("throws when storage returns neither an artifact nor an error", async () => {
    const { storage } = createStorageDownload({ data: null, error: null });

    await expect(
      createSupabaseWahooRouteStorage(storage).downloadRouteGpx("routes/unknown.gpx"),
    ).rejects.toThrow("Route storage download returned no data");
  });
});
