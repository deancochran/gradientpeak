import { describe, expect, it } from "vitest";
import { compileActivityPlanV3 } from "./activity-plan";
import {
  calculateActivityPlanStats,
  extractActivityProfile,
  getOccurrenceAtElapsedTime,
} from "./activity-plan-calculations";

describe("activity plan calculations", () => {
  it("preserves the single-segment timed cycling golden", () => {
    const plan = compileActivityPlanV3({
      version: 3,
      segments: [
        {
          role: "activity",
          id: "70000000-0000-4000-8000-000000000001",
          name: "Bike",
          category: "bike",
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
      categoryDoses: [
        { category: "bike", cyclingPower: { averageFtpPercent: 80, estimatedTss: 64 } },
      ],
    });
    expect(extractActivityProfile(plan)[0]).toMatchObject({
      durationSeconds: 3600,
      cumulativeExactSeconds: 0,
      category: "bike",
    });
    expect(getOccurrenceAtElapsedTime(plan, 1800)).toMatchObject({
      elapsedSeconds: 1800,
      progress: 0.5,
    });
  });

  it("does not average load or elapsed time across sport and completion domains", () => {
    const plan = compileActivityPlanV3({
      version: 3,
      segments: [
        {
          role: "activity",
          id: "70000000-0000-4000-8000-000000000011",
          name: "Bike",
          category: "bike",
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
          category: "run",
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
    });
    const stats = calculateActivityPlanStats(plan);
    expect(stats.duration.exactElapsedSeconds).toBeNull();
    expect(stats.categoryDoses).toEqual([
      expect.objectContaining({ category: "bike", cyclingPower: expect.any(Object) }),
      expect.not.objectContaining({ cyclingPower: expect.anything() }),
    ]);
    expect(getOccurrenceAtElapsedTime(plan, 700)).toBeNull();
  });

  it("sums variable-intensity cycling stress per occurrence instead of squaring mean IF", () => {
    const plan = compileActivityPlanV3({
      version: 3,
      segments: [
        {
          role: "activity",
          id: "70000000-0000-4000-8000-000000000021",
          name: "Variable bike",
          category: "bike",
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

    expect(calculateActivityPlanStats(plan).categoryDoses[0]?.cyclingPower).toMatchObject({
      averageFtpPercent: 75,
      evidenceSeconds: 3600,
      eligibleTimedSeconds: 3600,
      evidenceCoverage: 1,
      complete: true,
      estimatedTss: 62.5,
    });
  });

  it("marks cycling load partial when timed bike dose lacks power evidence", () => {
    const plan = compileActivityPlanV3({
      version: 3,
      segments: [
        {
          role: "activity",
          id: "70000000-0000-4000-8000-000000000031",
          name: "Partial bike",
          category: "bike",
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

    expect(calculateActivityPlanStats(plan).categoryDoses[0]?.cyclingPower).toMatchObject({
      evidenceSeconds: 1800,
      eligibleTimedSeconds: 3600,
      evidenceCoverage: 0.5,
      complete: false,
      estimatedTss: 32,
    });
  });
});
