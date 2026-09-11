import { describe, expect, it } from "vitest";

import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionCollectionSchema,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
  plannedSessionSourceSchema,
} from "./planned-session";

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const structure = {
  version: 3 as const,
  activity_category: "run" as const,
  segments: [
    {
      id: id(1),
      role: "activity" as const,
      name: "Run",
      intervals: [
        {
          id: id(2),
          name: "Work",
          repetitions: 1,
          steps: [
            {
              id: id(3),
              name: "Steady",
              duration: { type: "time" as const, seconds: 1_800 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
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
      activityPlanId: id(102),
      activityPlanRevision: 1,
      variantId: id(102),
      variantName: "Base",
      structureHash: `v1:sha256:${"0".repeat(64)}`,
      structure,
      prescriptionQuantification: null,
      capturedAt: "2026-08-01T08:00:00.000Z",
    },
    lifecycle: { status: "scheduled" as const },
    ...overrides,
  };
};

describe("planned session contract", () => {
  it("accepts only v2 snapshots with canonical variant provenance", () => {
    const session = baseSession();

    expect(PLANNED_SESSION_CONTRACT_VERSION).toBe("planned-session-v2");
    expect(plannedSessionSchema.parse(session).prescription).toMatchObject({
      variantId: id(102),
      variantName: "Base",
    });
    expect(
      plannedSessionSchema.safeParse({ ...session, contractVersion: "planned-session-v1" }).success,
    ).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...session,
        prescription: { ...session.prescription, variantId: undefined },
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...session,
        prescription: { ...session.prescription, variantName: undefined },
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...session,
        prescription: {
          ...session.prescription,
          variantId: "00000000-0000-0000-0000-000000000000",
        },
      }).success,
    ).toBe(false);

    for (const variantName of ["", " Base ", "x".repeat(101)]) {
      expect(
        plannedSessionSchema.safeParse({
          ...session,
          prescription: { ...session.prescription, variantName },
        }).success,
      ).toBe(false);
    }

    const uppercaseVariantId = id(102).toUpperCase();
    expect(
      plannedSessionSchema.parse({
        ...session,
        prescription: { ...session.prescription, variantId: uppercaseVariantId },
      }).prescription.variantId,
    ).toBe(id(102));
  });

  it("retains target date when a training-plan session moves", () => {
    const source = {
      kind: "training_plan" as const,
      trainingPlanId: id(10),
      trainingPlanRevision: 4,
      sourceSessionKey: "week-1-session-2",
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
        activityPlanId: id(13),
        activityPlanRevision: 3,
        variantId: id(13),
        variantName: "Base",
        structureHash: `v1:sha256:${"0".repeat(64)}`,
        structure,
        prescriptionQuantification: null,
        capturedAt: "2026-08-01T08:00:00.000Z",
      },
      lifecycle: { status: "scheduled" as const },
    };
    expect(plannedSessionSchema.parse(session)).toEqual(session);
    expect(
      plannedSessionSchema.safeParse({ ...session, idempotencyKey: "caller-controlled" }).success,
    ).toBe(false);
  });

  it("keeps the original planning date as a recurring occurrence identity after a move", () => {
    const source = {
      kind: "recurrence" as const,
      seriesId: id(20),
      occurrenceKey: "2026-08-10",
    };
    const base = {
      contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
      id: id(21),
      profileId: id(22),
      sessionRevision: 1,
      planningDate: "2026-08-11",
      originalTargetDate: "2026-08-10",
      source,
      idempotencyKey: plannedSessionIdempotencyKey(source),
      groupEventId: null,
      prescription: {
        activityPlanId: id(23),
        activityPlanRevision: 1,
        variantId: id(23),
        variantName: "Base",
        structureHash: `v1:sha256:${"0".repeat(64)}`,
        structure,
        prescriptionQuantification: null,
        capturedAt: "2026-08-01T08:00:00.000Z",
      },
      lifecycle: { status: "scheduled" as const },
    };
    expect(plannedSessionSchema.safeParse(base).success).toBe(true);
    expect(
      plannedSessionSchema.safeParse({
        ...base,
        originalTargetDate: "2026-08-09",
      }).success,
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
      sourceSessionKey: "week-1-session-1",
    };
    const recurrenceSource = {
      kind: "recurrence" as const,
      seriesId: id(109),
      occurrenceKey: "2026-08-10",
    };
    expect(plannedSessionIdempotencyKey(session.source)).toBe(`direct:${"a".repeat(32)}`);
    expect(plannedSessionIdempotencyKey(trainingPlanSource)).toBe(
      `training-plan:${id(108)}:2:week-1-session-1`,
    );
    expect(plannedSessionIdempotencyKey(recurrenceSource)).toBe(`recurrence:${id(109)}:2026-08-10`);
    expect(plannedSessionSchema.safeParse({ ...session, sessionRevision: 0 }).success).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...session,
        prescription: { ...session.prescription, activityPlanRevision: 0 },
      }).success,
    ).toBe(false);
    expect(
      plannedSessionSchema.safeParse({
        ...session,
        prescription: { ...session.prescription, structure: { ...structure, unknown: true } },
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

    expect(plannedSessionSchema.parse(unlinked).lifecycle).toEqual(unlinked.lifecycle);
  });
});
