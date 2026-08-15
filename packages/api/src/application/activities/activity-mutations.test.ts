import { beforeEach, describe, expect, it, vi } from "vitest";

const retention = vi.hoisted(() => ({
  resumeDeletionForProfile: vi.fn().mockResolvedValue(0),
  listExclusiveArtifactIdsForActivity: vi.fn().mockResolvedValue([{ id: "artifact-1" }]),
  deleteForProfile: vi.fn().mockResolvedValue({ status: "purged" }),
}));
const markAthleteStateDirty = vi.hoisted(() => vi.fn(async () => 1));
const updateCanonicalActivityFields = vi.hoisted(() => vi.fn(async () => ({ id: "activity-1" })));
const thresholdDeletion = vi.hoisted(() => ({
  readImpact: vi.fn().mockResolvedValue([
    {
      activityCategory: "bike",
      metric: "power",
      effectiveAt: new Date("2026-06-01T00:00:00.000Z"),
    },
  ]),
  deleteChains: vi.fn().mockResolvedValue(undefined),
  rebuild: vi.fn().mockResolvedValue({ changed: true, count: 0 }),
}));

vi.mock("../activity-file-ingestion/artifact-retention", () => ({
  createActivityArtifactRetentionService: vi.fn(() => retention),
}));
vi.mock("../../repositories/athlete-state-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../repositories/athlete-state-repository")>()),
  markAthleteStateDirty,
}));
vi.mock("../../repositories/threshold-repository", () => ({
  readThresholdImpactForActivity: thresholdDeletion.readImpact,
  deleteThresholdChainsForImpacts: thresholdDeletion.deleteChains,
  rebuildThresholdChainWithProfileLockHeld: thresholdDeletion.rebuild,
}));
vi.mock("./submit-activity", () => ({ updateCanonicalActivityFields }));

import { deleteActivityForProfile, updateActivityForProfile } from "./activity-mutations";

beforeEach(() => {
  markAthleteStateDirty.mockClear();
  updateCanonicalActivityFields.mockClear();
  thresholdDeletion.readImpact.mockClear();
  thresholdDeletion.deleteChains.mockClear();
  thresholdDeletion.rebuild.mockClear();
  retention.resumeDeletionForProfile.mockReset().mockResolvedValue(0);
  retention.listExclusiveArtifactIdsForActivity
    .mockReset()
    .mockResolvedValue([{ id: "artifact-1" }]);
  retention.deleteForProfile.mockReset().mockResolvedValue({ status: "purged" });
});

describe("deleteActivityForProfile", () => {
  it("identifies impact, deletes the source, rebuilds, and dirties under one final fence", async () => {
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
    expect(retention.listExclusiveArtifactIdsForActivity).toHaveBeenCalledWith({
      activityId: "activity-1",
      profileId: "profile-1",
      limit: 10_000,
    });
    expect(thresholdDeletion.readImpact).toHaveBeenCalledWith(tx, {
      activityId: "activity-1",
      profileId: "profile-1",
    });
    expect(thresholdDeletion.deleteChains).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        profileId: "profile-1",
      }),
    );
    expect(retention.listExclusiveArtifactIdsForActivity.mock.invocationCallOrder[0]).toBeLessThan(
      thresholdDeletion.readImpact.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(thresholdDeletion.readImpact.mock.invocationCallOrder[0]).toBeLessThan(
      deleteParent.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(thresholdDeletion.rebuild).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        profileId: "profile-1",
        identity: { activityCategory: "bike", metric: "power" },
      }),
    );
    expect(deleteParent.mock.invocationCallOrder[0]).toBeLessThan(
      thresholdDeletion.rebuild.mock.invocationCallOrder.at(-1) ?? Number.POSITIVE_INFINITY,
    );
    expect(deleteParent.mock.invocationCallOrder[0]).toBeLessThan(
      retention.deleteForProfile.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(retention.deleteForProfile).toHaveBeenCalledWith({
      artifactId: "artifact-1",
      profileId: "profile-1",
    });
    expect(markAthleteStateDirty).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        profileId: "profile-1",
        effectiveAt: new Date("2026-06-01T00:00:00.000Z"),
      }),
    );
  });

  it("leaves a rebuilt database state when post-commit artifact deletion needs a retry", async () => {
    const storageError = new Error("storage deletion failed");
    retention.deleteForProfile.mockRejectedValueOnce(storageError);
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: "activity-1", finishedAt: new Date("2026-07-01T00:00:00.000Z") }]);
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      delete: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
    };
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

    expect(thresholdDeletion.readImpact).toHaveBeenCalled();
    expect(thresholdDeletion.deleteChains).toHaveBeenCalled();
    expect(thresholdDeletion.rebuild).toHaveBeenCalled();
    expect(markAthleteStateDirty).toHaveBeenCalled();
  });
});

describe("updateActivityForProfile", () => {
  it("persists only canonical editable parent fields", async () => {
    const tx = {};
    const db = { transaction: vi.fn((callback) => callback(tx)) };

    await updateActivityForProfile({
      db: db as never,
      input: { id: "activity-1", name: "Renamed" },
      profileId: "profile-1",
    });

    expect(updateCanonicalActivityFields).toHaveBeenCalledWith(tx, {
      activityId: "activity-1",
      profileId: "profile-1",
      fields: { id: "activity-1", name: "Renamed" },
    });
    expect(markAthleteStateDirty).not.toHaveBeenCalled();
  });
});
