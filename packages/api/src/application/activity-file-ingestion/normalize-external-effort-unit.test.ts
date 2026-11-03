import { describe, expect, it } from "vitest";
import { normalizeExternalEffortUnit } from "./normalize-external-effort-unit";

describe("normalizeExternalEffortUnit", () => {
  it.each([
    ["power", 1.2, "kW", { value: 1200, unit: "watts" }],
    ["speed", 36, "km/h", { value: 10, unit: "meters_per_second" }],
    ["speed", 10, "mph", { value: 4.4704, unit: "meters_per_second" }],
    ["heart_rate", 160, "beats_per_minute", { value: 160, unit: "bpm" }],
  ] as const)("converts external %s units without relabeling values", (kind, value, unit, expected) => {
    expect(normalizeExternalEffortUnit({ kind, value, unit })).toEqual(expected);
  });

  it("fails closed for unknown, incompatible, and non-finite provider values", () => {
    expect(normalizeExternalEffortUnit({ kind: "speed", value: 1, unit: "knots" })).toBeNull();
    expect(normalizeExternalEffortUnit({ kind: "power", value: 1, unit: "mph" })).toBeNull();
    expect(
      normalizeExternalEffortUnit({
        kind: "power",
        value: Number.POSITIVE_INFINITY,
        unit: "watts",
      }),
    ).toBeNull();
  });
});
