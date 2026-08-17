import { plannedSessionIdempotencyKey, plannedSessionSchema } from "@repo/core/calendar";
import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { PlannedSessionStaleRevisionError } from "../../application/calendar/planned-session-errors";
import { PLANNED_SESSION_CACHE_TAGS } from "../../contracts/cache-receipts";
import { createRouterCaller } from "../../test/router";
import { createPlannedSessionsRouter } from "../planned-sessions";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";

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
      activityPlanId: "44444444-4444-4444-8444-444444444444",
      activityPlanRevision: 1,
      structure: {
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
      },
      prescriptionQuantification: null,
      capturedAt: "2026-08-01T08:00:00.000Z",
    },
    lifecycle: { status: "scheduled" },
  });
}

function router(overrides: Record<string, unknown> = {}) {
  const current = session();
  const dependencies = {
    create: vi.fn(async () => ({ status: "created" as const, session: current })),
    readRange: vi.fn(async () => ({ items: [current], truncated: false })),
    move: vi.fn(async () => ({ ...current, sessionRevision: 2, planningDate: "2026-08-11" })),
    cancel: vi.fn(async () => current),
    linkCompletion: vi.fn(async () => current),
    linkGroupEvent: vi.fn(async () => current),
    unlinkGroupEvent: vi.fn(async () => current),
    createId: () => SESSION_ID,
    ...overrides,
  };
  return { dependencies, router: createPlannedSessionsRouter(dependencies as never) };
}

describe("plannedSessionsRouter", () => {
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

  it("maps stale revision failures to a finite conflict", async () => {
    const { router: planned } = router({
      move: vi.fn(async () => {
        throw new PlannedSessionStaleRevisionError(2);
      }),
    });
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: {} });
    await expect(
      caller.move({
        profileId: PROFILE_ID,
        sessionId: SESSION_ID,
        expectedRevision: 1,
        planningDate: "2026-08-11",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" } satisfies Partial<TRPCError>);
  });

  it("returns the public DTO and exact cross-surface cache receipt", async () => {
    const { router: planned } = router();
    const caller = createRouterCaller(planned, { userId: PROFILE_ID, db: {} });
    const result = await caller.linkGroupEvent({
      profileId: PROFILE_ID,
      sessionId: SESSION_ID,
      expectedRevision: 1,
      groupEventId: "88888888-8888-4888-8888-888888888888",
    });
    expect(result.cache_tags).toEqual(PLANNED_SESSION_CACHE_TAGS);
    expect(result.session).not.toHaveProperty("idempotencyKey");
    expect(result.session).not.toHaveProperty("claimToken");
  });
});
