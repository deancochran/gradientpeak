import { describe, expect, it } from "vitest";
import {
  filterDateKeyedItemsToProjectionWindow,
  resolveTrainingPlanProjectionWindow,
} from "./trainingPlanProjectionBudgets";

describe("trainingPlanProjectionBudgets", () => {
  it("resolves the default plan projection budget around an anchor date", () => {
    expect(resolveTrainingPlanProjectionWindow({ anchorDate: "2026-07-07" })).toEqual({
      startDate: "2026-05-23",
      endDate: "2027-07-07",
      wasClamped: false,
    });
  });

  it("clamps pathological requested windows", () => {
    expect(
      resolveTrainingPlanProjectionWindow({
        anchorDate: "2026-07-07",
        requestedStartDate: "2020-01-01",
        requestedEndDate: "2030-01-01",
      }),
    ).toEqual({
      startDate: "2026-05-23",
      endDate: "2027-07-07",
      wasClamped: true,
    });
  });

  it("filters date-keyed projection inputs to the resolved window", () => {
    const window = resolveTrainingPlanProjectionWindow({ anchorDate: "2026-07-07" });
    expect(
      filterDateKeyedItemsToProjectionWindow(
        [
          { date: "2026-05-22", value: 1 },
          { date: "2026-05-23", value: 2 },
          { date: "2027-07-07", value: 3 },
          { date: "2027-07-08", value: 4 },
        ],
        { window, getDate: (item) => item.date },
      ).map((item) => item.value),
    ).toEqual([2, 3]);
  });
});
