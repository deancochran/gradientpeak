import { renderHook } from "@testing-library/react-native";

jest.mock("@repo/core", () => ({
  __esModule: true,
  buildEstimationContext: ({ activityPlan }: any) => ({ activityPlan }),
  decodePolyline: jest.fn(() => [
    { latitude: 10, longitude: 20 },
    { latitude: 11, longitude: 21 },
  ]),
  estimateActivity: jest.fn(() => ({ duration: 3600, tss: 42.4, intensityFactor: 0.83 })),
}));

jest.mock("@/lib/utils/durationConversion", () => ({
  __esModule: true,
  getDurationMs: () => 600000,
}));

import { useActivityPlanDetailViewModel } from "../useActivityPlanDetailViewModel";

describe("useActivityPlanDetailViewModel", () => {
  it("prefers planned activity plan over other sources and derives overview data", () => {
    const { result } = renderHook(() =>
      useActivityPlanDetailViewModel({
        activityPlanParam: JSON.stringify({
          id: "param-plan",
          activity_category: "ride",
          structure: {},
        }),
        fetchedPlan: { id: "db-plan", activity_category: "swim", structure: {} },
        formatDuration: (seconds) => `${seconds / 60}m`,
        isScheduled: true,
        plannedActivity: {
          activity_plan: {
            id: "planned-plan",
            activity_category: "run",
            profile_id: "profile-1",
            estimated_tss: 30,
            authoritative_metrics: {
              estimated_duration: 3600,
              estimated_tss: 42,
              intensity_factor: 0.83,
            },
            structure: {
              intervals: [
                {
                  repetitions: 2,
                  steps: [
                    { id: "step-1", duration: { type: "time", seconds: 600 }, name: "Tempo" },
                  ],
                },
              ],
            },
          },
        },
        profile: { id: "profile-1" },
        route: { polyline: "abc" },
        template: JSON.stringify({ id: "template-plan", activity_category: "hike", structure: {} }),
      }),
    );

    expect(result.current.activityPlan.id).toBe("planned-plan");
    expect(result.current.durationLabel).toBe("60m");
    expect(result.current.tss).toBe(42);
    expect(result.current.intensityFactor).toBe(0.83);
    expect(result.current.steps).toHaveLength(2);
    expect(result.current.detailBadges).toEqual(["run", "Scheduled"]);
    expect(result.current.routePreview?.coordinates).toHaveLength(2);
  });

  it("falls back through malformed params without crashing", () => {
    const { result } = renderHook(() =>
      useActivityPlanDetailViewModel({
        activityPlanParam: "{bad json",
        fetchedPlan: null,
        formatDuration: (seconds) => `${seconds / 60}m`,
        isScheduled: false,
        plannedActivity: null,
        profile: { id: "profile-1" },
        route: null,
        template: "{still bad",
      }),
    );

    expect(result.current.activityPlan).toBeNull();
    expect(result.current.detailBadges).toEqual([]);
    expect(result.current.routePreview).toBeNull();
  });
});
