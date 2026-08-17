import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { secondsPerKilometerToMetersPerSecond } from "@repo/core/units";
import { activities, profiles } from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  append: vi.fn(),
  advanceRefresh: vi.fn(),
  buildSummaries: vi.fn(),
  claim: vi.fn(),
  verifyClaim: vi.fn(),
  createStore: vi.fn(),
  fencedSnapshot: vi.fn(),
  failClaim: vi.fn(),
  lock: vi.fn(),
  lockPublicationState: vi.fn(),
  coalesceRecalculationRequest: vi.fn(),
  materialize: vi.fn(),
  readRevision: vi.fn(),
  rebuild: vi.fn(),
}));

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: mocks.createStore,
  createDrizzleAthleteDerivedStateRepository: vi.fn(() => ({
    lockPublicationState: mocks.lockPublicationState,
    coalesceRecalculationRequest: mocks.coalesceRecalculationRequest,
  })),
}));
vi.mock("../../db", () => ({
  withProfileFencedRepeatableReadSnapshot: mocks.fencedSnapshot,
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
  advanceClaimedActivityAnalysisRefresh: mocks.advanceRefresh,
  claimNextAthleteState: mocks.claim,
  failAthleteStateClaim: mocks.failClaim,
  verifyAthleteStateClaimForAnalysisRefresh: mocks.verifyClaim,
}));
vi.mock("../athlete-intelligence/athlete-state-evidence", () => ({
  materializeActivityAthleteStateEvidence: mocks.materialize,
}));
vi.mock("../athlete-intelligence/athlete-state-worker", () => ({
  ATHLETE_STATE_LEASE_MILLISECONDS: 300_000,
  rebuildClaimedAthleteState: mocks.rebuild,
}));

import {
  ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE,
  AnalysisRefreshFenceError,
  reprocessProfileActivityAnalysis,
} from "./reprocess-profile-activity-analysis";

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

const partial = {
  status: "partial" as const,
  model: "gradientpeak_relative_load" as const,
  version: "1" as const,
  activity_category: "run" as const,
  contributingDurationSeconds: 1800,
  knownDurationSeconds: 2400,
  contributingActivityCount: 1,
  partialActivityCount: 1,
  unavailableActivityCount: 0,
  totalActivityCount: 1,
  activityCountCoverage: 1,
  knownDurationCoverage: 0.75,
  unknownDurationActivityCount: 0,
  load: 42,
  intensity: 0.8,
};

