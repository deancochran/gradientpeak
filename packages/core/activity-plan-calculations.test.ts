import { describe, expect, it } from "vitest";
import { compileActivityPlan } from "./activity-plan";
import {
  calculateActivityPlanStats,
  extractActivityProfile,
  getOccurrenceAtElapsedTime,
} from "./activity-plan-calculations";

const id = (value: number) => `70000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const structure = (steps: unknown[], repetitions = 1) => ({
  version: 5 as const,
  activity_category: "bike" as const,
  items: repetitions === 1 ? steps : [{ type: "repeat", id: id(1), count: repetitions, steps }],
});
describe("activity-plan calculations", () => {
  it("preserves V5 timed cycling totals and occurrence identity", () => {
    const plan = compileActivityPlan(
      structure([
        {
          type: "step",
          id: id(2),
          name: "Steady",
          duration: { type: "time", seconds: 3600 },
          targets: [{ type: "%FTP", intensity: 80 }],
        },
      ]),
    );
    expect(calculateActivityPlanStats(plan)).toMatchObject({
      occurrenceCount: 1,
      duration: { exactElapsedSeconds: 3600, timedActiveSeconds: 3600, restSeconds: 0 },
      categoryDoses: [{ activity_category: "bike", occurrenceCount: 1 }],
    });
    expect(extractActivityProfile(plan)[0]).toMatchObject({
      durationSeconds: 3600,
      cumulativeExactSeconds: 0,
      activity_category: "bike",
    });
    expect(getOccurrenceAtElapsedTime(plan, 1800)).toMatchObject({
      elapsedSeconds: 1800,
      progress: 0.5,
    });
  });
  it("expands repetitions without inventing elapsed time for mixed completion policies", () => {
    const plan = compileActivityPlan(
      structure(
        [
          {
            type: "step",
            id: id(2),
            duration: { type: "time", seconds: 120 },
            targets: [{ type: "RPE", intensity: 5 }],
          },
          {
            type: "step",
            id: id(3),
            duration: { type: "distance", meters: 400 },
            targets: [{ type: "RPE", intensity: 6 }],
          },
        ],
        3,
      ),
    );
    expect(calculateActivityPlanStats(plan)).toMatchObject({
      occurrenceCount: 6,
      duration: { exactElapsedSeconds: null, timedActiveSeconds: 360, distanceMeters: 1200 },
    });
    expect(getOccurrenceAtElapsedTime(plan, 121)).toBeNull();
  });
  it("keeps load and target coverage outside structural statistics", () => {
    const plan = compileActivityPlan(
      structure([
        {
          type: "step",
          id: id(2),
          duration: { type: "time", seconds: 1800 },
          targets: [{ type: "%FTP", intensity: 50 }],
        },
        {
          type: "step",
          id: id(3),
          duration: { type: "time", seconds: 1800 },
          targets: [{ type: "%FTP", intensity: 100 }],
        },
      ]),
    );
    const dose = calculateActivityPlanStats(plan).categoryDoses[0];
    expect(dose).toMatchObject({
      activity_category: "bike",
      occurrenceCount: 2,
      timedActiveSeconds: 3600,
    });
    expect(dose).not.toHaveProperty("cyclingPower");
    expect(dose).not.toHaveProperty("estimatedCommonLoad");
  });
  it("rejects V3 and validates V5 category target compatibility", () => {
    expect(() =>
      compileActivityPlan({ version: 3, activity_category: "bike", segments: [] }),
    ).toThrow();
    expect(() =>
      compileActivityPlan(
        structure([
          {
            type: "step",
            id: id(2),
            duration: { type: "time", seconds: 1 },
            targets: [{ type: "speed", intensity: 10 }],
          },
        ]),
      ),
    ).toThrow();
  });
});
