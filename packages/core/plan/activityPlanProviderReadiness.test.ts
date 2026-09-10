import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../activity-plan";
import { getActivityPlanProviderProjection } from "./activityPlanProviderReadiness";

const structure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      role: "rest",
      name: "Recovery",
      duration: { type: "time", seconds: 60 },
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      role: "activity",
      name: "Run",
      intervals: [
        {
          id: "00000000-0000-4000-8000-000000000003",
          name: "Main set",
          repetitions: 1,
          steps: [
            {
              id: "00000000-0000-4000-8000-000000000004",
              name: "Easy",
              duration: { type: "time", seconds: 300 },
              targets: [{ type: "RPE", intensity: 3 }],
            },
          ],
        },
      ],
    },
  ],
});

describe("activity plan provider readiness labels", () => {
  it("uses the selected provider manifest label in generic boundary findings", () => {
    const projection = getActivityPlanProviderProjection({ provider: "strava", structure });
    const boundary = projection.findings.find(
      (finding) => finding.reasonCode === "unsupported_boundary",
    );

    expect(boundary?.message).toBe("Strava cannot preserve rest boundaries.");
    expect(boundary?.message).not.toContain("Wahoo");
  });
});
