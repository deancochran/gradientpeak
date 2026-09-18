import { describe, expect, it } from "vitest";
import {
  canonicalActivityCategoryValues,
  canonicalTrainingPlanStructureSchema,
  canonicalTrainingPlanStructureSessionSchema,
  creationConstraintsSchema,
  persistedTrainingPlanStructureSchema,
  trainingPlanCreateInputSchema,
  trainingPlanCreateSchema,
  trainingPlanSchema,
} from "../../schemas";

const activityPlanId = "11111111-1111-4111-8111-111111111111";

const canonicalStructure = {
  version: 1,
  plan_preferences: {
    weekly_session_count: 3,
    target_weekly_duration_minutes: 180,
    maximum_session_duration_minutes: 90,
    preferred_weekdays: [1, 3, 5],
    rest_days: [0, 2, 4, 6],
    progression_style: "balanced" as const,
    recovery_priority: "balanced" as const,
  },
  sessions: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      offset_days: 0,
      activity_plan_id: activityPlanId,
      demand: {
        activity_category: "bike",
        training_intent: "aerobic_base",
        target_duration_minutes: 60,
        target_common_load: 50,
        importance: "normal",
      },
      event_overrides: {
        title: "Opening aerobic ride",
        description: "Keep this one controlled.",
        start_time: "07:30",
      },
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      offset_days: 2,
      activity_plan_id: "22222222-2222-4222-8222-222222222222",
      demand: {
        activity_category: "bike",
        training_intent: "threshold_development",
        target_duration_minutes: 60,
        target_common_load: 70,
        importance: "key",
      },
    },
  ],
};

