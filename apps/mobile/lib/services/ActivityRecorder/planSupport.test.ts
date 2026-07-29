import { describe, expect, it } from "vitest";
import { getMobileRecordingPlanSupport } from "./planSupport";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const activitySegment = (activityCategory: "run" | "bike", value: number) => ({
  id: id(value),
  role: "activity" as const,
  name: activityCategory,
  activity_category: activityCategory,
  intervals: [
    {
      id: id(value + 100),
      name: activityCategory,
      repetitions: 1,
      steps: [
        {
          id: id(value + 200),
          name: activityCategory,
          duration: { type: "time" as const, seconds: 60 },
          targets: [{ type: "RPE" as const, intensity: 4 }],
        },
      ],
    },
  ],
});

const plan = (segments: unknown) => ({ name: "Plan", structure: { version: 3, segments } });

describe("getMobileRecordingPlanSupport", () => {
  it("supports a single-activity-category plan", () => {
    expect(getMobileRecordingPlanSupport(plan([activitySegment("run", 1)])).supported).toBe(true);
  });

  it("supports repeated activity segments in the same category", () => {
    const support = getMobileRecordingPlanSupport(
      plan([activitySegment("run", 1), activitySegment("run", 2)]),
    );
    expect(support).toMatchObject({ supported: true, activity_category: "run" });
  });

  it("rejects mixed-category plans", () => {
    const support = getMobileRecordingPlanSupport(
      plan([activitySegment("run", 1), activitySegment("bike", 2)]),
    );
    expect(support).toMatchObject({
      supported: false,
      reason: "invalid_structure",
    });
  });

  it("fails closed when the plan structure is invalid", () => {
    expect(getMobileRecordingPlanSupport({ name: "Broken", structure: {} })).toMatchObject({
      supported: false,
      reason: "invalid_structure",
    });
  });
});
