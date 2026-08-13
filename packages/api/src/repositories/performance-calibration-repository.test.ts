import { describe, expect, it, vi } from "vitest";
import {
  buildCalibrationSelectionEvidenceLinks,
  insertCalibrationEvidenceEvaluation,
  invalidateAllCalibrationEvidenceForActivity,
  readCalibrationAsOf,
} from "./performance-calibration-repository";

describe("performance calibration evidence ownership", () => {
  it("builds ordered profile-owned normalized selection links instead of JSON-only provenance", () => {
    expect(
      buildCalibrationSelectionEvidenceLinks({
        calibrationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        profileId: "11111111-1111-4111-8111-111111111111",
        identity: { metricKey: "threshold_speed", activityCategory: "run" },
        selectedEvidenceIds: [
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        ],
      }),
    ).toEqual([
      {
        calibration_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        evidence_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        profile_id: "11111111-1111-4111-8111-111111111111",
        metric_key: "threshold_speed",
        activity_category: "run",
        ordinal: 0,
      },
      {
        calibration_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        evidence_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        profile_id: "11111111-1111-4111-8111-111111111111",
        metric_key: "threshold_speed",
        activity_category: "run",
        ordinal: 1,
      },
    ]);
  });

  it("does not resolve a calibration through cross-identity selection evidence", async () => {
    const evidenceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const calibrationBuilder = {
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    };
    calibrationBuilder.where.mockReturnValue(calibrationBuilder);
    calibrationBuilder.orderBy.mockReturnValue(calibrationBuilder);
    calibrationBuilder.limit.mockResolvedValue([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        profile_id: "11111111-1111-4111-8111-111111111111",
        metric_key: "threshold_speed",
        activity_category: "run",
        value: 4,
        unit: "meters_per_second",
        effective_at: new Date("2026-08-09T12:00:00.000Z"),
        expires_at: new Date("2026-09-09T12:00:00.000Z"),
        policy_version: "performance-calibration-v1",
        selection_diagnostics: {
          selectedEvidenceIds: [evidenceId],
          selectedActivityIds: ["22222222-2222-4222-8222-222222222222"],
          evidenceCount: 1,
          selectionReason: "first_qualifying_evidence",
          trend: "initial",
          tolerance: 0.03,
          policyVersion: "performance-calibration-v1",
        },
        supersedes_id: null,
        created_at: new Date("2026-08-09T12:00:00.000Z"),
      },
    ]);
    const evidenceBuilder = {
      innerJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
    };
    evidenceBuilder.innerJoin.mockReturnValue(evidenceBuilder);
    evidenceBuilder.where.mockReturnValue(evidenceBuilder);
    evidenceBuilder.orderBy.mockReturnValue(evidenceBuilder);
    evidenceBuilder.limit.mockResolvedValue([
      {
        id: evidenceId,
        activityId: "22222222-2222-4222-8222-222222222222",
        ordinal: 0,
        linkMetricKey: "threshold_heart_rate",
        linkActivityCategory: "bike",
        evidenceMetricKey: "threshold_heart_rate",
        evidenceActivityCategory: "bike",
      },
    ]);
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: vi.fn(() => calibrationBuilder) })
      .mockReturnValueOnce({ from: vi.fn(() => evidenceBuilder) });

    await expect(
      readCalibrationAsOf({ select } as never, {
        profileId: "11111111-1111-4111-8111-111111111111",
        identity: { metricKey: "threshold_speed", activityCategory: "run" },
        asOf: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).resolves.toBeNull();
  });

  it("rejects evidence before insertion when the accepted source identity is not owner-matched", async () => {
    const insert = vi.fn();
    const select = vi.fn(() => ({
      from: vi.fn(() => {
        const builder = {
          innerJoin: vi.fn(() => builder),
          where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
        };
        return builder;
      }),
    }));
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const tx = { select, insert, execute };

    await expect(
      insertCalibrationEvidenceEvaluation(tx as never, {
        profileId: "11111111-1111-4111-8111-111111111111",
        identity: { metricKey: "threshold_speed", activityCategory: "run" },
        value: 4,
        observedAt: new Date("2026-08-10T12:00:00.000Z"),
        activityId: "22222222-2222-4222-8222-222222222222",
        segmentId: "33333333-3333-4333-8333-333333333333",
        segmentRevision: 2,
        sourceArtifactId: "44444444-4444-4444-8444-444444444444",
        state: "candidate",
        rejectionReason: null,
        sourceSemantics: "derived",
        diagnostics: { version: 1 },
        modelSourceEffortIds: [],
        now: new Date("2026-08-10T13:00:00.000Z"),
      }),
    ).rejects.toThrow("accepted profile-owned revision");
    expect(execute).toHaveBeenCalledOnce();
    expect(insert).not.toHaveBeenCalled();
  });

  it("retains hard-deleted activity evidence as invalidated audit history", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ metricKey: "threshold_power", activityCategory: "bike" }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const tx = { update: vi.fn(() => ({ set })), delete: vi.fn() };
    const now = new Date("2026-08-10T13:00:00.000Z");

    await expect(
      invalidateAllCalibrationEvidenceForActivity(tx as never, {
        profileId: "11111111-1111-4111-8111-111111111111",
        activityId: "22222222-2222-4222-8222-222222222222",
        now,
        reason: "activity_deleted",
      }),
    ).resolves.toEqual([{ metricKey: "threshold_power", activityCategory: "bike" }]);
    expect(set).toHaveBeenCalledWith({
      state: "invalidated",
      invalidated_at: now,
      invalidation_reason: "activity_deleted",
    });
    expect(tx.delete).not.toHaveBeenCalled();
  });
});