describe("canonical training plan structure", () => {
  it("accepts relative sessions as the canonical reusable training plan structure", () => {
    expect(canonicalTrainingPlanStructureSchema.parse(canonicalStructure)).toEqual(
      canonicalStructure,
    );
    expect(trainingPlanCreateSchema.parse(canonicalStructure)).toEqual(canonicalStructure);
    expect(persistedTrainingPlanStructureSchema.safeParse(canonicalStructure).success).toBe(false);
    expect(
      persistedTrainingPlanStructureSchema.parse({
        id: "33333333-3333-4333-8333-333333333333",
        ...canonicalStructure,
      }),
    ).toEqual({ id: "33333333-3333-4333-8333-333333333333", ...canonicalStructure });
  });

  it("makes training plan create input use the canonical relative-session structure", () => {
    const parsed = trainingPlanCreateInputSchema.parse({
      name: "Reusable base builder",
      description: null,
      structure: canonicalStructure,
    });

    expect(parsed.structure).toEqual(canonicalStructure);
  });

  it("accepts date-agnostic goal blueprints with target offsets", () => {
    const structure = {
      ...canonicalStructure,
      goal_blueprints: [
        {
          title: "Peak for event",
          priority: 10,
          activity_category: "bike",
          target_offset_days: 42,
        },
      ],
    };

    expect(canonicalTrainingPlanStructureSchema.parse(structure)).toEqual(structure);
  });

  it.each(
    canonicalActivityCategoryValues,
  )("accepts canonical plan category %s and preserves multisport ordering", (activity_category) => {
    expect(
      canonicalTrainingPlanStructureSchema.parse({
        ...canonicalStructure,
        activity_category: [activity_category, "strength"],
      }).activity_category,
    ).toEqual([activity_category, "strength"]);
  });

  it.each([
    "mixed",
    "cycling",
    "running",
    " bike ",
  ])("rejects obsolete plan category alias %s", (activity_category) => {
    expect(
      canonicalTrainingPlanStructureSchema.safeParse({
        ...canonicalStructure,
        activity_category: [activity_category],
      }).success,
    ).toBe(false);
  });

  it("rejects removed builder snapshots and legacy preference keys", () => {
    expect(
      canonicalTrainingPlanStructureSchema.safeParse({
        ...canonicalStructure,
        builder_planning_snapshot: {
          version: 1,
        },
      }).success,
    ).toBe(false);
    expect(
      canonicalTrainingPlanStructureSchema.safeParse({
        ...canonicalStructure,
        plan_preferences: { ...canonicalStructure.plan_preferences, durationWeeks: 8 },
      }).success,
    ).toBe(false);
  });

  it("rejects aliases in category-keyed creation overrides", () => {
    expect(
      creationConstraintsSchema.safeParse({
        hard_rest_days: [],
        activity_category_overrides: {
          cycling: { min_sessions_per_week: 1 },
        },
      }),
    ).toMatchObject({ success: false });
  });

  it("rejects real target dates in reusable goal blueprints", () => {
    const result = canonicalTrainingPlanStructureSchema.safeParse({
      ...canonicalStructure,
      goal_blueprints: [
        {
          title: "Peak for event",
          priority: 10,
          target_date: "2026-07-01",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("requires persisted canonical structures to carry an id without changing session shape", () => {
    const parsed = trainingPlanSchema.parse({
      id: "33333333-3333-4333-8333-333333333333",
      ...canonicalStructure,
    });

    expect(parsed).toEqual({
      id: "33333333-3333-4333-8333-333333333333",
      ...canonicalStructure,
    });
  });

  it("rejects calendar, periodization, and provider fields in canonical session structure", () => {
    const result = canonicalTrainingPlanStructureSessionSchema.safeParse({
      offset_days: 0,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      activity_plan_id: activityPlanId,
      demand: canonicalStructure.sessions[0]!.demand,
      scheduled_date: "2026-06-01",
      session_type: "planned_activity",
      provider_metadata: { provider: "wahoo" },
    });

    expect(result.success).toBe(false);
  });

  it("requires plan preferences and session demand while allowing an unresolved activity plan", () => {
    expect(
      canonicalTrainingPlanStructureSchema.safeParse({
        version: 1,
        sessions: canonicalStructure.sessions,
      }).success,
    ).toBe(false);
    expect(
      canonicalTrainingPlanStructureSessionSchema.parse({
        offset_days: 0,
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        activity_plan_id: null,
        demand: canonicalStructure.sessions[0]!.demand,
      }).activity_plan_id,
    ).toBeNull();
    expect(
      canonicalTrainingPlanStructureSessionSchema.safeParse({
        offset_days: 0,
        activity_plan_id: null,
      }).success,
    ).toBe(false);
  });

  it("allows semantically identical sessions with distinct stable ids", () => {
    expect(
      canonicalTrainingPlanStructureSchema.safeParse({
        ...canonicalStructure,
        sessions: [
          canonicalStructure.sessions[0],
          { ...canonicalStructure.sessions[0]!, id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate canonical session ids", () => {
    expect(
      canonicalTrainingPlanStructureSchema.safeParse({
        ...canonicalStructure,
        sessions: [canonicalStructure.sessions[0], canonicalStructure.sessions[0]],
      }).success,
    ).toBe(false);
  });

  it("caps canonical plans at 366 sessions", () => {
    const sessions = Array.from({ length: 366 }, (_, index) => ({
      ...canonicalStructure.sessions[0]!,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    expect(
      canonicalTrainingPlanStructureSchema.safeParse({ ...canonicalStructure, sessions }).success,
    ).toBe(true);
    expect(
      canonicalTrainingPlanStructureSchema.safeParse({
        ...canonicalStructure,
        sessions: [...sessions, { ...sessions[0]!, id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }],
      }).success,
    ).toBe(false);
  });

  it("rejects old periodized and maintenance structures in the normal create path", () => {
    const periodized = trainingPlanCreateSchema.safeParse({
      plan_type: "periodized",
      name: "Old periodized plan",
      start_date: "2026-01-01",
      end_date: "2026-03-01",
      fitness_progression: { starting_longTermLoad: 40 },
      activity_distribution: { run: { target_percentage: 1 } },
      blocks: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "Build",
          start_date: "2026-01-01",
          end_date: "2026-03-01",
          goal_ids: [],
          phase: "build",
          target_weekly_load_range: { min: 200, max: 300 },
        },
      ],
    });
    const maintenance = trainingPlanCreateSchema.safeParse({
      plan_type: "maintenance",
      name: "Old maintenance plan",
      start_date: "2026-01-01",
      activity_distribution: { run: { target_percentage: 1 } },
    });

    expect(periodized.success).toBe(false);
    expect(maintenance.success).toBe(false);
    expect(
      persistedTrainingPlanStructureSchema.safeParse({
        id: "33333333-3333-4333-8333-333333333333",
        plan_type: "periodized",
        blocks: [],
      }).success,
    ).toBe(false);
    expect(
      persistedTrainingPlanStructureSchema.safeParse({
        id: "33333333-3333-4333-8333-333333333333",
        start_date: "2026-01-01",
        weeks: [{ days: [{ sessions: [{ activity_plan_id: activityPlanId }] }] }],
      }).success,
    ).toBe(false);
  });
});
