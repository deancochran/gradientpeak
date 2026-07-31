import { describe, expect, it } from "vitest";
import { ActivityMetricsSchema } from "../activity_payload";

describe("canonical activity metric units", () => {
  it("accepts Celsius temperatures and pool lengths in metres", () => {
    const metrics = {
      avg_temperature: 21.5,
      pool_length_meters: 25,
    } as const;

    expect(ActivityMetricsSchema.parse(metrics)).toEqual(metrics);
  });

  it("accepts the canonical pool length field", () => {
    expect(ActivityMetricsSchema.safeParse({ pool_length_meters: 25 }).success).toBe(true);
  });

  it("rejects the removed maximum-temperature metric", () => {
    expect(
      ActivityMetricsSchema.safeParse({ avg_temperature: 21.5, max_temperature: 25.25 }).success,
    ).toBe(false);
  });

  it.each([
    { pool_length_meters: 25, pool_length_unit: "yards" },
    { pool_length_meters: 25, pool_length_unit: "feet" },
    { pool_length_meters: 25, pool_length_unit: "m" },
  ])("rejects non-metric pool length input %#", (metrics) => {
    expect(ActivityMetricsSchema.safeParse(metrics).success).toBe(false);
  });
});
