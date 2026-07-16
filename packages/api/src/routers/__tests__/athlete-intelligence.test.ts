import { athleteIntelligenceProjectionSchema } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type {
  AthleteIntelligenceDataSource,
  AthleteIntelligenceRows,
} from "../../application/athlete-intelligence/model-reader";
import { athleteIntelligenceRuntimeProjectionSchema } from "../../application/athlete-intelligence/projection-orchestrator";
import { evaluateAthleteIntelligence } from "../../application/athlete-intelligence/read-model";
import { createRouterCaller } from "../../test/router";
import { createAthleteIntelligenceRouter } from "../athlete-intelligence";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const unavailable = {
  estimate: null,
  unit: null,
  uncertainty: 1,
  state: "unknown",
  missingDataState: "required_data_missing",
  reasonCodes: ["missing"],
  contributingSourceIds: [],
} as const;

function projection() {
  const base = athleteIntelligenceProjectionSchema.parse({
    contractVersion: "athlete-intelligence-projection-v1",
    assessmentAsOf: "2026-07-10T12:00:00.000Z",
    athleteId: OWNER_ID,
    capability: {
      ftp: unavailable,
      wattsPerKilogram: unavailable,
      heartRateReserve: unavailable,
      effortCurves: [],
      enduranceRecencyWeightedMinutes: unavailable,
      durabilityBaselineRatio: unavailable,
      sportSpecificity: unavailable,
    },
    readiness: {
      volumeTrend: unavailable,
      frequencyTrend: unavailable,
      recoveryContext: unavailable,
    },
    feasibility: {
      policyVersion: "training-feasibility-v1",
      timeCoverage: unavailable,
      requiredSessionCoverage: unavailable,
      compatibleScheduledMinutes: unavailable,
      scheduleCoverage: unavailable,
      constraints: {
        hardRestConflicts: unavailable,
        dailyDurationExcesses: unavailable,
        dailySessionCapExcesses: unavailable,
        doubleDayConflicts: unavailable,
        sessionDurationExcesses: unavailable,
        weeklyDurationExcesses: unavailable,
        weeklySessionCapExcesses: unavailable,
        sportOverrideExcesses: unavailable,
        recoveryPreferenceConflicts: unavailable,
      },
    },
    goalCoverage: [],
    opportunities: { training: [], evidence: [] },
    decisionGuidance: {
      state: "unknown",
      reasonCodes: [],
      recommendedActions: [],
      cautions: [],
    },
  });
  const channel = {
    result: unavailable,
    coverage: { state: "unknown" as const, reasonCodes: unavailable.reasonCodes, sourceIds: [] },
    calculationIdentity: "test",
  };
  const domainCoverage = {
    metrics: { state: "complete" as const, reason: null },
    activities: { state: "complete" as const, reason: null },
    efforts: { state: "complete" as const, reason: null },
    schedules: { state: "complete" as const, reason: null },
  };
  const generatedAt = "2026-07-10T12:00:00.000Z";
  const stateVector = {
    contractVersion: "athlete-state-vector-v1" as const,
    athleteId: OWNER_ID,
    assessmentAsOf: generatedAt,
    internalResponse: channel,
    externalWork: [],
    mechanicalExposure: channel,
    strengthExposure: channel,
    wellnessContext: channel,
    calendarContext: channel,
    policyVersions: [],
    domainCoverage,
    limitations: [],
    generatedAt,
  };
  return athleteIntelligenceRuntimeProjectionSchema.parse({
    ...base,
    explainability: {
      assessment: {
        at: generatedAt,
        state: "unknown",
        uncertainty: "unknown",
      },
      evidence: [],
      limits: [],
      coverage: [
        { label: "Profile metrics", state: "complete" },
        { label: "Recorded activities", state: "complete" },
        { label: "Activity efforts", state: "complete" },
        { label: "Availability data", state: "complete" },
      ],
      collectionPrompts: [],
    },
    runtimeContext: {
      stateVector,
    },
  });
}

function caller(evaluate = vi.fn(async () => projection()), authenticated = true) {
  const router = createAthleteIntelligenceRouter(evaluate);
  return {
    evaluate,
    caller: createRouterCaller(router, {
      db: {},
      userId: OWNER_ID,
      ...(authenticated ? {} : { session: null }),
    }),
  };
}

