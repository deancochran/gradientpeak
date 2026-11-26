import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fenced: vi.fn(),
  readSource: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("../../db", () => ({
  withProfileFencedRepeatableReadSnapshot: mocks.fenced,
}));
vi.mock("../../repositories/profile-accepted-activity-artifact-repository", () => ({
  listProfileCurrentAcceptedActivityArtifacts: vi.fn(),
  readCurrentAcceptedActivitySourceState: mocks.readSource,
}));
vi.mock("../activities/reconcile-activity-evidence", () => ({
  reconcileGeneratedActivityEvidenceWithProfileLockHeld: mocks.reconcile,
}));

import { reconcileReanalyzedArtifactAtomically } from "./reanalyze-accepted-activity-artifacts";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVITY_ID = "22222222-2222-4222-8222-222222222222";
const ARTIFACT_ID = "33333333-3333-4333-8333-333333333333";
const SEGMENT_ID = "44444444-4444-4444-8444-444444444444";
const startedAt = new Date("2026-01-01T00:00:00.000Z");
const finishedAt = new Date("2026-01-01T00:01:00.000Z");

describe("atomic accepted-artifact reconciliation", () => {
  it("reconciles generated efforts and threshold calibration in the same fenced transaction", async () => {
    const tx = { transaction: "profile-fenced" };
    mocks.fenced.mockImplementationOnce(async (_db, _profileId, write) => write(tx));
    mocks.readSource.mockResolvedValueOnce({
      startedAt,
      finishedAt,
      segmentsRevision: 3,
      segments: [
        {
          id: SEGMENT_ID,
          ordinal: 0,
          role: "activity",
          activityCategory: "bike",
          startOffsetMs: 0,
          endOffsetMs: 60_000,
          segmentRevision: 3,
          sourceArtifactId: ARTIFACT_ID,
          sourceMessageIndex: null,
          sourceSessionIndex: 0,
          rawTypeString: null,
          rawTypeInteger: null,
          rawSportString: "cycling",
          rawSportInteger: null,
          rawSubSportString: null,
          rawSubSportInteger: null,
        },
      ],
    });
    const lthrEffort = { method: "activity_file_lthr_detection" };
    const detectedLTHR = { valueBpm: 171 };
    mocks.reconcile.mockResolvedValueOnce({
      effortInserts: [lthrEffort],
      calibrationReconciliation: { changed: true },
    });
    const artifact = {
      activityId: ACTIVITY_ID,
      artifactId: ARTIFACT_ID,
      bucket: "activity-files",
      byteSize: 3,
      digest: "a".repeat(64),
      finishedAt,
      format: "fit" as const,
      mediaType: "application/vnd.ant.fit",
      path: `artifacts/sha256/${PROFILE_ID}/${"a".repeat(64)}`,
      segmentsRevision: 3,
      startedAt,
    };
    const analysis = {
      startedAt,
      activityCompletedAt: finishedAt,
      detectedLTHR,
      effortsToInsert: [lthrEffort],
      segmentSet: {
        version: 1,
        elapsedMs: 60_000,
        segments: [
          {
            id: SEGMENT_ID,
            ordinal: 0,
            role: "activity",
            activity_category: "bike",
            startOffsetMs: 0,
            endOffsetMs: 60_000,
            source: {
              kind: "artifact",
              artifactId: ARTIFACT_ID,
              source: { standard: "fit", format: "fit" },
              sessionMessageIndex: 0,
              rawSport: "cycling",
            },
          },
        ],
      },
    } as never;
    const now = new Date("2026-02-01T00:00:00.000Z");
    const db = {} as never;

    await expect(
      reconcileReanalyzedArtifactAtomically({
        analysis,
        artifact,
        db,
        now,
        profileId: PROFILE_ID,
      }),
    ).resolves.toEqual({
      insertedEfforts: 1,
      insertedLthrEfforts: 1,
      calibration: "completed",
    });

    expect(mocks.fenced).toHaveBeenCalledWith(db, PROFILE_ID, expect.any(Function));
    expect(mocks.readSource).toHaveBeenCalledWith(tx, {
      profileId: PROFILE_ID,
      activityId: ACTIVITY_ID,
      artifactId: ARTIFACT_ID,
    });
    expect(mocks.reconcile).toHaveBeenCalledWith(tx, {
      profileId: PROFILE_ID,
      activityId: ACTIVITY_ID,
      efforts: [lthrEffort],
      detectedLTHR,
      now,
    });
    expect(mocks.reconcile.mock.calls[0]?.[1]).not.toHaveProperty("deferPerformanceCalibration");
  });
});
