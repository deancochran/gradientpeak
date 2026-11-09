import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { validateRecordingSearch } from "../../../../lib/recording-web";
import { Route } from "./$routeId";

describe("legacy recording route preview", () => {
  it("redirects with launcher context and the preview route taking precedence", () => {
    const search = validateRecordingSearch({
      activity_category: "bike",
      gps: "on",
      activityPlanId: "00000000-0000-4000-8000-000000000001",
      plannedSessionId: "00000000-0000-4000-8000-000000000002",
      plannedSessionDate: "2026-09-20",
      routeId: "00000000-0000-4000-8000-000000000003",
      eventId: "00000000-0000-4000-8000-000000000004",
    });
    const params = { routeId: "00000000-0000-4000-8000-000000000005" };
    let thrown: unknown;
    try {
      (
        Route as unknown as {
          options: {
            beforeLoad: (context: { search: typeof search; params: typeof params }) => void;
          };
        }
      ).options.beforeLoad({ search, params });
    } catch (error) {
      thrown = error;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({
      options: { to: "/record", search: { ...search, routeId: params.routeId } },
    });
  });
});
