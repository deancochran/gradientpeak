import { renderHook } from "@testing-library/react-native";
import {
  createActivityPlanDetail,
  createActivityPlanSummary,
} from "../../../test/activity-plan-projection-fixture";

jest.mock("@/lib/utils/durationConversion", () => ({
  __esModule: true,
  getDurationMs: () => 600000,
}));

import { useActivityPlanDetailViewModel } from "../useActivityPlanDetailViewModel";

describe("useActivityPlanDetailViewModel", () => {
  it("prefers planned activity plan over other sources and derives overview data", async () => {
    const { result } = await renderHook(() =>
      useActivityPlanDetailViewModel({
        activityPlanParam: JSON.stringify({
          id: "param-plan",
          activity_category: "bike",
          structure: {},
        }),
        fetchedPlan: createActivityPlanDetail({ id: "db-plan", activityCategory: "swim" }),
        formatDuration: (seconds) => `${seconds / 60}m`,
        isScheduled: true,
        plannedActivity: {
          activityPlanSummary: createActivityPlanSummary({
            id: "planned-plan",
            activityCategory: "run",
            metrics: [
              {
                key: "elapsed_duration",
                label: "Duration",
                value: 3_600,
                unit: "seconds",
                status: "available",
                reason: null,
                provenance: "authored",
              },
            ],
            structure: {
              version: 3,
              activity_category: "run",
              segments: [
                {
                  id: "00000000-0000-4000-8000-000000000001",
                  role: "activity",
                  name: "Run",
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
          }),
        },
        profile: { id: "profile-1" },
        template: JSON.stringify({
          id: "template-plan",
          activity_category: "other",
          structure: {},
        }),
      }),
    );

    expect(result.current.activityPlan?.id).toBe("planned-plan");
    expect(result.current.durationLabel).toBe("60m");
    expect(result.current.steps).toHaveLength(2);
    expect(result.current.detailBadges).toEqual(["run", "Scheduled"]);
  });

  it("falls back through malformed params without crashing", async () => {
    const { result } = await renderHook(() =>
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

  it("keeps unavailable duration unavailable instead of using an explicit timed fragment", async () => {
    const { result } = await renderHook(() =>
      useActivityPlanDetailViewModel({
        fetchedPlan: createActivityPlanDetail({
          metrics: [
            {
              key: "elapsed_duration",
              label: "Duration",
              status: "unavailable",
              value: null,
              unit: "seconds",
              reason: "incomplete_members",
              provenance: null,
            },
          ],
        }),
        formatDuration: (seconds) => `${seconds / 60}m`,
        isScheduled: false,
        plannedActivity: null,
        profile: null,
      }),
    );

    expect(result.current.durationMinutes).toBeNull();
    expect(result.current.durationLabel).toBe("—");
  });
});
