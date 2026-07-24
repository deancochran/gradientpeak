import { ALL_SAMPLE_PLANS } from "@repo/core";
import { describe, expect, it } from "vitest";
import { createQueryMapDbMock } from "../../test/mock-query-db";
import { trainingPlansRouter } from "../planning/training-plans";

type SystemTrainingPlanRow = {
  id: string;
  name: string;
  description: string;
  structure: Record<string, unknown>;
  sessions_per_week_target: number;
  duration_hours: number;
  is_system_template: boolean;
  template_visibility: string;
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
    created_at: "2026-03-13T00:00:00.000Z",
    updated_at: "2026-03-13T00:00:00.000Z",
  };
}

function toExpectedTemplateResponse(
  plan: SamplePlan,
  options?: { includeSocialFields?: boolean; includeTimestamps?: boolean },
) {
  return {
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

function createCaller(rows: SystemTrainingPlanRow[]) {
  const { db } = createQueryMapDbMock({
    training_plans: {
      data: rows,
      error: null,
    },
  });

  return trainingPlansRouter.createCaller({
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

  it("listTemplates preserves canonical system-plan payloads", async () => {
    const caller = createCaller(rows);

    await expect(caller.listTemplates({ limit: 25 })).resolves.toMatchObject({
      items: expectedTemplates,
    });
  });

  it("getTemplate preserves a canonical plan artifact", async () => {
    const caller = createCaller(rows);
    const canonicalPlan = ALL_SAMPLE_PLANS.find(
      (plan: SamplePlan) => plan.name === "Half Marathon Build (10 weeks)",
    );

    if (!canonicalPlan) {
      throw new Error("Missing canonical system plan fixture");
    }

    const expectedTemplate = toExpectedTemplateResponse(canonicalPlan);

    await expect(caller.getTemplate({ id: canonicalPlan.id })).resolves.toEqual(expectedTemplate);
  });
});
