import { describe, expect, it } from "vitest";
import { getPlanCategoryComposition, projectCommonLoad } from "../home";

const step = (id: string) => ({
  id,
  name: "Steady",
  duration: { type: "time" as const, seconds: 600 },
  targets: [{ type: "RPE" as const, intensity: 5 }],
});

describe("home plan card projection", () => {
  it("uses effective common Load and abstains when a planned item lacks Load", () => {
    expect(
      projectCommonLoad({
        current: { longTermLoad: 40, recentLoad: 50 },
        currentDate: "2026-04-03",
        days: 1,
        items: [
          {
            date: "2026-04-04",
            commonLoad: { status: "complete", load: 70 },
          },
        ],
      }),
    ).toEqual([expect.objectContaining({ date: "2026-04-04", plannedLoad: 70, plannedTss: null })]);
    expect(
      projectCommonLoad({
        current: { longTermLoad: 40, recentLoad: 50 },
        currentDate: "2026-04-03",
        days: 1,
        items: [{ date: "2026-04-04", commonLoad: { status: "unavailable" } }],
      }),
    ).toBeNull();
  });

  it("does not mark a projection complete when an effective item is partial", () => {
    expect(
      projectCommonLoad({
        current: { longTermLoad: 40, recentLoad: 50 },
        currentDate: "2026-04-03",
        days: 1,
        items: [{ date: "2026-04-04", commonLoad: { status: "partial", load: 70 } }],
      }),
    ).toEqual([expect.objectContaining({ status: "partial" })]);
  });

  it("derives ordered repeated and multisport composition from V3 segments", () => {
    const structure = {
      version: 3 as const,
      segments: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          name: "Run one",
          role: "activity" as const,
          category: "run" as const,
          intervals: [
            {
              id: "20000000-0000-4000-8000-000000000001",
              name: "Run",
              repetitions: 1,
              steps: [step("30000000-0000-4000-8000-000000000001")],
            },
          ],
        },
        {
          id: "10000000-0000-4000-8000-000000000002",
          name: "Bike",
          role: "activity" as const,
          category: "bike" as const,
          intervals: [
            {
              id: "20000000-0000-4000-8000-000000000002",
              name: "Bike",
              repetitions: 1,
              steps: [step("30000000-0000-4000-8000-000000000002")],
            },
          ],
        },
        {
          id: "10000000-0000-4000-8000-000000000003",
          name: "Run two",
          role: "activity" as const,
          category: "run" as const,
          intervals: [
            {
              id: "20000000-0000-4000-8000-000000000003",
              name: "Run",
              repetitions: 1,
              steps: [step("30000000-0000-4000-8000-000000000003")],
            },
          ],
        },
      ],
    };

    expect(getPlanCategoryComposition(structure)).toEqual(["run", "bike", "run"]);
  });
});
