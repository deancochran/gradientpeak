import { describe, expect, it } from "vitest";
import { buildTrainingPreferencesLoadTimeline } from "./projectionPreview";

type TimelineInput = Parameters<typeof buildTrainingPreferencesLoadTimeline>[0];

describe("buildTrainingPreferencesLoadTimeline", () => {
  it("uses canonical daily load points instead of projection display totals", () => {
    const timeline = buildTrainingPreferencesLoadTimeline({
      snapshot: { insightTimeline: { timeline: [] } } as unknown as TimelineInput["snapshot"],
      projectionChart: {
        start_date: "2026-01-05",
        end_date: "2026-01-05",
        points: [
          {
            date: "2026-01-05",
            predicted_load: 300,
            predicted_fitness_longTermLoad: 40,
            predicted_fatigue_recentLoad: 45,
            predicted_form_loadBalance: -5,
            readiness_score: 50,
          },
        ],
        daily_load_points: [
          {
            date: "2026-01-05",
            recommended_load: 72,
            primary_focus: "endurance",
            activity_category: "run",
            confidence: "high",
            reason_codes: ["daily_load_distribution_v1"],
          },
        ],
        goal_markers: [],
        periodization_phases: [],
        microcycles: [],
      },
    });

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.recommended_common_load).toBe(72);
  });

  it("does not reinterpret projection display totals as daily recommended Load", () => {
    const timeline = buildTrainingPreferencesLoadTimeline({
      snapshot: { insightTimeline: { timeline: [] } } as unknown as TimelineInput["snapshot"],
      projectionChart: {
        start_date: "2026-01-05",
        end_date: "2026-01-05",
        points: [
          {
            date: "2026-01-05",
            predicted_load: 123.4,
            predicted_fitness_longTermLoad: 40,
            predicted_fatigue_recentLoad: 45,
            predicted_form_loadBalance: -5,
            readiness_score: 50,
          },
        ],
        goal_markers: [],
        periodization_phases: [],
        microcycles: [],
      },
    });

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.recommended_common_load).toBeNull();
  });

  it("adds daily load dates beyond canonical projection points", () => {
    const timeline = buildTrainingPreferencesLoadTimeline({
      snapshot: { insightTimeline: { timeline: [] } } as unknown as TimelineInput["snapshot"],
      projectionChart: {
        start_date: "2026-01-05",
        end_date: "2026-01-06",
        points: [
          {
            date: "2026-01-05",
            predicted_load: 80,
            predicted_fitness_longTermLoad: 40,
            predicted_fatigue_recentLoad: 45,
            predicted_form_loadBalance: -5,
            readiness_score: 50,
          },
        ],
        daily_load_points: [
          {
            date: "2026-01-06",
            recommended_load: 42,
            primary_focus: "recovery",
            activity_category: "run",
            confidence: "medium",
            reason_codes: ["daily_load_distribution_v1"],
          },
        ],
        goal_markers: [],
        periodization_phases: [],
        microcycles: [],
      },
    });

    expect(timeline.map((point) => point.date)).toEqual(["2026-01-05", "2026-01-06"]);
    expect(timeline[1]?.recommended_common_load).toBe(42);
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
      expect.objectContaining({ scheduled_common_load: 0 }),
      expect.objectContaining({ scheduled_common_load: 0 }),
    ]);
  });
});
