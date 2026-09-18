import { describe, expect, it } from "vitest";
import { compileActivityPlan, summarizeCompiledActivityPlanInterval } from "./activity-plan";
import {
  calculateActivityPlanStats,
  extractActivityProfile,
  getOccurrenceAtElapsedTime,
} from "./activity-plan-calculations";

describe("activity plan calculations", () => {
  it("preserves the single-segment timed cycling golden", () => {
    const plan = compileActivityPlan({
      version: 3,
      activity_category: "bike",
      segments: [
        {
          role: "activity",
          id: "70000000-0000-4000-8000-000000000001",
          name: "Bike",
          intervals: [
            {
              id: "70000000-0000-4000-8000-000000000002",
              name: "Main",
              repetitions: 1,
              steps: [
                {
                  id: "70000000-0000-4000-8000-000000000003",
                  name: "Steady",
                  duration: { type: "time", seconds: 3600 },
                  targets: [{ type: "%FTP", intensity: 80 }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(calculateActivityPlanStats(plan)).toMatchObject({
      occurrenceCount: 1,
      duration: { exactElapsedSeconds: 3600, timedActiveSeconds: 3600 },
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

  it("fails closed on mixed-category and transition plans", () => {
    const structure = {
      version: 3,
      activity_category: "bike",
      segments: [
        {
          role: "activity",
          id: "70000000-0000-4000-8000-000000000011",
          name: "Bike",
          activity_category: "bike",
          intervals: [
            {
              id: "70000000-0000-4000-8000-000000000012",
              name: "Bike",
              repetitions: 1,
              steps: [
                {
                  id: "70000000-0000-4000-8000-000000000013",
                  name: "Bike",
                  duration: { type: "time", seconds: 600 },
                  targets: [{ type: "%FTP", intensity: 80 }],
                },
              ],
            },
          ],
        },
        {
          role: "transition",
          id: "70000000-0000-4000-8000-000000000014",
          name: "T1",
          duration: { type: "time", seconds: 60 },
        },
        {
          role: "activity",
          id: "70000000-0000-4000-8000-000000000015",
          name: "Run",
          activity_category: "run",
          intervals: [
            {
              id: "70000000-0000-4000-8000-000000000016",
              name: "Run",
              repetitions: 1,
              steps: [
                {
                  id: "70000000-0000-4000-8000-000000000017",
                  name: "Run",
                  duration: { type: "distance", meters: 1000 },
                  targets: [{ type: "speed", intensity: 12 }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(() => compileActivityPlan(structure)).toThrow();
  });

  it("does not calculate bike-only Load or normalized intensity", () => {
    const plan = compileActivityPlan({
      version: 3,
      activity_category: "bike",
      segments: [
        {
          role: "activity",
          id: "70000000-0000-4000-8000-000000000021",
          name: "Variable bike",
          intervals: [
            {
              id: "70000000-0000-4000-8000-000000000022",
              name: "Main",
              repetitions: 1,
              steps: [
                {
                  id: "70000000-0000-4000-8000-000000000023",
                  name: "Easy",
                  duration: { type: "time", seconds: 1800 },
                  targets: [{ type: "%FTP", intensity: 50 }],
                },
                {
                  id: "70000000-0000-4000-8000-000000000024",
                  name: "Threshold",
                  duration: { type: "time", seconds: 1800 },
                  targets: [{ type: "%FTP", intensity: 100 }],
                },
              ],
            },
          ],
        },
      ],
    });

    const dose = calculateActivityPlanStats(plan).categoryDoses[0];
    expect(dose).toMatchObject({
      activity_category: "bike",
      occurrenceCount: 2,
      timedActiveSeconds: 3600,
    });
    expect(dose).not.toHaveProperty("cyclingPower");
    expect(dose).not.toHaveProperty("estimatedCommonLoad");
  });

  it("summarizes repeated mixed quantities without inventing elapsed time", () => {
    const intervalId = "70000000-0000-4000-8000-000000000042";
    const plan = compileActivityPlan({
      version: 3,
      activity_category: "run",
      segments: [
        {
          role: "activity",
          id: "70000000-0000-4000-8000-000000000041",
          name: "Run",
          intervals: [
            {
              id: intervalId,
              name: "Mixed set",
              repetitions: 3,
              steps: [
                {
                  id: "70000000-0000-4000-8000-000000000043",
                  name: "Timed",
                  duration: { type: "time", seconds: 120 },
                  targets: [{ type: "RPE", intensity: 5 }],
                },
                {
                  id: "70000000-0000-4000-8000-000000000044",
                  name: "Distance",
                  duration: { type: "distance", meters: 400 },
                  targets: [{ type: "RPE", intensity: 6 }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(summarizeCompiledActivityPlanInterval(plan, intervalId)).toEqual({
      hasOpenDuration: false,
      hasPartialQuantities: true,
      perRepeat: { distanceMeters: 400, repetitionCount: 0, timedSeconds: 120 },
      repetitions: 3,
      total: { distanceMeters: 1200, repetitionCount: 0, timedSeconds: 360 },
    });
  });

  it("keeps target coverage out of the structural statistics helper", () => {
    const plan = compileActivityPlan({
      version: 3,
      activity_category: "bike",
      segments: [
        {
          role: "activity",
          id: "70000000-0000-4000-8000-000000000031",
          name: "Partial bike",
          intervals: [
            {
              id: "70000000-0000-4000-8000-000000000032",
              name: "Main",
              repetitions: 1,
              steps: [
                {
                  id: "70000000-0000-4000-8000-000000000033",
                  name: "Power",
                  duration: { type: "time", seconds: 1800 },
                  targets: [{ type: "%FTP", intensity: 80 }],
                },
                {
                  id: "70000000-0000-4000-8000-000000000034",
                  name: "RPE only",
                  duration: { type: "time", seconds: 1800 },
                  targets: [{ type: "RPE", intensity: 5 }],
                },
              ],
            },
          ],
        },
      ],
    });

    const dose = calculateActivityPlanStats(plan).categoryDoses[0];
    expect(dose).toMatchObject({
      activity_category: "bike",
      occurrenceCount: 2,
      timedActiveSeconds: 3600,
    });
    expect(dose).not.toHaveProperty("cyclingPower");
  });
});
