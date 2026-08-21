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
      recommended_common_load_status: "complete",
      scheduled_common_load: 75,
      scheduled_common_load_status: "complete",
      completed_common_load: 30,
      completed_common_load_status: "complete",
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

  it("preserves unavailable planned load and a partial weekly subtotal", () => {
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
        recommended_common_load: 0,
        recommended_common_load_status: "partial",
        scheduled_common_load: 10,
        scheduled_common_load_status: "complete",
        completed_common_load: 5,
        completed_common_load_status: "complete",
      },
    ]);
  });

  it("keeps a missing planned value unavailable instead of inventing zero", () => {
    expect(normalizeTrainingLoadTimelinePoint({ date: "2026-07-08" })).toMatchObject({
      recommended_common_load: null,
      recommended_common_load_status: "unavailable",
      scheduled_common_load: null,
      scheduled_common_load_status: "unavailable",
      completed_common_load: null,
      completed_common_load_status: "unavailable",
    });
  });

  it("keeps an explicitly established empty day as known zero", () => {
    expect(
      normalizeTrainingLoadTimelinePoint({
        date: "2026-07-08",
        recommended_common_load: 0,
        scheduled_common_load: 0,
      }),
    ).toMatchObject({
      recommended_common_load: 0,
      recommended_common_load_status: "known_zero",
      scheduled_common_load: 0,
      scheduled_common_load_status: "known_zero",
    });
  });

  it("rejects status/value contradictions", () => {
    expect(
      trainingLoadTimelineInputPointSchema.safeParse({
        date: "2026-07-08",
        completed_common_load: null,
        completed_common_load_status: "known_zero",
      }).success,
    ).toBe(false);
  });
});
