import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { plannedSessionIdempotencyKey } from "@repo/core/calendar";
import type { PlannedSessionRow } from "@repo/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { createResolutionManifestFixture } from "../../test/builders/planned-session";
import {
  createDrizzlePlannedSessionRepository,
  immutableSessionMatches,
  isConvergedGroupEventMutation,
  mapPlannedSessionRow,
} from "./drizzle-planned-session-repository";

const linkedAt = new Date("2026-08-01T12:00:00.000Z");
const unlinkedAt = new Date("2026-08-02T12:00:00.000Z");
const prescriptionStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "66666666-6666-4666-8666-666666666666",
      name: "Steady",
      duration: { type: "time", seconds: 1800 },
      targets: [{ type: "%FTP", intensity: 75 }],
    },
  ],
});
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  profile_id: "22222222-2222-4222-8222-222222222222",
  contract_version: "planned-session-v1",
  session_revision: 3,
  planning_date: "2026-08-03",
  original_target_date: "2026-08-01",
  source_kind: "direct",
  idempotency_key: "direct:direct_planned_session_operation_1",
  direct_operation_id: "direct_planned_session_operation_1",
  training_plan_id: null,
  training_plan_revision: null,
  training_plan_application_id: null,
  source_session_id: null,
  group_event_id: null,
  activity_plan_id: "33333333-3333-4333-8333-333333333333",
  activity_plan_revision: 1,
  resolution_manifest: createResolutionManifestFixture({
    activityPlanId: "33333333-3333-4333-8333-333333333333",
    structure: prescriptionStructure,
    demand: {
      activity_category: "bike",
      training_intent: "general_maintenance",
      target_duration_minutes: 30,
      target_common_load: null,
      importance: "normal",
    },
  }),
  prescription_captured_at: linkedAt,
  status: "completed",
  cancellation_reason: null,
  cancelled_at: null,
  completed_activity_id: null,
  completion_state: "activity_deleted",
  completion_outcome: "full",
  skip_operation_id: null,
  linked_at: linkedAt,
  completion_unlinked_at: unlinkedAt,
  created_at: linkedAt,
  updated_at: unlinkedAt,
} satisfies PlannedSessionRow;
describe("planned-session Drizzle mapper", () => {
  it("preserves original scheduling and completion history after activity unlink", () => {
    expect(mapPlannedSessionRow(row)).toMatchObject({
      id: row.id,
      profileId: row.profile_id,
      sessionRevision: 3,
      planningDate: "2026-08-03",
      originalTargetDate: "2026-08-01",
      source: { kind: "direct", operationId: row.direct_operation_id },
      lifecycle: {
        status: "completed",
        completion: {
          state: "activity_deleted",
          linkedAt: linkedAt.toISOString(),
          unlinkedAt: unlinkedAt.toISOString(),
        },
      },
    });
  });
  it("rejects malformed source and date rows rather than returning persistence data", () => {
    expect(() => mapPlannedSessionRow({ ...row, direct_operation_id: "short" })).toThrow();
    expect(() => mapPlannedSessionRow({ ...row, planning_date: "08/03/2026" })).toThrow();
  });
  it("treats a direct-operation replay with a different group event as a conflict", () => {
    const existing = mapPlannedSessionRow(row);
    const prescription = existing.prescription;
    if (!prescription) throw new Error("Legacy row fixture must have a prescription");
    expect(
      immutableSessionMatches(existing, {
        ...existing,
        id: "77777777-7777-4777-8777-777777777777",
        groupEventId: "88888888-8888-4888-8888-888888888888",
        prescription: {
          ...prescription,
          capturedAt: "2026-08-03T12:00:00.000Z",
        },
      }),
    ).toBe(false);
  });
  it("allows a truthful direct replay to keep its first server capture timestamp", () => {
    const existing = mapPlannedSessionRow(row);
    const prescription = existing.prescription;
    if (!prescription) throw new Error("Legacy row fixture must have a prescription");
    expect(
      immutableSessionMatches(existing, {
        ...existing,
        id: "77777777-7777-4777-8777-777777777777",
        prescription: {
          ...prescription,
          capturedAt: "2026-08-03T12:00:00.000Z",
        },
      }),
    ).toBe(true);
  });
  it("keeps a direct-operation retry idempotent after its referenced plan changes", () => {
    const existing = mapPlannedSessionRow(row);
    const prescription = existing.prescription;
    if (!prescription) throw new Error("Legacy row fixture must have a prescription");
    expect(
      immutableSessionMatches(existing, {
        ...existing,
        prescription: {
          ...prescription,
          capturedAt: "2026-08-03T12:00:00.000Z",
          resolutionManifest: {
            ...prescription.resolutionManifest,
            session_demand: {
              ...prescription.resolutionManifest.session_demand,
              target_duration_minutes: 75,
            },
          },
        },
      }),
    ).toBe(true);
  });
  it("converges only current no-ops and exact one-revision group-event retries", () => {
    const scheduled = {
      ...mapPlannedSessionRow({
        ...row,
        session_revision: 3,
        group_event_id: "88888888-8888-4888-8888-888888888888",
        status: "scheduled" as const,
        completion_state: null,
        linked_at: null,
        completion_unlinked_at: null,
      }),
      lifecycle: { status: "scheduled" as const },
    };
    const link = {
      action: "associate_group_event" as const,
      profileId: scheduled.profileId,
      sessionId: scheduled.id,
      groupEventId: scheduled.groupEventId as string,
    };
    expect(isConvergedGroupEventMutation(scheduled, { ...link, expectedRevision: 3 })).toBe(true);
    expect(isConvergedGroupEventMutation(scheduled, { ...link, expectedRevision: 2 })).toBe(true);
    expect(isConvergedGroupEventMutation(scheduled, { ...link, expectedRevision: 1 })).toBe(false);
    expect(
      isConvergedGroupEventMutation(scheduled, {
        ...link,
        expectedRevision: 2,
        groupEventId: "99999999-9999-4999-8999-999999999999",
      }),
    ).toBe(false);
    const unlinked = { ...scheduled, groupEventId: null };
    expect(
      isConvergedGroupEventMutation(unlinked, {
        action: "clear_group_event",
        profileId: unlinked.profileId,
        sessionId: unlinked.id,
        expectedRevision: 2,
        groupEventId: "88888888-8888-4888-8888-888888888888",
      }),
    ).toBe(true);
    expect(
      isConvergedGroupEventMutation(unlinked, {
        action: "clear_group_event",
        profileId: unlinked.profileId,
        sessionId: unlinked.id,
        expectedRevision: 1,
        groupEventId: "88888888-8888-4888-8888-888888888888",
      }),
    ).toBe(false);
    expect(
      isConvergedGroupEventMutation(scheduled, {
        action: "clear_group_event",
        profileId: scheduled.profileId,
        sessionId: scheduled.id,
        expectedRevision: 2,
        groupEventId: "88888888-8888-4888-8888-888888888888",
      }),
    ).toBe(false);
  });
  it("uses active membership and excludes deleted groups and cancelled events", async () => {
    let whereCondition: unknown;
    const db = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: (condition: unknown) => {
                whereCondition = condition;
                return { limit: async () => [] };
              },
            }),
          }),
        }),
      }),
    };
    const repository = createDrizzlePlannedSessionRepository(db as never);
    await expect(
      repository.groupEventExistsForProfile({
        profileId: row.profile_id,
        groupEventId: "88888888-8888-4888-8888-888888888888",
      }),
    ).resolves.toBe(false);
    const query = new PgDialect().sqlToQuery(whereCondition as never);
    expect(query.sql).toContain('"group_memberships"."profile_id" =');
    expect(query.sql).toContain('"group_memberships"."status" =');
    expect(query.sql).toContain('"group_events"."id" =');
    expect(query.sql).toContain('"groups"."deleted_at" is null');
    expect(query.sql).toContain('"group_events"."cancelled_at" is null');
    expect(query.params).toEqual(
      expect.arrayContaining([row.profile_id, "active", "88888888-8888-4888-8888-888888888888"]),
    );
  });
  it("reactivates an exact cancelled training-plan replay without resurrecting completed sessions", async () => {
    const cancelledTrainingPlanRow = {
      ...row,
      session_revision: 2,
      planning_date: "2026-08-01",
      source_kind: "training_plan" as const,
      direct_operation_id: null,
      training_plan_id: "99999999-9999-4999-8999-999999999999",
      training_plan_revision: 1,
      source_session_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      idempotency_key: plannedSessionIdempotencyKey({
        kind: "training_plan",
        trainingPlanId: "99999999-9999-4999-8999-999999999999",
        trainingPlanRevision: 1,
        sourceSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
      status: "cancelled" as const,
      cancellation_reason: "user_requested" as const,
      cancelled_at: linkedAt,
      completed_activity_id: null,
      completion_state: null,
      linked_at: null,
      completion_unlinked_at: null,
    } satisfies PlannedSessionRow;
    const cancelled = mapPlannedSessionRow(cancelledTrainingPlanRow);
    const replay = {
      ...cancelled,
      id: "77777777-7777-4777-8777-777777777777",
      sessionRevision: 1,
      lifecycle: { status: "scheduled" as const },
    };
    const reactivatedRow = {
      ...cancelledTrainingPlanRow,
      session_revision: 3,
      status: "scheduled" as const,
      cancellation_reason: null,
      cancelled_at: null,
    } satisfies PlannedSessionRow;
    const updateSet = vi.fn(() => ({
      where: () => ({ returning: async () => [reactivatedRow] }),
    }));
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: async () => [{ id: "plan" }] }) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: async () => [{ id: "plan" }] }) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: async () => [cancelledTrainingPlanRow] }) }),
      });
    const repository = createDrizzlePlannedSessionRepository({
      select,
      insert: () => ({
        values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }),
      }),
      update: () => ({ set: updateSet }),
    } as never);
    await expect(
      repository.createOwned({ profileId: replay.profileId, session: replay }),
    ).resolves.toMatchObject({
      status: "unchanged",
      session: { lifecycle: { status: "scheduled" }, sessionRevision: 3 },
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "scheduled",
        cancellation_reason: null,
        cancelled_at: null,
      }),
    );
    const completedRepository = createDrizzlePlannedSessionRepository({
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => [{ id: "plan" }] }) }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => [{ id: "plan" }] }) }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  ...cancelledTrainingPlanRow,
                  status: "completed" as const,
                  cancellation_reason: null,
                  cancelled_at: null,
                  completion_state: "activity_deleted" as const,
                  linked_at: linkedAt,
                  completion_unlinked_at: unlinkedAt,
                },
              ],
            }),
          }),
        }),
      insert: () => ({
        values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }),
      }),
      update: () => ({ set: updateSet }),
    } as never);
    await expect(
      completedRepository.createOwned({ profileId: replay.profileId, session: replay }),
    ).resolves.toMatchObject({
      status: "unchanged",
      session: { lifecycle: { status: "completed" } },
    });
    expect(updateSet).toHaveBeenCalledTimes(1);
  });
});
