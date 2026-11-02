import { describe, expect, it } from "vitest";
import {
  activityPlanStructureSchema,
  normalizeActivityPlanAuthoringStructure,
  normalizeActivityPlanSpeedTargetIntensity,
  resolveActivityPlanTargetPresentation,
} from "..";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const structure = {
  version: 5 as const,
  activity_category: "run" as const,
  items: [
    {
      type: "step",
      id: id(2),
      duration: { type: "time" as const, seconds: 270 },
      targets: [
        { type: "speed" as const, intensity: 13.333333333333334 },
        { type: "RPE" as const, intensity: 1.5 },
      ],
    },
  ],
};
describe("activity-plan speed authoring normalization", () => {
  it("rounds only new speed values to two decimals and retains half-point RPE", () => {
    const normalized = normalizeActivityPlanAuthoringStructure(
      activityPlanStructureSchema.parse(structure),
    );
    expect(normalized).toMatchObject({
      success: true,
      structure: {
        items: [
          {
            targets: [
              { type: "speed", intensity: 13.33 },
              { type: "RPE", intensity: 1.5 },
            ],
          },
        ],
      },
    });
  });
  it("does not silently turn a small positive speed into zero", () => {
    expect(normalizeActivityPlanSpeedTargetIntensity(0.001)).toEqual({
      success: false,
      message: "Speed must be at least 0.01 km/h.",
    });
    expect(normalizeActivityPlanSpeedTargetIntensity(0.005)).toEqual({
      success: true,
      intensity: 0.01,
    });
    expect(normalizeActivityPlanSpeedTargetIntensity(100)).toEqual({
      success: true,
      intensity: 100,
    });
  });
  it("rejects negative speeds rather than rounding them into a valid target", () => {
    expect(normalizeActivityPlanSpeedTargetIntensity(-0.001)).toEqual({
      success: false,
      message: "Speed must be a finite, nonnegative number.",
    });
  });
  it("bounds legacy conversion artifacts in presentation without mutating them", () => {
    const target = { type: "speed" as const, intensity: 13.333333333333334 };
    expect(
      resolveActivityPlanTargetPresentation({
        target,
        activityCategory: "run",
        asOf: "2026-10-03T00:00:00.000Z",
      }).label,
    ).toBe("13.33 km/h");
    expect(target.intensity).toBe(13.333333333333334);
  });
});
