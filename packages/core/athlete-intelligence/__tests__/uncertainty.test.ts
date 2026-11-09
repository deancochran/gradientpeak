import { describe, expect, it } from "vitest";
import { parseUncertainty, uncertaintySchema } from "../uncertainty";

describe("uncertaintySchema", () => {
  it.each([0, 1, 0.25, 0.5, 0.999])("accepts bounded value %s", (value) => {
    expect(parseUncertainty(value)).toBe(value);
  });

  it.each([
    -0.01,
    1.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])("rejects out-of-range or non-finite value %s", (value) => {
    expect(uncertaintySchema.safeParse(value).success).toBe(false);
  });
});
