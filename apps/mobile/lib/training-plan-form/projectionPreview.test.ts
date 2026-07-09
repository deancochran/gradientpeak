import type { ProjectionChartPayload } from "@repo/core/plan/projectionTypes";
import { describe, expect, it } from "vitest";
import { buildTrainingPreferencesLoadTimeline } from "./projectionPreview";

type TimelineInput = Parameters<typeof buildTrainingPreferencesLoadTimeline>[0];

describe("buildTrainingPreferencesLoadTimeline", () => {
  it("uses canonical daily load points before legacy projection display points", () => {
    const timeline = buildTrainingPreferencesLoadTimeline({
      snapshot: { insightTimeline: { timeline: [] } } as unknown as TimelineInput["snapshot"],
      projectionChart: {
        display_points: [
          {
            date: "2026-01-05",
            predicted_load_tss: 300,
            predicted_fitness_ctl: 40,
            predicted_fatigue_atl: 45,
            predicted_form_tsb: -5,
            readiness_score: 50,
          },
        ],
        daily_load_points: [
          {
            date: "2026-01-05",
            recommended_load_tss: 72,
            primary_focus: "endurance",
            activity_category: "run",
            confidence: "high",
            reason_codes: ["daily_load_distribution_v1"],
          },
        ],
      } as ProjectionChartPayload,
    });

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.recommended_load_tss).toBe(72);
  });
});
