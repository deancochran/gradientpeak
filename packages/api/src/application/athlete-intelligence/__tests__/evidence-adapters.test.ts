import { describe, expect, it } from "vitest";
import { canonicalEffortValue } from "../evidence-adapters";

describe("athlete intelligence effort normalization", () => {
  it("delegates supported aliases to the Core canonical effort boundary", () => {
    expect(canonicalEffortValue("power", 2, "kilowatts")).toEqual({ value: 2000, unit: "watts" });
    expect(canonicalEffortValue("speed", 36, "km/h")).toEqual({
      value: 10,
      unit: "meters_per_second",
    });
    expect(canonicalEffortValue("speed", 1, "knots")).toBeNull();
  });
});
