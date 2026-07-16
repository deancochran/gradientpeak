import { describe, expect, it } from "vitest";
import { ActivityMetricsSchema } from "../activity_payload";

describe("canonical activity metric units", () => {
  it("accepts Celsius temperatures and pool lengths in metres", () => {
    const metrics = {
      avg_temperature: 21.5,
      pool_length: 25,
      pool_length_unit: "meters",
    } as const;

    expect(ActivityMetricsSchema.parse(metrics)).toEqual(metrics);
  });

  it("accepts a legacy canonical pool length without a redundant unit field", () => {
    expect(ActivityMetricsSchema.safeParse({ pool_length: 25 }).success).toBe(true);
  });

  it("does not retain the removed maximum-temperature metric", () => {
    expect(ActivityMetricsSchema.parse({ avg_temperature: 21.5, max_temperature: 25.25 })).toEqual({
      avg_temperature: 21.5,
    });
  });

  it.each([
    { pool_length: 25, pool_length_unit: "yards" },
    { pool_length: 25, pool_length_unit: "feet" },
    { pool_length: 25, pool_length_unit: "m" },
  ])("rejects non-metric pool length input %#", (metrics) => {
    expect(ActivityMetricsSchema.safeParse(metrics).success).toBe(false);
  });
});
