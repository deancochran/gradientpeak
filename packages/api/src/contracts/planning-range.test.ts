import { describe, expect, it } from "vitest";
import { planningRangeRequestSchema } from "./planning-range";

describe("PlanningRange contract", () => {
  it("accepts a bounded 366-day calendar range", () => {
    expect(
      planningRangeRequestSchema.safeParse({
        startDate: "2026-01-01",
        endDate: "2027-01-01",
      }).success,
    ).toBe(true);
  });

  it("rejects reversed and wider ranges", () => {
    expect(
      planningRangeRequestSchema.safeParse({
        startDate: "2026-01-02",
        endDate: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(
      planningRangeRequestSchema.safeParse({
        startDate: "2026-01-01",
        endDate: "2027-01-02",
      }).success,
    ).toBe(false);
  });
});
