import { describe, expect, it } from "vitest";
import {
  normalizeTrainingLoadTimelinePoint,
  trainingLoadTimelineInputPointSchema,
} from "../trainingLoadTimeline";

describe("training load timeline", () => {
  it("emits only canonical load fields", () => {
    const point = normalizeTrainingLoadTimelinePoint({
      date: "2026-07-09",
      recommended_load_tss: 90.04,
      scheduled_load_tss: 75,
      tentative_scheduled_load_tss: 10,
      completed_load_tss: 30,
    });

    expect(point).toMatchObject({
      date: "2026-07-09",
      recommended_load_tss: 90,
      scheduled_load_tss: 75,
      tentative_scheduled_load_tss: 10,
      completed_load_tss: 30,
    });
    expect(point).not.toHaveProperty("ideal_tss");
    expect(point).not.toHaveProperty("scheduled_tss");
    expect(point).not.toHaveProperty("actual_tss");
  });

  it("rejects legacy load aliases", () => {
    expect(
      trainingLoadTimelineInputPointSchema.safeParse({
        date: "2026-07-09",
        ideal_tss: 90,
      }).success,
    ).toBe(false);
  });
});