function createFakeDb(
  input: { activityCount?: number; profileExists?: boolean; visibleFromIndex?: number } = {},
) {
  const originalSnapshot = Object.freeze({
    contractVersion: "completed-activity-performance-target-snapshot-v2",
    original: "immutable",
  });
  const activityRows = Array.from({ length: input.activityCount ?? 1 }, (_, index) => ({
    id:
      index === 0 ? ACTIVITY_ID : `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
    profile_id: PROFILE_ID,
    started_at: new Date(startedAt.getTime() + index * 60_000),
    finished_at: new Date(finishedAt.getTime() + index * 60_000),
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
  }));
  const segmentRows = activityRows.map((activityRow, index) => ({
    id: index === 0 ? SEGMENT_ID : `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, "0")}`,
    activity_id: activityRow.id,
    profile_id: PROFILE_ID,
    ordinal: 0,
    role: "activity",
    activity_category: "run",
    segment_revision: 3,
  }));
  const activity = activityRows[0];
  if (!activity) throw new Error("Fake activity database requires at least one activity");
  const select = vi.fn(() => {
    let table: unknown;
    const rows = () =>
      table === profiles
        ? input.profileExists === false
          ? []
          : [{ id: PROFILE_ID }]
        : table === activities
          ? activityRows.slice(input.visibleFromIndex ?? 0)
          : segmentRows.slice(input.visibleFromIndex ?? 0);
    const builder: Record<string, unknown> = {
      from(value: unknown) {
        table = value;
        return builder;
      },
      where() {
        return builder;
      },
      orderBy() {
        const ordered = Promise.resolve(rows()) as Promise<unknown> & {
          limit: (limit: number) => Promise<unknown[]>;
        };
        ordered.limit = (limit: number) => Promise.resolve(rows().slice(0, limit));
        return ordered;
      },
      limit(limit: number) {
        return Promise.resolve(rows().slice(0, limit));
      },
    };
    return builder;
  });
  const transactionExecutor = { select };
  const db = {
    $client: {},
    select,
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(transactionExecutor),
    ),
  };
  return {
    activity,
    activityRows,
    db: db as never,
    originalSnapshot,
    rawDb: db,
    segmentRows,
    select,
    transaction: db.transaction,
  };
}

describe("manual profile activity analysis reprocessing", () => {
  const targets = buildPerformanceTargetFactsFixture({
    athleteId: PROFILE_ID,
    asOf: startedAt.toISOString(),
    thresholdEffectiveAt: "2026-01-10T08:00:00.000Z",
    runThresholdMetersPerSecond: secondsPerKilometerToMetersPerSecond(300),
  });
  const getPerformanceTargetsForRequests = vi.fn(async ({ requests }: { requests: unknown[] }) =>
    requests.map(() => targets),
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createStore.mockReturnValue({ getPerformanceTargetsForRequests });
    mocks.fencedSnapshot.mockImplementation(async (db, _profileId, write) =>
      db.transaction(write, { accessMode: "read write", isolationLevel: "repeatable read" }),
    );
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
    mocks.lockPublicationState.mockResolvedValue({
      profileId: PROFILE_ID,
      planningTimezone: "UTC",
      sourceRevision: 1,
      publishedRevision: 1,
    });
    mocks.coalesceRecalculationRequest.mockImplementation(async ({ request }) => request);
    mocks.advanceRefresh.mockResolvedValue(true);
    mocks.verifyClaim.mockResolvedValue(true);
    mocks.claim.mockResolvedValue({
      profileId: PROFILE_ID,
      sourceRevision: 1,
      leaseToken: "lease",
      planningTimezone: "UTC",
      dirtyFromAt: null,
      activityAnalysisCursor: null,
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
      availableSegments: 1,
      partialSegments: 0,
      unavailableSegments: 0,
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

  it("reports partial load separately from unavailable threshold results", async () => {
    const { db } = createFakeDb();
    mocks.buildSummaries.mockResolvedValueOnce([
      {
        activity_id: ACTIVITY_ID,
        segment_id: SEGMENT_ID,
        activity_category: "run",
        common_load: partial,
        observationQuantification: { members: [{ commonLoad: partial }] },
      },
    ]);

    const result = await reprocessProfileActivityAnalysis(db, {
      profileId: PROFILE_ID,
      apply: false,
    });

    expect(result).toMatchObject({
      availableSegments: 0,
      partialSegments: 1,
      unavailableSegments: 0,
      unavailableReasons: {},
    });
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
      accessMode: "read write",
      isolationLevel: "repeatable read",
    });
    expect(mocks.fencedSnapshot).toHaveBeenCalledWith(db, PROFILE_ID, expect.any(Function), {
      lockNamespace: 1,
    });
    expect(mocks.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        activityId: ACTIVITY_ID,
        profileId: PROFILE_ID,
        sourceSegmentsRevision: 3,
        performanceTargets: targets,
      }),
    );
    expect(mocks.append.mock.calls[0]?.[1]?.performanceTargets.thresholds.run).toMatchObject({
      thresholdId: "run-threshold-test-fixture",
      evaluationId: "run-evaluation-test-fixture",
      method: "run_speed_30m",
      effectiveAt: "2026-01-10T08:00:00.000Z",
      calculationVersion: "threshold-policy-v1",
      confidence: 0.9,
    });
    expect(mocks.materialize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        profileId: PROFILE_ID,
        activityId: ACTIVITY_ID,
        canonicalEvidenceMaterialChanged: true,
        deferAthleteStateRefresh: true,
        targetSourceRevision: 2,
      }),
    );
    expect(mocks.coalesceRecalculationRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PROFILE_ID,
        request: expect.objectContaining({
          earliestAffectedAt: finishedAt.toISOString(),
          reasons: ["analysis_replaced"],
        }),
      }),
    );
    expect(mocks.claim).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ profileId: PROFILE_ID }),
    );
    expect(activity.performance_target_snapshot).toBe(originalSnapshot);
  });

  it("finishes claimed historical analysis without recursively claiming or rebuilding state", async () => {
    const { db } = createFakeDb();
    const now = new Date("2026-03-01T00:00:00.000Z");
    const claimedAthleteState = {
      profileId: PROFILE_ID,
      sourceRevision: 7,
      leaseToken: "22222222-2222-4222-8222-222222222222",
      planningTimezone: "UTC",
      dirtyFromAt: startedAt,
      activityAnalysisCursor: null,
    };
    mocks.verifyClaim.mockResolvedValueOnce(true);

    await expect(
      reprocessProfileActivityAnalysis(db, {
        profileId: PROFILE_ID,
        apply: true,
        confirmProfileId: PROFILE_ID,
        from: startedAt,
        now,
        claimedAthleteState,
      }),
    ).resolves.toMatchObject({
      appendedRevisions: 1,
      athleteStateRebuild: "not_requested",
    });

    expect(mocks.verifyClaim).toHaveBeenCalledWith(expect.anything(), {
      claim: claimedAthleteState,
    });
    expect(mocks.coalesceRecalculationRequest).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.rebuild).not.toHaveBeenCalled();
  });

  it("commits a bounded claimed batch and persists its continuation cursor", async () => {
    const { activityRows, db, segmentRows } = createFakeDb({
      activityCount: ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE + 1,
    });
    const batchActivities = activityRows.slice(0, ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE);
    mocks.buildSummaries.mockResolvedValueOnce(
      batchActivities.map((activityRow, index) => {
        const segment = segmentRows[index];
        if (!segment) throw new Error("Expected batch segment");
        return {
          activity_id: activityRow.id,
          segment_id: segment.id,
          activity_category: "run",
          common_load: available,
          observationQuantification: { members: [{ commonLoad: available }] },
        };
      }),
    );
    const claimedAthleteState = {
      profileId: PROFILE_ID,
      sourceRevision: 7,
      leaseToken: "22222222-2222-4222-8222-222222222222",
      planningTimezone: "UTC",
      dirtyFromAt: startedAt,
      activityAnalysisCursor: null,
    };
    const now = new Date("2026-03-01T00:00:00.000Z");

    await expect(
      reprocessProfileActivityAnalysis(db, {
        profileId: PROFILE_ID,
        apply: true,
        confirmProfileId: PROFILE_ID,
        from: startedAt,
        now,
        claimedAthleteState,
      }),
    ).resolves.toMatchObject({
      scopedActivities: ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE,
      appendedRevisions: ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE,
      durableRefresh: "continued",
      athleteStateRebuild: "not_requested",
    });

    const last = batchActivities.at(-1);
    if (!last) throw new Error("Expected final batch activity");
    expect(mocks.advanceRefresh).toHaveBeenCalledWith(expect.anything(), {
      claim: claimedAthleteState,
      nextCursor: { startedAt: last.started_at, activityId: last.id },
      now,
    });
    expect(mocks.verifyClaim).not.toHaveBeenCalled();
    expect(mocks.append).toHaveBeenCalledTimes(ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE);
    expect(mocks.coalesceRecalculationRequest).not.toHaveBeenCalled();

    mocks.append.mockClear();
    mocks.materialize.mockClear();
    mocks.verifyClaim.mockClear();
    const continuationDb = createFakeDb({
      activityCount: ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE + 1,
      visibleFromIndex: ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE,
    });
    const remainingActivity = continuationDb.activityRows[ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE];
    const remainingSegment = continuationDb.segmentRows[ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE];
    if (!remainingActivity || !remainingSegment) throw new Error("Expected continuation activity");
    mocks.buildSummaries.mockResolvedValueOnce([
      {
        activity_id: remainingActivity.id,
        segment_id: remainingSegment.id,
        activity_category: "run",
        common_load: available,
        observationQuantification: { members: [{ commonLoad: available }] },
      },
    ]);
    const continuationClaim = {
      ...claimedAthleteState,
      leaseToken: "33333333-3333-4333-8333-333333333333",
      activityAnalysisCursor: { startedAt: last.started_at, activityId: last.id },
    };
    mocks.append.mockRejectedValueOnce(new Error("bounded_batch_failed"));

    await expect(
      reprocessProfileActivityAnalysis(continuationDb.db, {
        profileId: PROFILE_ID,
        apply: true,
        confirmProfileId: PROFILE_ID,
        from: startedAt,
        now,
        claimedAthleteState: continuationClaim,
      }),
    ).rejects.toThrow("bounded_batch_failed");
    expect(mocks.advanceRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.verifyClaim).not.toHaveBeenCalled();

    mocks.buildSummaries.mockResolvedValueOnce([
      {
        activity_id: remainingActivity.id,
        segment_id: remainingSegment.id,
        activity_category: "run",
        common_load: available,
        observationQuantification: { members: [{ commonLoad: available }] },
      },
    ]);

    await expect(
      reprocessProfileActivityAnalysis(continuationDb.db, {
        profileId: PROFILE_ID,
        apply: true,
        confirmProfileId: PROFILE_ID,
        from: startedAt,
        now,
        claimedAthleteState: continuationClaim,
      }),
    ).resolves.toMatchObject({
      scopedActivities: 1,
      appendedRevisions: 1,
      durableRefresh: "completed",
    });
    expect(mocks.verifyClaim).toHaveBeenCalledWith(expect.anything(), {
      claim: continuationClaim,
    });
    expect(mocks.advanceRefresh).toHaveBeenCalledTimes(1);
  });

  it("rolls back a bounded batch when its claim is fenced before cursor advancement", async () => {
    const fixture = createFakeDb({ activityCount: ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE + 1 });
    const batchActivities = fixture.activityRows.slice(0, ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE);
    mocks.buildSummaries.mockResolvedValueOnce(
      batchActivities.map((activityRow, index) => {
        const segment = fixture.segmentRows[index];
        if (!segment) throw new Error("Expected fenced batch segment");
        return {
          activity_id: activityRow.id,
          segment_id: segment.id,
          activity_category: "run",
          common_load: available,
          observationQuantification: { members: [{ commonLoad: available }] },
        };
      }),
    );
    const durable = { revisions: 0 };
    fixture.rawDb.transaction = vi.fn(async (write) => {
      const tx = { select: fixture.select, pendingRevisions: 0 };
      const result = await write(tx);
      durable.revisions += tx.pendingRevisions;
      return result;
    });
    mocks.append.mockImplementation(async (tx: { pendingRevisions: number }) => {
      tx.pendingRevisions += 1;
    });
    mocks.advanceRefresh.mockResolvedValueOnce(false);
    const claimedAthleteState = {
      profileId: PROFILE_ID,
      sourceRevision: 7,
      leaseToken: "22222222-2222-4222-8222-222222222222",
      planningTimezone: "UTC",
      dirtyFromAt: startedAt,
      activityAnalysisCursor: null,
    };

    await expect(
      reprocessProfileActivityAnalysis(fixture.db, {
        profileId: PROFILE_ID,
        apply: true,
        confirmProfileId: PROFILE_ID,
        from: startedAt,
        claimedAthleteState,
      }),
    ).rejects.toBeInstanceOf(AnalysisRefreshFenceError);

    expect(mocks.append).toHaveBeenCalledTimes(ACTIVITY_ANALYSIS_REFRESH_BATCH_SIZE);
    expect(mocks.advanceRefresh).toHaveBeenCalledOnce();
    expect(durable.revisions).toBe(0);
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
      accessMode: "read write",
      isolationLevel: "repeatable read",
    });
    const fenceOrder = mocks.fencedSnapshot.mock.invocationCallOrder[0];
    const firstEvaluationReadOrder = select.mock.invocationCallOrder[0];
    const revisionReadOrder = mocks.readRevision.mock.invocationCallOrder[0];
    if (
      fenceOrder === undefined ||
      firstEvaluationReadOrder === undefined ||
      revisionReadOrder === undefined
    ) {
      throw new Error("Expected the pre-snapshot fence and evaluation reads");
    }
    expect(fenceOrder).toBeLessThan(firstEvaluationReadOrder);
    expect(fenceOrder).toBeLessThan(revisionReadOrder);
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
