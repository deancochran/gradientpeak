import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  insert: vi.fn().mockResolvedValue({ inserted: true }),
  invalidate: vi.fn().mockResolvedValue([]),
  readCalibration: vi.fn().mockResolvedValue(null),
  readSource: vi.fn().mockResolvedValue([
    {
      finishedAt: new Date("2026-08-10T12:00:00.000Z"),
      segmentsRevision: 2,
      segmentId: "22222222-2222-4222-8222-222222222222",
      activityCategory: "run",
      sourceArtifactId: "33333333-3333-4333-8333-333333333333",
    },
  ]),
  resolve: vi.fn().mockResolvedValue({ changed: false, calibration: null }),
}));
const markDirty = vi.hoisted(() => vi.fn().mockResolvedValue(1));

vi.mock("../../repositories/performance-calibration-repository", () => ({
  insertCalibrationEvidenceEvaluation: repository.insert,
  invalidateCalibrationEvidenceForActivitySources: repository.invalidate,
  readCalibrationAsOf: repository.readCalibration,
  readCalibrationEvidenceSource: repository.readSource,
  resolveCalibrationWithProfileLockHeld: repository.resolve,
}));
vi.mock("../../repositories/athlete-state-repository", () => ({
  markAthleteStateDirty: markDirty,
}));

import {
  finalizePerformanceCalibrationsAfterHistoryImport,
  reconcilePerformanceCalibrationsWithProfileLockHeld,
} from "./reconcile-performance-calibrations";

beforeEach(() => vi.clearAllMocks());

describe("calibration source replacement", () => {
  it("final history reconciliation resolves the complete registry at one horizon", async () => {
    repository.resolve.mockResolvedValue({ changed: false, calibration: null });
    const asOf = new Date("2026-08-10T12:00:00.000Z");
    const result = await finalizePerformanceCalibrationsAfterHistoryImport({} as never, {
      profileId: "11111111-1111-4111-8111-111111111111",
      asOf,
      now: new Date("2026-08-10T13:00:00.000Z"),
    });

    expect(result.identities.length).toBeGreaterThan(0);
    expect(repository.resolve).toHaveBeenCalledTimes(result.identities.length);
    expect(repository.resolve.mock.calls.every(([, input]) => input.asOf === asOf)).toBe(true);
  });

  it("re-resolves the old identity when a corrected segment changes category", async () => {
    await reconcilePerformanceCalibrationsWithProfileLockHeld({} as never, {
      profileId: "11111111-1111-4111-8111-111111111111",
      activityId: "44444444-4444-4444-8444-444444444444",
      efforts: [],
      detectedLTHR: null,
      swimmingCssResult: null,
      preInvalidatedIdentities: [{ metricKey: "threshold_power", activityCategory: "bike" }],
      now: new Date("2026-08-10T13:00:00.000Z"),
    });

    expect(repository.resolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        identity: { metricKey: "threshold_power", activityCategory: "bike" },
      }),
    );
    expect(repository.invalidate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        acceptedSources: [
          {
            segmentId: "22222222-2222-4222-8222-222222222222",
            segmentRevision: 2,
            sourceArtifactId: "33333333-3333-4333-8333-333333333333",
          },
        ],
      }),
    );
    expect(repository.resolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        identity: { metricKey: "threshold_speed", activityCategory: "run" },
      }),
    );
    expect(repository.readCalibration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        identity: { metricKey: "threshold_speed", activityCategory: "run" },
        excludedActivityId: "44444444-4444-4444-8444-444444444444",
      }),
    );
    expect(markDirty).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ profileId: "11111111-1111-4111-8111-111111111111" }),
    );
  });

  it("retains every exact accepted segment source when one activity has multiple artifacts", async () => {
    repository.readSource.mockResolvedValueOnce([
      {
        finishedAt: new Date("2026-08-10T12:00:00.000Z"),
        segmentsRevision: 3,
        segmentId: "22222222-2222-4222-8222-222222222221",
        activityCategory: "run",
        sourceArtifactId: "33333333-3333-4333-8333-333333333331",
      },
      {
        finishedAt: new Date("2026-08-10T12:00:00.000Z"),
        segmentsRevision: 3,
        segmentId: "22222222-2222-4222-8222-222222222222",
        activityCategory: "run",
        sourceArtifactId: "33333333-3333-4333-8333-333333333332",
      },
    ]);

    await reconcilePerformanceCalibrationsWithProfileLockHeld({} as never, {
      profileId: "11111111-1111-4111-8111-111111111111",
      activityId: "44444444-4444-4444-8444-444444444444",
      efforts: [],
      detectedLTHR: null,
      swimmingCssResult: null,
      now: new Date("2026-08-10T13:00:00.000Z"),
    });

    expect(repository.invalidate).toHaveBeenCalledWith(expect.anything(), {
      profileId: "11111111-1111-4111-8111-111111111111",
      activityId: "44444444-4444-4444-8444-444444444444",
      acceptedSources: [
        {
          segmentId: "22222222-2222-4222-8222-222222222221",
          segmentRevision: 3,
          sourceArtifactId: "33333333-3333-4333-8333-333333333331",
        },
        {
          segmentId: "22222222-2222-4222-8222-222222222222",
          segmentRevision: 3,
          sourceArtifactId: "33333333-3333-4333-8333-333333333332",
        },
      ],
      now: new Date("2026-08-10T13:00:00.000Z"),
      reason: "accepted_source_revision_replaced",
    });
    expect(repository.insert).toHaveBeenCalledTimes(4);
    expect(repository.insert.mock.calls.map(([, write]) => write.sourceArtifactId)).toEqual([
      "33333333-3333-4333-8333-333333333331",
      "33333333-3333-4333-8333-333333333331",
      "33333333-3333-4333-8333-333333333332",
      "33333333-3333-4333-8333-333333333332",
    ]);
  });
});
