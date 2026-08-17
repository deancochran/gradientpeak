import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { ATHLETE_STATE_CACHE_TAGS } from "../../contracts/cache-receipts";
import { createRouterCaller } from "../../test/router";
import { createAthleteIntelligenceRouter } from "../athlete-intelligence";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function currentState() {
  return {
    planningTimezone: "UTC",
    currentPlanningDate: "2026-08-10",
    freshness: "fresh" as const,
    rebuildStatus: "fresh" as const,
    importStatus: "complete" as const,
    revisions: { source: 4, published: 4 },
    coverage: {
      startAt: "2026-08-01T08:00:00.000Z",
      endAt: "2026-08-10T08:00:00.000Z",
      lastActivityAt: "2026-08-10T08:00:00.000Z",
    },
    computedAt: "2026-08-10T08:00:00.000Z",
    algorithmVersion: "v1",
    baseline: null,
    performanceTargets: null,
    estimates: [],
    leaseToken: "worker-private",
  };
}

function transportRouter() {
  const readCurrentState = vi.fn(async () => currentState());
  const readLoadRange = vi.fn(async () => ({
    profileId: PROFILE_ID,
    range: { startDate: "2026-08-01", endDate: "2026-08-10" },
    publishedRevision: 4,
    freshness: "fresh" as const,
    coverage: currentState().coverage,
    days: [],
  }));
  const requestRepair = vi.fn(async () => ({ status: "accepted" as const, profileId: PROFILE_ID }));
  const router = createAthleteIntelligenceRouter(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      readCurrentState: readCurrentState as never,
      readLoadRange: readLoadRange as never,
      requestRepair: requestRepair as never,
    },
  );
  return { readCurrentState, readLoadRange, requestRepair, router };
}

describe("athlete intelligence state transport", () => {
  it("requires authentication and denies cross-profile reads before application access", async () => {
    const { router, readCurrentState } = transportRouter();
    const unauthenticated = createRouterCaller(router, { session: null, db: {} });
    await expect(unauthenticated.getCurrentState({ profileId: PROFILE_ID })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    } satisfies Partial<TRPCError>);

    const other = createRouterCaller(router, { userId: OTHER_ID, db: {} });
    await expect(other.getCurrentState({ profileId: PROFILE_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
    expect(readCurrentState).not.toHaveBeenCalled();
  });

  it("returns only the public current-state DTO", async () => {
    const { router } = transportRouter();
    const caller = createRouterCaller(router, { userId: PROFILE_ID, db: {} });
    const result = await caller.getCurrentState({ profileId: PROFILE_ID });
    expect(result).toMatchObject({ profileId: PROFILE_ID, revisions: { published: 4 } });
    expect(result).not.toHaveProperty("leaseToken");
    expect(result).not.toHaveProperty("estimates");
  });

  it("returns a bounded repair receipt with exact athlete-state cache tags", async () => {
    const { router, requestRepair } = transportRouter();
    const caller = createRouterCaller(router, { userId: PROFILE_ID, db: {} });
    await expect(caller.requestRecalculationRepair({ profileId: PROFILE_ID })).resolves.toEqual({
      status: "accepted",
      profileId: PROFILE_ID,
      cache_tags: ATHLETE_STATE_CACHE_TAGS,
    });
    expect(requestRepair).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: PROFILE_ID, db: {} }),
    );
  });
});
