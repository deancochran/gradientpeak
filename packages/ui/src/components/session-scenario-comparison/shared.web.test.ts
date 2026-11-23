import { describe, expect, it } from "vitest";
import { toSessionScenarioComparisonVisual } from "./shared";

describe("toSessionScenarioComparisonVisual", () => {
  it("maps canonical aligned transitions without deriving values or zero-filling gaps", () => {
    const visual = toSessionScenarioComparisonVisual({
      baseline: {
        transitions: [
          {
            toAsOf: "2026-11-23T00:00:00.000Z",
            state: { longTermLoad: 42, recentLoad: 57, loadBalance: -15 },
          },
          {
            toAsOf: "2026-11-24T00:00:00.000Z",
            state: { longTermLoad: 43, recentLoad: 55, loadBalance: -12 },
          },
        ],
      },
      alternative: {
        transitions: [
          {
            toAsOf: "2026-11-23T00:00:00.000Z",
            state: { longTermLoad: 42, recentLoad: 57, loadBalance: -15 },
          },
        ],
      },
      timeZone: "UTC",
    });

    expect(visual.timeZone).toBe("UTC");
    expect(visual.unitLabel).toBe("training load");
    expect(visual.points).toEqual([
      {
        date: "2026-11-23",
        index: 0,
        recorded: { fitness: 42, fatigue: 57, form: -15 },
        projected: { fitness: 42, fatigue: 57, form: -15 },
      },
      {
        date: "2026-11-24",
        index: 1,
        recorded: { fitness: 43, fatigue: 55, form: -12 },
        projected: { fitness: null, fatigue: null, form: null },
      },
    ]);
  });
});
