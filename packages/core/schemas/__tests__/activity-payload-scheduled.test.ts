import { describe, expect, it } from "vitest";
import { ActivityPayloadSchema } from "../activity_payload";

const planId = "11111111-1111-4111-8111-111111111111";
const plannedSessionId = "22222222-2222-4222-8222-222222222222";
const variantId = "33333333-3333-4333-8333-333333333333";
const structureHash = `v1:sha256:${"a".repeat(64)}`;
const structure = {
  version: 3 as const,
  activity_category: "bike" as const,
  segments: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      role: "activity" as const,
      name: "Bike",
      intervals: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "66666666-6666-4666-8666-666666666666",
              name: "Tempo",
              duration: { type: "time" as const, seconds: 900 },
              targets: [{ type: "RPE" as const, intensity: 6 }],
            },
          ],
        },
      ],
    },
  ],
};

const plannedSession = {
  id: plannedSessionId,
  sessionRevision: 3,
  prescription: {
    activityPlanId: planId,
    activityPlanRevision: 7,
    variantId,
    variantName: "Long",
    structure,
    structureHash,
    prescriptionQuantification: null,
    capturedAt: "2026-09-01T10:00:00.000Z",
  },
};

describe("scheduled activity payload", () => {
  it("accepts the exact planned-session prescription and retains all provenance", () => {
    const payload = ActivityPayloadSchema.parse({
      activity_category: "bike",
      gpsRecordingEnabled: false,
      eventId: "77777777-7777-4777-8777-777777777777",
      plan: { id: planId, name: "Scheduled tempo", structure },
      plannedSession,
    });

    expect(payload.plannedSession).toEqual(plannedSession);
    expect(payload.plan?.structure).toEqual(structure);
  });

  it("rejects mutable/default plan data substituted for the scheduled snapshot", () => {
    expect(
      ActivityPayloadSchema.safeParse({
        activity_category: "bike",
        gpsRecordingEnabled: false,
        plan: {
          id: planId,
          name: "Changed default",
          structure: {
            ...structure,
            segments: [],
          },
        },
        plannedSession,
      }).success,
    ).toBe(false);
  });

  it("keeps an unplanned ad-hoc launch valid", () => {
    expect(
      ActivityPayloadSchema.safeParse({
        activity_category: "run",
        gpsRecordingEnabled: false,
      }).success,
    ).toBe(true);
  });
});
