import { describe, expect, it } from "vitest";
import {
  canonicalTrainingPlanStructureSchema,
  canonicalTrainingPlanStructureSessionSchema,
  persistedTrainingPlanStructureSchema,
  trainingPlanCreateInputSchema,
  trainingPlanCreateSchema,
  trainingPlanSchema,
} from "../../schemas";

const activityPlanId = "11111111-1111-4111-8111-111111111111";

const canonicalStructure = {
  version: 1,
  sessions: [
    {
      offset_days: 0,
      activity_plan_id: activityPlanId,
      event_overrides: {
        title: "Opening aerobic ride",
        description: "Keep this one controlled.",
        start_time: "07:30",
      },
    },
    {
      offset_days: 2,
      activity_plan_id: "22222222-2222-4222-8222-222222222222",
    },
  ],
};

describe("canonical training plan structure", () => {
  it("accepts relative sessions as the canonical reusable training plan structure", () => {
    expect(canonicalTrainingPlanStructureSchema.parse(canonicalStructure)).toEqual(
      canonicalStructure,
    );
    expect(trainingPlanCreateSchema.parse(canonicalStructure)).toEqual(canonicalStructure);
    expect(persistedTrainingPlanStructureSchema.parse(canonicalStructure)).toEqual(
      canonicalStructure,
    );
  });

  it("makes training plan create input use the canonical relative-session structure", () => {
    const parsed = trainingPlanCreateInputSchema.parse({
      name: "Reusable base builder",
      description: null,
      structure: canonicalStructure,
    });

    expect(parsed.structure).toEqual(canonicalStructure);
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
      activity_plan_id: activityPlanId,
      scheduled_date: "2026-06-01",
      session_type: "planned_activity",
      provider_metadata: { provider: "wahoo" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects old periodized and maintenance structures in the normal create path", () => {
    const periodized = trainingPlanCreateSchema.safeParse({
      plan_type: "periodized",
      name: "Old periodized plan",
      start_date: "2026-01-01",
      end_date: "2026-03-01",
      fitness_progression: { starting_ctl: 40 },
      activity_distribution: { run: { target_percentage: 1 } },
      blocks: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "Build",
          start_date: "2026-01-01",
          end_date: "2026-03-01",
          goal_ids: [],
          phase: "build",
          target_weekly_tss_range: { min: 200, max: 300 },
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
  });
});
