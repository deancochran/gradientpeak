import { addDaysToDateKey, addMonthsToDateKey } from "@/lib/calendar/dateMath";

describe("calendar.navigate-views", () => {
  it("retains the selected day when moving between month views and clamps month ends", () => {
    expect(addMonthsToDateKey("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToDateKey("2026-02-28", -1)).toBe("2026-01-28");
    expect(addDaysToDateKey("2026-03-23", 7)).toBe("2026-03-30");
  });
});
