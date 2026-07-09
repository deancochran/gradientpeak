import { describe, expect, it } from "vitest";
import {
  createActivityEffortInputSchema,
  formatActivityEffortValue,
  formatEffortDuration,
  getActivityEffortDefinition,
  getActivityEffortDefinitionsForCategory,
} from "../activity-efforts";

describe("activity effort definitions", () => {
  it("filters supported efforts by activity category", () => {
    expect(getActivityEffortDefinitionsForCategory("bike")).toHaveLength(1);
    expect(
      getActivityEffortDefinition({ activityCategory: "run", effortType: "speed" }),
    ).toMatchObject({
      unit: "m/s",
    });
  });

  it("rejects unsupported category and effort combinations", () => {
    expect(() =>
      createActivityEffortInputSchema.parse({
        activity_category: "run",
        effort_type: "power",
        duration_seconds: 60,
        value: 300,
        recorded_at: "2026-07-09T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("normalizes unit and value on create", () => {
    const parsed = createActivityEffortInputSchema.parse({
      activity_category: "bike",
      effort_type: "power",
      duration_seconds: 1200,
      value: 301.4,
      recorded_at: "2026-07-09T12:00:00.000Z",
    });

    expect(parsed).toMatchObject({ unit: "W", value: 301 });
  });

  it("formats effort values and durations", () => {
    expect(
      formatActivityEffortValue({ activity_category: "bike", effort_type: "power", value: 300 }),
    ).toBe("300 W");
    expect(formatEffortDuration(125)).toBe("2m 05s");
  });
});
