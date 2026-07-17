import { activityPlanStructureSchemaV3 } from "@repo/core";
import { describe, expect, it } from "vitest";

import { publicShareRouter } from "../public-share";

function createCaller(rows: unknown[]) {
  const executeCalls: unknown[] = [];
  const db = {
    execute: async (query: unknown) => {
      executeCalls.push(query);
      return { rows };
    },
  };

  const caller = publicShareRouter.createCaller({
    db,
    headers: new Headers(),
    session: null,
    authSession: null,
    clientType: "web",
    trpcSource: "vitest-public-share",
    auth: {
      lookupInput: { headers: new Headers(), clientType: "web" },
      session: null,
    },
  } as never);

  return { caller, executeCalls };
}

describe("publicShareRouter", () => {
  it("returns null for unavailable activities so private and missing reads are indistinguishable", async () => {
    const { caller } = createCaller([]);

    await expect(
      caller.activity({ id: "00000000-0000-4000-8000-000000000001" }),
    ).resolves.toBeNull();
  });

  it("maps public activities to a safe DTO", async () => {
    const { caller } = createCaller([
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Morning ride",
        notes: "Sunny tempo work",
        started_at: new Date("2026-07-16T12:00:00.000Z"),
        finished_at: new Date("2026-07-16T13:15:00.000Z"),
        elapsed_ms: 4_500_000,
        active_ms: 4_400_000,
        moving_ms: 4_300_000,
        timing_coverage: "complete",
        distance_meters: 30250,
        elevation_gain_meters: "420.5",
        calories: 650,
        avg_heart_rate: 142,
        max_heart_rate: 172,
        avg_power: 205,
        max_power: 540,
        avg_speed_mps: "7.1",
        max_speed_mps: "13.2",
        segments: [
          {
            id: "00000000-0000-4000-8000-000000000004",
            ordinal: 0,
            role: "activity",
            category: "bike",
            startOffsetMs: 0,
            endOffsetMs: 4_500_000,
            summary: {
              version: 1,
              timing: { timingCoverage: "complete", activeMs: 4_400_000, movingMs: 4_300_000 },
            },
          },
        ],
        current_artifact: {
          id: "00000000-0000-4000-8000-000000000005",
          digest_algorithm: "sha256",
          digest: "a".repeat(64),
          byte_size: "1234",
          media_type: "application/vnd.ant.fit",
          format: "fit",
          original_name: "ride.fit",
          availability: "accepted",
          first_accepted_at: new Date("2026-07-16T13:16:00.000Z"),
          path: "must-not-leak.fit",
        },
        likes_count: "3",
        owner_id: "00000000-0000-4000-8000-000000000003",
        owner_name: "Alex Athlete",
        owner_username: "alex",
        owner_avatar_url: "https://example.test/avatar.png",
      },
    ]);

    const activity = await caller.activity({ id: "00000000-0000-4000-8000-000000000002" });

    expect(activity).toMatchObject({
      id: "00000000-0000-4000-8000-000000000002",
      name: "Morning ride",
      started_at: "2026-07-16T12:00:00.000Z",
      elevation_gain_meters: 420.5,
      likes_count: 3,
      owner: { username: "alex" },
    });
    expect(activity).not.toHaveProperty("activity_file_path");
    expect(activity?.current_artifact).not.toHaveProperty("path");
  });

  it("returns only modern V3 public workout fields", async () => {
    const id = "00000000-0000-4000-8000-000000000010";
    const structure = activityPlanStructureSchemaV3.parse({
      version: 3,
      segments: [
        {
          id: "00000000-0000-4000-8000-000000000011",
          role: "activity",
          category: "run",
          name: "Run",
          intervals: [
            {
              id: "00000000-0000-4000-8000-000000000012",
              name: "Run interval",
              repetitions: 1,
              steps: [
                {
                  id: "00000000-0000-4000-8000-000000000013",
                  name: "Easy run",
                  duration: { type: "time", seconds: 1800 },
                  targets: [{ type: "RPE", intensity: 5 }],
                },
              ],
            },
          ],
        },
      ],
    });
    const { caller } = createCaller([
      {
        id,
        name: "Public brick",
        description: null,
        notes: null,
        structure,
        structure_hash: `v1:sha256:${"a".repeat(64)}`,
        gps_recording_enabled: true,
        template_visibility: "public",
        is_system_template: false,
        created_at: new Date("2026-07-16T12:00:00.000Z"),
        updated_at: new Date("2026-07-16T12:00:00.000Z"),
        owner_id: null,
        owner_name: null,
        owner_username: null,
        owner_avatar_url: null,
        activity_category: "must-not-leak",
        version: "must-not-leak",
      },
    ]);

    const workout = await caller.workout({ id });

    expect(workout).toMatchObject({ id, structure, structure_hash: `v1:sha256:${"a".repeat(64)}` });
    expect(workout).not.toHaveProperty("activity_category");
    expect(workout).not.toHaveProperty("version");
  });
});
