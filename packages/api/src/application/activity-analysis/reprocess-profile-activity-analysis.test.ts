import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { activities, profiles } from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  append: vi.fn(),
  buildSummaries: vi.fn(),
  claim: vi.fn(),
  createStore: vi.fn(),
  failClaim: vi.fn(),
  lock: vi.fn(),
  markDirty: vi.fn(),
  materialize: vi.fn(),
  readRevision: vi.fn(),
  rebuild: vi.fn(),
}));

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: mocks.createStore,
}));
vi.mock("../../lib/activity-analysis", () => ({
  buildActivitySegmentDerivedSummaries: mocks.buildSummaries,
}));
vi.mock("../../repositories/activity-analysis-revision-repository", () => ({
  appendActivityAnalysisRevision: mocks.append,
  activityAnalysisFingerprint: (value: unknown) => JSON.stringify(value),
  lockProfileActivityAnalysisScope: mocks.lock,
  readMatchingActivityAnalysisRevision: mocks.readRevision,
}));
vi.mock("../../repositories/athlete-state-repository", () => ({
  claimNextAthleteState: mocks.claim,
  failAthleteStateClaim: mocks.failClaim,
  markAthleteStateDirty: mocks.markDirty,
}));
vi.mock("../athlete-intelligence/athlete-state-evidence", () => ({
  materializeActivityAthleteStateEvidence: mocks.materialize,
}));
vi.mock("../athlete-intelligence/athlete-state-worker", () => ({
  ATHLETE_STATE_LEASE_MILLISECONDS: 300_000,
  rebuildClaimedAthleteState: mocks.rebuild,
}));

import { reprocessProfileActivityAnalysis } from "./reprocess-profile-activity-analysis";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEGMENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const startedAt = new Date("2026-01-15T08:00:00.000Z");
const finishedAt = new Date("2026-01-15T09:00:00.000Z");

const available = {
  status: "available" as const,
  model: "gradientpeak_relative_load" as const,
  version: "1" as const,
  activity_category: "run" as const,
  method: "run_pace_threshold" as const,
  load: 42,
  intensity: 0.8,
  contributingDurationSeconds: 1800,
  quality: { confidence: "high" as const },
  thresholdEvidence: { sourceFingerprint: "target" },
  evidenceFingerprint: "activity",
  computedAsOf: startedAt.toISOString(),
  estimated: false,
};

function createFakeDb(input: { profileExists?: boolean } = {}) {
  const originalSnapshot = Object.freeze({
    contractVersion: "completed-activity-performance-target-snapshot-v1",
    original: "immutable",
  });
  const activity = {
    id: ACTIVITY_ID,
    profile_id: PROFILE_ID,
    started_at: startedAt,
    finished_at: finishedAt,
    elapsed_ms: 3_600_000,
    active_ms: 3_600_000,
    moving_ms: 3_600_000,
    timing_coverage: "complete",
    distance_meters: 10_000,
    avg_heart_rate: null,
    max_heart_rate: null,
    segments_revision: 3,
    performance_target_snapshot: originalSnapshot,
    athlete_state_common_load: 10,
    athlete_state_activity_category: "run",
    athlete_state_evidence_confidence: 0.5,
  };
  const segment = {
    id: SEGMENT_ID,
    activity_id: ACTIVITY_ID,
    profile_id: PROFILE_ID,
    ordinal: 0,
    role: "activity",
    activity_category: "run",
    segment_revision: 3,
  };
  const select = vi.fn(() => {
    let table: unknown;
    const rows = () =>
      table === profiles
        ? input.profileExists === false
          ? []
          : [{ id: PROFILE_ID }]
        : table === activities
          ? [activity]
          : [segment];
    const builder: Record<string, unknown> = {
      from(value: unknown) {
        table = value;
        return builder;
      },
      where() {
        return builder;
      },
      orderBy() {
        return Promise.resolve(rows());
      },
      limit(limit: number) {
        return Promise.resolve(rows().slice(0, limit));
      },
    };
    return builder;
  });
  const db = {
    select,
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db)),
  };
  return { activity, db: db as never, originalSnapshot, select, transaction: db.transaction };
}

