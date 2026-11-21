import { describe, expect, it } from "vitest";
import {
  formatTrainingStateDate,
  formatTrainingStateValue,
  getTrainingStateSourceStatus,
  type TrainingStateVisualPoint,
  trainingStateHasValues,
  trainingStateMetrics,
} from "./training-state";

const empty = { fatigue: null, fitness: null, form: null };

describe("training-state presentation", () => {
  const points: TrainingStateVisualPoint[] = [
    {
      date: "2026-03-08",
      index: 0,
      projected: empty,
      recorded: { fatigue: 0, fitness: 42, form: -12.5 },
    },
    {
      date: "2026-03-10",
      index: 2,
      projected: { fatigue: 31, fitness: 44, form: -13 },
      recorded: empty,
    },
  ];

  it("keeps zero, negative values, gaps, and recorded/projected status distinct", () => {
    expect(trainingStateHasValues(points, "fatigue", "recorded")).toBe(true);
    expect(trainingStateHasValues(points, "form", "projected")).toBe(true);
    expect(getTrainingStateSourceStatus(points)).toBe("mixed");
    expect(formatTrainingStateValue(0, "Common Load points")).toBe("0.0 Common Load points");
    expect(formatTrainingStateValue(-12.5, "Common Load points")).toBe("-12.5 Common Load points");
    expect(formatTrainingStateValue(null, "Common Load points")).toBe("Unavailable");
    expect(
      formatTrainingStateValue(
        42,
        "Common Load points from the selected planning period with a deliberately long unit description",
      ),
    ).toContain("Common Load points from the selected planning period");
  });

  it("has stable metric colors and timezone-aware date labels without manufacturing empty data", () => {
    expect(trainingStateMetrics.fitness.colorToken).toBe("chart-1");
    expect(trainingStateMetrics.fatigue.colorToken).toBe("chart-3");
    expect(trainingStateMetrics.form.colorToken).toBe("chart-5");
    expect(formatTrainingStateDate("2026-03-08", "America/Los_Angeles")).toMatch(/Mar 8/);
    expect(getTrainingStateSourceStatus([])).toBe("unavailable");
    expect(trainingStateHasValues([], "fitness", "recorded")).toBe(false);
    expect(
      getTrainingStateSourceStatus([
        { date: "2026-03-09", index: 1, projected: empty, recorded: empty },
        { date: "2026-03-11", index: 3, projected: { ...empty, fitness: 0 }, recorded: empty },
      ]),
    ).toBe("projected");
  });
});
