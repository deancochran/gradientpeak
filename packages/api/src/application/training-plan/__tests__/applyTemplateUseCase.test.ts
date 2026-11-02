import { describe, expect, it } from "vitest";
import {
  trainingPlanApplicationApplyInputSchema,
  trainingPlanApplicationPreviewInputSchema,
} from "../applyTemplateUseCase";

const planId = "11111111-1111-4111-8111-111111111111";
const hash = `v1:sha256:${"a".repeat(64)}`;

describe("canonical training-plan application contracts", () => {
  it("requires a revision, plan hash, state revision, and preview fingerprint for apply", () => {
    const preview = trainingPlanApplicationPreviewInputSchema.parse({
      trainingPlanId: planId,
      applicationMode: "full",
      startDate: "2026-08-01",
    });
    expect(preview.trainingPlanId).toBe(planId);
    expect(() => trainingPlanApplicationApplyInputSchema.parse(preview)).toThrow();
    expect(
      trainingPlanApplicationApplyInputSchema.parse({
        ...preview,
        operationId: "training_plan_application_test_00001",
        expectedPlanRevision: 1,
        expectedPlanHash: hash,
        basePublishedRevision: null,
        previewFingerprint: hash,
      }),
    ).toMatchObject({ expectedPlanRevision: 1, expectedPlanHash: hash });
  });

  it("does not retain the legacy template application field names", () => {
    expect(
      trainingPlanApplicationPreviewInputSchema.safeParse({
        template_id: planId,
        template_type: "training_plan",
      }).success,
    ).toBe(false);
  });
});
