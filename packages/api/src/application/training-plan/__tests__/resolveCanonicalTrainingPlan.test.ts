import {
  buildDailyLoadDistribution,
  buildGoalAnchoredProjectionPlan,
  buildSystemActivityTemplateCatalog,
  trainingPlanSchema,
} from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import { resolveCanonicalTrainingPlan } from "../resolveCanonicalTrainingPlan";

function fixture() {
  const projection = buildGoalAnchoredProjectionPlan({
    minimalPlan: {
      plan_start_date: "2026-01-05",
      goals: [
        {
          name: "Threshold check",
          target_date: "2026-03-15",
          priority: 5,
          targets: [{ target_type: "hr_threshold", target_lthr_bpm: 160 }],
        },
      ],
    },
    startingCtl: 40,
  });
  const dailyLoadPoints = buildDailyLoadDistribution({
    startDate: projection.start_date,
    endDate: projection.end_date,
    weeklyTargets: projection.blocks.map((block) => ({
      weekStartDate: block.start_date,
      weekEndDate: block.end_date,
      targetTss: (block.target_weekly_tss_range.min + block.target_weekly_tss_range.max) / 2,
      phase: block.phase,
    })),
  });
  return { projection, dailyLoadPoints };
}

describe("resolveCanonicalTrainingPlan", () => {
  it("resolves a real goal-anchored projection and reasserts every selected ID", async () => {
    const availableIds = buildSystemActivityTemplateCatalog().map((entry) => entry.template_id);
    const repository = {
      listAvailablePublicSystemTemplateIds: vi.fn(async () => availableIds),
      assertAvailablePublicSystemTemplateIds: vi.fn(async () => ({
        availableIds,
        missingIds: [],
      })),
      withLockedPublishedTemplates: vi.fn(),
    };
    const result = await resolveCanonicalTrainingPlan({
      planId: "11111111-1111-4111-8111-111111111111",
      ...fixture(),
      planningTemplateRepository: repository,
    });

    expect(trainingPlanSchema.parse(result.structure)).toEqual(result.structure);
    expect(result.structure.sessions.length).toBeGreaterThan(0);
    expect(repository.assertAvailablePublicSystemTemplateIds).toHaveBeenCalledWith(
      result.resolution_manifest.map((entry) => entry.selected_activity_plan_id),
    );
  });

  it("fails explicitly when a preview fingerprint is stale", async () => {
    const availableIds = buildSystemActivityTemplateCatalog().map((entry) => entry.template_id);
    await expect(
      resolveCanonicalTrainingPlan({
        planId: "11111111-1111-4111-8111-111111111111",
        ...fixture(),
        expectedFingerprint: "stale-fingerprint",
        planningTemplateRepository: {
          listAvailablePublicSystemTemplateIds: vi.fn(async () => availableIds),
          assertAvailablePublicSystemTemplateIds: vi.fn(),
          withLockedPublishedTemplates: vi.fn(),
        },
      }),
    ).rejects.toMatchObject({
      code: "CANONICAL_TRAINING_PLAN_RESOLUTION_FAILED",
      details: { reason: "stale_resolution_fingerprint" },
    });
  });
});
