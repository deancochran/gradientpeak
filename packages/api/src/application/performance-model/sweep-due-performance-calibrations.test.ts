import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  readIds: vi.fn().mockResolvedValue(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]),
  readRows: vi.fn().mockResolvedValue([
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      profile_id: "11111111-1111-4111-8111-111111111111",
      metric_key: "threshold_power",
      activity_category: "bike",
      expires_at: new Date("2026-08-10T12:00:00.000Z"),
    },
  ]),
  readCurrent: vi.fn().mockResolvedValue({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    expiresAt: "2026-08-10T12:00:00.000Z",
  }),
}));
const markDirty = vi.hoisted(() => vi.fn().mockResolvedValue(1));

vi.mock("../../repositories/performance-calibration-repository", () => ({
  readDueCalibrationIds: repository.readIds,
  readCalibrationsByIds: repository.readRows,
  readCalibrationAsOf: repository.readCurrent,
}));
vi.mock("../../repositories/athlete-state-repository", () => ({
  markAthleteStateDirty: markDirty,
}));

import { sweepDuePerformanceCalibrations } from "./sweep-due-performance-calibrations";

beforeEach(() => vi.clearAllMocks());

describe("due calibration sweep", () => {
  it("claims a bounded due row and dirties publication at expiry without appending state", async () => {
    const tx = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    const db = { transaction: vi.fn((callback) => callback(tx)) };
    const now = new Date("2026-08-10T12:00:01.000Z");

    await expect(
      sweepDuePerformanceCalibrations(db as never, { now, limit: 500 }),
    ).resolves.toEqual({ claimed: 1, changed: 1 });
    expect(repository.readIds).toHaveBeenCalledWith(tx, { now, limit: 100 });
    expect(repository.readCurrent).toHaveBeenCalledWith(tx, {
      profileId: "11111111-1111-4111-8111-111111111111",
      identity: { metricKey: "threshold_power", activityCategory: "bike" },
      asOf: now,
    });
    expect(markDirty).toHaveBeenCalledWith(tx, {
      profileId: "11111111-1111-4111-8111-111111111111",
      effectiveAt: new Date("2026-08-10T12:00:00.000Z"),
      now,
    });
  });

  it("is retry-safe when the due row is no longer current", async () => {
    repository.readCurrent.mockResolvedValueOnce(null);
    const tx = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    const db = { transaction: vi.fn((callback) => callback(tx)) };

    await expect(
      sweepDuePerformanceCalibrations(db as never, {
        now: new Date("2026-08-10T12:00:01.000Z"),
        limit: 1,
      }),
    ).resolves.toEqual({ claimed: 1, changed: 0 });
    expect(markDirty).not.toHaveBeenCalled();
  });
});
