import { describe, expect, it } from "vitest";
import { convertToWahooPlan } from "./plan-converter";

describe("Wahoo plan converter", () => {
  it("exports the pure plan converter", () => {
    expect(convertToWahooPlan).toBeTypeOf("function");
  });
});
