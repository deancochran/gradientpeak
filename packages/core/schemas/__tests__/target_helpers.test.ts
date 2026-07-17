import { describe, expect, it } from "vitest";

import {
  convertTargetToAbsolute,
  formatTargetValue,
  getRuntimeTargetIntensity,
  getTargetGuidance,
  getTargetRange,
  isInTargetRange,
} from "../target_helpers";

const speedTarget = { type: "speed" as const, intensity: 18 };

describe("modern speed target helpers", () => {
  it("formats the persisted target as km/h", () => {
    expect(formatTargetValue(speedTarget)).toBe("18.0 km/h");
  });

  it("normalizes persisted km/h to m/s for runtime comparisons", () => {
    expect(getRuntimeTargetIntensity(speedTarget)).toBe(5);
    expect(getTargetRange(speedTarget)).toEqual([4.75, 5.25]);
    expect(isInTargetRange(5, speedTarget)).toBe(true);
    expect(isInTargetRange(18, speedTarget)).toBe(false);
  });

  it("uses m/s for runtime guidance and absolute/export values", () => {
    expect(getTargetGuidance(4, speedTarget)).toEqual({
      status: "below",
      message: "Increase by 1 m/s",
    });
    expect(convertTargetToAbsolute(speedTarget, {})).toEqual({
      intensity: 5,
      unit: "m/s",
      label: "Speed",
    });
  });
});
