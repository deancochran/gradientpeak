import {
  ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  type AthleteStateBaseline,
  PLAN_READINESS_HORIZON_FALLBACK,
  resolvePlanReadinessHorizon,
  simulateTrainingPlan,
} from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPublishedAthleteStateSnapshotData } from "../../repositories/athlete-state-repository";
import { readAthleteReadModel } from "../athlete-intelligence/athlete-read-model";
import {
  resolveAuthoritativePlanReadinessHorizon,
  trainingPlanCommitInputSchema,
  trainingPlanPreviewInputSchema,
} from "./projection-planning";

vi.mock("../../repositories/athlete-state-repository", () => ({
  readPublishedAthleteStateSnapshotData: vi.fn(),
}));

const profileId = "11111111-1111-4111-8111-111111111111";

function dbWithProfile(planningTimezone: string | null = "UTC") {
  return {
    select: () => {
      const builder = {
        from: () => builder,
        where: () => builder,
        limit: async () => [{ planningTimezone }],
      };
      return builder;
    },
  } as never;
}

function currentState(sourceRevision = 4, publishedRevision = 4) {
  return {
    state: {
      profile_id: profileId,
      source_revision: sourceRevision,
      published_revision: publishedRevision,
      dirty_from_at:
        sourceRevision === publishedRevision ? null : new Date("2026-06-01T00:00:00.000Z"),
      fitness: 40,
      fatigue: 35,
      evidence_confidence: 0.75,
      coverage_start_at: new Date("2026-06-01T00:00:00.000Z"),
      coverage_end_at: new Date("2026-07-01T12:00:00.000Z"),
      last_activity_at: new Date("2026-07-01T12:00:00.000Z"),
      algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      computed_at: new Date("2026-07-01T12:00:00.000Z"),
      lease_token: null,
      lease_expires_at: null,
      retry_after: null,
      consecutive_failures: 0,
      last_failure_code: null,
      updated_at: new Date("2026-07-01T12:00:00.000Z"),
    },
    estimates: [],
  };
}

function mockSnapshot(
  current: ReturnType<typeof currentState> | null,
  blockingImport: "active" | "failed" | null = null,
) {
  vi.mocked(readPublishedAthleteStateSnapshotData).mockResolvedValue({
    planningTimezone: "UTC",
    current,
    blockingImport,
  });
}

function readProjectionReadModel(now: Date) {
  return readAthleteReadModel({
    db: dbWithProfile(),
    profileId,
    now,
    sections: {
      publishedState: true,
      status: true,
      currentBaseline: { includePlanningContext: false },
    },
  });
}

beforeEach(() => {
  vi.mocked(readPublishedAthleteStateSnapshotData).mockReset();
});

