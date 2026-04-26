import { ALL_SAMPLE_PLANS } from "@repo/core";
import { describe, expect, it } from "vitest";
import { createQueryMapDbMock } from "../../test/mock-query-db";
import { trainingPlansCrudRouter, trainingPlansRouter } from "../planning/training-plans";

type SystemTrainingPlanRow = {
  id: string;
  name: string;
  description: string;
  structure: Record<string, unknown>;
  sessions_per_week_target: number;
  duration_hours: number;
  is_system_template: boolean;
  template_visibility: string;
  likes_count: number;
  created_at: string;
  updated_at: string;
};

type SamplePlan = (typeof ALL_SAMPLE_PLANS)[number];

function toTrainingPlanRow(plan: SamplePlan): SystemTrainingPlanRow {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    structure: plan.structure,
    sessions_per_week_target: plan.sessions_per_week_target,
    duration_hours: plan.duration_hours,
    is_system_template: true,
    template_visibility: "public",
    likes_count: 0,
    created_at: "2026-03-13T00:00:00.000Z",
    updated_at: "2026-03-13T00:00:00.000Z",
  };
}

function toExpectedTemplateResponse(
  plan: SamplePlan,
  options?: { includeSocialFields?: boolean; includeTimestamps?: boolean },
) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    sessions_per_week_target: plan.sessions_per_week_target,
    duration_hours: plan.duration_hours,
    ...(options?.includeSocialFields
      ? {
          likes_count: 0,
          has_liked: false,
        }
      : {}),
    ...(options?.includeTimestamps
      ? {
          created_at: "2026-03-13T00:00:00.000Z",
          updated_at: "2026-03-13T00:00:00.000Z",
        }
      : {}),
    ...plan.structure,
  };
}

function createCaller(
  router: typeof trainingPlansRouter | typeof trainingPlansCrudRouter,
  rows: SystemTrainingPlanRow[],
) {
  const { db } = createQueryMapDbMock({
    training_plans: {
      data: rows,
      error: null,
    },
  });

  return router.createCaller({
    db: db as any,
    session: { user: { id: "profile-123" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

describe("system training-plan router parity", () => {
  const rows = ALL_SAMPLE_PLANS.map(toTrainingPlanRow);
  const expectedTemplates = ALL_SAMPLE_PLANS.map((plan) =>
    toExpectedTemplateResponse(plan, { includeSocialFields: true, includeTimestamps: true }),
  );

  it("listTemplates preserves canonical system-plan payloads across routed surfaces", async () => {
    const aggregateCaller = createCaller(trainingPlansRouter, rows);
    const crudCaller = createCaller(trainingPlansCrudRouter, rows);

    const [aggregateResult, crudResult] = await Promise.all([
      aggregateCaller.listTemplates({ limit: 25 }),
      crudCaller.listTemplates({ limit: 25 }),
    ]);

    expect(aggregateResult.items).toEqual(expectedTemplates);
    expect(crudResult.items).toEqual(expectedTemplates);
  });

  it("getTemplate preserves a canonical plan artifact across routed surfaces", async () => {
    const aggregateCaller = createCaller(trainingPlansRouter, rows);
    const crudCaller = createCaller(trainingPlansCrudRouter, rows);
    const canonicalPlan = ALL_SAMPLE_PLANS.find(
      (plan: SamplePlan) => plan.name === "Half Marathon Build (10 weeks)",
    );

    if (!canonicalPlan) {
      throw new Error("Missing canonical system plan fixture");
    }

    const expectedTemplate = toExpectedTemplateResponse(canonicalPlan);

    const [aggregateResult, crudResult] = await Promise.all([
      aggregateCaller.getTemplate({ id: canonicalPlan.id }),
      crudCaller.getTemplate({ id: canonicalPlan.id }),
    ]);

    expect(aggregateResult).toEqual(expectedTemplate);
    expect(crudResult).toEqual(expectedTemplate);
  });

  it("auditTemplateHealth reports canonical seeded templates as healthy", async () => {
    const aggregateCaller = createCaller(trainingPlansRouter, rows);
    const crudCaller = createCaller(trainingPlansCrudRouter, rows);

    const [aggregateResult, crudResult] = await Promise.all([
      aggregateCaller.auditTemplateHealth(),
      crudCaller.auditTemplateHealth(),
    ]);

    expect(aggregateResult).toEqual(crudResult);
    expect(aggregateResult.total).toBe(ALL_SAMPLE_PLANS.length);
    expect(aggregateResult.healthy_count).toBe(ALL_SAMPLE_PLANS.length);
    expect(aggregateResult.legacy_count).toBe(0);
    expect(aggregateResult.invalid_count).toBe(0);
    expect(aggregateResult.metadata_gap_count).toBe(0);
    expect(aggregateResult.items.every((item) => item.isPersistedCompatible)).toBe(true);
    expect(aggregateResult.items.every((item) => item.isCurrentSchemaCompatible)).toBe(true);
    expect(aggregateResult.items.every((item) => item.missingMetadata.length === 0)).toBe(true);
    expect(aggregateResult.items.every((item) => item.isHealthy)).toBe(true);
  });

  it("auditTemplateHealth flags legacy seeded templates before they break actions", async () => {
    const legacyRows = [
      {
        ...toTrainingPlanRow(ALL_SAMPLE_PLANS[0]!),
        structure: {
          version: 1,
          start_date: "2026-01-05",
          target_weekly_tss_min: 280,
          target_weekly_tss_max: 420,
          target_activities_per_week: 4,
          max_consecutive_days: 3,
          min_rest_days_per_week: 2,
          sessions: [
            {
              offset_days: 1,
              title: "Easy Run",
              session_type: "planned",
              activity_plan_id: "1b4c5d6e-7f8a-4b0c-9d2e-3f4a5b6c7d8e",
            },
          ],
        },
      },
    ];

    const caller = createCaller(trainingPlansRouter, legacyRows);
    const result = await caller.auditTemplateHealth();

    expect(result.total).toBe(1);
    expect(result.healthy_count).toBe(0);
    expect(result.legacy_count).toBe(1);
    expect(result.invalid_count).toBe(0);
    expect(result.metadata_gap_count).toBe(1);
    expect(result.items[0]).toMatchObject({
      isHealthy: false,
      isPersistedCompatible: true,
      isCurrentSchemaCompatible: false,
      missingMetadata: ["sport", "experienceLevel", "durationWeeks"],
      issueCodes: [
        "legacy_structure",
        "missing_sport_metadata",
        "missing_experience_level_metadata",
        "missing_duration_weeks_metadata",
      ],
    });
  });
});
