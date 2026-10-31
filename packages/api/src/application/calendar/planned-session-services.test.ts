import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  type PlannedSession,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { describe, expect, it } from "vitest";
import type {
  CreateOwnedPlannedSessionResult,
  PlannedSessionRepositoryPort,
} from "../../repositories/planned-session-repository-port";
import { createResolutionManifestFixture } from "../../test/builders/planned-session";
import { cancelPlannedSession } from "./cancel-planned-session";
import { createPlannedSession } from "./create-planned-session";
import { linkPlannedSessionCompletion } from "./link-planned-session-completion";
import { movePlannedSession } from "./move-planned-session";
import {
  PlannedSessionAccessError,
  PlannedSessionStaleRevisionError,
  PlannedSessionStateConflictError,
} from "./planned-session-errors";
import { readPlannedSessionRange } from "./read-planned-session-range";

const profileId = "11111111-1111-4111-8111-111111111111";
const otherProfileId = "22222222-2222-4222-8222-222222222222";
const ownedActivityPlanId = "33333333-3333-4333-8333-333333333333";
const systemActivityPlanId = "44444444-4444-4444-8444-444444444444";
const otherActivityPlanId = "55555555-5555-4555-8555-555555555555";
const ownedTrainingPlanId = "66666666-6666-4666-8666-666666666666";
const systemTrainingPlanId = "77777777-7777-4777-8777-777777777777";
const otherTrainingPlanId = "88888888-8888-4888-8888-888888888888";
const activityId = "99999999-9999-4999-8999-999999999999";
const groupEventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      name: "Steady",
      duration: { type: "time", seconds: 1800 },
      targets: [{ type: "%FTP", intensity: 75 }],
    },
  ],
});
function session(input: {
  id: string;
  source:
    | {
        kind: "direct";
        operationId: string;
      }
    | {
        kind: "training_plan";
        trainingPlanId: string;
        trainingPlanRevision: number;
        sourceSessionId: string;
      };
  activityPlanId?: string;
  planningDate?: string;
  groupEventId?: string | null;
}) {
  const planningDate = input.planningDate ?? "2026-08-20";
  return plannedSessionSchema.parse({
    contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
    id: input.id,
    profileId,
    sessionRevision: 1,
    planningDate,
    originalTargetDate: planningDate,
    source: input.source,
    idempotencyKey: plannedSessionIdempotencyKey(input.source),
    groupEventId: input.groupEventId ?? null,
    prescription: {
      resolutionManifest: createResolutionManifestFixture({
        activityPlanId: input.activityPlanId ?? ownedActivityPlanId,
        structure,
        demand: {
          activity_category: "bike",
          training_intent: "general_maintenance",
          target_duration_minutes: 30,
          target_common_load: null,
          importance: "normal",
        },
      }),
      capturedAt: "2026-08-01T00:00:00.000Z",
    },
    lifecycle: { status: "scheduled" },
  });
}
class MemoryPlannedSessionRepository implements PlannedSessionRepositoryPort {
  readonly sessions = new Map<string, PlannedSession>();
  readonly idempotency = new Map<string, string>();
  readonly activityPlans = new Set([ownedActivityPlanId, systemActivityPlanId]);
  readonly trainingPlans = new Set([ownedTrainingPlanId, systemTrainingPlanId]);
  readonly activities = new Set([activityId]);
  async createOwned(input: {
    profileId: string;
    session: PlannedSession;
  }): Promise<CreateOwnedPlannedSessionResult> {
    const existingId = this.idempotency.get(`${input.profileId}:${input.session.idempotencyKey}`);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (!existing) throw new Error("Missing memory session");
      const immutableMatches =
        existing.originalTargetDate === input.session.originalTargetDate &&
        JSON.stringify(existing.source) === JSON.stringify(input.session.source) &&
        JSON.stringify(existing.prescription) === JSON.stringify(input.session.prescription);
      return immutableMatches
        ? { status: "unchanged", session: existing }
        : { status: "identity_conflict" };
    }
    if (
      input.session.groupEventId &&
      [...this.sessions.values()].some(
        (candidate) =>
          candidate.profileId === input.profileId &&
          candidate.groupEventId === input.session.groupEventId,
      )
    ) {
      return { status: "conflict", reason: "group_event_already_linked" };
    }
    this.sessions.set(input.session.id, input.session);
    this.idempotency.set(`${input.profileId}:${input.session.idempotencyKey}`, input.session.id);
    return { status: "created", session: input.session };
  }
  async listOwnedRange(input: {
    profileId: string;
    startDate: string;
    endDate: string;
    limit: number;
  }) {
    const matches = [...this.sessions.values()]
      .filter(
        (candidate) =>
          candidate.profileId === input.profileId &&
          candidate.planningDate >= input.startDate &&
          candidate.planningDate <= input.endDate,
      )
      .sort(
        (left, right) =>
          left.planningDate.localeCompare(right.planningDate) || left.id.localeCompare(right.id),
      );
    return { items: matches.slice(0, input.limit), truncated: matches.length > input.limit };
  }
  async getOwned(input: { profileId: string; sessionId: string }) {
    const existing = this.sessions.get(input.sessionId);
    return existing?.profileId === input.profileId ? existing : null;
  }
  async listOwnedLinkedToActivity(input: { profileId: string; activityId: string }) {
    return [...this.sessions.values()].filter(
      (candidate) =>
        candidate.profileId === input.profileId &&
        candidate.lifecycle.status === "completed" &&
        candidate.lifecycle.completion.state === "linked" &&
        candidate.lifecycle.completion.activityId === input.activityId,
    );
  }
  async mutateOwned(input: Parameters<PlannedSessionRepositoryPort["mutateOwned"]>[0]) {
    const current = await this.getOwned({ profileId: input.profileId, sessionId: input.sessionId });
    if (!current) return { status: "not_found" as const };
    if (current.sessionRevision !== input.expectedRevision) {
      return { status: "stale_revision" as const, currentRevision: current.sessionRevision };
    }
    if (current.lifecycle.status !== "scheduled" && input.action !== "unlink_deleted_activity") {
      return { status: "conflict" as const, reason: "already_completed" as const };
    }
    if (input.action === "link_completion" && !this.activities.has(input.activityId)) {
      return { status: "conflict" as const, reason: "activity_not_owned" as const };
    }
    let updated: PlannedSession;
    switch (input.action) {
      case "move":
        updated = plannedSessionSchema.parse({
          ...current,
          planningDate: input.planningDate,
          sessionRevision: current.sessionRevision + 1,
        });
        break;
      case "cancel":
        updated = plannedSessionSchema.parse({
          ...current,
          sessionRevision: current.sessionRevision + 1,
          lifecycle: {
            status: "cancelled",
            reason: input.reason,
            cancelledAt: input.cancelledAt,
          },
        });
        break;
      case "link_completion":
        updated = plannedSessionSchema.parse({
          ...current,
          sessionRevision: current.sessionRevision + 1,
          lifecycle: {
            status: "completed",
            completion: { state: "linked", activityId: input.activityId, linkedAt: input.linkedAt },
          },
        });
        break;
      default:
        return { status: "not_found" as const };
    }
    this.sessions.set(updated.id, updated);
    return { status: "updated" as const, session: updated };
  }
  async trainingPlanExistsForProfile(input: { profileId: string; trainingPlanId: string }) {
    return input.profileId === profileId && this.trainingPlans.has(input.trainingPlanId);
  }
  async activityPlanExistsForProfile(input: { profileId: string; activityPlanId: string }) {
    return input.profileId === profileId && this.activityPlans.has(input.activityPlanId);
  }
  async getActivityPlanPrescriptionSource(input: { profileId: string; activityPlanId: string }) {
    if (!(await this.activityPlanExistsForProfile(input))) return null;
    return {
      id: input.activityPlanId,
      profileId: input.activityPlanId === systemActivityPlanId ? null : input.profileId,
      name: "Saved ride",
      description: null,
      revision: 1,
      structure,
      trainingIntent: "general_maintenance" as const,
      structureHash: `v1:sha256:${"a".repeat(64)}`,
      semanticHash: activityPlanSemanticHash({
        structure,
        trainingIntent: "general_maintenance",
      }),
      gpsRecordingEnabled: true,
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
  }
  async groupEventExistsForProfile(input: { profileId: string; groupEventId: string }) {
    return input.profileId === profileId && input.groupEventId.length > 0;
  }
}
describe("planned-session application services", () => {
  it("converges direct and training-plan source replays", async () => {
    const repository = new MemoryPlannedSessionRepository();
    const direct = session({
      id: "00000000-0000-4000-8000-000000000001",
      source: { kind: "direct", operationId: `direct_${"a".repeat(32)}` },
    });
    const training = session({
      id: "00000000-0000-4000-8000-000000000002",
      source: {
        kind: "training_plan",
        trainingPlanId: ownedTrainingPlanId,
        trainingPlanRevision: 3,
        sourceSessionId: "00000000-0000-4000-8000-000000000004",
      },
    });
    await createPlannedSession({ repository, profileId, session: direct });
    await createPlannedSession({ repository, profileId, session: training });
    for (const candidate of [direct, training]) {
      const replay = await createPlannedSession({
        repository,
        profileId,
        session: { ...candidate, id: crypto.randomUUID() },
      });
      expect(replay.status).toBe("unchanged");
      expect(replay.session.id).toBe(candidate.id);
    }
  });
  it("requires the current revision for move, cancel, and completion link", async () => {
    const repository = new MemoryPlannedSessionRepository();
    const planned = session({
      id: "00000000-0000-4000-8000-000000000010",
      source: { kind: "direct", operationId: `direct_${"b".repeat(32)}` },
    });
    await createPlannedSession({ repository, profileId, session: planned });
    await expect(
      movePlannedSession({
        repository,
        profileId,
        sessionId: planned.id,
        expectedRevision: 2,
        planningDate: "2026-08-22",
      }),
    ).rejects.toBeInstanceOf(PlannedSessionStaleRevisionError);
    await expect(
      cancelPlannedSession({
        repository,
        profileId,
        sessionId: planned.id,
        expectedRevision: 2,
        reason: "user_requested",
        cancelledAt: "2026-08-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(PlannedSessionStaleRevisionError);
    await expect(
      linkPlannedSessionCompletion({
        repository,
        profileId,
        sessionId: planned.id,
        expectedRevision: 2,
        activityId,
        linkedAt: "2026-08-20T01:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(PlannedSessionStaleRevisionError);
    await expect(
      linkPlannedSessionCompletion({
        repository,
        profileId,
        sessionId: planned.id,
        expectedRevision: 1,
        activityId: "aaaaaaaa-0000-4000-8000-000000000001",
        linkedAt: "2026-08-20T01:00:00.000Z",
      }),
    ).rejects.toMatchObject({ reason: "activity_not_owned" });
  });
  it("allows only owned or system activity and training plans", async () => {
    const repository = new MemoryPlannedSessionRepository();
    for (const [id, activityPlanId, trainingPlanId] of [
      ["00000000-0000-4000-8000-000000000020", ownedActivityPlanId, ownedTrainingPlanId],
      ["00000000-0000-4000-8000-000000000021", systemActivityPlanId, systemTrainingPlanId],
    ] as const) {
      await expect(
        createPlannedSession({
          repository,
          profileId,
          session: session({
            id,
            activityPlanId,
            source: {
              kind: "training_plan",
              trainingPlanId,
              trainingPlanRevision: 1,
              sourceSessionId: id,
            },
          }),
        }),
      ).resolves.toMatchObject({ status: "created" });
    }
    await expect(
      createPlannedSession({
        repository,
        profileId,
        session: session({
          id: "00000000-0000-4000-8000-000000000022",
          activityPlanId: otherActivityPlanId,
          source: { kind: "direct", operationId: `direct_${"c".repeat(32)}` },
        }),
      }),
    ).rejects.toBeInstanceOf(PlannedSessionAccessError);
    await expect(
      createPlannedSession({
        repository,
        profileId,
        session: session({
          id: "00000000-0000-4000-8000-000000000023",
          source: {
            kind: "training_plan",
            trainingPlanId: otherTrainingPlanId,
            trainingPlanRevision: 1,
            sourceSessionId: "00000000-0000-4000-8000-000000000024",
          },
        }),
      }),
    ).rejects.toBeInstanceOf(PlannedSessionAccessError);
  });
  it("enforces one group-event association per profile and owner-scoped range reads", async () => {
    const repository = new MemoryPlannedSessionRepository();
    const first = session({
      id: "00000000-0000-4000-8000-000000000040",
      groupEventId,
      source: { kind: "direct", operationId: `direct_${"e".repeat(32)}` },
    });
    const second = session({
      id: "00000000-0000-4000-8000-000000000041",
      groupEventId,
      source: { kind: "direct", operationId: `direct_${"f".repeat(32)}` },
    });
    await createPlannedSession({ repository, profileId, session: first });
    await expect(
      createPlannedSession({ repository, profileId, session: second }),
    ).rejects.toBeInstanceOf(PlannedSessionStateConflictError);
    expect(
      await readPlannedSessionRange({
        repository,
        profileId,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
    ).toMatchObject({ items: [{ id: first.id }], truncated: false });
    expect(
      await readPlannedSessionRange({
        repository,
        profileId: otherProfileId,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
    ).toEqual({ items: [], truncated: false });
  });
});
