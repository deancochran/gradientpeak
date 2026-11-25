import { describe, expect, it } from "vitest";

import { createUnavailableActivityPlanPlanningEstimate } from "./activity-plan-planning-estimate";
import { summarizePlannedDay } from "./planned-day-summary";

describe("summarizePlannedDay", () => {
  it("derives one canonical bundle while preserving unavailable totals", () => {
    const prescriptionQuantification = (activityCategory: "bike" | "run" | "swim") =>
      createUnavailableActivityPlanPlanningEstimate({
        asOf: "2026-07-31T12:00:00.000Z",
        activityCategory,
        planId: `plan-${activityCategory}`,
      }).prescriptionQuantification;
    const result = summarizePlannedDay([
      { prescriptionQuantification: prescriptionQuantification("bike") },
      { prescriptionQuantification: prescriptionQuantification("run") },
      { prescriptionQuantification: prescriptionQuantification("swim") },
    ]);

    expect(result).toMatchObject({
      eventCount: 3,
      activity_categories: ["bike", "run", "swim"],
      totalDurationSeconds: null,
      totalLoad: null,
    });
    expect(result.prescriptionQuantification.members).toHaveLength(3);
  });

  it("keeps an empty day unavailable rather than inventing zero work", () => {
    expect(summarizePlannedDay([])).toMatchObject({
      eventCount: 0,
      totalDurationSeconds: null,
      totalLoad: null,
    });
  });
});
