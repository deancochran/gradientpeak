import {
  activityPlanAuthoringContentSchema,
  activityPlanStructureSchema,
} from "@repo/core/activity-plan";
import { plannedSessionIdempotencyKey, plannedSessionSchema } from "@repo/core/calendar";
import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { PlannedSessionStaleRevisionError } from "../../application/calendar/planned-session-errors";
import { PLANNED_SESSION_CACHE_TAGS } from "../../contracts/cache-receipts";
import { createResolutionManifestFixture } from "../../test/builders/planned-session";
import { createRouterCaller } from "../../test/router";
import { createPlannedSessionsRouter } from "../planned-sessions";

const providerQueue = vi.hoisted(() => ({ enqueue: vi.fn().mockResolvedValue(null) }));
vi.mock("../../lib/provider-sync/planned-activities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/provider-sync/planned-activities")>()),
  enqueueWahooPlannedSessionSyncAfterMutation: providerQueue.enqueue,
}));
vi.mock("../../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../db")>();
  return {
    ...actual,
    withProfileFencedRepeatableReadSnapshot: async <Result>(
      db: { transaction: (work: (tx: never) => Promise<Result>) => Promise<Result> },
      _profileId: string,
      write: (tx: never) => Promise<Result>,
    ) => db.transaction(write),
  };
});

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const GROUP_EVENT_ID = "88888888-8888-4888-8888-888888888888";

