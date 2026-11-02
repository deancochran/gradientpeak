import { describe, expect, it } from "vitest";
import { dateOnlySchema } from "../date-only";

describe("dateOnlySchema", () => {
  it.each([
    "2024-02-29",
    "2025-02-28",
    "2000-02-29",
    "1900-02-28",
  ])("accepts valid Gregorian date %s", (value) => {
    expect(dateOnlySchema.safeParse(value).success).toBe(true);
  });

  it.each([
    "2025-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-1-01",
    " 2026-01-01",
    "2026-01-01 ",
    "2026-01-01T00:00:00Z",
  ])("rejects non-literal or invalid date %s", (value) => {
    expect(dateOnlySchema.safeParse(value).success).toBe(false);
  });
});
