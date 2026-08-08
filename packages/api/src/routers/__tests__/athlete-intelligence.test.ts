import { createUnavailableAthletePerformanceTargetFacts } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { goalAssessmentResponseSchema } from "../../application/athlete-intelligence/goal-assessment";
import type {
  withAuthorizedAthleteReadAcrossOrganizations,
  withResolvedAuthorizedAthleteReadAcrossOrganizations,
} from "../../application/organizations/authorize-athlete-read";
import { createRouterCaller } from "../../test/router";
import { createAthleteIntelligenceRouter, resolveGoalProfile } from "../athlete-intelligence";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const COACH_ID = "22222222-2222-4222-8222-222222222222";
const GOAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function publishedAssessment() {
  return goalAssessmentResponseSchema.parse({
    stateRevision: 4,
    computedAt: "2026-07-10T12:00:00.000Z",
    freshness: "stale",
    assessmentConfidence: 0.75,
    rebuildStatus: "pending",
    assessment: null,
  });
}

function caller(
  assessGoal = vi.fn(async () => publishedAssessment()),
  authenticated = true,
  resolveGoalProfile = vi.fn(async () => OWNER_ID),
  userId = OWNER_ID,
  authorizeResolvedRead: typeof withResolvedAuthorizedAthleteReadAcrossOrganizations = resolvedConsentAuthorizer(
    { state: "valid", scopes: ["goals"] },
  ),
) {
  const router = createAthleteIntelligenceRouter(
    assessGoal,
    resolveGoalProfile,
    undefined,
    undefined,
    authorizeResolvedRead,
  );
  return {
    assessGoal,
    resolveGoalProfile,
    caller: createRouterCaller(router, {
      db: {},
      userId,
      ...(authenticated ? {} : { session: null }),
    }),
  };
}

type ConsentState = "expired" | "missing" | "revoked" | "valid";

function consentAuthorizer(input: {
  state: ConsentState;
  scopes: readonly ("goals" | "metrics")[];
}) {
  return vi.fn(
    async (request: Parameters<typeof withAuthorizedAthleteReadAcrossOrganizations>[0]) => {
      if (input.state !== "valid" || !input.scopes.includes(request.scope as "goals" | "metrics")) {
        return { outcome: "deny" as const };
      }
      return {
        outcome: "allow" as const,
        organizationId: "33333333-3333-4333-8333-333333333333",
        value: await request.read({} as never),
      };
    },
  ) as unknown as typeof withAuthorizedAthleteReadAcrossOrganizations;
}

function resolvedConsentAuthorizer(input: {
  state: ConsentState;
  scopes: readonly ("goals" | "metrics")[];
}) {
  return vi.fn(
    async (request: Parameters<typeof withResolvedAuthorizedAthleteReadAcrossOrganizations>[0]) => {
      const athleteProfileId = await request.resolveAthleteProfileId({} as never);
      if (!athleteProfileId) return { outcome: "not_found" as const };
      if (
        request.actorProfileId !== athleteProfileId &&
        (input.state !== "valid" || !input.scopes.includes(request.scope as "goals" | "metrics"))
      ) {
        return { outcome: "deny" as const, athleteProfileId };
      }
      return {
        outcome: "allow" as const,
        athleteProfileId,
        organizationId:
          request.actorProfileId === athleteProfileId
            ? null
            : "33333333-3333-4333-8333-333333333333",
        value: await request.read({} as never, athleteProfileId),
      };
    },
  ) as unknown as typeof withResolvedAuthorizedAthleteReadAcrossOrganizations;
}

