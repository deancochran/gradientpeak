import { describe, expect, it } from "vitest";
import { activityPlansRouter } from "../activity-plans";
import { calendarRouter } from "../events";

const baseContext = {
  supabase: {},
  session: {
    user: {
      id: "profile-123",
    },
  },
  headers: new Headers(),
  clientType: "test",
  trpcSource: "vitest",
} as any;

describe("GPS cutover router contracts", () => {
  it("rejects legacy activityLocation filter in activity_plans.list", async () => {
    const caller = activityPlansRouter.createCaller(baseContext);

    await expect(caller.list({ activityLocation: "outdoor" } as any)).rejects.toThrow();
  });

  it("rejects legacy activity_location filter in calendar.range", async () => {
    const caller = calendarRouter.createCaller(baseContext);

    await expect(
      caller.range({
        startDate: "2026-01-01",
        endDateExclusive: "2026-01-02",
        activity_location: "outdoor",
      } as any),
    ).rejects.toThrow();
  });
});
