import { describe, expect, it } from "vitest";
import { buildBaselineDailyRecommendedTssByDate } from "../planning/training-plans/base";

describe("baseline daily recommendation safety", () => {
  it("does not populate target maps when plan sessions omit activity_category", () => {
    const targets = buildBaselineDailyRecommendedTssByDate({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      structure: { sessions: [{ offset_days: 1, estimated_tss: 60 }] },
      blocks: [
        {
          start_date: "2026-01-05",
          end_date: "2026-01-11",
          target_weekly_tss_range: { min: 280, max: 320 },
        },
      ],
      hasActivityHistory: true,
    });

    expect(targets.size).toBe(0);
  });
});
