import { getVisibleMonthIndex } from "../CalendarMonthList";

describe("calendar paging lists", () => {
  it("keeps month paging pinned to the visible month instead of the selected day", () => {
    expect(getVisibleMonthIndex(["2026-01-01", "2026-02-01", "2026-03-01"], "2026-03-01")).toBe(2);

    expect(
      getVisibleMonthIndex(
        ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"],
        "2026-04-01",
      ),
    ).toBe(3);
  });
});
