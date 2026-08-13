import { activityPlanStructureSchema } from "@repo/core";
import { describe, expect, it } from "vitest";
import { toActivityPlanSummary } from "./read-projections";

const PLAN_ID = "80000000-0000-4000-8000-000000000001";
const PROFILE_ID = "90000000-0000-4000-8000-000000000001";

const structure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "bike",
  segments: [
    {
      role: "activity",
      id: "70000000-0000-4000-8000-000000000001",
      name: "Scheduled bike",
      intervals: [
        {
          id: "70000000-0000-4000-8000-000000000002",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "70000000-0000-4000-8000-000000000003",
              name: "Steady",
              duration: { type: "time", seconds: 1_800 },
              targets: [{ type: "%FTP", intensity: 75 }],
            },
          ],
        },
      ],
    },
  ],
});

describe("toActivityPlanSummary", () => {
  it("normalizes malformed owner presentation fields", () => {
    const result = toActivityPlanSummary(
      {
        id: PLAN_ID,
        profile_id: PROFILE_ID,
        name: "Bike plan",
        structure,
        structure_hash: `v1:sha256:${"a".repeat(64)}`,
        gps_recording_enabled: true,
        content_visibility: "private",
        is_system_template: false,
        created_at: "2026-07-17T08:00:00.000Z",
        updated_at: "2026-07-17T08:00:00.000Z",
        owner: { username: " ", avatar_url: "/legacy-avatar.png" },
      },
      PROFILE_ID,
    );

    expect(result.owner).toEqual({ id: PROFILE_ID, username: null, avatarUrl: null });
  });
});
