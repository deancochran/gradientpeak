import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { validateRecordingSearch } from "../../../../lib/recording-web";
import { Route } from "./index";

describe("legacy recording route picker", () => {
  it("redirects to the indoor recorder with validated launcher context", () => {
    const search = validateRecordingSearch({
      activity_category: "bike",
      gps: "on",
      activityPlanId: "00000000-0000-4000-8000-000000000001",
      plannedSessionId: "00000000-0000-4000-8000-000000000002",
      plannedSessionDate: "2026-09-20",
      routeId: "00000000-0000-4000-8000-000000000003",
      eventId: "00000000-0000-4000-8000-000000000004",
    });
    let thrown: unknown;
    try {
      (
        Route as unknown as {
          options: { beforeLoad: (context: { search: typeof search }) => void };
        }
      ).options.beforeLoad({ search });
    } catch (error) {
      thrown = error;
    }
    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to: "/record/session", search } });
  });
});
