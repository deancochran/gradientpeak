import { describe, expect, it } from "vitest";
import {
  aggregateTrainingLoadTimelineByWeek,
  normalizeTrainingLoadTimelinePoint,
  trainingLoadTimelineInputPointSchema,
} from "../trainingLoadTimeline";

describe("training load timeline", () => {
  it("emits only canonical load fields", () => {
    const point = normalizeTrainingLoadTimelinePoint({
      date: "2026-07-09",
      recommended_common_load: 90.04,
      scheduled_common_load: 75,
      completed_common_load: 30,
    });

    expect(point).toMatchObject({
      date: "2026-07-09",
      recommended_common_load: 90,
      scheduled_common_load: 75,
      completed_common_load: 30,
    });
    expect(point).not.toHaveProperty("legacy_load_metric");
  });

  it("rejects unrecognized load fields", () => {
    expect(
      trainingLoadTimelineInputPointSchema.safeParse({
        date: "2026-07-09",
        legacy_load_metric: 90,
      }).success,
    ).toBe(false);
  });

  it("rejects the removed tentative load field", () => {
    expect(
      trainingLoadTimelineInputPointSchema.safeParse({
        date: "2026-07-09",
        tentative_scheduled_common_load: 10,
      }).success,
    ).toBe(false);
  });

  it("keeps unavailable load distinct from known zero through weekly aggregation", () => {
    expect(
      aggregateTrainingLoadTimelineByWeek([
        {
          date: "2026-07-06",
          recommended_common_load: 0,
          scheduled_common_load: 0,
          completed_common_load: 0,
        },
        {
          date: "2026-07-07",
          recommended_common_load: null,
          scheduled_common_load: 10,
          completed_common_load: 5,
        },
      ]),
    ).toEqual([
      {
        week_start: "2026-07-06",
        week_end: "2026-07-12",
        recommended_common_load: null,
        scheduled_common_load: 10,
        completed_common_load: 5,
      },
    ]);
  });
});
