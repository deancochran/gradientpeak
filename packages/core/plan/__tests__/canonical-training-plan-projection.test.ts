import { describe, expect, it } from "vitest";
import { trainingPlanSchema } from "../../schemas";
import { requireFixtureValue } from "../../testing/requireFixtureValue";
import { projectCanonicalTrainingPlan } from "../canonicalTrainingPlanProjection";
import type { GoalAnchoredProjectionPlan } from "../goalAnchoredProjectionPlan";
import { materializePlanToEvents } from "../materializePlanToEvents";
import type { NormalizedSystemActivityTemplateCatalogEntry } from "../verification/activityTemplateCatalog";
import { buildSystemActivityTemplateCatalog } from "../verification/activityTemplateCatalog";

const planId = "11111111-1111-4111-8111-111111111111";
const runTemplateId = "22222222-2222-4222-8222-222222222222";
const preferences = {
  weekly_session_count: 4,
  target_weekly_duration_minutes: 240,
  maximum_session_duration_minutes: 90,
  preferred_weekdays: [1, 3, 5],
  rest_days: [0, 2, 4, 6],
  progression_style: "balanced" as const,
  recovery_priority: "balanced" as const,
};

function candidate(
  overrides: Partial<NormalizedSystemActivityTemplateCatalogEntry> = {},
): NormalizedSystemActivityTemplateCatalogEntry {
  return {
    template_id: runTemplateId,
    template_name: "Run aerobic",
    activity_category: "run",
    source_file: "fixture",
    execution_context: "outdoor",
    session_archetype: "aerobic_endurance",
    training_intent: "aerobic_base",
    intensity_family: "endurance",
    progression_level: "foundation",
    duration_seconds: 3600,
    duration_band: "medium",
    load_band: "moderate",
    recovery_cost_band: "moderate",
    normalized_structure: {},
    structure_signature: "{}",
    primary_work_signature: "[]",
    duplicate_name_count: 1,
    ...overrides,
  };
}

const projection: GoalAnchoredProjectionPlan = {
  name: "10K",
  start_date: "2026-01-05",
  end_date: "2026-01-11",
  fitness_progression: { starting_longTermLoad: 40 },
  activity_distribution: { run: { target_percentage: 1 } },
  blocks: [
    {
      id: "block",
      name: "Base",
      phase: "base",
      start_date: "2026-01-05",
      end_date: "2026-01-11",
      goal_ids: [],
      target_weekly_load_range: { min: 200, max: 250 },
      target_sessions_per_week_range: { min: 3, max: 5 },
    },
  ],
  goals: [
    {
      id: "goal",
      name: "10K",
      target_date: "2026-01-11",
      priority: 8,
      targets: [
        {
          target_type: "race_performance",
          activity_category: "run",
          distance_m: 10_000,
          target_time_s: 3000,
        },
      ],
    },
  ],
};

