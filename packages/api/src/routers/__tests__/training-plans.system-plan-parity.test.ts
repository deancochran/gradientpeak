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

function toExpectedTemplateResponse(plan: SamplePlan) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    sessions_per_week_target: plan.sessions_per_week_target,
    duration_hours: plan.duration_hours,
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
  const expectedTemplates = ALL_SAMPLE_PLANS.map(toExpectedTemplateResponse);

  it("listTemplates preserves canonical system-plan payloads across routed surfaces", async () => {
    const aggregateCaller = createCaller(trainingPlansRouter, rows);
    const crudCaller = createCaller(trainingPlansCrudRouter, rows);

    const [aggregateResult, crudResult] = await Promise.all([
      aggregateCaller.listTemplates(),
      crudCaller.listTemplates(),
    ]);

    expect(aggregateResult).toEqual(expectedTemplates);
    expect(crudResult).toEqual(expectedTemplates);
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
});
