import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("activity plan scheduling", () => {
  it("keeps detail presentation structure-only", () => {
    const source = readFileSync("src/routes/_protected/activity-plans/$activityPlanId.tsx", "utf8");

    expect(source).not.toContain("routes.list");
    expect(source).not.toContain("routeOptions");
    expect(source).not.toContain("plan.route");
  });

  it("creates planned events with the current activity plan name", () => {
    const source = readFileSync("src/routes/_protected/activity-plans/$activityPlanId.tsx", "utf8");

    expect(source).toContain("activity_plan_id: plan.id");
    expect(source).toContain('event_type: "planned"');
    expect(source).toContain("scheduled_date: scheduledDate");
    expect(source).toContain("title: plan.name");
  });
});
