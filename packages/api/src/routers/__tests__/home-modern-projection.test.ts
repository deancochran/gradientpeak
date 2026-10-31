import { describe, expect, it } from "vitest";
import {
  getPlanCategoryComposition,
  getScheduleExecutionPresentation,
  projectCommonLoad,
} from "../home";

const step = (id: string) => ({
  type: "step",
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
    ).toEqual([
      expect.objectContaining({
        date: "2026-04-04",
        longTermLoad: 40.7,
        recentLoad: 52.9,
        loadBalance: -12.1,
        plannedLoad: 70,
      }),
    ]);
    expect(
      projectCommonLoad({
        current: { longTermLoad: 40, recentLoad: 50 },
        currentDate: "2026-04-03",
        days: 1,
        items: [{ date: "2026-04-04", commonLoad: { status: "complete", load: 70 } }],
      })?.[0],
    ).not.toHaveProperty("plannedTss");
    expect(
      projectCommonLoad({
        current: { longTermLoad: 40, recentLoad: 50 },
        currentDate: "2026-04-03",
        days: 1,
        items: [{ date: "2026-04-04", commonLoad: { status: "complete", load: 70 } }],
      })?.[0],
    ).not.toMatchObject({ ctl: expect.anything(), atl: expect.anything(), tsb: expect.anything() });
    expect(
      projectCommonLoad({
        current: { longTermLoad: 40, recentLoad: 50 },
        currentDate: "2026-04-03",
        days: 1,
        items: [{ date: "2026-04-04", commonLoad: { status: "unavailable" } }],
      }),
    ).toBeNull();
  });
  it("withholds projected Load when planned evidence coverage is partial", () => {
    expect(
      projectCommonLoad({
        current: { longTermLoad: 40, recentLoad: 50 },
        currentDate: "2026-04-03",
        days: 1,
        items: [{ date: "2026-04-04", commonLoad: { status: "partial", load: 70 } }],
      }),
    ).toBeNull();
  });
  it("rejects mixed-category composition from V3 segments", () => {
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
    expect(getPlanCategoryComposition(structure)).toEqual([]);
  });
  it("uses canonical activity_category schedule presentation", () => {
    expect(
      getScheduleExecutionPresentation({
        activity_category: "bike",
      }),
    ).toEqual({ activity_category: "bike" });
    expect(getScheduleExecutionPresentation(null)).toEqual({ activity_category: null });
  });
});
