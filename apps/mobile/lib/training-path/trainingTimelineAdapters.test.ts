import { buildTrainingTimelineWindow } from "@repo/core/training-timeline";
import { describe, expect, it } from "vitest";
import { buildDailyTrainingAdjustmentPointsFromTimelineWindow } from "./trainingTimelineAdapters";

describe("buildDailyTrainingAdjustmentPointsFromTimelineWindow", () => {
  it("keeps completed, scheduled, tentative, and recommended loads semantically distinct", () => {
    const timelineWindow = buildTrainingTimelineWindow({
      today: "2026-06-01",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      loadPoints: [
        {
          date: "2026-06-01",
          completed_load_tss: 35,
          scheduled_load_tss: 40,
          tentative_scheduled_load_tss: 10,
          recommended_load_tss: 50,
        },
        {
          date: "2026-06-02",
          scheduled_load_tss: 30,
          tentative_scheduled_load_tss: 5,
          recommended_load_tss: 45,
        },
      ],
    });

    const points = buildDailyTrainingAdjustmentPointsFromTimelineWindow({ timelineWindow });

    expect(points[0]).toMatchObject({
      plannedLoadTss: 40,
      tentativePlannedLoadTss: 10,
      completedLoadTss: 35,
      targetLoadTss: 50,
      actualOrScheduledLoadTss: 50,
      loadDeltaTss: 0,
      plannedDeltaTss: 0,
    });
    expect(points[1]).toMatchObject({
      plannedLoadTss: 30,
      tentativePlannedLoadTss: 5,
      completedLoadTss: 0,
      targetLoadTss: 45,
      actualOrScheduledLoadTss: 35,
      loadDeltaTss: -10,
      plannedDeltaTss: -10,
    });
  });
});
