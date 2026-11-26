import { describe, expect, it } from "vitest";
import { stringifyCanonicalJson } from "../../athlete-intelligence/canonical-json";
import { sha256Hex } from "../../utils/sha256";
import { ActivityPayloadSchema } from "../activity_payload";

const planId = "11111111-1111-4111-8111-111111111111";
const plannedSessionId = "22222222-2222-4222-8222-222222222222";
const structure = {
  version: 5 as const,
  activity_category: "bike" as const,
  items: [
    {
      type: "step",
      id: "66666666-6666-4666-8666-666666666666",
      name: "Tempo",
      duration: { type: "time" as const, seconds: 900 },
      targets: [{ type: "RPE" as const, intensity: 6 }],
    },
  ],
};
const structureHash = `v1:sha256:${sha256Hex(stringifyCanonicalJson(structure))}`;
const plannedSession = {
  id: plannedSessionId,
  sessionRevision: 3,
  source: { kind: "direct" as const, operationId: "core-activity-payload-test-operation-01" },
  prescription: {
    resolutionManifest: {
      resolver_version: "prescription-resolver-v2",
      policy_version: "training-plan-policy-v2",
      training_plan_id: null,
      training_plan_revision: null,
      training_plan_hash: null,
      athlete_context_revision: null,
      activity_plan_id: planId,
      activity_plan_revision: 7,
      activity_plan_semantic_hash: `v2:sha256:${"a".repeat(64)}`,
      effective_target_duration_minutes: null,
      effective_target_common_load: null,
      evidence_facts: [],
      session_demand: {
        activity_category: "bike" as const,
        training_intent: "aerobic_base" as const,
        target_duration_minutes: 15,
        target_common_load: null,
        importance: "normal" as const,
      },
      fallback_level: "system_default_no_context" as const,
      reason_codes: [],
      resolved_structure: structure,
      resolved_structure_hash: structureHash,
      prescription_estimate: {
        duration: { status: "exact" as const, value_seconds: 900 },
        common_load: { status: "unavailable" as const, value: null },
        rest_seconds: 0,
        has_open_completion: false,
        warnings: [],
        factors: ["canonical prescription quantification"],
      },
      fingerprint: `v1:sha256:${"b".repeat(64)}`,
    },
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
            blocks: [],
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
