import { describe, expect, it } from "vitest";
import { buildActivityCalendarCells } from "./activityCalendar";

describe("activity calendar cells", () => {
  it("aligns active marks to their actual dates instead of filling by activity count", () => {
    const cells = buildActivityCalendarCells({
      points: [
        { date: new Date("2026-07-02T12:00:00Z") },
        { date: new Date("2026-07-05T09:00:00Z") },
      ],
      startDate: new Date("2026-07-01T00:00:00Z"),
      endDate: new Date("2026-07-07T00:00:00Z"),
      maxDays: 60,
    });

    expect(cells).toHaveLength(7);
    expect(cells.filter((cell) => cell.active).map((cell) => cell.dateKey)).toEqual([
      "2026-07-02",
      "2026-07-05",
    ]);
  });

  it("limits long ranges to the most recent requested days", () => {
    const cells = buildActivityCalendarCells({
      points: [],
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-07-18T00:00:00Z"),
      maxDays: 28,
    });

    expect(cells).toHaveLength(28);
    expect(cells[0]?.dateKey).toBe("2026-06-21");
    expect(cells.at(-1)?.dateKey).toBe("2026-07-18");
  });
});
