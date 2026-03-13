import { describe, expect, it, vi } from "vitest";

import { refreshScheduleViews } from "../refreshScheduleViews";

describe("refreshScheduleViews", () => {
  it("invalidates all schedule-sensitive query families", async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    } as any;

    await refreshScheduleViews(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(12);
  });
});
