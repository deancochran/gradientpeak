import { beforeEach, describe, expect, it, vi } from "vitest";

const retention = vi.hoisted(() => ({
  resumeDeletionForProfile: vi.fn().mockResolvedValue(0),
  deleteForActivity: vi.fn().mockResolvedValue(1),
}));
const markAthleteStateDirty = vi.hoisted(() => vi.fn(async () => 1));

vi.mock("../activity-file-ingestion/artifact-retention", () => ({
  createActivityArtifactRetentionService: vi.fn(() => retention),
}));
vi.mock("../../repositories/athlete-state-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../repositories/athlete-state-repository")>()),
  markAthleteStateDirty,
}));

import { deleteActivityForProfile, updateActivityForProfile } from "./activity-mutations";

beforeEach(() => markAthleteStateDirty.mockClear());

describe("deleteActivityForProfile", () => {
  it("finishes linked artifact retention before deleting the parent activity", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: "activity-1", finishedAt: new Date("2026-07-01T00:00:00.000Z") }]);
    const where = vi.fn(() => ({ returning }));
    const deleteParent = vi.fn(() => ({ where }));
    const tx = { delete: deleteParent };
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
    expect(retention.deleteForActivity.mock.invocationCallOrder[0]).toBeLessThan(
      deleteParent.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(markAthleteStateDirty).toHaveBeenCalledWith(tx, {
      profileId: "profile-1",
      effectiveAt: new Date("2026-07-01T00:00:00.000Z"),
    });
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
