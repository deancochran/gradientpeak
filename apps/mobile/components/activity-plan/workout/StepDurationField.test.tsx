import { describe, expect, it } from "vitest";
import { durationForType, fromUIValue } from "./stepDurationValues";

describe("step duration form values", () => {
  it("replaces a duration with a complete valid discriminated value when its type changes", () => {
    expect(durationForType("time")).toEqual({ type: "time", seconds: 600 });
    expect(durationForType("distance")).toEqual({ type: "distance", meters: 1000 });
    expect(durationForType("repetitions")).toEqual({ type: "repetitions", count: 10 });
  });

  it("converts unit changes into canonical duration fields without preserving stale fields", () => {
    expect(fromUIValue("time", 2, "minutes")).toEqual({ type: "time", seconds: 120 });
    expect(fromUIValue("distance", 1.5, "km")).toEqual({ type: "distance", meters: 1500 });
    expect(fromUIValue("repetitions", 12, "reps")).toEqual({ type: "repetitions", count: 12 });
  });
});
