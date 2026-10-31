import { describe, expect, it } from "vitest";
import { createRouterCaller } from "../../test/router";
import { activityPlansRouter } from "../activity-plans";
import { calendarRouter } from "../events";

describe("GPS cutover router contracts", () => {
  it("rejects legacy activityLocation filter in activity_plans.list", async () => {
    const caller = createRouterCaller(activityPlansRouter);

    await expect(caller.list({ activityLocation: "outdoor" } as never)).rejects.toThrow();
  });

  it("rejects legacy activity_location filter in calendar.range", async () => {
    const caller = createRouterCaller(calendarRouter);

    await expect(
      caller.range({
        startDate: "2026-01-01",
        endDateExclusive: "2026-01-02",
        activity_location: "outdoor",
      } as never),
    ).rejects.toThrow();
  });
});
