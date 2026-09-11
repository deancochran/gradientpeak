import { activityPlanStructureSchema, initializeActivityPlanDocument } from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { describe, expect, it } from "vitest";

import { publicShareRouter } from "../public-share";

const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

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
        activity_kind: "single",
        activity_categories: ["bike"],
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
            activity_category: "bike",
            startOffsetMs: 0,
            endOffsetMs: 4_500_000,
            summary: {
              version: 1,
              timing: { timingCoverage: "complete", activeMs: 4_400_000, movingMs: 4_300_000 },
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
      version: 3,
      activity_category: "run",
      segments: [
        {
          id: "00000000-0000-4000-8000-000000000011",
          role: "activity",
          name: "Run",
          notes: "Ease into the first interval.",
          intervals: [
            {
              id: "00000000-0000-4000-8000-000000000012",
              name: "Run interval",
              notes: "Walk between rounds.",
              repetitions: 1,
              steps: [
                {
                  id: "00000000-0000-4000-8000-000000000013",
                  name: "Easy run",
                  description: "Keep the effort conversational.",
                  notes: "Relax your shoulders.",
                  duration: { type: "time", seconds: 1800 },
                  targets: [{ type: "RPE", intensity: 5 }],
                },
              ],
            },
          ],
        },
        {
          id: "00000000-0000-4000-8000-000000000014",
          role: "rest",
          name: "Cool down",
          notes: "Walk until your breathing settles.",
          duration: { type: "time", seconds: 300 },
        },
      ],
    });
    const { caller } = createCaller([
      {
        id,
        name: "Public brick",
        description: null,
        notes: "Private instruction: hold RPE 8 for 20 minutes",
        structure: initializeActivityPlanDocument({ activityPlanId: id, structure }),
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
      structure_version: 3,
      structure_summary: "Structured plan details",
      structure: {
        version: 3,
        activity_category: "run",
        segments: [
          {
            role: "activity",
            name: "Run",
            notes: "Ease into the first interval.",
            intervals: [
              {
                name: "Run interval",
                notes: "Walk between rounds.",
                repetitions: 1,
                steps: [
                  {
                    name: "Easy run",
                    description: "Keep the effort conversational.",
                    notes: "Relax your shoulders.",
                    duration: { type: "time", seconds: 1800 },
                    targets: [{ type: "RPE", intensity: 5 }],
                  },
                ],
              },
            ],
          },
          {
            role: "rest",
            name: "Cool down",
            notes: "Walk until your breathing settles.",
            duration: { type: "time", seconds: 300 },
          },
        ],
      },
    });
    expect(Object.keys(activityPlan ?? {}).sort()).toEqual([
      "activity_category",
      "defaultVariantId",
      "defaultVariantName",
      "description",
      "id",
      "is_system_template",
      "metrics",
      "name",
      "owner",
      "structure",
      "structure_summary",
      "structure_version",
      "variantCount",
      "variants",
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
        value: 2_100,
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
    const firstSegment = activityPlan?.structure.segments[0];
    expect(firstSegment).toMatchObject({ role: "activity" });
    if (!firstSegment || firstSegment.role !== "activity")
      throw new Error("Expected activity segment");
    const firstInterval = firstSegment.intervals[0];
    const firstStep = firstInterval?.steps[0];
    expect(firstSegment).not.toHaveProperty("id");
    expect(firstInterval).not.toHaveProperty("id");
    expect(firstStep).not.toHaveProperty("id");
    expect(activityPlan?.structure.segments[1]).not.toHaveProperty("id");
    expect(JSON.stringify(activityPlan?.structure)).not.toMatch(
      /00000000-0000-4000-8000-00000000001[1234]/,
    );
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

  it("redacts builder snapshots, arbitrary goal objectives, and internal IDs at direct public tRPC", async () => {
    const id = "00000000-0000-4000-8000-000000000020";
    const secretActivityPlanId = "00000000-0000-4000-8000-000000000021";
    const secretProfileGoalId = "private-profile-goal-id";
    const structure = {
      id,
      version: 1 as const,
      sessions: [
        {
          activity_plan_id: secretActivityPlanId,
          activity_plan_variant_id: secretActivityPlanId,
          offset_days: 0,
        },
      ],
      goal_blueprints: [
        {
          title: "Private race objective",
          objective: { privateTarget: "do-not-return" },
        },
      ],
      builder_planning_snapshot: {
        version: 1 as const,
        plan_preferences: {
          duration_weeks: 8,
          weekly_session_count: 4,
          target_weekly_hours: 6,
          rest_days_per_week: 2,
        },
        scheduling: { preferred_weekdays: [1, 3, 6] },
        goal_context: {
          selected_goals: [
            {
              title: "Private goal",
              target_offset_days: 40,
              priority: 10,
              activity_category: "run" as const,
              objective: { raw: "sensitive-objective" },
              source_profile_goal_id: secretProfileGoalId,
            },
          ],
        },
      },
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
    expect(serialized).not.toContain("builder_planning_snapshot");
    expect(serialized).not.toContain("objective");
    expect(serialized).not.toContain(secretActivityPlanId);
    expect(serialized).not.toContain(secretProfileGoalId);
    expect(trainingPlan).not.toHaveProperty("structure_hash");
    expect(trainingPlan).not.toHaveProperty("content_visibility");
    expect(trainingPlan).not.toHaveProperty("created_at");
    expect(trainingPlan).not.toHaveProperty("updated_at");
    expect(trainingPlan?.owner).not.toHaveProperty("id");
    expect(trainingPlan?.owner).not.toHaveProperty("avatar_url");
  });
});
