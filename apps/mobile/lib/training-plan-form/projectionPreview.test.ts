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

  it("falls back to legacy display points when canonical daily load points are missing", () => {
    const timeline = buildTrainingPreferencesLoadTimeline({
      snapshot: { insightTimeline: { timeline: [] } } as unknown as TimelineInput["snapshot"],
      projectionChart: {
        display_points: [
          {
            date: "2026-01-05",
            predicted_load_tss: 123.4,
            predicted_fitness_ctl: 40,
            predicted_fatigue_atl: 45,
            predicted_form_tsb: -5,
            readiness_score: 50,
          },
        ],
      } as ProjectionChartPayload,
    });

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.recommended_load_tss).toBe(123);
  });

  it("adds canonical daily load dates even when they are absent from display points", () => {
    const timeline = buildTrainingPreferencesLoadTimeline({
      snapshot: { insightTimeline: { timeline: [] } } as unknown as TimelineInput["snapshot"],
      projectionChart: {
        display_points: [
          {
            date: "2026-01-05",
            predicted_load_tss: 80,
            predicted_fitness_ctl: 40,
            predicted_fatigue_atl: 45,
            predicted_form_tsb: -5,
            readiness_score: 50,
          },
        ],
        daily_load_points: [
          {
            date: "2026-01-06",
            recommended_load_tss: 42,
            primary_focus: "recovery",
            activity_category: "run",
            confidence: "medium",
            reason_codes: ["daily_load_distribution_v1"],
          },
        ],
      } as ProjectionChartPayload,
    });

    expect(timeline.map((point) => point.date)).toEqual(["2026-01-05", "2026-01-06"]);
    expect(timeline[1]?.recommended_load_tss).toBe(42);
  });

  it("keeps an expanded chart window available beyond projection and schedule data", () => {
    const timeline = buildTrainingPreferencesLoadTimeline({
      snapshot: { insightTimeline: { timeline: [] } } as unknown as TimelineInput["snapshot"],
      projectionChart: null,
      scheduledWindowStart: "2024-01-01",
      scheduledWindowEnd: "2028-12-31",
    });

    expect(timeline.map((point) => point.date)).toEqual(["2024-01-01", "2028-12-31"]);
    expect(timeline).toEqual([
      expect.objectContaining({ scheduled_load_tss: 0 }),
      expect.objectContaining({ scheduled_load_tss: 0 }),
    ]);
  });
});
