import { describe, expect, it } from "vitest";
import { addDays } from "../dates";

describe("addDays", () => {
  it("preserves local calendar-date addition without mutating its input", () => {
    const date = new Date(2026, 2, 8, 12, 30, 0, 0);
    const result = addDays(date, 1);

    expect(result).not.toBe(date);
    expect(date.getDate()).toBe(8);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(9);
    expect(result.getHours()).toBe(12);
  });
});
