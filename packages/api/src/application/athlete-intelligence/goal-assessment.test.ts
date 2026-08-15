import {
  ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  createUnavailableAthletePerformanceTargetFacts,
} from "@repo/core";
import { profileGoals, profiles } from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPublishedAthleteStateSnapshotData } from "../../repositories/athlete-state-repository";
import { getGoalAssessment } from "./goal-assessment";

const getAthleteThresholdTargetFactsAsOf = vi.hoisted(() => vi.fn());

vi.mock("../../repositories/athlete-state-repository", () => ({
  readPublishedAthleteStateSnapshotData: vi.fn(),
}));
vi.mock("../performance-model/get-athlete-performance-model-as-of", () => ({
  getAthleteThresholdTargetFactsAsOf,
}));

const profileId = "11111111-1111-4111-8111-111111111111";
const goalId = "22222222-2222-4222-8222-222222222222";

function dbWithGoal(input: { planningTimezone?: string; targetDate?: string } = {}) {
  const snapshotExecutor = {
    select: () => {
      let table: unknown;
      const builder = {
        from: (selected: unknown) => {
          table = selected;
          return builder;
        },
        where: () => builder,
        limit: async () =>
          table === profiles
            ? [{ planningTimezone: input.planningTimezone ?? "UTC" }]
            : table === profileGoals
              ? [
                  {
                    id: goalId,
                    profile_id: profileId,
                    activity_category: "run",
                    target_date: input.targetDate ?? "2026-09-01",
                    target_payload: {
                      type: "event_performance",
                      activity_category: "run",
                      distance_m: 10_000,
                      target_time_s: 3_600,
                    },
                  },
                ]
              : [],
      };
      return builder;
    },
  };
  return {
    ...snapshotExecutor,
    $client: {},
    transaction: async (read: (executor: typeof snapshotExecutor) => Promise<unknown>) =>
      read(snapshotExecutor),
  } as never;
}

function publishedState(
  estimates: Array<{
    profile_id: string;
    capability_kind: string;
    activity_category: "run";
    value: number;
    unit: string;
    confidence: number;
    effective_at: Date;
    evidence_window_start_at: Date | null;
    evidence_window_end_at: Date | null;
    algorithm_version: string;
    source_revision: number;
    computed_at: Date;
  }> = [],
) {
  return {
    state: {
      profile_id: profileId,
      source_revision: 4,
      published_revision: 4,
      dirty_from_at: null,
      fitness: 40,
      fatigue: 35,
      evidence_confidence: 0.75,
      coverage_start_at: new Date("2026-07-01T12:00:00.000Z"),
      coverage_end_at: new Date("2026-08-01T12:00:00.000Z"),
      last_activity_at: new Date("2026-08-01T12:00:00.000Z"),
      algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      computed_at: new Date("2026-08-01T12:00:00.000Z"),
      lease_token: null,
      lease_expires_at: null,
      retry_after: null,
      consecutive_failures: 0,
      last_failure_code: null,
      updated_at: new Date("2026-08-01T12:00:00.000Z"),
    },
    estimates,
  };
}

function mockSnapshot(
  current: ReturnType<typeof publishedState> | null,
  planningTimezone = "UTC",
  blockingImport: "active" | "failed" | null = null,
) {
  vi.mocked(readPublishedAthleteStateSnapshotData).mockResolvedValue({
    planningTimezone,
    current,
    blockingImport,
  });
}

beforeEach(() => {
  vi.mocked(readPublishedAthleteStateSnapshotData).mockReset();
  getAthleteThresholdTargetFactsAsOf
    .mockReset()
    .mockImplementation(({ athleteId, asOf }) =>
      createUnavailableAthletePerformanceTargetFacts(asOf.toISOString(), athleteId),
    );
});

