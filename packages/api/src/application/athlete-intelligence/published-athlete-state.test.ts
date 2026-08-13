import { ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION } from "@repo/core";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type PublishedAthleteStateRead,
  readPublishedAthleteStateSnapshotData,
} from "../../repositories/athlete-state-repository";
import { readPublishedAthleteStateSnapshot } from "./published-athlete-state";

vi.mock("../../repositories/athlete-state-repository", () => ({
  readPublishedAthleteStateSnapshotData: vi.fn(),
}));

const profileId = "11111111-1111-4111-8111-111111111111";

function publishedState(): NonNullable<PublishedAthleteStateRead["current"]> {
  const computedAt = new Date("2026-07-01T23:30:00.000Z");
  return {
    state: {
      profile_id: profileId,
      source_revision: 4,
      published_revision: 4,
      dirty_from_at: null,
      fitness: 40,
      fatigue: 35,
      evidence_confidence: 0.75,
      coverage_start_at: new Date("2026-06-01T00:00:00.000Z"),
      coverage_end_at: computedAt,
      last_activity_at: computedAt,
      algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      computed_at: computedAt,
      lease_token: null,
      lease_expires_at: null,
      retry_after: null,
      consecutive_failures: 0,
      last_failure_code: null,
      updated_at: computedAt,
    },
    estimates: [],
  };
}

function snapshotRead(
  planningTimezone: string | null,
  blockingImport: "active" | "failed" | null = null,
) {
  return { planningTimezone, current: publishedState(), blockingImport };
}

function estimate(
  capabilityKind: string,
  activityCategory: "bike" | "run" | "swim",
  value: number,
  unit: string,
  targetFact: unknown,
) {
  const computedAt = new Date("2026-07-01T23:30:00.000Z");
  return {
    profile_id: profileId,
    capability_kind: capabilityKind,
    activity_category: activityCategory,
    value,
    unit,
    confidence: 0.9,
    effective_at: computedAt,
    evidence_window_start_at: new Date("2026-06-01T00:00:00.000Z"),
    evidence_window_end_at: computedAt,
    algorithm_version: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
    source_revision: 4,
    target_fact: targetFact,
    computed_at: computedAt,
  };
}

beforeEach(() => {
  vi.mocked(readPublishedAthleteStateSnapshotData)
    .mockReset()
    .mockResolvedValue(snapshotRead("UTC"));
});

