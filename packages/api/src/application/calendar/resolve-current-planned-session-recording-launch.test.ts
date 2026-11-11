import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { plannedSessionIdempotencyKey, plannedSessionSchema } from "@repo/core/calendar";
import { describe, expect, it, vi } from "vitest";
import { activityPlanCanonicalStructureHash } from "../activity-plans/structure-hash";
import { resolveCurrentPlannedSessionRecordingLaunch } from "./resolve-current-planned-session-recording-launch";

vi.mock("../athlete-intelligence/load-planning-baseline", () => ({
  loadPlanningBaseline: async () => ({
    status: "no_context" as const,
    as_of: "1970-01-01T00:00:00.000Z",
  }),
}));

const profileId = "11111111-1111-4111-8111-111111111111";
const activityPlanId = "22222222-2222-4222-8222-222222222222";
const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "33333333-3333-4333-8333-333333333333",
      name: "Edited current step",
      duration: { type: "time", seconds: 1200 },
      targets: [{ type: "RPE", intensity: 6 }],
    },
  ],
});

describe("resolveCurrentPlannedSessionRecordingLaunch", () => {
  it("captures the edited referenced plan at recording launch, not the scheduled snapshot", async () => {
    const source = { kind: "direct" as const, operationId: "a".repeat(32) };
    const session = plannedSessionSchema.parse({
      contractVersion: "planned-session-v1",
      id: "44444444-4444-4444-8444-444444444444",
      profileId,
      sessionRevision: 3,
      planningDate: "2026-10-23",
      originalTargetDate: "2026-10-23",
      source,
      idempotencyKey: plannedSessionIdempotencyKey(source),
      activityPlanId,
      prescription: {
        resolutionManifest: {
          resolver_version: "prescription-resolver-v2",
          policy_version: "training-plan-policy-v2",
          training_plan_id: null,
          training_plan_revision: null,
          training_plan_hash: null,
          athlete_context_revision: null,
          activity_plan_id: activityPlanId,
          activity_plan_revision: 1,
          activity_plan_semantic_hash: `v2:sha256:${"a".repeat(64)}`,
          effective_target_duration_minutes: null,
          effective_target_common_load: null,
          evidence_facts: [],
          session_demand: {
            activity_category: "run",
            training_intent: "durable_endurance",
            target_duration_minutes: null,
            target_common_load: null,
            importance: "normal",
          },
          fallback_level: "system_default_no_context",
          reason_codes: [],
          resolved_structure: {
            ...structure,
            items: [{ ...structure.items[0], name: "Old step" }],
          },
          resolved_structure_hash: activityPlanCanonicalStructureHash({
            ...structure,
            items: [{ ...structure.items[0], name: "Old step" }],
          }),
          prescription_estimate: {
            duration: { status: "exact", value_seconds: 1200 },
            common_load: { status: "unavailable", value: null },
            rest_seconds: 0,
            has_open_completion: false,
            warnings: [],
            factors: [],
          },
          fingerprint: `v1:sha256:${"b".repeat(64)}`,
        },
        capturedAt: "2026-10-01T00:00:00.000Z",
      },
      lifecycle: { status: "scheduled" },
    });
    const getActivityPlanPrescriptionSource = vi.fn(async () => ({
      id: activityPlanId,
      profileId,
      name: "Edited plan",
      description: null,
      revision: 2,
      structure,
      trainingIntent: "general_maintenance" as const,
      structureHash: activityPlanCanonicalStructureHash(structure),
      semanticHash: activityPlanSemanticHash({
        structure,
        trainingIntent: "general_maintenance",
      }),
      gpsRecordingEnabled: false,
      updatedAt: "2026-10-23T08:00:00.000Z",
    }));

    const launch = await resolveCurrentPlannedSessionRecordingLaunch({
      db: {} as never,
      repository: { getActivityPlanPrescriptionSource } as never,
      profileId,
      session,
      capturedAt: new Date("2026-10-23T08:30:00.000Z"),
    });

    expect(launch).toMatchObject({
      id: session.id,
      sessionRevision: 3,
      prescription: {
        capturedAt: "2026-10-23T08:30:00.000Z",
        resolutionManifest: {
          activity_plan_revision: 2,
          training_plan_id: null,
          athlete_context_revision: null,
          session_demand: expect.objectContaining({
            activity_category: "run",
            training_intent: "general_maintenance",
          }),
          resolved_structure: structure,
          resolved_structure_hash: activityPlanCanonicalStructureHash(structure),
        },
      },
    });
  });
});
