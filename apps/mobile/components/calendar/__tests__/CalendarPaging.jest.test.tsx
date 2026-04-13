import { getActiveDayIndex } from "../CalendarDayList";
import { getVisibleMonthIndex } from "../CalendarMonthList";

describe("calendar paging lists", () => {
  it("keeps day paging pinned to the current visible day when the window expands", () => {
    expect(getActiveDayIndex(["2026-03-22", "2026-03-23", "2026-03-24"], "2026-03-24")).toBe(2);

    expect(
      getActiveDayIndex(
        [
          "2026-03-18",
          "2026-03-19",
          "2026-03-20",
          "2026-03-21",
          "2026-03-22",
          "2026-03-23",
          "2026-03-24",
          "2026-03-25",
        ],
        "2026-03-24",
      ),
    ).toBe(6);
  });

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
