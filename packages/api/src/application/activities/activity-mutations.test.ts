import { beforeEach, describe, expect, it, vi } from "vitest";

const profileId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";

const retention = vi.hoisted(() => ({
  resumeDeletionForProfile: vi.fn().mockResolvedValue(0),
  listExclusiveArtifactIdsForActivity: vi.fn().mockResolvedValue([{ id: "artifact-1" }]),
  deleteForProfile: vi.fn().mockResolvedValue({ status: "purged" }),
}));
const athleteDerived = vi.hoisted(() => ({
  deleteThresholdEvidenceForActivity: vi.fn(async () => 1),
  lockPublicationState: vi.fn(async () => ({
    profileId,
    planningTimezone: "UTC",
    sourceRevision: 1,
    publishedRevision: 1,
  })),
  coalesceRecalculationRequest: vi.fn(async ({ request }) => request),
}));
const plannedSessions = vi.hoisted(() => ({
  listOwnedLinkedToActivity: vi.fn(
    async () => [] as Array<{ id: string; sessionRevision: number }>,
  ),
  mutateOwned: vi.fn(),
}));
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
vi.mock("../../infrastructure/repositories", () => ({
  createDrizzleAthleteDerivedStateRepository: vi.fn(() => athleteDerived),
  createDrizzlePlannedSessionRepository: vi.fn(() => plannedSessions),
}));
vi.mock("../../repositories/threshold-repository", () => ({
  readThresholdImpactForActivity: thresholdDeletion.readImpact,
  deleteThresholdChainsForImpacts: thresholdDeletion.deleteChains,
  rebuildThresholdChainWithProfileLockHeld: thresholdDeletion.rebuild,
}));
vi.mock("./submit-activity", () => ({ updateCanonicalActivityFields }));

import { deleteActivityForProfile, updateActivityForProfile } from "./activity-mutations";

beforeEach(() => {
  athleteDerived.deleteThresholdEvidenceForActivity.mockClear();
  athleteDerived.lockPublicationState.mockClear();
  athleteDerived.coalesceRecalculationRequest.mockClear();
  plannedSessions.listOwnedLinkedToActivity.mockReset().mockResolvedValue([]);
  plannedSessions.mutateOwned.mockReset();
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
      .mockResolvedValue([{ id: activityId, finishedAt: new Date("2026-07-01T00:00:00.000Z") }]);
    const where = vi.fn(() => ({ returning }));
    const deleteParent = vi.fn(() => ({ where }));
    const tx = { delete: deleteParent, execute: vi.fn().mockResolvedValue([]) };
    const db = {
      query: { activities: { findFirst: vi.fn().mockResolvedValue({ id: activityId }) } },
      transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      deleteActivityForProfile({
        db: db as never,
        artifactStorage: {} as never,
        activityId,
        profileId,
      }),
    ).resolves.toEqual({ success: true, deletedActivityId: activityId });

    expect(retention.resumeDeletionForProfile).toHaveBeenCalledWith(profileId);
    expect(retention.listExclusiveArtifactIdsForActivity).toHaveBeenCalledWith({
      activityId,
      profileId,
      limit: 10_000,
    });
    expect(thresholdDeletion.readImpact).toHaveBeenCalledWith(tx, {
      activityId,
      profileId,
    });
    expect(plannedSessions.listOwnedLinkedToActivity).toHaveBeenCalledWith({
      activityId,
      profileId,
    });
    expect(plannedSessions.listOwnedLinkedToActivity.mock.invocationCallOrder[0]).toBeLessThan(
      deleteParent.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(thresholdDeletion.deleteChains).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        profileId,
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
        profileId,
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
      profileId,
    });
    expect(athleteDerived.deleteThresholdEvidenceForActivity).toHaveBeenCalledWith({
      activityId,
      profileId,
    });
    expect(athleteDerived.coalesceRecalculationRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId,
        request: expect.objectContaining({
          earliestAffectedAt: "2026-06-01T00:00:00.000Z",
          reasons: ["activity_deleted"],
        }),
      }),
    );
  });

  it("records activity_deleted completion history before deleting the activity", async () => {
    plannedSessions.listOwnedLinkedToActivity.mockResolvedValueOnce([
      { id: "33333333-3333-4333-8333-333333333333", sessionRevision: 4 },
    ]);
    plannedSessions.mutateOwned.mockResolvedValueOnce({
      status: "updated",
      session: { id: "33333333-3333-4333-8333-333333333333" },
    });
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: activityId, finishedAt: new Date("2026-07-01T00:00:00.000Z") }]);
    const deleteParent = vi.fn(() => ({ where: vi.fn(() => ({ returning })) }));
    const tx = { delete: deleteParent, execute: vi.fn().mockResolvedValue([]) };
    const db = {
      query: { activities: { findFirst: vi.fn().mockResolvedValue({ id: activityId }) } },
      transaction: vi.fn((callback) => callback(tx)),
    };

    await deleteActivityForProfile({
      db: db as never,
      artifactStorage: {} as never,
      activityId,
      profileId,
    });

    expect(plannedSessions.mutateOwned).toHaveBeenCalledWith({
      action: "unlink_deleted_activity",
      activityId,
      expectedRevision: 4,
      profileId,
      sessionId: "33333333-3333-4333-8333-333333333333",
      unlinkedAt: expect.any(String),
    });
    expect(plannedSessions.mutateOwned.mock.invocationCallOrder[0]).toBeLessThan(
      deleteParent.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("leaves a rebuilt database state when post-commit artifact deletion needs a retry", async () => {
    const storageError = new Error("storage deletion failed");
    retention.deleteForProfile.mockRejectedValueOnce(storageError);
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: activityId, finishedAt: new Date("2026-07-01T00:00:00.000Z") }]);
    const tx = {
      execute: vi.fn().mockResolvedValue([]),
      delete: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
    };
    const db = {
      query: { activities: { findFirst: vi.fn().mockResolvedValue({ id: activityId }) } },
      transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      deleteActivityForProfile({
        db: db as never,
        artifactStorage: {} as never,
        activityId,
        profileId,
      }),
    ).rejects.toBe(storageError);

    expect(thresholdDeletion.readImpact).toHaveBeenCalled();
    expect(thresholdDeletion.deleteChains).toHaveBeenCalled();
    expect(thresholdDeletion.rebuild).toHaveBeenCalled();
    expect(athleteDerived.coalesceRecalculationRequest).toHaveBeenCalled();
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
    expect(athleteDerived.coalesceRecalculationRequest).not.toHaveBeenCalled();
  });
});
