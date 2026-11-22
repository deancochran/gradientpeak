import { beforeEach, describe, expect, it, vi } from "vitest";
import { withRepeatableReadSnapshot } from "../../db";

const readThresholdsForRequests = vi.hoisted(() => vi.fn());

vi.mock("../../repositories/athlete-performance-model-repository", () => ({
  adaptActivityEffortToCanonicalPerformanceEvidence: vi.fn(),
  adaptQualifiedSwimmingPerformanceEvidence: vi.fn(),
}));

vi.mock("../../repositories/threshold-repository", () => ({
  readThresholdsForRequests,
}));

import {
  createAthletePerformanceTargetFactsBatchReader,
  createAthletePerformanceTargetFactsReader,
  getAthleteThresholdTargetFactsAsOf,
  getAthleteThresholdTargetFactsForRequests,
} from "./get-athlete-performance-model-as-of";

beforeEach(() => {
  readThresholdsForRequests.mockReset();
});

function repeatableReadRoot(snapshotExecutor: object = {}) {
  const transaction = vi.fn(async (read: (executor: typeof snapshotExecutor) => Promise<unknown>) =>
    read(snapshotExecutor),
  );
  return { db: { $client: {}, transaction } as never, snapshotExecutor, transaction };
}

describe("getAthleteThresholdTargetFactsAsOf", () => {
  it("returns canonical threshold facts without translating them into fitted models", async () => {
    const asOf = new Date("2026-08-10T12:00:00.000Z");
    const rows = [
      {
        id: "threshold-1",
        status: "available",
        activityCategory: "swim",
        metric: "speed",
        method: "swim_speed_15m",
        value: 1.4,
        unit: "meters_per_second",
        effectiveAt: "2026-08-01T12:00:00.000Z",
        policyVersion: "threshold-policy-v1",
        state: "confirmed",
        confidence: 0.9,
        sourceEvaluationIds: ["evaluation-1"],
        sourceEffortIds: ["effort-1"],
        sourceActivityIds: ["activity-1"],
      },
    ];
    readThresholdsForRequests.mockResolvedValue([rows]);
    const root = repeatableReadRoot();
    const facts = await getAthleteThresholdTargetFactsAsOf(
      { athleteId: "11111111-1111-4111-8111-111111111111", asOf },
      root.db,
    );
    expect(facts.thresholds.swim).toMatchObject({
      status: "available",
      thresholdId: "threshold-1",
      evaluationId: "evaluation-1",
      activityCategory: "swim",
      metric: "speed",
      method: "swim_speed_15m",
      value: 1.4,
      freshness: "fresh",
      ageSeconds: 777_600,
    });
    expect(root.transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });
    expect(readThresholdsForRequests).toHaveBeenCalledWith(root.snapshotExecutor, [
      { profileId: "11111111-1111-4111-8111-111111111111", asOf },
    ]);
  });

  it("reads target HR facts directly without invoking duration-performance models", async () => {
    const asOf = new Date("2026-08-10T12:00:00.000Z");
    readThresholdsForRequests.mockResolvedValue([[]]);
    const readHeartRateCapabilityEvidenceBatch = vi.fn(async () => [
      {
        bike: { maxHr: { rows: [], truncated: false } },
        run: {
          maxHr: {
            rows: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                profile_id: "11111111-1111-4111-8111-111111111111",
                metric_type: "max_hr" as const,
                recorded_at: new Date("2026-08-09T12:00:00.000Z"),
                unit: "bpm",
                value: 191,
                source: "derived" as const,
                method: "max_hr_progressive_test_v1",
                calculation_version: "max_hr_progressive_test_v1",
                provenance: {
                  activity_id: "55555555-5555-4555-8555-555555555555",
                  segment_id: "66666666-6666-4666-8666-666666666666",
                  derived_from: "progressive_max_hr_test",
                  protocol: "progressive_max_hr",
                  source_series: "heart_rate",
                  calculation_version: "max_hr_progressive_test_v1",
                },
                reference_activity_id: "55555555-5555-4555-8555-555555555555",
                activity_category: "run" as const,
                reference_activity_finished_at: new Date("2026-08-09T12:00:00.000Z"),
              },
            ],
            truncated: false,
          },
        },
        swim: { maxHr: { rows: [], truncated: false } },
      },
    ]);
    const root = repeatableReadRoot();
    const reader = createAthletePerformanceTargetFactsReader(
      { readHeartRateCapabilityEvidenceBatch },
      root.db,
    );

    const facts = await reader({
      actorProfileId: "11111111-1111-4111-8111-111111111111",
      asOf,
    });

    expect(facts.heartRate.run.maxHr).toMatchObject({
      status: "available",
      valueBpm: 191,
      observedAt: "2026-08-09T12:00:00.000Z",
    });
    expect(facts.heartRate.run.lthr.status).toBe("unavailable");
    expect(readHeartRateCapabilityEvidenceBatch).toHaveBeenCalledWith(root.snapshotExecutor, [
      { athleteId: "11111111-1111-4111-8111-111111111111", asOf },
    ]);
    expect(readThresholdsForRequests).toHaveBeenCalledOnce();
  });

  it("keeps threshold and HR reads on one repeatable-read snapshot during a concurrent update", async () => {
    const asOf = new Date("2026-08-10T12:00:00.000Z");
    let visibleRevision = 1;
    const snapshotExecutor = { visibleRevision: 1 };
    const transaction = vi.fn(
      async (readSnapshot: (executor: typeof snapshotExecutor) => Promise<unknown>) => {
        snapshotExecutor.visibleRevision = visibleRevision;
        visibleRevision = 2;
        return readSnapshot(snapshotExecutor);
      },
    );
    readThresholdsForRequests.mockImplementation(async (executor: typeof snapshotExecutor) => {
      expect(executor.visibleRevision).toBe(1);
      return [[]];
    });
    const readHeartRateCapabilityEvidenceBatch = vi.fn(
      async (executor: typeof snapshotExecutor) => {
        expect(executor.visibleRevision).toBe(1);
        return [
          {
            bike: { maxHr: { rows: [], truncated: false } },
            run: { maxHr: { rows: [], truncated: false } },
            swim: { maxHr: { rows: [], truncated: false } },
          },
        ];
      },
    );
    const reader = createAthletePerformanceTargetFactsReader(
      { readHeartRateCapabilityEvidenceBatch } as never,
      { $client: {}, transaction } as never,
    );

    await expect(
      reader({
        actorProfileId: "11111111-1111-4111-8111-111111111111",
        asOf,
      }),
    ).resolves.toMatchObject({ athleteId: "11111111-1111-4111-8111-111111111111" });

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });
    expect(readThresholdsForRequests).toHaveBeenCalledWith(snapshotExecutor, [
      { profileId: "11111111-1111-4111-8111-111111111111", asOf },
    ]);
    expect(readHeartRateCapabilityEvidenceBatch).toHaveBeenCalledWith(snapshotExecutor, [
      { athleteId: "11111111-1111-4111-8111-111111111111", asOf },
    ]);
  });

  it("reuses a known repeatable-read transaction executor without opening a nested transaction", async () => {
    const asOf = new Date("2026-08-10T12:00:00.000Z");
    const root = repeatableReadRoot();
    readThresholdsForRequests.mockResolvedValue([[]]);
    const readHeartRateCapabilityEvidenceBatch = vi.fn(async () => [
      {
        bike: { maxHr: { rows: [], truncated: false } },
        run: { maxHr: { rows: [], truncated: false } },
        swim: { maxHr: { rows: [], truncated: false } },
      },
    ]);
    await withRepeatableReadSnapshot(root.db, async (transactionExecutor) => {
      const reader = createAthletePerformanceTargetFactsReader(
        { readHeartRateCapabilityEvidenceBatch },
        transactionExecutor,
      );
      await reader({
        actorProfileId: "11111111-1111-4111-8111-111111111111",
        asOf,
      });
    });

    expect(root.transaction).toHaveBeenCalledOnce();
    expect(readThresholdsForRequests).toHaveBeenCalledWith(root.snapshotExecutor, [
      { profileId: "11111111-1111-4111-8111-111111111111", asOf },
    ]);
    expect(readHeartRateCapabilityEvidenceBatch).toHaveBeenCalledWith(root.snapshotExecutor, [
      { athleteId: "11111111-1111-4111-8111-111111111111", asOf },
    ]);
  });

  it("rejects an unmarked existing transaction rather than assuming its isolation level", async () => {
    readThresholdsForRequests.mockResolvedValue([[]]);
    await expect(
      getAthleteThresholdTargetFactsAsOf(
        {
          athleteId: "11111111-1111-4111-8111-111111111111",
          asOf: new Date("2026-08-10T12:00:00.000Z"),
        },
        { execute: vi.fn() } as never,
      ),
    ).rejects.toThrow("not a known repeatable-read snapshot");
    expect(readThresholdsForRequests).not.toHaveBeenCalled();
  });

  it("preserves historical batch order and excludes later HR facts from earlier targets", async () => {
    const earlier = new Date("2026-08-08T12:00:00.000Z");
    const later = new Date("2026-08-10T12:00:00.000Z");
    readThresholdsForRequests.mockResolvedValue([[], []]);
    const availableRow = {
      id: "44444444-4444-4444-8444-444444444444",
      profile_id: "11111111-1111-4111-8111-111111111111",
      metric_type: "max_hr" as const,
      recorded_at: new Date("2026-08-09T12:00:00.000Z"),
      unit: "bpm",
      value: 191,
      source: "derived" as const,
      method: "max_hr_progressive_test_v1",
      calculation_version: "max_hr_progressive_test_v1",
      provenance: {
        activity_id: "55555555-5555-4555-8555-555555555555",
        segment_id: "66666666-6666-4666-8666-666666666666",
        derived_from: "progressive_max_hr_test",
        protocol: "progressive_max_hr",
        source_series: "heart_rate",
        calculation_version: "max_hr_progressive_test_v1",
      },
      reference_activity_id: "55555555-5555-4555-8555-555555555555",
      activity_category: "run" as const,
      reference_activity_finished_at: new Date("2026-08-09T12:00:00.000Z"),
    };
    const emptyCategory = { maxHr: { rows: [], truncated: false } };
    const readHeartRateCapabilityEvidenceBatch = vi.fn(async () => [
      { bike: emptyCategory, run: emptyCategory, swim: emptyCategory },
      {
        bike: emptyCategory,
        run: { maxHr: { rows: [availableRow], truncated: false } },
        swim: emptyCategory,
      },
    ]);
    const reader = createAthletePerformanceTargetFactsBatchReader(
      { readHeartRateCapabilityEvidenceBatch },
      repeatableReadRoot().db,
    );

    const facts = await reader([
      { actorProfileId: availableRow.profile_id, asOf: earlier },
      { actorProfileId: availableRow.profile_id, asOf: later },
    ]);

    expect(facts[0]?.asOf).toBe(earlier.toISOString());
    expect(facts[0]?.heartRate.run.maxHr.status).toBe("unavailable");
    expect(facts[1]?.asOf).toBe(later.toISOString());
    expect(facts[1]?.heartRate.run.maxHr).toMatchObject({ status: "available", valueBpm: 191 });
  });

  it("rejects an invalid as-of instant before querying persistence", async () => {
    readThresholdsForRequests.mockClear();
    await expect(
      getAthleteThresholdTargetFactsAsOf(
        {
          athleteId: "11111111-1111-4111-8111-111111111111",
          asOf: new Date(Number.NaN),
        },
        {} as never,
      ),
    ).rejects.toThrow("asOf is invalid");
    expect(readThresholdsForRequests).not.toHaveBeenCalled();
  });

  it("sends a representative max batch through one ordered repository read", async () => {
    const inputs = Array.from({ length: 525 }, (_, index) => ({
      athleteId:
        index % 2 === 0
          ? "11111111-1111-4111-8111-111111111111"
          : "22222222-2222-4222-8222-222222222222",
      asOf: new Date(Date.parse("2026-08-10T12:00:00.000Z") + index * 1_000),
      ...(index % 3 === 0 ? { excludedActivityId: "33333333-3333-4333-8333-333333333333" } : {}),
    }));
    readThresholdsForRequests.mockImplementation(
      async (_db: unknown, requests: Array<{ profileId: string; asOf: Date }>) =>
        requests.map(() => []),
    );
    const root = repeatableReadRoot();

    const facts = await getAthleteThresholdTargetFactsForRequests(inputs, root.db);

    expect(readThresholdsForRequests).toHaveBeenCalledOnce();
    expect(readThresholdsForRequests.mock.calls[0]?.[1]).toHaveLength(525);
    expect(facts.map(({ athleteId }) => athleteId)).toEqual(
      inputs.map(({ athleteId }) => athleteId),
    );
    expect(facts.every(({ thresholds }) => thresholds.bike.status === "unavailable")).toBe(true);
  });
});
