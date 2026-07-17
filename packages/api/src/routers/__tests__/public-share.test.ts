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
        type: "ride",
        notes: "Sunny tempo work",
        started_at: new Date("2026-07-16T12:00:00.000Z"),
        finished_at: new Date("2026-07-16T13:15:00.000Z"),
        duration_seconds: 4500,
        moving_seconds: 4300,
        distance_meters: 30250,
        elevation_gain_meters: "420.5",
        calories: 650,
        avg_heart_rate: 142,
        max_heart_rate: 172,
        avg_power: 205,
        max_power: 540,
        avg_speed_mps: "7.1",
        max_speed_mps: "13.2",
        likes_count: "3",
        owner_id: "00000000-0000-4000-8000-000000000003",
        owner_name: "Alex Athlete",
        owner_username: "alex",
        owner_avatar_url: "https://example.test/avatar.png",
        activity_file_path: "must-not-leak.fit",
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
  });
});
