import { beforeEach, describe, expect, it, vi } from "vitest";

const retention = vi.hoisted(() => ({
  resumeDeletionForProfile: vi.fn().mockResolvedValue(0),
  deleteForActivity: vi.fn().mockResolvedValue(1),
}));
const markAthleteStateDirty = vi.hoisted(() => vi.fn(async () => 1));
const calibrationDeletion = vi.hoisted(() => ({
  invalidate: vi
    .fn()
    .mockResolvedValue([{ metricKey: "threshold_power", activityCategory: "bike" }]),
  resolve: vi.fn().mockResolvedValue({ changed: true, calibration: null }),
}));

vi.mock("../activity-file-ingestion/artifact-retention", () => ({
  createActivityArtifactRetentionService: vi.fn(() => retention),
}));
vi.mock("../../repositories/athlete-state-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../repositories/athlete-state-repository")>()),
  markAthleteStateDirty,
}));
vi.mock("../../repositories/performance-calibration-repository", () => ({
  invalidateAllCalibrationEvidenceForActivity: calibrationDeletion.invalidate,
  resolveCalibrationWithProfileLockHeld: calibrationDeletion.resolve,
}));

import { deleteActivityForProfile, updateActivityForProfile } from "./activity-mutations";

beforeEach(() => {
  markAthleteStateDirty.mockClear();
  calibrationDeletion.invalidate.mockClear();
  calibrationDeletion.resolve.mockClear();
  retention.resumeDeletionForProfile.mockReset().mockResolvedValue(0);
  retention.deleteForActivity.mockReset().mockResolvedValue(1);
});

describe("deleteActivityForProfile", () => {
  it("final-lock invalidates a concurrent source candidate before deleting its activity", async () => {
    calibrationDeletion.invalidate
      .mockResolvedValueOnce([{ metricKey: "threshold_power", activityCategory: "bike" }])
      .mockResolvedValueOnce([{ metricKey: "threshold_speed", activityCategory: "run" }]);
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: "activity-1", finishedAt: new Date("2026-07-01T00:00:00.000Z") }]);
    const where = vi.fn(() => ({ returning }));
    const deleteParent = vi.fn(() => ({ where }));
    const tx = { delete: deleteParent, execute: vi.fn().mockResolvedValue([]) };
    const db = {
      query: { activities: { findFirst: vi.fn().mockResolvedValue({ id: "activity-1" }) } },
      transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      deleteActivityForProfile({
        db: db as never,
        artifactStorage: {} as never,
        activityId: "activity-1",
        profileId: "profile-1",
      }),
    ).resolves.toEqual({ success: true, deletedActivityId: "activity-1" });

    expect(retention.resumeDeletionForProfile).toHaveBeenCalledWith("profile-1");
    expect(retention.deleteForActivity).toHaveBeenCalledWith({
      activityId: "activity-1",
      profileId: "profile-1",
    });
    expect(calibrationDeletion.invalidate).toHaveBeenNthCalledWith(
      1,
      tx,
      expect.objectContaining({
        activityId: "activity-1",
        profileId: "profile-1",
        reason: "activity_deleted",
      }),
    );
    expect(calibrationDeletion.invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      retention.deleteForActivity.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(calibrationDeletion.resolve).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        profileId: "profile-1",
        identity: { metricKey: "threshold_power", activityCategory: "bike" },
      }),
    );
    expect(retention.deleteForActivity.mock.invocationCallOrder[0]).toBeLessThan(
      deleteParent.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(calibrationDeletion.invalidate).toHaveBeenNthCalledWith(
      2,
      tx,
      expect.objectContaining({
        activityId: "activity-1",
        profileId: "profile-1",
        reason: "activity_deleted_final_fence",
      }),
    );
    expect(retention.deleteForActivity.mock.invocationCallOrder[0]).toBeLessThan(
      calibrationDeletion.invalidate.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
    );
    expect(calibrationDeletion.invalidate.mock.invocationCallOrder[1]).toBeLessThan(
      deleteParent.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(calibrationDeletion.resolve).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        profileId: "profile-1",
        identity: { metricKey: "threshold_speed", activityCategory: "run" },
      }),
    );
    expect(deleteParent.mock.invocationCallOrder[0]).toBeLessThan(
      calibrationDeletion.resolve.mock.invocationCallOrder.at(-1) ?? Number.POSITIVE_INFINITY,
    );
    expect(markAthleteStateDirty).toHaveBeenCalledWith(tx, {
      profileId: "profile-1",
      effectiveAt: new Date("2026-07-01T00:00:00.000Z"),
    });
  });

  it("re-resolves removed calibration evidence when artifact deletion needs a retry", async () => {
    const storageError = new Error("storage deletion failed");
    retention.deleteForActivity.mockRejectedValueOnce(storageError);
    const tx = { execute: vi.fn().mockResolvedValue([]) };
    const db = {
      query: { activities: { findFirst: vi.fn().mockResolvedValue({ id: "activity-1" }) } },
      transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      deleteActivityForProfile({
        db: db as never,
        artifactStorage: {} as never,
        activityId: "activity-1",
        profileId: "profile-1",
      }),
    ).rejects.toBe(storageError);

    expect(calibrationDeletion.resolve).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        profileId: "profile-1",
        identity: { metricKey: "threshold_power", activityCategory: "bike" },
      }),
    );
    expect(markAthleteStateDirty).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ profileId: "profile-1" }),
    );
  });
});

describe("updateActivityForProfile", () => {
  it("persists only canonical editable parent fields", async () => {
    const set = vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: "activity-1" }]) })),
    }));
    const tx = { update: vi.fn(() => ({ set })) };
    const db = { transaction: vi.fn((callback) => callback(tx)) };

    await updateActivityForProfile({
      db: db as never,
      input: { id: "activity-1", name: "Renamed" },
      profileId: "profile-1",
    });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed" }));
    expect(markAthleteStateDirty).not.toHaveBeenCalled();
  });
});
