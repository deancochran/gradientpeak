import { renderHook } from "@testing-library/react-native";
import { createPrescriptionQuantificationBundleFixture } from "@/components/shared/__tests__/activityQuantificationFixture";

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
          activity_category: "bike",
          structure: {},
        }),
        fetchedPlan: {
          id: "db-plan",
          activity_category: "swim",
          structure: {},
        },
        formatDuration: (seconds) => `${seconds / 60}m`,
        isScheduled: true,
        plannedActivity: {
          activity_plan: {
            id: "planned-plan",
            activity_category: "run",
            profile_id: "profile-1",
            prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
              durationSeconds: 3_600,
              id: "planned-plan",
            }),
            structure: {
              version: 3,
              segments: [
                {
                  id: "00000000-0000-4000-8000-000000000001",
                  role: "activity",
                  name: "Run",
                  activity_category: "run",
                  intervals: [
                    {
                      id: "00000000-0000-4000-8000-000000000002",
                      name: "Tempo",
                      repetitions: 2,
                      steps: [
                        {
                          id: "00000000-0000-4000-8000-000000000003",
                          duration: { type: "time", seconds: 600 },
                          name: "Tempo",
                          targets: [{ type: "RPE", intensity: 6 }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        profile: { id: "profile-1" },
        template: JSON.stringify({
          id: "template-plan",
          activity_category: "other",
          structure: {},
        }),
      }),
    );

    expect(result.current.activityPlan.id).toBe("planned-plan");
    expect(result.current.durationLabel).toBe("60m");
    expect(result.current.steps).toHaveLength(2);
    expect(result.current.detailBadges).toEqual(["run", "Scheduled"]);
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
        template: "{still bad",
      }),
    );

    expect(result.current.activityPlan).toBeNull();
    expect(result.current.detailBadges).toEqual([]);
  });
});
