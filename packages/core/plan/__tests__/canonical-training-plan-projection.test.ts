import { describe, expect, it } from "vitest";
import { trainingPlanSchema } from "../../schemas";
import { projectCanonicalTrainingPlan } from "../canonicalTrainingPlanProjection";
import type { GoalAnchoredProjectionPlan } from "../goalAnchoredProjectionPlan";
import { materializePlanToEvents } from "../materializePlanToEvents";
import type { NormalizedSystemActivityTemplateCatalogEntry } from "../verification/activityTemplateCatalog";

const planId = "11111111-1111-4111-8111-111111111111";
const runTemplateId = "22222222-2222-4222-8222-222222222222";

function candidate(
  overrides: Partial<NormalizedSystemActivityTemplateCatalogEntry> = {},
): NormalizedSystemActivityTemplateCatalogEntry {
  return {
    template_id: runTemplateId,
    template_name: "Run aerobic",
    sport: "run",
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
    category_composition: ["run"],
    normalized_structure: {},
    structure_signature: "{}",
    primary_work_signature: "[]",
    duplicate_name_count: 1,
    ...overrides,
  };
}

const projection: GoalAnchoredProjectionPlan = {
  plan_type: "periodized",
  name: "10K",
  start_date: "2026-01-05",
  end_date: "2026-01-11",
  fitness_progression: { starting_ctl: 40 },
  activity_distribution: { run: { target_percentage: 1 } },
  blocks: [
    {
      id: "block",
      name: "Base",
      phase: "base",
      start_date: "2026-01-05",
      end_date: "2026-01-11",
      goal_ids: [],
      target_weekly_tss_range: { min: 200, max: 250 },
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
        recommended_load_tss: 55,
        primary_focus: "endurance" as const,
        activity_category: "run" as const,
        confidence: "high" as const,
        reason_codes: [],
      },
    ];
    const first = projectCanonicalTrainingPlan({
      planId,
      projection,
      dailyLoadPoints,
      candidates: [preferred, ...alternatives],
    });
    const second = projectCanonicalTrainingPlan({
      planId,
      projection,
      dailyLoadPoints,
      candidates: [...alternatives].reverse().concat(preferred),
    });

    expect(first).toEqual(second);
    expect(first.status).toBe("resolved");
    if (first.status !== "resolved") throw new Error("expected resolved projection");
    expect(first.structure.sessions[0]?.activity_plan_id).toBe(runTemplateId);
    expect(first.structure.builder_planning_snapshot?.scheduling.start_date).toBe(
      projection.start_date,
    );
    expect(first.structure.goal_blueprints?.[0]?.target_offset_days).toBe(6);
    expect(trainingPlanSchema.parse(first.structure)).toEqual(first.structure);
  });

  it("creates one session per positive non-rest point and preserves event overrides", () => {
    const result = projectCanonicalTrainingPlan({
      planId,
      projection,
      candidates: [candidate()],
      dailyLoadPoints: [
        {
          date: "2026-01-05",
          recommended_load_tss: 0,
          primary_focus: "rest",
          activity_category: "run",
          confidence: "high",
          reason_codes: [],
        },
        {
          date: "2026-01-06",
          recommended_load_tss: 50,
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
        activity_plan_id: runTemplateId,
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

  it("does not use cross-sport fallback and reports the unresolved coverage cell", () => {
    const result = projectCanonicalTrainingPlan({
      planId,
      projection,
      candidates: [candidate({ sport: "bike" })],
      dailyLoadPoints: [
        {
          date: "2026-01-06",
          recommended_load_tss: 50,
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
          sport: "run",
          focus: "endurance",
          reason: "missing_exact_sport_focus_coverage",
        },
      ],
    });
  });
});
