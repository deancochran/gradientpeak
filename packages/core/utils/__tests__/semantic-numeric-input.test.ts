import { describe, expect, it } from "vitest";
import { normalizedSliderPolicy, parseNumericInput } from "../numeric-ux-policy";

describe("semantic numeric parsing", () => {
  it.each([undefined, "", "  "])("distinguishes blank %s from zero", (raw) => {
    expect(parseNumericInput(raw)).toEqual({ status: "empty" });
    expect(parseNumericInput("0")).toEqual({ status: "valid", value: 0 });
  });
  it.each([
    "12suffix",
    "0x10",
    "NaN",
    "Infinity",
    "-",
    "1e",
    "1 2",
  ])("rejects malformed %s in full", (raw) => {
    expect(parseNumericInput(raw).status).toBe("invalid");
  });
  it.each([
    "2.5",
    "9007199254740993",
    "2.00000000000000001",
    "1e-1000",
  ])("rejects integer precision loss for %s", (raw) => {
    expect(parseNumericInput(raw, { precision: "integer" }).status).toBe("invalid");
  });
  it("preserves continuous precision and accepts numeric exponent notation", () => {
    expect(parseNumericInput("70.123456789")).toEqual({ status: "valid", value: 70.123456789 });
    expect(parseNumericInput("1.25e2", { precision: "integer" })).toEqual({
      status: "valid",
      value: 125,
    });
    expect(parseNumericInput("1.2300", { precision: { maxDecimalPlaces: 2 } }).status).toBe(
      "valid",
    );
    expect(parseNumericInput("1.234", { precision: { maxDecimalPlaces: 2 } }).status).toBe(
      "invalid",
    );
  });
  it("rejects out-of-range typed values without clamping", () => {
    expect(parseNumericInput("101", { min: 0, max: 100 })).toEqual({
      status: "invalid",
      reason: "range",
    });
    expect(parseNumericInput("1e999").status).toBe("invalid");
    expect(normalizedSliderPolicy).toEqual({ minimumValue: 0, maximumValue: 1, step: 0.01 });
  });
});
