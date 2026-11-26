import { describe, expect, it } from "vitest";
import { normalizeWahooProfileEnrichment } from "./wahoo-profile-enrichment";

describe("normalizeWahooProfileEnrichment", () => {
  it("normalizes only supported profile facts", () => {
    expect(
      normalizeWahooProfileEnrichment({
        birth: "1990-06-15",
        gender: 1,
        id: 7,
        weight: "61.5",
      } as never),
    ).toEqual({ dob: new Date("1990-06-15T00:00:00.000Z"), gender: "female", weightKg: 61.5 });
  });

  it("abstains from malformed or implausible values", () => {
    expect(
      normalizeWahooProfileEnrichment({
        birth: "not-a-date",
        gender: 3,
        id: 7,
        weight: 900,
      } as never),
    ).toEqual({});
  });
});
