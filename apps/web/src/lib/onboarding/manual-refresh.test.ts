import { describe, expect, it, vi } from "vitest";
import { retainSnapshotOnRefresh } from "./manual-refresh";

describe("retainSnapshotOnRefresh", () => {
  it("turns transport rejection into visible error without replacing a good snapshot", async () => {
    const snapshot = { percent: 50 };
    const onSuccess = vi.fn();
    const onError = vi.fn();
    await expect(
      retainSnapshotOnRefresh({
        load: async () => {
          throw new Error("transport down");
        },
        onSuccess,
        onError,
        errorMessage: "Progress could not be refreshed.",
      }),
    ).resolves.toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Progress could not be refreshed.");
    expect(snapshot).toEqual({ percent: 50 });
  });
});
