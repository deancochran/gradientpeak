import { describe, expect, it } from "vitest";

import {
  convertTargetToAbsolute,
  formatTargetValue,
  getRuntimeTargetIntensity,
  getTargetGuidance,
  getTargetRange,
  isInTargetRange,
} from "../target_helpers";

const legacySpeedTarget = { type: "speed" as const, intensity: 18 };

describe("legacy V2 speed target helpers", () => {
  it("formats the persisted target as km/h", () => {
    expect(formatTargetValue(legacySpeedTarget)).toBe("18.0 km/h");
  });

  it("normalizes persisted km/h to m/s for runtime comparisons", () => {
    expect(getRuntimeTargetIntensity(legacySpeedTarget)).toBe(5);
    expect(getTargetRange(legacySpeedTarget)).toEqual([4.75, 5.25]);
    expect(isInTargetRange(5, legacySpeedTarget)).toBe(true);
    expect(isInTargetRange(18, legacySpeedTarget)).toBe(false);
  });

  it("uses m/s for runtime guidance and absolute/export values", () => {
    expect(getTargetGuidance(4, legacySpeedTarget)).toEqual({
      status: "below",
      message: "Increase by 1 m/s",
    });
    expect(convertTargetToAbsolute(legacySpeedTarget, {})).toEqual({
      intensity: 5,
      unit: "m/s",
      label: "Speed",
    });
  });
});