describe("athleteIntelligenceRouter.evaluate", () => {
  it("requires authentication", async () => {
    const { caller: unauthenticated } = caller(undefined, false);
    await expect(unauthenticated.evaluate({ goalId: GOAL_ID })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    } satisfies Partial<TRPCError>);
  });

  it("rejects invalid identifiers and unknown keys before delegation", async () => {
    const { caller: api, evaluate } = caller();
    await expect(api.evaluate({ goalId: "not-a-uuid" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
    const inputWithUnknownKey = { goalId: GOAL_ID, unexpected: true };
    await expect(api.evaluate(inputWithUnknownKey)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<TRPCError>);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("delegates with authenticated profile scope and returns the output schema", async () => {
    const { caller: api, evaluate } = caller();
    const result = await api.evaluate({ goalId: GOAL_ID });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: OWNER_ID, goalId: GOAL_ID }),
    );
    expect(athleteIntelligenceRuntimeProjectionSchema.parse(result)).toEqual(result);
  });

  it("returns only curated explainability evidence without source identifiers or raw observations", async () => {
    const result = await caller().caller.evaluate({ goalId: GOAL_ID });

    expect(result.explainability).toEqual(
      expect.objectContaining({
        assessment: expect.objectContaining({ at: expect.any(String), state: "unknown" }),
        evidence: [],
      }),
    );
    expect(JSON.stringify(result.explainability)).not.toMatch(/activity:|metric:|rawObservation/);
  });

  it("rejects a client-supplied planning timezone", async () => {
    const { caller: api, evaluate } = caller();
    await expect(
      api.evaluate({ goalId: GOAL_ID, planningTimezone: "America/New_York" } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("preserves goal-not-found errors", async () => {
    const evaluate = vi.fn(async () => {
      throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
    });
    const { caller: api } = caller(evaluate);
    await expect(api.evaluate({ goalId: GOAL_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("performs no writes in the transport layer", async () => {
    const evaluate = vi.fn(async () => projection());
    const { caller: api } = caller(evaluate);
    await api.evaluate({ goalId: GOAL_ID });
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it("materializes and evaluates through a typed read boundary without writes", async () => {
    const failWrite = vi.fn(() => {
      throw new Error("athlete intelligence evaluation must remain read-only");
    });
    const db = {
      insert: failWrite,
      update: failWrite,
      delete: failWrite,
    } as unknown as Parameters<typeof evaluateAthleteIntelligence>[0]["db"];
    const observedAt = new Date("2026-07-01T00:00:00.000Z");
    const rows: AthleteIntelligenceRows = {
      profile: {
        id: OWNER_ID,
        dob: new Date("1990-01-01T00:00:00.000Z"),
        planningTimezone: "America/New_York",
        preferredUnits: "metric",
        updatedAt: observedAt,
      },
      metrics: [],
      activities: [],
      efforts: [],
      goals: [
        {
          profileId: OWNER_ID,
          id: GOAL_ID,
          targetDate: "2026-09-01",
          priority: 8,
          activityCategory: "bike",
          targetPayload: {
            type: "threshold",
            metric: "power",
            activity_category: "bike",
            value: 300,
            test_duration_s: 3600,
          },
          createdAt: observedAt,
          updatedAt: observedAt,
        },
      ],
      trainingSettings: null,
      schedule: [],
      scheduleTruncated: false,
    };
    const dataSource: AthleteIntelligenceDataSource = {
      read: vi.fn(async () => rows),
    };

    const result = await evaluateAthleteIntelligence({
      db,
      dataSource,
      profileId: OWNER_ID,
      goalId: GOAL_ID,
      now: new Date("2026-07-10T12:00:00.000Z"),
    });

    expect(dataSource.read).toHaveBeenCalledOnce();
    expect(failWrite).not.toHaveBeenCalled();
    expect(result.athleteId).toBe(OWNER_ID);
    expect(athleteIntelligenceRuntimeProjectionSchema.parse(result)).toEqual(result);
  });
});