describe("manual profile activity analysis reprocessing", () => {
  const targets = buildPerformanceTargetFactsFixture({
    athleteId: PROFILE_ID,
    asOf: startedAt.toISOString(),
    planningThresholdPaceSecondsPerKm: 300,
  });
  const getPerformanceTargetsForRequests = vi.fn(async ({ requests }: { requests: unknown[] }) =>
    requests.map(() => targets),
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createStore.mockReturnValue({ getPerformanceTargetsForRequests });
    mocks.buildSummaries.mockResolvedValue([
      {
        activity_id: ACTIVITY_ID,
        segment_id: SEGMENT_ID,
        activity_category: "run",
        common_load: available,
        observationQuantification: { members: [{ commonLoad: available }] },
      },
    ]);
    mocks.readRevision.mockResolvedValue(null);
    mocks.materialize.mockResolvedValue({ materialChanged: true, effectiveAt: finishedAt });
    mocks.claim.mockResolvedValue({
      profileId: PROFILE_ID,
      sourceRevision: 1,
      leaseToken: "lease",
      planningTimezone: "UTC",
    });
    mocks.rebuild.mockResolvedValue(true);
  });

  it("dry-runs with current targets as-of activity time, excluding own evidence, and performs no writes", async () => {
    const { db, originalSnapshot, activity } = createFakeDb();

    const result = await reprocessProfileActivityAnalysis(db, {
      profileId: PROFILE_ID,
      apply: false,
      now: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      mode: "dry_run",
      scopedActivities: 1,
      evaluatedSegments: 1,
      changedActivities: 1,
      appendedRevisions: 0,
      athleteStateRebuild: "not_requested",
    });
    expect(getPerformanceTargetsForRequests).toHaveBeenCalledWith({
      requests: [{ profileId: PROFILE_ID, asOf: startedAt, activityIdToExclude: ACTIVITY_ID }],
    });
    expect(mocks.buildSummaries).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PROFILE_ID,
        performanceTargetsByActivityId: new Map([[ACTIVITY_ID, targets]]),
      }),
    );
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.materialize).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(activity.performance_target_snapshot).toBe(originalSnapshot);
  });

  it("appends and materializes revisions before replaying only the named profile", async () => {
    const { db, originalSnapshot, activity, transaction } = createFakeDb();
    const now = new Date("2026-03-01T00:00:00.000Z");

    const result = await reprocessProfileActivityAnalysis(db, {
      profileId: PROFILE_ID,
      apply: true,
      confirmProfileId: PROFILE_ID,
      now,
    });

    expect(result).toMatchObject({
      mode: "apply",
      appendedRevisions: 1,
      athleteStateRebuild: "completed",
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "read committed",
    });
    expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), PROFILE_ID);
    expect(mocks.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        activityId: ACTIVITY_ID,
        profileId: PROFILE_ID,
        sourceSegmentsRevision: 3,
        performanceTargets: targets,
      }),
    );
    expect(mocks.materialize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: PROFILE_ID,
        activityId: ACTIVITY_ID,
        deferAthleteStateRefresh: true,
      }),
    );
    expect(mocks.markDirty).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ profileId: PROFILE_ID, effectiveAt: finishedAt }),
    );
    expect(mocks.claim).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ profileId: PROFILE_ID }),
    );
    expect(activity.performance_target_snapshot).toBe(originalSnapshot);
  });

  it("re-evaluates the latest head after the profile lock and skips a concurrent duplicate", async () => {
    const { db, select, transaction } = createFakeDb();
    const projection = {
      version: 1,
      segments: [
        {
          segmentId: SEGMENT_ID,
          activityCategory: "run",
          commonLoad: available,
        },
      ],
    };
    mocks.readRevision.mockResolvedValue({
      targetFingerprint: JSON.stringify(targets),
      outputFingerprint: JSON.stringify(projection),
    });

    const result = await reprocessProfileActivityAnalysis(db, {
      profileId: PROFILE_ID,
      apply: true,
      confirmProfileId: PROFILE_ID,
      now: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "read committed",
    });
    const lockOrder = mocks.lock.mock.invocationCallOrder[0];
    const firstEvaluationReadOrder = select.mock.invocationCallOrder[0];
    const revisionReadOrder = mocks.readRevision.mock.invocationCallOrder[0];
    if (
      lockOrder === undefined ||
      firstEvaluationReadOrder === undefined ||
      revisionReadOrder === undefined
    ) {
      throw new Error("Expected the lock and post-lock evaluation reads");
    }
    expect(lockOrder).toBeLessThan(firstEvaluationReadOrder);
    expect(lockOrder).toBeLessThan(revisionReadOrder);
    expect(result).toMatchObject({
      mode: "apply",
      changedActivities: 0,
      appendedRevisions: 0,
      athleteStateRebuild: "not_needed",
    });
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.materialize).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("rejects apply without exact confirmation before opening a transaction", async () => {
    const { db, transaction } = createFakeDb();

    await expect(
      reprocessProfileActivityAnalysis(db, { profileId: PROFILE_ID, apply: true }),
    ).rejects.toThrow("exactly matches");

    expect(transaction).not.toHaveBeenCalled();
    expect(mocks.append).not.toHaveBeenCalled();
  });

  it("fails closed for an unavailable profile", async () => {
    const { db } = createFakeDb({ profileExists: false });

    await expect(
      reprocessProfileActivityAnalysis(db, { profileId: PROFILE_ID, apply: false }),
    ).rejects.toThrow("Profile not found");
    expect(mocks.append).not.toHaveBeenCalled();
  });
});
