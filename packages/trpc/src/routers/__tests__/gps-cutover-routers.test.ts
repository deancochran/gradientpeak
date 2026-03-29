import { describe, expect, it } from "vitest";
import { activitiesRouter } from "../activities";
import { activityPlansRouter } from "../activity-plans";
import { eventsRouter } from "../events";

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

  it("rejects legacy activity_location filter in events.list", async () => {
    const caller = eventsRouter.createCaller(baseContext);

    await expect(caller.list({ activity_location: "outdoor" } as any)).rejects.toThrow();
  });

  it("rejects legacy location in activities.create", async () => {
    const caller = activitiesRouter.createCaller(baseContext);

    await expect(
      caller.create({
        profile_id: "profile-123",
        name: "Morning Run",
        notes: null,
        type: "run",
        startedAt: "2026-01-01T10:00:00.000Z",
        finishedAt: "2026-01-01T10:45:00.000Z",
        durationSeconds: 2700,
        movingSeconds: 2650,
        distanceMeters: 9000,
        metrics: {},
        location: "outdoor",
      } as any),
    ).rejects.toThrow();
  });
});
