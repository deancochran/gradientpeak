import { describe, expect, it } from "vitest";
import { fitTimerSeconds } from "./fit-time";

describe("fitTimerSeconds", () => {
  it("converts recorder milliseconds to FIT timer seconds", () => {
    expect(fitTimerSeconds(2_400_000)).toBe(2_400);
  });

  it("does not emit a negative timer duration", () => {
    expect(fitTimerSeconds(-1)).toBe(0);
  });
});
