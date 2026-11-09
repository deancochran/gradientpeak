import { activityPlanStructureSchema } from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { activityArtifactLinks, activitySegments, likes } from "@repo/db";
import { describe, expect, it } from "vitest";
import { publicShareRouter } from "../public-share";

const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });
function createCaller(rows: unknown[]) {
  const selectCalls: unknown[] = [];
  const activity = rows[0] as Record<string, unknown> | undefined;
  const db = {
    select: () => {
      let table: unknown;
      const builder = Object.assign(
        Promise.resolve().then(() => {
          selectCalls.push(table);
          if (table === activitySegments) {
            return (
              (activity?.activity_categories as string[] | undefined)?.map((category) => ({
                category,
              })) ?? []
            );
          }
          if (table === activityArtifactLinks)
            return activity?.current_artifact ? [activity.current_artifact] : [];
          if (table === likes) return [{ value: activity?.likes_count ?? 0 }];
          return rows;
        }),
        {
          from: (value: unknown) => {
            table = value;
            return builder;
          },
          leftJoin: () => builder,
          innerJoin: () => builder,
          where: () => builder,
          orderBy: () => builder,
          limit: () => builder,
        },
      );
      return builder;
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
  return { caller, selectCalls };
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
        activity_kind: "single",
        activity_categories: ["bike"],
        notes: "Sunny tempo work",
        started_at: new Date("2026-07-16T12:00:00.000Z"),
        finished_at: new Date("2026-07-16T13:15:00.000Z"),
        elapsed_ms: 4500000,
        active_ms: 4400000,
        moving_ms: 4300000,
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
            activity_category: "bike",
            startOffsetMs: 0,
            endOffsetMs: 4500000,
            summary: {
              version: 1,
              timing: { timingCoverage: "complete", activeMs: 4400000, movingMs: 4300000 },
              normalizedPowerResult: unavailableNormalizedPowerResult,
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
      startedAt: "2026-07-16T12:00:00.000Z",
      performance: { elevationGainMeters: 420.5 },
      likes: 3,
      owner: { username: "alex" },
    });
    expect(Object.keys(activity ?? {}).sort()).toEqual([
      "activityComposition",
      "id",
      "likes",
      "notes",
      "owner",
      "performance",
      "sourceArtifact",
      "startedAt",
    ]);
    expect(activity?.owner).not.toHaveProperty("id");
    expect(activity?.owner).not.toHaveProperty("avatar_url");
    expect(activity).not.toHaveProperty("activity_file_path");
    expect(activity?.sourceArtifact).not.toHaveProperty("path");
  });
  it("returns only the activity-plan fields rendered by the public route", async () => {
    const id = "00000000-0000-4000-8000-000000000010";
    const structure = activityPlanStructureSchema.parse({
      version: 5,
      activity_category: "run",
      items: [
        {
          type: "step",
          id: "00000000-0000-4000-8000-000000000013",
          name: "Easy run",
          instructions: "Keep the effort conversational.\n\nRelax your shoulders.",
          duration: { type: "time", seconds: 1800 },
          targets: [{ type: "RPE", intensity: 5 }],
        },
        {
          type: "step",
          id: "00000000-0000-4000-8000-000000000015",
          name: "Cool down",
          instructions: "Walk until your breathing settles.",
          duration: { type: "time", seconds: 300 },
          targets: [],
        },
      ],
    });
    const { caller } = createCaller([
      {
        id,
        name: "Public brick",
        description: null,
        notes: "Private instruction: hold RPE 8 for 20 minutes",
        structure,
        structure_hash: `v1:sha256:${"a".repeat(64)}`,
        gps_recording_enabled: true,
        content_visibility: "public",
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
    const activityPlan = await caller.activityPlan({ id });
    expect(activityPlan).toMatchObject({
      id,
      activity_category: "run",
      structure_version: 5,
      structure_summary: "Structured plan details",
      structure: {
        version: 5,
        activity_category: "run",
        items: [
          {
            type: "step",
            name: "Easy run",
            instructions: "Keep the effort conversational.\n\nRelax your shoulders.",
            duration: { type: "time", seconds: 1800 },
            targets: [{ type: "RPE", intensity: 5 }],
          },
          {
            type: "step",
            name: "Cool down",
            instructions: "Walk until your breathing settles.",
            duration: { type: "time", seconds: 300 },
            targets: [],
          },
        ],
      },
    });
    expect(Object.keys(activityPlan ?? {}).sort()).toEqual([
      "activity_category",
      "description",
      "id",
      "is_system_template",
      "metrics",
      "name",
      "owner",
      "structure",
      "structure_summary",
      "structure_version",
    ]);
    expect(activityPlan).not.toHaveProperty("structure_hash");
    expect(activityPlan).not.toHaveProperty("gps_recording_enabled");
    expect(activityPlan).not.toHaveProperty("content_visibility");
    expect(activityPlan).not.toHaveProperty("created_at");
    expect(activityPlan).not.toHaveProperty("updated_at");
    expect(activityPlan?.owner).not.toHaveProperty("id");
    expect(activityPlan?.owner).not.toHaveProperty("avatar_url");
    expect(JSON.stringify(activityPlan)).toMatch(/RPE|targets|duration|seconds/i);
    expect(activityPlan?.metrics).toEqual([
      expect.objectContaining({ key: "distance", status: "unavailable", provenance: null }),
      expect.objectContaining({
        key: "elapsed_duration",
        status: "available",
        value: 2100,
        provenance: "authored",
      }),
      expect.objectContaining({ key: "common_load", status: "unavailable", provenance: null }),
      expect.objectContaining({
        key: "objective_intensity",
        status: "unavailable",
        provenance: null,
      }),
    ]);
    expect(JSON.stringify(activityPlan?.metrics)).not.toMatch(
      /athlete|threshold|calibration|evidence/i,
    );
    const firstItem = activityPlan?.structure.items[0];
    if (!firstItem) throw new Error("Expected activity item");
    expect(firstItem).toHaveProperty("id", "00000000-0000-4000-8000-000000000013");
    expect(firstItem).toHaveProperty("type");
    expect(activityPlan?.structure.items[1]).toHaveProperty("id");
  });
  it("returns only the public route fields rendered by the public route page", async () => {
    const id = "00000000-0000-4000-8000-000000000030";
    const { caller } = createCaller([
      {
        id,
        name: "Public loop",
        description: "A scenic route.",
        total_distance: "5020",
        total_ascent: "120",
        total_descent: "120",
        polyline: "encoded-public-geometry",
        is_system_template: false,
        owner_name: "Alex Athlete",
        owner_username: "alex",
        file_path: "must-not-leak.gpx",
      },
    ]);
    await expect(caller.route({ id })).resolves.toEqual({
      id,
      name: "Public loop",
      description: "A scenic route.",
      totalDistanceMeters: 5020,
      totalAscentMeters: 120,
      totalDescentMeters: 120,
      isSystemTemplate: false,
      owner: { name: "Alex Athlete", username: "alex" },
    });
  });
  it("returns a canonical training-plan share without internal IDs at direct public tRPC", async () => {
    const id = "00000000-0000-4000-8000-000000000020";
    const secretActivityPlanId = "00000000-0000-4000-8000-000000000021";
    const structure = {
      id,
      version: 1 as const,
      plan_preferences: {
        weekly_session_count: null,
        target_weekly_duration_minutes: null,
        maximum_session_duration_minutes: null,
        preferred_weekdays: [],
        rest_days: [],
        progression_style: null,
        recovery_priority: null,
      },
      sessions: [
        {
          id: "00000000-0000-4000-8000-000000000023",
          activity_plan_id: secretActivityPlanId,
          offset_days: 0,
          demand: {
            activity_category: "run" as const,
            training_intent: "general_maintenance" as const,
            target_duration_minutes: 30,
            target_common_load: null,
            importance: "normal" as const,
          },
        },
      ],
      goal_blueprints: [
        {
          title: "Race objective",
          priority: 10,
          activity_category: "run" as const,
          target_offset_days: 40,
        },
      ],
    };
    const { caller } = createCaller([
      {
        id,
        name: "Public marathon plan",
        description: "Eight week plan",
        structure,
        structure_hash: `v1:sha256:${"b".repeat(64)}`,
        content_visibility: "public",
        sessions_per_week_target: 4,
        duration_hours: "6.5",
        is_system_template: false,
        created_at: new Date("2026-07-16T12:00:00.000Z"),
        updated_at: new Date("2026-07-17T12:00:00.000Z"),
        owner_id: "00000000-0000-4000-8000-000000000022",
        owner_name: "Alex Athlete",
        owner_username: "alex",
        owner_avatar_url: "https://example.test/private-avatar.png",
      },
    ]);
    const trainingPlan = await caller.trainingPlan({ id });
    const serialized = JSON.stringify(trainingPlan);
    expect(trainingPlan).toEqual({
      id,
      name: "Public marathon plan",
      description: "Eight week plan",
      structure_summary: "Structured plan details",
      sessions_per_week_target: 4,
      duration_hours: 6.5,
      is_system_template: false,
      owner: { name: "Alex Athlete", username: "alex" },
    });
    expect(serialized).not.toContain("plan_preferences");
    expect(serialized).not.toContain(secretActivityPlanId);
    expect(trainingPlan).not.toHaveProperty("structure_hash");
    expect(trainingPlan).not.toHaveProperty("content_visibility");
    expect(trainingPlan).not.toHaveProperty("created_at");
    expect(trainingPlan).not.toHaveProperty("updated_at");
    expect(trainingPlan?.owner).not.toHaveProperty("id");
    expect(trainingPlan?.owner).not.toHaveProperty("avatar_url");
  });
});
