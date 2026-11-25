import { SYSTEM_TEMPLATES } from "@repo/core";
import { plannedSessionSchema } from "@repo/core/calendar";
import { describe, expect, it, vi } from "vitest";
import { createResolutionManifestFixture } from "../../test/builders/planned-session";
import { resolveCurrentPlannedSessionPlan } from "./resolve-current-planned-session-plan";

const plan = SYSTEM_TEMPLATES[0];
if (!plan) throw new Error("Expected a system plan fixture");
const profileId = "22222222-2222-4222-8222-222222222222";

describe("resolveCurrentPlannedSessionPlan", () => {
  it("uses the durable reference rather than the compatibility manifest id", async () => {
    const currentId = "11111111-1111-4111-8111-111111111111";
    const session = plannedSessionSchema.parse({
      contractVersion: "planned-session-v1",
      id: "33333333-3333-4333-8333-333333333333",
      profileId,
      sessionRevision: 1,
      planningDate: "2026-10-23",
      originalTargetDate: "2026-10-23",
      source: { kind: "direct", operationId: "current_plan_resolution_operation_123456" },
      idempotencyKey: "direct:current_plan_resolution_operation_123456",
      activityPlanId: currentId,
      prescription: {
        resolutionManifest: createResolutionManifestFixture({
          activityPlanId: plan.id,
          structure: plan.structure,
          demand: {
            activity_category: plan.structure.activity_category,
            training_intent: plan.training_intent,
            target_duration_minutes: null,
            target_common_load: null,
            importance: "normal",
          },
        }),
        capturedAt: "2026-10-23T00:00:00.000Z",
      },
      lifecycle: { status: "scheduled" },
    });
    const getActivityPlanPrescriptionSource = vi.fn(async () => null);

    await resolveCurrentPlannedSessionPlan({
      repository: { getActivityPlanPrescriptionSource } as never,
      profileId,
      session,
    });

    expect(getActivityPlanPrescriptionSource).toHaveBeenCalledWith({
      profileId,
      activityPlanId: currentId,
    });
  });
});