describe("goal assessment", () => {
  it("simulates future planned sessions without mutating the published baseline", async () => {
    const published = publishedState();
    mockSnapshot(published);

    const result = await getGoalAssessment({
      db: dbWithGoal(),
      profileId,
      goalId,
      now: new Date("2026-08-01T12:00:00.000Z"),
      plannedSessions: [
        {
          kind: "projected",
          sourceId: "planned-session-1",
          scheduledAt: "2026-08-03T08:00:00.000Z",
          activityCategory: "run",
          commonLoad: 45,
        },
      ],
    });

    expect(result).toMatchObject({
      stateRevision: 4,
      computedAt: "2026-08-01T12:00:00.000Z",
      freshness: "fresh",
      rebuildStatus: "fresh",
      assessment: {
        goalId,
        assessedAt: "2026-09-01T23:59:59.999Z",
      },
    });
    expect(published.state.computed_at.toISOString()).toBe("2026-08-01T12:00:00.000Z");
  });

  it("simulates through the Tokyo-local end of the goal date", async () => {
    mockSnapshot(publishedState(), "Asia/Tokyo");

    const result = await getGoalAssessment({
      db: dbWithGoal({ planningTimezone: "Asia/Tokyo" }),
      profileId,
      goalId,
      now: new Date("2026-08-01T12:00:00.000Z"),
      plannedSessions: [
        {
          kind: "projected",
          sourceId: "planned-session-1",
          scheduledAt: "2026-08-03T08:00:00.000Z",
          activityCategory: "run",
          commonLoad: 100,
        },
      ],
    });

    expect(result.assessment?.assessedAt).toBe("2026-09-01T14:59:59.999Z");
  });

  it.each([
    ["spring offset", "2027-03-14", "2027-03-15T06:59:59.999Z"],
    ["fall offset", "2026-11-01", "2026-11-02T07:59:59.999Z"],
  ])("simulates through the Los Angeles-local goal end across the %s", async (_label, targetDate, expected) => {
    mockSnapshot(publishedState(), "America/Los_Angeles");

    const result = await getGoalAssessment({
      db: dbWithGoal({ planningTimezone: "America/Los_Angeles", targetDate }),
      profileId,
      goalId,
      now: new Date("2026-08-01T12:00:00.000Z"),
      plannedSessions: [
        {
          kind: "projected",
          sourceId: "planned-session-1",
          scheduledAt: "2026-08-03T08:00:00.000Z",
          activityCategory: "run",
          commonLoad: 100,
        },
      ],
    });

    expect(result.assessment?.assessedAt).toBe(expected);
  });

  it("reports unavailable without inventing readiness", async () => {
    mockSnapshot(null);

    await expect(
      getGoalAssessment({
        db: dbWithGoal(),
        profileId,
        goalId,
        now: new Date("2026-08-01T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      stateRevision: null,
      freshness: "unavailable",
      assessmentConfidence: 0,
      rebuildStatus: "unavailable",
      assessment: null,
    });
  });

  it("reports a failed deferred import before any source revision exists", async () => {
    mockSnapshot(null, "UTC", "failed");

    await expect(
      getGoalAssessment({
        db: dbWithGoal(),
        profileId,
        goalId,
        now: new Date("2026-08-01T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      stateRevision: null,
      freshness: "unavailable",
      rebuildStatus: "failed",
      assessment: null,
    });
  });

  it.each([
    ["active", "pending"],
    ["failed", "failed"],
  ] as const)("marks a published assessment stale for a %s bulk import", async (status, expected) => {
    mockSnapshot(publishedState(), "UTC", status);

    await expect(
      getGoalAssessment({
        db: dbWithGoal(),
        profileId,
        goalId,
        now: new Date("2026-08-01T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ freshness: "stale", rebuildStatus: expected });
  });

  it("uses persisted longest-distance and duration evidence for goal specificity", async () => {
    const estimate = (capabilityKind: string, value: number, unit: string) => ({
      profile_id: profileId,
      capability_kind: capabilityKind,
      activity_category: "run" as const,
      value,
      unit,
      confidence: 0.9,
      effective_at: new Date("2026-08-01T10:00:00.000Z"),
      evidence_window_start_at: null,
      evidence_window_end_at: new Date("2026-08-01T12:00:00.000Z"),
      algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      source_revision: 4,
      computed_at: new Date("2026-08-01T12:00:00.000Z"),
    });
    mockSnapshot(
      publishedState([
        estimate("longest_distance", 10_000, "meters"),
        estimate("longest_duration", 60, "minutes"),
      ]),
    );

    const result = await getGoalAssessment({
      db: dbWithGoal(),
      profileId,
      goalId,
      now: new Date("2026-08-01T12:00:00.000Z"),
    });
    expect(result.assessment).toMatchObject({
      specificityScore: 100,
      reasonCodes: expect.arrayContaining(["activity_specific_capability_available"]),
    });
  });
});
