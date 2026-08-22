import { describe, expect, it } from "vitest";

import { publicShareRouter } from "../public-share";

const ids = {
  activity: "00000000-0000-4000-8000-000000000101",
  activityPlan: "00000000-0000-4000-8000-000000000102",
  trainingPlan: "00000000-0000-4000-8000-000000000103",
};

const activityPlanStructure = {
  version: 3 as const,
  activity_category: "run" as const,
  segments: [
    {
      id: "00000000-0000-4000-8000-000000000104",
      role: "activity" as const,
      name: "Main set",
      intervals: [
        {
          id: "00000000-0000-4000-8000-000000000105",
          name: "Steady",
          repetitions: 1,
          steps: [
            {
              id: "00000000-0000-4000-8000-000000000106",
              name: "Run",
              duration: { type: "time" as const, seconds: 600 },
              targets: [{ type: "RPE" as const, intensity: 6 }],
            },
          ],
        },
      ],
    },
  ],
};

function createCaller(rows: unknown[]) {
  let call = 0;
  const db = { execute: async () => ({ rows: rows[call++] ? [rows[call - 1]] : [] }) };
  return publicShareRouter.createCaller({
    db,
    headers: new Headers(),
    session: null,
    authSession: null,
    clientType: "web",
    trpcSource: "vitest-capability-p0-public-share",
    auth: { lookupInput: { headers: new Headers(), clientType: "web" }, session: null },
  } as never);
}

describe("P0 public-share API outcomes", () => {
  it("returns safe public DTOs for activity, activity plan, and training plan links", async () => {
    const caller = createCaller([
      {
        id: ids.activity,
        notes: "Easy morning run",
        started_at: new Date("2026-08-20T07:00:00.000Z"),
        elapsed_ms: 1_800_000,
        moving_ms: 1_700_000,
        timing_coverage: "complete",
        distance_meters: 5000,
        elevation_gain_meters: "42.5",
        calories: 300,
        avg_heart_rate: 145,
        max_heart_rate: 165,
        avg_power: null,
        max_power: null,
        activity_categories: ["run"],
        current_artifact: { format: "fit", original_name: "run.fit" },
        likes_count: "2",
        owner_name: "Public Runner",
        owner_username: "runner",
      },
      {
        id: ids.activityPlan,
        name: "Public Tempo",
        description: "A public workout",
        structure: activityPlanStructure,
        updated_at: new Date("2026-08-20T07:00:00.000Z"),
        is_system_template: false,
        owner_name: "Public Runner",
        owner_username: "runner",
      },
      {
        id: ids.trainingPlan,
        name: "Public Base Plan",
        description: "A public training plan",
        structure: {
          id: ids.trainingPlan,
          version: 1 as const,
          sessions: [{ offset_days: 0, activity_plan_id: ids.activityPlan }],
        },
        sessions_per_week_target: 3,
        duration_hours: "4.5",
        is_system_template: false,
        owner_name: "Public Runner",
        owner_username: "runner",
      },
    ]);

    await expect(caller.activity({ id: ids.activity })).resolves.toMatchObject({
      id: ids.activity,
      performance: { elapsedSeconds: 1800, elevationGainMeters: 42.5 },
      sourceArtifact: { format: "fit", originalName: "run.fit" },
      owner: { name: "Public Runner", username: "runner" },
    });
    await expect(caller.activityPlan({ id: ids.activityPlan })).resolves.toMatchObject({
      id: ids.activityPlan,
      name: "Public Tempo",
      structure: { version: 3, activity_category: "run" },
      metrics: expect.arrayContaining([expect.objectContaining({ key: "elapsed_duration" })]),
    });
    await expect(caller.trainingPlan({ id: ids.trainingPlan })).resolves.toEqual({
      id: ids.trainingPlan,
      name: "Public Base Plan",
      description: "A public training plan",
      structure_summary: "Structured plan details",
      sessions_per_week_target: 3,
      duration_hours: 4.5,
      is_system_template: false,
      owner: { name: "Public Runner", username: "runner" },
    });
  });

  it("returns null for unavailable ids across all three public readers", async () => {
    const caller = createCaller([]);
    await expect(caller.activity({ id: ids.activity })).resolves.toBeNull();
    await expect(caller.activityPlan({ id: ids.activityPlan })).resolves.toBeNull();
    await expect(caller.trainingPlan({ id: ids.trainingPlan })).resolves.toBeNull();
  });
});
