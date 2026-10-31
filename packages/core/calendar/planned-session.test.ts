import { describe, expect, it } from "vitest";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "../activity-plan";
import { stringifyCanonicalJson } from "../athlete-intelligence/canonical-json";
import { sha256Hex } from "../utils/sha256";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionCollectionSchema,
  plannedSessionIdempotencyKey,
  plannedSessionLifecycleSchema,
  plannedSessionSchema,
  plannedSessionSourceSchema,
} from "./planned-session";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const structure = activityPlanStructureSchema.parse({
  version: 5 as const,
  activity_category: "run" as const,
  items: [
    {
      type: "step",
      id: id(3),
      name: "Steady",
      duration: { type: "time" as const, seconds: 1800 },
      targets: [{ type: "RPE" as const, intensity: 5 }],
    },
  ],
});
const structureHash = `v1:sha256:${sha256Hex(stringifyCanonicalJson(structure))}`;
const resolutionManifest = {
  resolver_version: "prescription-resolver-v2",
  policy_version: "training-plan-policy-v2",
  training_plan_id: null,
  training_plan_revision: null,
  training_plan_hash: null,
  athlete_context_revision: null,
  activity_plan_id: id(102),
  activity_plan_revision: 1,
  activity_plan_semantic_hash: activityPlanSemanticHash({
    structure,
    trainingIntent: "aerobic_base",
  }),
  effective_target_duration_minutes: null,
  effective_target_common_load: null,
  evidence_facts: [],
  session_demand: {
    activity_category: "run" as const,
    training_intent: "aerobic_base" as const,
    target_duration_minutes: 30,
    target_common_load: null,
    importance: "normal" as const,
  },
  fallback_level: "system_default_no_context" as const,
  reason_codes: [],
  resolved_structure: structure,
  resolved_structure_hash: structureHash,
  prescription_estimate: {
    duration: { status: "exact" as const, value_seconds: 1800 },
    common_load: { status: "unavailable" as const, value: null },
    rest_seconds: 0,
    has_open_completion: false,
    warnings: [],
    factors: ["canonical prescription quantification"],
  },
  fingerprint: `v1:sha256:${"b".repeat(64)}`,
};
const baseSession = (overrides: Record<string, unknown> = {}) => {
  const source = { kind: "direct" as const, operationId: "a".repeat(32) };
  return {
    contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
    id: id(100),
    profileId: id(101),
    sessionRevision: 1,
    planningDate: "2026-08-10",
    originalTargetDate: "2026-08-10",
    source,
    idempotencyKey: plannedSessionIdempotencyKey(source),
    groupEventId: null,
    prescription: {
      resolutionManifest,
      capturedAt: "2026-08-01T08:00:00.000Z",
    },
    lifecycle: { status: "scheduled" as const },
    ...overrides,
  };
};
describe("planned session contract", () => {
  it("represents a skip without an activity identity", () => {
    expect(
      plannedSessionLifecycleSchema.parse({
        status: "completed",
        completion: {
          state: "skipped",
          skippedAt: "2026-08-10T12:00:00.000Z",
          operationId: id(999),
        },
      }),
    ).toEqual({
      status: "completed",
      completion: {
        state: "skipped",
        skippedAt: "2026-08-10T12:00:00.000Z",
        operationId: id(999),
      },
    });
  });
  it("retains target date when a training-plan session moves", () => {
    const source = {
      kind: "training_plan" as const,
      applicationId: null,
      trainingPlanId: id(10),
      trainingPlanRevision: 4,
      sourceSessionId: id(14),
    };
    const session = {
      contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
      id: id(11),
      profileId: id(12),
      sessionRevision: 2,
      planningDate: "2026-08-12",
      originalTargetDate: "2026-08-10",
      source,
      idempotencyKey: plannedSessionIdempotencyKey(source),
      groupEventId: null,
      prescription: {
        resolutionManifest: {
          ...resolutionManifest,
          activity_plan_id: id(13),
          activity_plan_revision: 3,
        },
        capturedAt: "2026-08-01T08:00:00.000Z",
      },
      lifecycle: { status: "scheduled" as const },
    };
    expect(plannedSessionSchema.parse(session)).toEqual(session);
    expect(
      plannedSessionSchema.safeParse({ ...session, idempotencyKey: "caller-controlled" }).success,
    ).toBe(false);
  });
  it("accepts every valid completion-linkage shape", () => {
    const cancelled = baseSession({
      lifecycle: {
        status: "cancelled",
        reason: "user_requested",
        cancelledAt: "2026-08-10T12:00:00.000Z",
      },
    });
    const linked = baseSession({
      lifecycle: {
        status: "completed",
        completion: {
          state: "linked",
          activityId: id(103),
          linkedAt: "2026-08-10T12:00:00.000Z",
        },
      },
    });
    const activityDeleted = baseSession({
      lifecycle: {
        status: "completed",
        completion: {
          state: "activity_deleted",
          linkedAt: "2026-08-10T12:00:00.000Z",
          unlinkedAt: "2026-08-11T12:00:00.000Z",
        },
      },
    });
    expect(plannedSessionSchema.safeParse(cancelled).success).toBe(true);
    expect(plannedSessionSchema.safeParse(linked).success).toBe(true);
    expect(plannedSessionSchema.safeParse(activityDeleted).success).toBe(true);
  });
  it("rejects invalid completion-linkage and schedule-status shapes", () => {
    const linkedCompletion = {
      state: "linked",
      activityId: id(103),
      linkedAt: "2026-08-10T12:00:00.000Z",
    };
    expect(
      plannedSessionSchema.safeParse({
        ...baseSession(),
        lifecycle: { status: "scheduled", completion: linkedCompletion },
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...baseSession(),
        lifecycle: {
          status: "cancelled",
          reason: "user_requested",
          cancelledAt: "2026-08-10T12:00:00.000Z",
          completion: linkedCompletion,
        },
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...baseSession(),
        lifecycle: { status: "completed" },
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...baseSession(),
        lifecycle: {
          status: "completed",
          completion: {
            state: "linked",
            linkedAt: "2026-08-10T12:00:00.000Z",
          },
        },
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...baseSession(),
        lifecycle: {
          status: "completed",
          completion: {
            state: "activity_deleted",
            activityId: id(103),
            linkedAt: "2026-08-10T12:00:00.000Z",
            unlinkedAt: "2026-08-11T12:00:00.000Z",
          },
        },
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...baseSession(),
        lifecycle: {
          status: "completed",
          completion: {
            state: "activity_deleted",
            linkedAt: "2026-08-11T12:00:00.000Z",
            unlinkedAt: "2026-08-10T12:00:00.000Z",
          },
        },
      }).success,
    ).toBe(false);
  });
  it("preserves direct source identity, positive revisions, and prescription snapshots", () => {
    const session = baseSession();
    expect(plannedSessionSchema.safeParse(session).success).toBe(true);
    expect(plannedSessionSchema.safeParse({ ...session, groupEventId: undefined }).success).toBe(
      true,
    );
    const trainingPlanSource = {
      kind: "training_plan" as const,
      trainingPlanId: id(108),
      trainingPlanRevision: 2,
      sourceSessionId: id(109),
    };
    expect(plannedSessionIdempotencyKey(session.source)).toBe(`direct:${"a".repeat(32)}`);
    expect(plannedSessionIdempotencyKey(trainingPlanSource)).toBe(
      `training-plan:${id(108)}:2:${id(109)}`,
    );
    expect(plannedSessionSchema.safeParse({ ...session, sessionRevision: 0 }).success).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...session,
        prescription: {
          ...session.prescription,
          resolutionManifest: { ...resolutionManifest, activity_plan_revision: 0 },
        },
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...session,
        prescription: {
          ...session.prescription,
          resolutionManifest: {
            ...resolutionManifest,
            resolved_structure: { ...structure, unknown: true },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSourceSchema.safeParse({
        ...trainingPlanSource,
        operationId: "a".repeat(32),
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSourceSchema.safeParse({ ...trainingPlanSource, trainingPlanRevision: 0 })
        .success,
    ).toBe(false);
    expect(
      plannedSessionSourceSchema.safeParse({
        kind: "recurrence",
        seriesId: id(110),
        occurrenceKey: "2026-08-10",
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...session,
        prescription: { ...session.prescription, capturedAt: "not-an-instant" },
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate group-event associations for the same profile", () => {
    const groupEventId = id(104);
    const first = baseSession({ groupEventId });
    const duplicate = baseSession({ id: id(105), groupEventId });
    const anotherProfile = baseSession({ id: id(106), profileId: id(107), groupEventId });
    expect(plannedSessionCollectionSchema.safeParse([first, duplicate]).success).toBe(false);
    expect(plannedSessionCollectionSchema.safeParse([first, anotherProfile]).success).toBe(true);
  });
  it("models unlinking as an activity-deleted completion that keeps its link history", () => {
    const unlinked = baseSession({
      lifecycle: {
        status: "completed",
        completion: {
          state: "activity_deleted",
          linkedAt: "2026-08-10T12:00:00.000Z",
          unlinkedAt: "2026-08-10T12:00:00.000Z",
        },
      },
    });
    expect(plannedSessionSchema.parse(unlinked).lifecycle).toEqual({
      status: "completed",
      completion: {
        state: "activity_deleted",
        linkedAt: "2026-08-10T12:00:00.000Z",
        unlinkedAt: "2026-08-10T12:00:00.000Z",
        outcome: "full",
      },
    });
  });
});
