import { describe, expect, it } from "vitest";
import {
  calculateCssFrom400m200mTest,
  cssTestProtocolSchema,
  cssTestTimesSchema,
  pacePerHundredMetersToSpeed,
  speedToPacePerHundredMeters,
} from "../swim-pace-curve";

describe("400m/200m CSS test protocol", () => {
  it("returns CSS and both exact-distance speed efforts", () => {
    expect(calculateCssFrom400m200mTest({ time400Seconds: 360, time200Seconds: 168 })).toEqual({
      cssSecondsPer100m: 96,
      efforts: [
        { distanceMeters: 400, durationSeconds: 360, speedMetersPerSecond: 400 / 360 },
        { distanceMeters: 200, durationSeconds: 168, speedMetersPerSecond: 200 / 168 },
      ],
    });
  });

  it.each([
    { time400Seconds: 0, time200Seconds: 168 },
    { time400Seconds: 336, time200Seconds: 168 },
    { time400Seconds: 200, time200Seconds: 50 },
    { time400Seconds: 1_500, time200Seconds: 100 },
  ])("rejects invalid or implausible protocol input $time400Seconds/$time200Seconds", (input) => {
    expect(cssTestTimesSchema.safeParse(input).success).toBe(false);
  });

  it("requires a client-generated UUID operation ID for a persisted protocol submission", () => {
    expect(
      cssTestProtocolSchema.safeParse({
        operationId: "22222222-2222-4222-8222-222222222222",
        time400Seconds: 360,
        time200Seconds: 168,
      }).success,
    ).toBe(true);
    expect(
      cssTestProtocolSchema.safeParse({ time400Seconds: 360, time200Seconds: 168 }).success,
    ).toBe(false);
    expect(
      cssTestProtocolSchema.safeParse({
        operationId: "not-a-uuid",
        time400Seconds: 360,
        time200Seconds: 168,
      }).success,
    ).toBe(false);
  });
});

describe("swim pace conversions", () => {
  it("keeps conversion helpers available", () => {
    expect(pacePerHundredMetersToSpeed(80)).toBe(1.25);
    expect(speedToPacePerHundredMeters(1.25)).toBe(80);
  });
});
