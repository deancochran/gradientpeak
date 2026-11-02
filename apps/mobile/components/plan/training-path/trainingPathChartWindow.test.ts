import { describe, expect, it } from "vitest";
import { deriveTrainingPathChartWindow } from "./trainingPathChartWindow";

const points = Array.from({ length: 84 }, (_, index) => ({
  date: `day-${String(index + 1).padStart(2, "0")}`,
  value: index,
}));

describe("deriveTrainingPathChartWindow", () => {
  it("slices the complete API range locally around the current anchor", () => {
    const centered = deriveTrainingPathChartWindow({
      anchorDate: "day-43",
      maxPoints: 64,
      points,
      selectedDate: "day-43",
    });
    const atEnd = deriveTrainingPathChartWindow({
      anchorDate: "day-84",
      maxPoints: 64,
      points,
      selectedDate: "day-84",
    });

    expect(centered.visiblePoints).toHaveLength(64);
    expect(centered.visiblePoints).toEqual(points.slice(10, 74));
    expect(atEnd.visiblePoints).toEqual(points.slice(20, 84));
    expect(atEnd.anchorDate).toBe("day-84");
  });
});
