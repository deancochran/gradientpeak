import { describe, expect, it, vi } from "vitest";

const retention = vi.hoisted(() => ({
  resumeDeletionForProfile: vi.fn().mockResolvedValue(0),
  deleteForActivity: vi.fn().mockResolvedValue(1),
}));

vi.mock("../activity-file-ingestion/artifact-retention", () => ({
  createActivityArtifactRetentionService: vi.fn(() => retention),
}));

import { deleteActivityForProfile, updateActivityForProfile } from "./activity-mutations";

describe("deleteActivityForProfile", () => {
  it("finishes linked artifact retention before deleting the parent activity", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const deleteParent = vi.fn(() => ({ where }));
    const db = {
      query: { activities: { findFirst: vi.fn().mockResolvedValue({ id: "activity-1" }) } },
      delete: deleteParent,
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
    expect(retention.deleteForActivity.mock.invocationCallOrder[0]).toBeLessThan(
      deleteParent.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});

describe("updateActivityForProfile", () => {
  it("does not persist a legacy normalized_power field injected past the public type", async () => {
    const set = vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: "activity-1" }]) })),
    }));
    const tx = { update: vi.fn(() => ({ set })) };
    const db = { transaction: vi.fn((callback) => callback(tx)) };

    await updateActivityForProfile({
      db: db as never,
      input: { id: "activity-1", name: "Renamed", normalized_power: 999 } as never,
      profileId: "profile-1",
    });

    expect(set).toHaveBeenCalledWith(
      expect.not.objectContaining({ normalized_power: expect.anything() }),
    );
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed" }));
  });
});
