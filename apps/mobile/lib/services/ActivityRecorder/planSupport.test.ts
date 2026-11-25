import { describe, expect, it } from "vitest";
import { getMobileRecordingPlanSupport } from "./planSupport";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const activityStep = (activityCategory: "run" | "bike", value: number) => ({
  type: "step" as const,
  id: id(value + 200),
  name: activityCategory,
  duration: { type: "time" as const, seconds: 60 },
  targets: [{ type: "RPE" as const, intensity: 4 }],
});
const activityBlock = (activityCategory: "run" | "bike", value: number) => ({
  type: "repeat" as const,
  id: id(value),
  count: 2,
  steps: [
    {
      ...activityStep(activityCategory, value),
    },
  ],
});
const plan = (activity_category: "run" | "bike", items: unknown) => ({
  name: "Plan",
  structure: { version: 5, activity_category, items },
});
describe("getMobileRecordingPlanSupport", () => {
  it("supports a single-activity-category plan", () => {
    expect(getMobileRecordingPlanSupport(plan("run", [activityBlock("run", 1)])).supported).toBe(
      true,
    );
  });
  it("supports repeated blocks in the same category", () => {
    const support = getMobileRecordingPlanSupport(
      plan("run", [activityBlock("run", 1), activityBlock("run", 2)]),
    );
    expect(support).toMatchObject({ supported: true, activity_category: "run" });
  });
  it("rejects legacy segment-category plans", () => {
    const support = getMobileRecordingPlanSupport({
      name: "Legacy plan",
      structure: {
        version: 3,
        segments: [
          { ...activityBlock("run", 1), activity_category: "run" },
          { ...activityBlock("bike", 2), activity_category: "bike" },
        ],
      },
    });
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
