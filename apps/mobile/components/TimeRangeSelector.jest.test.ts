import { getDateRangeFromTimeRange } from "./TimeRangeSelector";

describe("getDateRangeFromTimeRange", () => {
  afterEach(() => jest.useRealTimers());

  it("returns local calendar date keys", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 0, 2, 23, 30));

    expect(getDateRangeFromTimeRange("1M")).toEqual({
      start_date: "2025-12-02",
      end_date: "2026-01-02",
    });
  });
});
