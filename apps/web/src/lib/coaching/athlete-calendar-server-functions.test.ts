import { expect, it } from "vitest";
import { currentCalendarWeek, shiftCalendarWeek } from "./athlete-calendar-server-functions";

it("creates a bounded date-only week", () => {
  const range = currentCalendarWeek();
  expect(range.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(range.endDateExclusive > range.startDate).toBe(true);
});

it("shifts date-only week boundaries without locale or timezone conversion", () => {
  expect(shiftCalendarWeek({ startDate: "2026-03-08", endDateExclusive: "2026-03-15" }, 1)).toEqual(
    {
      startDate: "2026-03-15",
      endDateExclusive: "2026-03-22",
    },
  );
  expect(
    shiftCalendarWeek({ startDate: "2026-03-08", endDateExclusive: "2026-03-15" }, -1),
  ).toEqual({
    startDate: "2026-03-01",
    endDateExclusive: "2026-03-08",
  });
});

it("shifts previous weeks across year and leap-day boundaries", () => {
  expect(
    shiftCalendarWeek({ startDate: "2027-01-03", endDateExclusive: "2027-01-10" }, -1),
  ).toEqual({
    startDate: "2026-12-27",
    endDateExclusive: "2027-01-03",
  });
  expect(
    shiftCalendarWeek({ startDate: "2024-03-03", endDateExclusive: "2024-03-10" }, -1),
  ).toEqual({
    startDate: "2024-02-25",
    endDateExclusive: "2024-03-03",
  });
});