describe("published athlete-state snapshot", () => {
  it("uses one profile-local current day and returns revision, freshness, import, and coverage", async () => {
    vi.mocked(readPublishedAthleteStateSnapshotData).mockResolvedValue(
      snapshotRead("America/Los_Angeles"),
    );
    const snapshot = await readPublishedAthleteStateSnapshot({
      db: {} as never,
      profileId,
      now: new Date("2026-07-02T00:30:00.000Z"),
    });

    expect(snapshot).toMatchObject({
      planningTimezone: "America/Los_Angeles",
      currentPlanningDate: "2026-07-01",
      freshness: "fresh",
      rebuildStatus: "fresh",
      importStatus: "complete",
      revisions: { source: 4, published: 4 },
      coverage: {
        startAt: "2026-06-01T00:00:00.000Z",
        endAt: "2026-07-01T23:30:00.000Z",
        lastActivityAt: "2026-07-01T23:30:00.000Z",
      },
      computedAt: "2026-07-01T23:30:00.000Z",
      baseline: {
        asOf: "2026-07-02T00:30:00.000Z",
        longTermLoad: 40,
        recentLoad: 35,
      },
    });
  });

  it("can retain the published baseline timestamp for a coherent historical snapshot", async () => {
    const snapshot = await readPublishedAthleteStateSnapshot({
      db: {} as never,
      profileId,
      now: new Date("2026-07-02T00:30:00.000Z"),
      advanceBaselineToReadTime: false,
    });

    expect(snapshot.baseline?.asOf).toBe("2026-07-01T23:30:00.000Z");
  });

  it("keeps the published snapshot fresh until a scheduled calibration expiry is due", async () => {
    const read = snapshotRead("UTC");
    if (!read.current) throw new Error("Expected published state fixture");
    read.current.state.source_revision = 5;
    read.current.state.published_revision = 4;
    read.current.state.dirty_from_at = new Date("2026-07-03T00:00:00.000Z");
    vi.mocked(readPublishedAthleteStateSnapshotData).mockResolvedValue(read);

    await expect(
      readPublishedAthleteStateSnapshot({
        db: {} as never,
        profileId,
        now: new Date("2026-07-02T00:30:00.000Z"),
      }),
    ).resolves.toMatchObject({ freshness: "fresh", rebuildStatus: "fresh" });
  });

  it("reconstructs canonical performance targets only from matching published estimate facts", async () => {
    const facts = buildPerformanceTargetFactsFixture({
      asOf: "2026-07-01T23:30:00.000Z",
      athleteId: profileId,
      planningThresholdPowerWatts: 285,
      planningThresholdPaceSecondsPerKm: 240,
      swimmingCssSecondsPer100m: 95,
      lthrBpm: { bike: 170, run: 176 },
      maxHrBpm: { bike: 190, run: 194, swim: 180 },
    });
    facts.cycling.planningThresholdPower.evidenceCount = 2;
    facts.cycling.planningThresholdPower.trend = "increasing";
    facts.heartRate.bike.lthr.evidenceCount = 3;
    facts.heartRate.bike.lthr.trend = "stable";
    const read = snapshotRead("UTC");
    if (!read.current) throw new Error("Expected published state fixture");
    read.current.estimates = [
      estimate("threshold_power", "bike", 285, "watts", facts.cycling.planningThresholdPower),
      estimate(
        "threshold_speed",
        "run",
        240,
        "seconds_per_km",
        facts.running.planningThresholdPace,
      ),
      estimate("threshold_speed", "swim", 95, "seconds_per_100m", facts.swimming.css),
      estimate("threshold_heart_rate", "bike", 170, "bpm", facts.heartRate.bike.lthr),
      estimate("bike_max_hr", "bike", 190, "bpm", facts.heartRate.bike.maxHr),
      estimate("threshold_heart_rate", "run", 176, "bpm", facts.heartRate.run.lthr),
      estimate("run_max_hr", "run", 194, "bpm", facts.heartRate.run.maxHr),
      estimate("swim_max_hr", "swim", 180, "bpm", facts.heartRate.swim.maxHr),
    ];
    vi.mocked(readPublishedAthleteStateSnapshotData).mockResolvedValue(read);

    await expect(
      readPublishedAthleteStateSnapshot({
        db: {} as never,
        profileId,
        now: new Date("2026-07-02T00:30:00.000Z"),
      }),
    ).resolves.toMatchObject({
      performanceTargets: {
        ...facts,
        cycling: {
          planningThresholdPower: expect.objectContaining({
            evidenceCount: 2,
            trend: "increasing",
          }),
        },
        heartRate: {
          bike: {
            lthr: expect.objectContaining({ evidenceCount: 3, trend: "stable" }),
          },
        },
      },
    });
  });

  it("uses UTC only when the profile preference is absent", async () => {
    vi.mocked(readPublishedAthleteStateSnapshotData).mockResolvedValueOnce(snapshotRead(null));
    await expect(
      readPublishedAthleteStateSnapshot({
        db: {} as never,
        profileId,
        now: new Date("2026-07-02T00:30:00.000Z"),
      }),
    ).resolves.toMatchObject({ planningTimezone: "UTC", currentPlanningDate: "2026-07-02" });

    vi.mocked(readPublishedAthleteStateSnapshotData).mockResolvedValueOnce(
      snapshotRead("not/a-timezone"),
    );
    await expect(
      readPublishedAthleteStateSnapshot({
        db: {} as never,
        profileId,
        now: new Date("2026-07-02T00:30:00.000Z"),
      }),
    ).rejects.toThrow();
  });

  it("keeps published state visible but stale when history is incomplete", async () => {
    vi.mocked(readPublishedAthleteStateSnapshotData).mockResolvedValue(
      snapshotRead("UTC", "failed"),
    );

    await expect(
      readPublishedAthleteStateSnapshot({
        db: {} as never,
        profileId,
        now: new Date("2026-07-02T00:30:00.000Z"),
      }),
    ).resolves.toMatchObject({
      freshness: "stale",
      rebuildStatus: "failed",
      importStatus: "failed",
      baseline: { stateRevision: 4 },
    });
  });
});