function session() {
  const source = { kind: "direct" as const, operationId: "a".repeat(32) };
  return plannedSessionSchema.parse({
    contractVersion: "planned-session-v1",
    id: SESSION_ID,
    profileId: PROFILE_ID,
    sessionRevision: 1,
    planningDate: "2026-08-10",
    originalTargetDate: "2026-08-10",
    source,
    idempotencyKey: plannedSessionIdempotencyKey(source),
    groupEventId: null,
    prescription: {
      resolutionManifest: createResolutionManifestFixture({
        activityPlanId: "44444444-4444-4444-8444-444444444444",
        demand: {
          activity_category: "run",
          training_intent: "general_maintenance",
          target_duration_minutes: null,
          target_common_load: null,
          importance: "normal",
        },
        structure: activityPlanStructureSchema.parse({
          version: 3,
          activity_category: "run",
          segments: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              role: "activity",
              name: "Run",
              intervals: [
                {
                  id: "66666666-6666-4666-8666-666666666666",
                  name: "Work",
                  repetitions: 1,
                  steps: [
                    {
                      id: "77777777-7777-4777-8777-777777777777",
                      name: "Steady",
                      duration: { type: "time", seconds: 1_800 },
                      targets: [{ type: "RPE", intensity: 5 }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      }),
      capturedAt: "2026-08-01T08:00:00.000Z",
    },
    lifecycle: { status: "scheduled" },
  });
}

function router(overrides: Record<string, unknown> = {}) {
  const current = session();
  const dependencies = {
    createDirect: vi.fn(async (_input: unknown) => ({
      status: "created" as const,
      session: current,
    })),
    readRange: vi.fn(async () => ({ items: [current], truncated: false })),
    move: vi.fn(async () => ({ ...current, sessionRevision: 2, planningDate: "2026-08-11" })),
    cancel: vi.fn(async () => current),
    linkCompletion: vi.fn(async () => current),
    reconcileManualCompletion: vi.fn(async () => ({
      outcome: "updated" as const,
      session: current,
    })),
    completionCandidates: vi.fn(async () => ({
      canAssociate: true,
      reason: null,
      currentActivityId: null,
      items: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          name: "Imported run",
          activityCategory: "run" as const,
          startedAt: new Date("2026-08-10T08:00:00.000Z"),
          elapsedMs: 1_800_000,
        },
      ],
      nextCursor: {
        id: "99999999-9999-4999-8999-999999999999",
        startedAt: new Date("2026-08-10T08:00:00.000Z"),
      },
    })),
    linkGroupEvent: vi.fn(async () => current),
    unlinkGroupEvent: vi.fn(async () => current),
    readLinkedActivityObservation: vi.fn(async () => null),
    createId: () => SESSION_ID,
    now: () => new Date("2026-08-01T08:00:00.000Z"),
    ...overrides,
  };
  return { dependencies, router: createPlannedSessionsRouter(dependencies as never) };
}

const transactionDb = {
  transaction: async <T>(work: (tx: never) => Promise<T>) => work({} as never),
};

describe("plannedSessionsRouter", () => {
  it("maps newly selected plan policy failures to BAD_REQUEST with field diagnostics", async () => {
    const historical = session().prescription.resolutionManifest.resolved_structure;
    const validation = activityPlanAuthoringContentSchema.safeParse({
      structure: historical,
      intent: { training_intent: "general_maintenance" },
    });
    if (validation.success) throw new Error("Fixture must retain its historical missing purpose");
    const { router: planned } = router({
      createDirect: vi.fn(async () => {
        throw validation.error;
      }),
    });
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: transactionDb });
    await expect(
      caller.create({
        profileId: PROFILE_ID,
        session: {
          planningDate: "2026-08-10",
          source: { kind: "direct", operationId: "a".repeat(32) },
          activityPlanId: "44444444-4444-4444-8444-444444444444",
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      cause: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: ["structure", "segments", 0, "intervals", 0, "steps", 0, "purpose"],
          }),
        ]),
      },
    });
  });

  it("continues reading frozen historical structures without new-authoring validation", async () => {
    const { router: planned, dependencies } = router();
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: transactionDb });
    const result = await caller.range({
      profileId: PROFILE_ID,
      range: { startDate: "2026-08-01", endDate: "2026-08-31" },
    });
    expect(result.items).toHaveLength(1);
    expect(dependencies.createDirect).not.toHaveBeenCalled();
  });
  it("routes an explicit operation-id completion link through manual reconciliation", async () => {
    const reconcileManualCompletion = vi.fn(async () => ({
      outcome: "updated" as const,
      session: session(),
    }));
    const { router: planned } = router({ reconcileManualCompletion });
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: transactionDb });

    await caller.linkCompletion({
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      expectedRevision: 1,
      activityId: "99999999-9999-4999-8999-999999999999",
      outcome: "partial",
      operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(reconcileManualCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: "99999999-9999-4999-8999-999999999999",
        expectedRevision: 1,
        operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    );
  });

  it("requires authentication and rejects cross-profile reads before service access", async () => {
    const { router: planned, dependencies } = router();
    const unauthenticated = createRouterCaller(planned, { session: null, db: {} });
    await expect(
      unauthenticated.range({
        profileId: PROFILE_ID,
        range: { startDate: "2026-08-01", endDate: "2026-08-31" },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" } satisfies Partial<TRPCError>);

    const other = createRouterCaller(planned, { userId: OTHER_ID, db: {} });
    await expect(
      other.range({
        profileId: PROFILE_ID,
        range: { startDate: "2026-08-01", endDate: "2026-08-31" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
    expect(dependencies.readRange).not.toHaveBeenCalled();
  });

  it("returns only the explicit completion-candidate DTO for the authenticated owner", async () => {
    const completionCandidates = vi.fn(async () => ({
      canAssociate: true,
      reason: null,
      currentActivityId: null,
      items: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          name: "Imported run",
          activityCategory: "run" as const,
          startedAt: new Date("2026-08-10T08:00:00.000Z"),
          elapsedMs: 1_800_000,
        },
      ],
      nextCursor: null,
    }));
    const { router: planned } = router({ completionCandidates });
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: {} });

    await expect(
      caller.completionCandidates({
        sessionId: SESSION_ID,
        cursor: {
          id: "99999999-9999-4999-8999-999999999999",
          startedAt: "2026-08-10T08:00:00.000Z",
        },
      }),
    ).resolves.toEqual({
      canAssociate: true,
      reason: null,
      currentActivityId: null,
      items: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          name: "Imported run",
          activityCategory: "run",
          startedAt: "2026-08-10T08:00:00.000Z",
          elapsedMs: 1_800_000,
        },
      ],
      nextCursor: null,
    });
    expect(completionCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        limit: 20,
        cursor: {
          id: "99999999-9999-4999-8999-999999999999",
          startedAt: new Date("2026-08-10T08:00:00.000Z"),
        },
      }),
    );
  });

  it("rejects malformed completion cursors before querying candidates", async () => {
    const { router: planned, dependencies } = router();
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: {} });

    await expect(
      caller.completionCandidates({
        sessionId: SESSION_ID,
        cursor: { id: "not-a-uuid", startedAt: "not-an-instant" },
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    expect(dependencies.completionCandidates).not.toHaveBeenCalled();
  });

  it("maps stale revision failures to a finite conflict", async () => {
    const { router: planned } = router({
      move: vi.fn(async () => {
        throw new PlannedSessionStaleRevisionError(2);
      }),
    });
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: transactionDb });
    await expect(
      caller.move({
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        expectedRevision: 1,
        planningDate: "2026-08-11",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<TRPCError>);
  });

  it("passes only plan identity to server-owned snapshot creation", async () => {
    providerQueue.enqueue.mockClear();
    const { router: planned, dependencies } = router();
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: transactionDb });
    await caller.create({
      profileId: PROFILE_ID,
      session: {
        planningDate: "2026-08-10",
        source: { kind: "direct", operationId: "a".repeat(32) },
        activityPlanId: "44444444-4444-4444-8444-444444444444",
      },
    });

    expect(dependencies.createDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PROFILE_ID,
        activityPlanId: "44444444-4444-4444-8444-444444444444",
        capturedAt: new Date("2026-08-01T08:00:00.000Z"),
      }),
    );
    expect(dependencies.createDirect.mock.calls[0]?.[0]).not.toHaveProperty("prescription");
    expect(providerQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        plannedSessionIds: [SESSION_ID],
        operation: "publish",
        profileId: PROFILE_ID,
      }),
    );
  });

  it.each([
    ["revision", { activityPlanRevision: 999 }],
    ["structure", { structure: { version: 3, activity_category: "run", segments: [] } }],
    ["quantification", { prescriptionQuantification: { forged: true } }],
  ])("rejects forged prescription %s before application access", async (_label, forged) => {
    const { router: planned, dependencies } = router();
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: {} });
    await expect(
      caller.create({
        profileId: PROFILE_ID,
        session: {
          planningDate: "2026-08-10",
          source: { kind: "direct", operationId: "a".repeat(32) },
          activityPlanId: "44444444-4444-4444-8444-444444444444",
          prescription: forged,
        },
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    expect(dependencies.createDirect).not.toHaveBeenCalled();
  });

  it("returns the public DTO and exact cross-surface cache receipt", async () => {
    const { router: planned } = router();
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: {} });
    const result = await caller.linkGroupEvent({
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      expectedRevision: 1,
      groupEventId: GROUP_EVENT_ID,
    });
    expect(result.cache_tags).toEqual(PLANNED_SESSION_CACHE_TAGS);
    expect(result.session).not.toHaveProperty("idempotencyKey");
    expect(result.session).not.toHaveProperty("claimToken");
  });

  it("publishes a moved session and unsyncs a cancelled session through the durable transaction queue", async () => {
    providerQueue.enqueue.mockClear();
    const moved = { ...session(), sessionRevision: 2, planningDate: "2026-08-11" };
    const cancelled = {
      ...moved,
      sessionRevision: 3,
      lifecycle: {
        status: "cancelled" as const,
        reason: "user_requested" as const,
        cancelledAt: "2026-08-02T08:00:00.000Z",
      },
    };
    const { dependencies, router: planned } = router({
      move: vi.fn(async () => moved),
      cancel: vi.fn(async () => cancelled),
    });
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: transactionDb });
    await caller.move({
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      expectedRevision: 1,
      planningDate: "2026-08-11",
    });
    await caller.cancel({
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      expectedRevision: 2,
      reason: "user_requested",
    });
    expect(dependencies.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ cancelledAt: "2026-08-01T08:00:00.000Z" }),
    );
    expect(providerQueue.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ plannedSessionIds: [SESSION_ID], operation: "publish" }),
    );
    expect(providerQueue.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ plannedSessionIds: [SESSION_ID], operation: "unsync" }),
    );
  });

  it("rolls back a planned-session mutation when durable provider follow-up is rejected", async () => {
    providerQueue.enqueue.mockResolvedValueOnce({ success: false });
    const { router: planned } = router();
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: transactionDb });

    await expect(
      caller.create({
        profileId: PROFILE_ID,
        session: {
          planningDate: "2026-08-10",
          source: { kind: "direct", operationId: "a".repeat(32) },
          activityPlanId: "44444444-4444-4444-8444-444444444444",
        },
      }),
    ).rejects.toThrow("Unable to durably enqueue planned-session provider follow-up");
  });

  it("keeps the successful updated receipt when a lost-response group link retry converges", async () => {
    const converged = { ...session(), sessionRevision: 2, groupEventId: GROUP_EVENT_ID };
    const { router: planned } = router({ linkGroupEvent: vi.fn(async () => converged) });
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: {} });

    await expect(
      caller.linkGroupEvent({
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        expectedRevision: 1,
        groupEventId: GROUP_EVENT_ID,
      }),
    ).resolves.toMatchObject({
      outcome: "updated",
      session: { sessionRevision: 2, groupEventId: GROUP_EVENT_ID },
    });
  });

  it("keeps the successful updated receipt when a lost-response group unlink retry converges", async () => {
    const converged = { ...session(), sessionRevision: 2, groupEventId: null };
    const { router: planned } = router({ unlinkGroupEvent: vi.fn(async () => converged) });
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: {} });

    await expect(
      caller.unlinkGroupEvent({
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        expectedRevision: 1,
        groupEventId: GROUP_EVENT_ID,
      }),
    ).resolves.toMatchObject({
      outcome: "updated",
      session: { sessionRevision: 2, groupEventId: null },
    });
  });
});
