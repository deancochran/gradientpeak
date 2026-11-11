import { describe, expect, it } from "vitest";
import { fromUIValue } from "./stepDurationValues";

describe("step duration form values", () => {
  it("converts unit changes into canonical duration fields without preserving stale fields", () => {
    expect(fromUIValue("time", 2, "minutes")).toEqual({ type: "time", seconds: 120 });
    expect(fromUIValue("distance", 1.5, "km")).toEqual({ type: "distance", meters: 1500 });
    expect(fromUIValue("repetitions", 12, "reps")).toEqual({ type: "repetitions", count: 12 });
  });

  it.each([
    [1.001, 1001],
    [1.005, 1005],
  ])("converts %s km despite binary floating-point noise", (kilometers, meters) => {
    expect(fromUIValue("distance", kilometers, "km")).toEqual({ type: "distance", meters });
  });

  it("rejects genuine sub-metre kilometer precision rather than rounding it", () => {
    expect(fromUIValue("distance", 1.0005, "km")).toBeNull();
  });
});