describe("athleteIntelligenceRouter.getGoalAssessment", () => {
  it("does not expose the retired raw runtime evaluation procedure", () => {
    const { caller: api } = caller();

    expect("evaluate" in api).toBe(false);
  });

  it("requires authentication", async () => {
    const { caller: unauthenticated } = caller(undefined, false);

    await expect(unauthenticated.getGoalAssessment({ goalId: GOAL_ID })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    } satisfies Partial<TRPCError>);
  });

  it("rejects invalid identifiers and unknown client planning inputs before delegation", async () => {
    const { caller: api, assessGoal } = caller();

    await expect(api.getGoalAssessment({ goalId: "not-a-uuid" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
    await expect(
      api.getGoalAssessment({ goalId: GOAL_ID, unexpected: true } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    await expect(
      api.getGoalAssessment({ goalId: GOAL_ID, plannedSessions: [] } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    expect(assessGoal).not.toHaveBeenCalled();
  });

  it("reads the published-state contract in the resolved athlete scope", async () => {
    const { caller: api, assessGoal } = caller();

    const result = await api.getGoalAssessment({ goalId: GOAL_ID });

    expect(assessGoal).toHaveBeenCalledOnce();
    expect(assessGoal).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: OWNER_ID, goalId: GOAL_ID }),
    );
    expect(result).toEqual(publishedAssessment());
    expect(goalAssessmentResponseSchema.parse(result)).toEqual(result);
    expect(result).not.toHaveProperty("runtimeContext");
  });

  it("uses the accessible athlete profile for an active coach", async () => {
    const assessGoal = vi.fn(async () => publishedAssessment());
    const resolveGoalProfile = vi.fn(async () => OWNER_ID);
    const authorizeRead = resolvedConsentAuthorizer({ state: "valid", scopes: ["goals"] });
    const { caller: api } = caller(assessGoal, true, resolveGoalProfile, COACH_ID, authorizeRead);

    await api.getGoalAssessment({ goalId: GOAL_ID });

    expect(resolveGoalProfile).toHaveBeenCalledWith(expect.objectContaining({ goalId: GOAL_ID }));
    expect(assessGoal).toHaveBeenCalledWith(
      expect.objectContaining({ goalId: GOAL_ID, profileId: OWNER_ID }),
    );
    expect(authorizeRead).toHaveBeenCalledWith(
      expect.objectContaining({
        actorProfileId: COACH_ID,
        scope: "goals",
        resolveAthleteProfileId: expect.any(Function),
        read: expect.any(Function),
      }),
    );
  });

  it("resolves a goal to its athlete profile", async () => {
    const getGoalOwnerId = vi.fn(async () => OWNER_ID);
    await expect(
      resolveGoalProfile({
        db: {} as never,
        goalId: GOAL_ID,
        getGoalOwnerId,
      }),
    ).resolves.toBe(OWNER_ID);
    expect(getGoalOwnerId).toHaveBeenCalledWith({}, GOAL_ID);
  });

  it.each([
    "missing",
    "revoked",
    "expired",
  ] as const)("does not perform the full goal read when goals consent is %s", async (state) => {
    const fullGoalRead = vi.fn(async () => publishedAssessment());
    const resolveGoalOwner = vi.fn(async () => OWNER_ID);
    const authorizeRead = resolvedConsentAuthorizer({ state, scopes: ["goals"] });
    const { caller: api } = caller(fullGoalRead, true, resolveGoalOwner, COACH_ID, authorizeRead);

    await expect(api.getGoalAssessment({ goalId: GOAL_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Goal not found",
    });
    expect(resolveGoalOwner).toHaveBeenCalledOnce();
    expect(fullGoalRead).not.toHaveBeenCalled();
  });

  it("does not treat metrics-only consent as goals consent", async () => {
    const assessGoal = vi.fn(async () => publishedAssessment());
    const authorizeRead = resolvedConsentAuthorizer({ state: "valid", scopes: ["metrics"] });
    const { caller: api } = caller(
      assessGoal,
      true,
      vi.fn(async () => OWNER_ID),
      COACH_ID,
      authorizeRead,
    );

    await expect(api.getGoalAssessment({ goalId: GOAL_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Goal not found",
    });
    expect(assessGoal).not.toHaveBeenCalled();
  });

  it("does not read published state for a goal outside the authenticated scope", async () => {
    const resolveGoalProfile = vi.fn(async () => {
      throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
    });
    const assessGoal = vi.fn(async () => publishedAssessment());
    const { caller: api } = caller(assessGoal, true, resolveGoalProfile, COACH_ID);

    await expect(api.getGoalAssessment({ goalId: GOAL_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(assessGoal).not.toHaveBeenCalled();
  });

  it("preserves not-found errors from the published-state read boundary", async () => {
    const assessGoal = vi.fn(async () => {
      throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
    });
    const { caller: api } = caller(assessGoal);

    await expect(api.getGoalAssessment({ goalId: GOAL_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("athleteIntelligenceRouter.getReadModel", () => {
  function athleteReadModel() {
    const baseline = {
      contractVersion: "athlete-state-projection-v1" as const,
      athleteId: OWNER_ID,
      stateRevision: 4,
      asOf: "2026-07-01T12:00:00.000Z",
      longTermLoad: 40,
      recentLoad: 35,
      loadBalance: 5,
      evidenceConfidence: 0.75,
      capabilities: [],
      athleteAgeYears: null,
    };
    return {
      contractVersion: "athlete-read-model-v1" as const,
      profileId: OWNER_ID,
      asOf: "2026-07-10T12:00:00.000Z",
      publishedRevision: 4,
      algorithmVersion: "athlete-state-projection-v1",
      publishedState: {
        publishedAt: "2026-07-01T12:00:00.000Z",
        baseline,
        estimates: [],
        performanceTargets: createUnavailableAthletePerformanceTargetFacts(
          "2026-07-01T12:00:00.000Z",
          OWNER_ID,
        ),
      },
      status: {
        freshness: "stale" as const,
        rebuildStatus: "pending" as const,
        importStatus: "active" as const,
        sourceRevision: 5,
        publishedRevision: 4,
        coverage: { startAt: null, endAt: null, lastActivityAt: null },
      },
    };
  }

  it("returns persisted publication time and the snapshot import fence for athlete self-access", async () => {
    const readModel = vi.fn(async () => athleteReadModel());
    const authorizeRead = consentAuthorizer({ state: "missing", scopes: [] });
    const router = createAthleteIntelligenceRouter(
      vi.fn(async () => publishedAssessment()),
      vi.fn(async () => OWNER_ID),
      readModel,
      authorizeRead,
    );
    const api = createRouterCaller(router, { db: {}, userId: OWNER_ID });

    await expect(
      api.getReadModel({
        profileId: OWNER_ID,
        sections: { publishedState: true, status: true },
      }),
    ).resolves.toEqual(expect.objectContaining({ publishedRevision: 4 }));
    expect(readModel).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: OWNER_ID,
        sections: { publishedState: true, status: true },
        now: expect.any(Date),
      }),
    );
    expect(authorizeRead).not.toHaveBeenCalled();
  });

  it("allows a coach to read the full published baseline through valid metrics consent", async () => {
    const readModel = vi.fn(async () => athleteReadModel());
    const authorizeRead = consentAuthorizer({ state: "valid", scopes: ["metrics"] });
    const router = createAthleteIntelligenceRouter(
      vi.fn(async () => publishedAssessment()),
      vi.fn(async () => OWNER_ID),
      readModel,
      authorizeRead,
    );
    const api = createRouterCaller(router, { db: {}, userId: COACH_ID });

    await expect(
      api.getReadModel({ profileId: OWNER_ID, sections: { publishedState: true } }),
    ).resolves.toEqual(
      expect.objectContaining({
        publishedState: expect.objectContaining({
          baseline: expect.objectContaining({ athleteId: OWNER_ID }),
        }),
      }),
    );
    expect(authorizeRead).toHaveBeenCalledWith(
      expect.objectContaining({
        actorProfileId: COACH_ID,
        athleteProfileId: OWNER_ID,
        scope: "metrics",
      }),
    );
    expect(readModel).toHaveBeenCalledOnce();
  });

  it.each([
    "missing",
    "revoked",
    "expired",
  ] as const)("denies a coach full published state when metrics consent is %s", async (state) => {
    const readModel = vi.fn(async () => athleteReadModel());
    const router = createAthleteIntelligenceRouter(
      vi.fn(async () => publishedAssessment()),
      vi.fn(async () => OWNER_ID),
      readModel,
      consentAuthorizer({ state, scopes: ["metrics"] }),
    );
    const api = createRouterCaller(router, { db: {}, userId: COACH_ID });

    await expect(
      api.getReadModel({ profileId: OWNER_ID, sections: { publishedState: true } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(readModel).not.toHaveBeenCalled();
  });

  it("does not treat goals-only consent as metrics consent", async () => {
    const readModel = vi.fn(async () => athleteReadModel());
    const router = createAthleteIntelligenceRouter(
      vi.fn(async () => publishedAssessment()),
      vi.fn(async () => OWNER_ID),
      readModel,
      consentAuthorizer({ state: "valid", scopes: ["goals"] }),
    );
    const api = createRouterCaller(router, { db: {}, userId: COACH_ID });

    await expect(
      api.getReadModel({ profileId: OWNER_ID, sections: { publishedState: true } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(readModel).not.toHaveBeenCalled();
  });
});