describe("projection planning", () => {
  it("keeps preview feedback separate from commit authority", () => {
    const previewInput = {
      kind: "create" as const,
      draft: {
        name: "Base plan",
        previewStartDate: "2026-07-20",
        structure: {
          version: 1 as const,
          sessions: [
            {
              offset_days: 0,
              activity_plan_id: "33333333-3333-4333-8333-333333333333",
            },
          ],
        },
      },
    };
    expect(trainingPlanPreviewInputSchema.parse(previewInput)).toEqual(previewInput);
    expect(
      trainingPlanPreviewInputSchema.safeParse({
        ...previewInput,
        basePublishedRevision: 4,
      }).success,
    ).toBe(false);

    const commitInput = { ...previewInput, basePublishedRevision: 4 };
    expect(trainingPlanCommitInputSchema.parse(commitInput)).toEqual(commitInput);
    expect(
      trainingPlanCommitInputSchema.safeParse({
        ...commitInput,
        draft: { ...commitInput.draft, id: "22222222-2222-4222-8222-222222222222" },
      }).success,
    ).toBe(false);
  });

  it("accepts duplicate drafts by source identity without client-authored persistence data", () => {
    const duplicate = {
      kind: "duplicate" as const,
      draft: {
        sourcePlanId: "22222222-2222-4222-8222-222222222222",
        name: "Copy",
        previewStartDate: "2026-07-20",
      },
    };
    expect(trainingPlanPreviewInputSchema.parse(duplicate)).toEqual(duplicate);
    expect(
      trainingPlanPreviewInputSchema.safeParse({
        ...duplicate,
        draft: { ...duplicate.draft, id: "33333333-3333-4333-8333-333333333333" },
      }).success,
    ).toBe(false);
  });

  it("uses the identical named goal-date horizon for client display and server validation", () => {
    const baseline = {
      contractVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      athleteId: profileId,
      stateRevision: 4,
      asOf: "2026-07-01T00:00:00.000Z",
      longTermLoad: 40,
      recentLoad: 35,
      loadBalance: 5,
      evidenceConfidence: 0.75,
      capabilities: [],
      athleteAgeYears: null,
    } satisfies AthleteStateBaseline;
    const plannedSessions = [
      {
        kind: "projected" as const,
        sourceId: "session-1",
        scheduledAt: "2026-07-05T00:00:00.000Z",
        activityCategory: "run" as const,
        commonLoad: 80,
      },
    ];
    const goal = {
      goalId: "goal-1",
      activityCategory: "run" as const,
      targetAt: "2026-08-01T23:59:59.999Z",
      targetDistanceMeters: 10_000,
      targetDurationMinutes: 50,
    };
    const horizonInput = { baselineAsOf: baseline.asOf, plannedSessions, goal };
    const clientHorizon = resolvePlanReadinessHorizon(horizonInput);
    const serverHorizon = resolveAuthoritativePlanReadinessHorizon(horizonInput);

    expect(serverHorizon).toBe(clientHorizon);
    expect(serverHorizon).toBe(goal.targetAt);
    expect(PLAN_READINESS_HORIZON_FALLBACK).toBe("latest_planned_session_or_baseline");
    expect(resolveAuthoritativePlanReadinessHorizon({ ...horizonInput, goal: null })).toBe(
      "2026-07-05T00:00:00.000Z",
    );
    expect(
      simulateTrainingPlan({
        baseline,
        plannedSessions,
        simulationAt: serverHorizon,
        planningTimezone: "UTC",
        goal,
      }),
    ).toEqual(
      simulateTrainingPlan({
        baseline,
        plannedSessions,
        simulationAt: clientHorizon,
        planningTimezone: "UTC",
        goal,
      }),
    );
  });

  it("returns an explicit unavailable projection baseline", async () => {
    mockSnapshot(null);

    await expect(
      readProjectionReadModel(new Date("2026-08-01T12:00:00.000Z")),
    ).resolves.toMatchObject({
      publishedRevision: null,
      publishedState: null,
      status: {
        freshness: "unavailable",
        rebuildStatus: "unavailable",
        importStatus: "complete",
      },
      currentBaseline: { baseline: null },
    });
  });

  it("reports a failed deferred import before any source revision exists", async () => {
    mockSnapshot(null, "failed");

    await expect(
      readProjectionReadModel(new Date("2026-08-01T12:00:00.000Z")),
    ).resolves.toMatchObject({
      publishedRevision: null,
      publishedState: null,
      status: {
        freshness: "unavailable",
        rebuildStatus: "failed",
        importStatus: "failed",
      },
      currentBaseline: { baseline: null },
    });
  });

  it("advances the published baseline for a cheap stale read", async () => {
    mockSnapshot(currentState(5, 4));

    const result = await readProjectionReadModel(new Date("2026-07-03T12:00:00.000Z"));

    expect(result).toMatchObject({
      publishedRevision: 4,
      publishedState: { publishedAt: "2026-07-01T12:00:00.000Z" },
      status: { freshness: "stale", rebuildStatus: "pending", importStatus: "complete" },
      currentBaseline: {
        baseline: { stateRevision: 4, asOf: "2026-07-03T12:00:00.000Z" },
      },
    });
    expect(result.currentBaseline?.baseline?.longTermLoad).toBeLessThan(40);
  });

  it.each([
    ["active", "pending"],
    ["failed", "failed"],
  ] as const)("marks the projection stale for a %s deferred bulk import", async (status, expected) => {
    mockSnapshot(currentState(), status);

    await expect(
      readProjectionReadModel(new Date("2026-07-03T12:00:00.000Z")),
    ).resolves.toMatchObject({
      publishedState: { publishedAt: "2026-07-01T12:00:00.000Z" },
      status: { freshness: "stale", rebuildStatus: expected, importStatus: status },
    });
  });
});
