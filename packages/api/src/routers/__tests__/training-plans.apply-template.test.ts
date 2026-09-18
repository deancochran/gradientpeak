import { describe, expect, it } from "vitest";
import {
  trainingPlanApplicationApplyInputSchema,
  trainingPlanApplicationPreviewInputSchema,
} from "../../application/training-plan/applyTemplateUseCase";

const planId = "11111111-1111-4111-8111-111111111111";
const hash = `v1:sha256:${"a".repeat(64)}`;

describe("trainingPlans canonical application transport", () => {
  it("uses one preview/apply contract and rejects legacy compatibility inputs", () => {
    const preview = trainingPlanApplicationPreviewInputSchema.parse({
      trainingPlanId: planId,
      applicationMode: "remaining",
      targetDate: "2026-09-01",
    });
    expect(
      trainingPlanApplicationApplyInputSchema.parse({
        ...preview,
        operationId: "apply_training_plan_transport_test_0001",
        expectedPlanRevision: 2,
        expectedPlanHash: hash,
        basePublishedRevision: 3,
        previewFingerprint: hash,
      }).trainingPlanId,
    ).toBe(planId);
    expect(
      trainingPlanApplicationPreviewInputSchema.safeParse({ template_id: planId }).success,
    ).toBe(false);
  });
});
