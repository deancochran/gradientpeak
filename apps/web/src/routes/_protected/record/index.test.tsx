import { describe, expect, it } from "vitest";
import { Route } from "./index";

describe("legacy record entrypoint", () => {
  it("redirects validated recording context to the canonical immediate session", () => {
    const search = {
      activity_category: "bike" as const,
      gps: "off" as const,
      activityPlanId: "00000000-0000-4000-8000-000000000001",
      routeId: "00000000-0000-4000-8000-000000000002",
    };
    let thrown: unknown;
    try {
      Route.options.beforeLoad?.({ search } as never);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ options: { to: "/record/session", search } });
  });
});