describe("projectCanonicalTrainingPlan", () => {
  it("is deterministic across shuffled candidates and ranks load then recovery then progression", () => {
    const preferred = candidate();
    const alternatives = [
      candidate({ template_id: "33333333-3333-4333-8333-333333333333", load_band: "high" }),
      candidate({
        template_id: "44444444-4444-4444-8444-444444444444",
        recovery_cost_band: "high",
      }),
    ];
    const dailyLoadPoints = [
      {
        date: "2026-01-06",
        recommended_load: 55,
        primary_focus: "endurance" as const,
        activity_category: "run" as const,
        confidence: "high" as const,
        reason_codes: [],
      },
    ];
    const first = projectCanonicalTrainingPlan({
      planId,
      preferences,
      projection,
      dailyLoadPoints,
      candidates: [preferred, ...alternatives],
    });
    const second = projectCanonicalTrainingPlan({
      planId,
      preferences,
      projection,
      dailyLoadPoints,
      candidates: [...alternatives].reverse().concat(preferred),
    });

    expect(first).toEqual(second);
    expect(first.status).toBe("resolved");
    if (first.status !== "resolved") throw new Error("expected resolved projection");
    expect(first.structure.sessions[0]?.activity_plan_id).toBe(runTemplateId);
    expect(first.structure.plan_preferences).toEqual(preferences);
    expect(first.structure.goal_blueprints?.[0]?.target_offset_days).toBe(6);
    expect(trainingPlanSchema.parse(first.structure)).toEqual(first.structure);
  });

  it("creates one session per positive non-rest point and preserves event overrides", () => {
    const result = projectCanonicalTrainingPlan({
      planId,
      preferences,
      projection,
      candidates: [candidate()],
      dailyLoadPoints: [
        {
          date: "2026-01-05",
          recommended_load: 0,
          primary_focus: "rest",
          activity_category: "run",
          confidence: "high",
          reason_codes: [],
        },
        {
          date: "2026-01-06",
          recommended_load: 50,
          primary_focus: "endurance",
          activity_category: "run",
          confidence: "high",
          reason_codes: [],
          event_overrides: { title: "Aerobic run", description: "Controlled", start_time: "07:30" },
        },
      ],
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved projection");
    expect(result.structure.sessions).toEqual([
      {
        offset_days: 1,
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        activity_plan_id: runTemplateId,
        demand: {
          activity_category: "run",
          training_intent: "aerobic_base",
          target_duration_minutes: 60,
          target_common_load: 50,
          importance: "normal",
        },
        event_overrides: { title: "Aerobic run", description: "Controlled", start_time: "07:30" },
      },
    ]);
    expect(
      materializePlanToEvents(result.structure, projection.start_date, "UTC")[0],
    ).toMatchObject({
      scheduled_date: "2026-01-06",
      title: "Aerobic run",
      description: "Controlled",
      starts_at: "2026-01-06T07:30:00.000Z",
      activity_plan_id: runTemplateId,
    });
  });

  it("keeps same-day overrides attached to their own deterministic sessions", () => {
    const result = projectCanonicalTrainingPlan({
      planId,
      preferences,
      projection,
      candidates: [candidate()],
      dailyLoadPoints: [
        {
          date: "2026-01-06",
          recommended_load: 40,
          primary_focus: "endurance",
          activity_category: "run",
          confidence: "high",
          reason_codes: [],
          event_overrides: { title: "Morning" },
        },
        {
          date: "2026-01-06",
          recommended_load: 55,
          primary_focus: "endurance",
          activity_category: "run",
          confidence: "high",
          reason_codes: [],
          event_overrides: { title: "Evening" },
        },
      ],
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved projection");
    expect(
      result.structure.sessions.map((session) => session.event_overrides?.title).sort(),
    ).toEqual(["Evening", "Morning"]);
    expect(new Set(result.structure.sessions.map((session) => session.id)).size).toBe(2);
    expect(result.resolution_manifest.map((entry) => entry.session_id)).toEqual(
      result.structure.sessions.map((session) => session.id),
    );
  });

  it("uses a portable SHA-256 fingerprint for deterministic, sensitive projection inputs", () => {
    const input = {
      planId,
      preferences,
      projection,
      candidates: [candidate()],
      dailyLoadPoints: [
        {
          date: "2026-01-06",
          recommended_load: 50,
          primary_focus: "endurance" as const,
          activity_category: "run" as const,
          confidence: "high" as const,
          reason_codes: [],
          event_overrides: { title: "Fingerprint" },
        },
      ],
    };
    const first = projectCanonicalTrainingPlan(input);
    const second = projectCanonicalTrainingPlan(structuredClone(input));
    const changedPreferences = projectCanonicalTrainingPlan({
      ...input,
      preferences: { ...preferences, progression_style: "ambitious" },
    });
    const changedOverrides = projectCanonicalTrainingPlan({
      ...input,
      dailyLoadPoints: [
        {
          ...requireFixtureValue(input.dailyLoadPoints[0], "expected daily load fixture"),
          event_overrides: { title: "Changed" },
        },
      ],
    });

    expect(first.fingerprint).toMatch(/^v1:sha256:[0-9a-f]{64}$/);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).not.toBe(changedPreferences.fingerprint);
    expect(first.fingerprint).not.toBe(changedOverrides.fingerprint);
  });

  it("assigns collision-free stable ids to more than 256 projected sessions", () => {
    const start = new Date("2026-01-05T00:00:00.000Z");
    const result = projectCanonicalTrainingPlan({
      planId,
      preferences,
      projection,
      candidates: [candidate()],
      dailyLoadPoints: Array.from({ length: 257 }, (_, index) => ({
        date: new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10),
        recommended_load: 50,
        primary_focus: "endurance" as const,
        activity_category: "run" as const,
        confidence: "high" as const,
        reason_codes: [],
      })),
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved projection");
    expect(new Set(result.structure.sessions.map((session) => session.id)).size).toBe(257);
  });

  it("does not use cross-category fallback and reports the unresolved coverage cell", () => {
    const result = projectCanonicalTrainingPlan({
      planId,
      preferences,
      projection,
      candidates: [candidate({ activity_category: "bike" })],
      dailyLoadPoints: [
        {
          date: "2026-01-06",
          recommended_load: 50,
          primary_focus: "endurance",
          activity_category: "run",
          confidence: "high",
          reason_codes: [],
        },
      ],
    });

    expect(result).toMatchObject({
      status: "unresolved",
      structure: null,
      unresolved: [
        {
          date: "2026-01-06",
          activity_category: "run",
          focus: "endurance",
          reason: "missing_exact_activity_category_focus_coverage",
        },
      ],
    });
  });

  it("resolves the current other race-specific coverage cell to a real system template", () => {
    const result = projectCanonicalTrainingPlan({
      planId,
      preferences,
      projection,
      candidates: buildSystemActivityTemplateCatalog(),
      dailyLoadPoints: [
        {
          date: "2026-01-06",
          recommended_load: 32.5,
          primary_focus: "race_specific",
          activity_category: "other",
          confidence: "high",
          reason_codes: [],
        },
      ],
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved projection");
    expect(result.resolution_manifest[0]).toMatchObject({
      activity_category: "other",
      focus: "race_specific",
      selected_activity_plan_id: "1f6ea8cb-5df9-42cb-9f04-3ca5a8a6d6d1",
    });
  });
});
