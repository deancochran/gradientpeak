import { describe, expect, it } from "vitest";
import { toSessionScenarioComparisonVisual } from "./shared";

describe("toSessionScenarioComparisonVisual", () => {
  it("maps a skip terminal transition to its own planning date without deriving values", () => {
    const visual = toSessionScenarioComparisonVisual({
      baseline: {
        transitions: [
          {
            toAsOf: "2026-11-24T00:00:00.000Z",
            state: { longTermLoad: 42, recentLoad: 57, loadBalance: -15 },
          },
          {
            toAsOf: "2026-12-01T00:00:00.000Z",
            state: { longTermLoad: 43, recentLoad: 55, loadBalance: -12 },
          },
        ],
      },
      alternative: {
        transitions: [
          {
            toAsOf: "2026-12-01T00:00:00.000Z",
            state: { longTermLoad: 40, recentLoad: 50, loadBalance: -10 },
          },
        ],
      },
      timeZone: "UTC",
    });

    expect(visual.timeZone).toBe("UTC");
    expect(visual.unitLabel).toBe("training load");
    expect(visual.points).toEqual([
      {
        date: "2026-11-24",
        index: 0,
        recorded: { fitness: 42, fatigue: 57, form: -15 },
        projected: { fitness: null, fatigue: null, form: null },
      },
      {
        date: "2026-12-01",
        index: 7,
        recorded: { fitness: 43, fatigue: 55, form: -12 },
        projected: { fitness: 40, fatigue: 50, form: -10 },
      },
    ]);
  });

  it("unions non-aligned dates, keeping missing values unavailable and the last same-day transition", () => {
    const visual = toSessionScenarioComparisonVisual({
      baseline: {
        transitions: [
          {
            toAsOf: "2026-11-24T04:00:00.000Z",
            state: { longTermLoad: 1, recentLoad: 2, loadBalance: -1 },
          },
          {
            toAsOf: "2026-11-25T04:00:00.000Z",
            state: { longTermLoad: 3, recentLoad: 4, loadBalance: -1 },
          },
          {
            toAsOf: "2026-11-26T04:00:00.000Z",
            state: { longTermLoad: 5, recentLoad: 6, loadBalance: -1 },
          },
        ],
      },
      alternative: {
        transitions: [
          {
            toAsOf: "2026-11-24T04:00:00.000Z",
            state: { longTermLoad: 10, recentLoad: 20, loadBalance: -10 },
          },
          {
            toAsOf: "2026-11-26T02:00:00.000Z",
            state: { longTermLoad: 30, recentLoad: 40, loadBalance: -10 },
          },
          {
            toAsOf: "2026-11-26T04:00:00.000Z",
            state: { longTermLoad: 31, recentLoad: 41, loadBalance: -10 },
          },
        ],
      },
      timeZone: "UTC",
    });
    expect(visual.points.map((point) => point.date)).toEqual([
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
    ]);
    expect(visual.points[1]?.projected).toEqual({ fitness: null, fatigue: null, form: null });
    expect(visual.points[2]?.projected).toEqual({ fitness: 31, fatigue: 41, form: -10 });
  });

  it("uses the planning timezone rather than the UTC date", () => {
    const visual = toSessionScenarioComparisonVisual({
      baseline: {
        transitions: [
          {
            toAsOf: "2026-11-25T03:30:00.000Z",
            state: { longTermLoad: 1, recentLoad: 2, loadBalance: -1 },
          },
        ],
      },
      alternative: { transitions: [] },
      timeZone: "America/New_York",
    });
    expect(visual.points[0]?.date).toBe("2026-11-24");
  });
});
