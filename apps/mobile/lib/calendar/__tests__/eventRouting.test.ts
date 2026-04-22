import { describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/constants/routes";
import { buildEditEventRoute, buildOpenEventRoute } from "../eventRouting";

describe("calendar event routing", () => {
  it("routes planned events to standard event detail", () => {
    expect(buildOpenEventRoute({ id: "e-0", event_type: "planned" })).toBe(
      ROUTES.PLAN.EVENT_DETAIL("e-0"),
    );
  });

  it("routes supported fallback detail types to standard event detail", () => {
    expect(buildOpenEventRoute({ id: "e-2", event_type: "race_target" })).toBe(
      ROUTES.PLAN.EVENT_DETAIL("e-2"),
    );
    expect(buildOpenEventRoute({ id: "e-3", event_type: "custom" })).toBe(
      ROUTES.PLAN.EVENT_DETAIL("e-3"),
    );
  });

  it("routes non-planned edit action to routed edit mode", () => {
    expect(buildEditEventRoute({ id: "e-4", event_type: "custom" })).toBe(
      ROUTES.PLAN.EVENT_UPDATE("e-4"),
    );
  });

  it("keeps legacy rest-day events out of routed fallback paths while imported events open detail", () => {
    expect(buildOpenEventRoute({ id: "e-1", event_type: "rest_day" })).toBe(null);
    expect(buildEditEventRoute({ id: "e-1", event_type: "rest_day" })).toBe(null);
    expect(buildOpenEventRoute({ id: "e-5", event_type: "imported" })).toBe(
      ROUTES.PLAN.EVENT_DETAIL("e-5"),
    );
    expect(buildEditEventRoute({ id: "e-5", event_type: "imported" })).toBe(null);
  });
});
