import { describe, expect, it, vi } from "vitest";
import {
  deleteRemoteActivitySourceWithCanonicalCleanup,
  resolveCanonicalActivityReference,
} from "./activity-source-reference-repository";

const source = {
  integrationId: "11111111-1111-4111-8111-111111111111",
  profileId: "22222222-2222-4222-8222-222222222222",
  provider: "wahoo" as const,
  providerExternalId: "external-activity",
};

function transactionWithDirectReference(row: {
  activityId: string | null;
  resolutionStatus: string;
}) {
  const limit = vi.fn().mockResolvedValue([row]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { select: vi.fn(() => ({ from })) } as never;
}

describe("resolveCanonicalActivityReference", () => {
  it.each([
    "review",
    "ignored",
    "provider_deleted",
  ] as const)("does not resurrect a %s direct source", async (resolutionStatus) => {
    await expect(
      resolveCanonicalActivityReference(
        transactionWithDirectReference({ activityId: null, resolutionStatus }),
        source,
      ),
    ).rejects.toMatchObject({ status: resolutionStatus });
  });

  it("resolves a confirmed direct source", async () => {
    await expect(
      resolveCanonicalActivityReference(
        transactionWithDirectReference({
          activityId: "33333333-3333-4333-8333-333333333333",
          resolutionStatus: "confirmed",
        }),
        source,
      ),
    ).resolves.toBe("33333333-3333-4333-8333-333333333333");
  });
});

function remoteDeletionTransaction(input: {
  acceptedArtifact?: boolean;
  otherSource?: boolean;
  providerRevision?: string;
  relationshipKind?: "imported" | "exported" | "both";
  resolutionStatus?: "confirmed" | "ignored";
}) {
  const rows = [
    [
      {
        activityId: "33333333-3333-4333-8333-333333333333",
        id: "44444444-4444-4444-8444-444444444444",
        providerRevision: input.providerRevision ?? null,
        relationshipKind: input.relationshipKind ?? "imported",
        resolutionStatus: input.resolutionStatus ?? "confirmed",
      },
    ],
    input.otherSource ? [{ id: "other-source" }] : [],
    input.acceptedArtifact ? [{ id: "artifact-link" }] : [],
  ];
  const select = vi.fn(() => {
    const isLockedSourceRead = rows.length === 3;
    const selectedRows = rows.shift() ?? [];
    const query = {
      from: vi.fn(() => query),
      innerJoin: vi.fn(() => query),
      where: vi.fn(() => query),
      limit: vi.fn(() => (isLockedSourceRead ? query : Promise.resolve(selectedRows))),
      for: vi.fn(() => Promise.resolve(selectedRows)),
    };
    return query;
  });
  const returning = vi.fn().mockResolvedValue([{ id: "source" }]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return {
    execute: vi.fn().mockResolvedValue([]),
    select,
    update: vi.fn(() => ({ set })),
  } as never;
}

describe("deleteRemoteActivitySourceWithCanonicalCleanup", () => {
  const deletionInput = {
    integrationId: source.integrationId,
    profileId: source.profileId,
    provider: source.provider,
    providerExternalId: source.providerExternalId,
  };

  it.each([
    [{ otherSource: true }, { hasOtherConfirmedSource: true }],
    [{ acceptedArtifact: true }, { hasAcceptedArtifactEvidence: true }],
  ] as const)("retains a canonical activity with represented support", async (support, expected) => {
    const deleteCanonicalActivity = vi.fn(async () => undefined);
    await expect(
      deleteRemoteActivitySourceWithCanonicalCleanup(
        remoteDeletionTransaction(support),
        deletionInput,
        deleteCanonicalActivity,
      ),
    ).resolves.toMatchObject({ status: "canonical_retained", support: expected });
    expect(deleteCanonicalActivity).not.toHaveBeenCalled();
  });

  it("deletes a canonical activity only after proving that no supported evidence remains", async () => {
    const deleteCanonicalActivity = vi.fn(async () => undefined);
    await expect(
      deleteRemoteActivitySourceWithCanonicalCleanup(
        remoteDeletionTransaction({}),
        deletionInput,
        deleteCanonicalActivity,
      ),
    ).resolves.toMatchObject({ status: "canonical_deleted" });
    expect(deleteCanonicalActivity).toHaveBeenCalledWith({
      activityId: "33333333-3333-4333-8333-333333333333",
      profileId: source.profileId,
    });
  });

  it("preserves an ignored user tombstone against later provider deletion", async () => {
    const deleteCanonicalActivity = vi.fn(async () => undefined);
    await expect(
      deleteRemoteActivitySourceWithCanonicalCleanup(
        remoteDeletionTransaction({ resolutionStatus: "ignored" }),
        deletionInput,
        deleteCanonicalActivity,
      ),
    ).resolves.toEqual({ status: "retained_user_tombstone" });
    expect(deleteCanonicalActivity).not.toHaveBeenCalled();
  });

  it.each([
    "exported",
    "both",
  ] as const)("preserves the local canonical activity when a %s remote alias is deleted", async (relationshipKind) => {
    const deleteCanonicalActivity = vi.fn(async () => undefined);
    await expect(
      deleteRemoteActivitySourceWithCanonicalCleanup(
        remoteDeletionTransaction({ relationshipKind }),
        deletionInput,
        deleteCanonicalActivity,
      ),
    ).resolves.toMatchObject({ status: "canonical_retained" });
    expect(deleteCanonicalActivity).not.toHaveBeenCalled();
  });

  it("ignores an out-of-order deletion older than the persisted provider revision", async () => {
    const deleteCanonicalActivity = vi.fn(async () => undefined);
    await expect(
      deleteRemoteActivitySourceWithCanonicalCleanup(
        remoteDeletionTransaction({ providerRevision: "2026-09-02T10:00:00.000Z" }),
        { ...deletionInput, providerRevision: "2026-09-01T10:00:00.000Z" },
        deleteCanonicalActivity,
      ),
    ).resolves.toEqual({
      status: "stale_event",
      activityId: "33333333-3333-4333-8333-333333333333",
    });
    expect(deleteCanonicalActivity).not.toHaveBeenCalled();
  });

  it("creates a provider tombstone when deletion arrives before import history", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "tombstone" }]);
    const transaction = {
      execute: vi.fn().mockResolvedValue([]),
      select: vi.fn(() => {
        const query = {
          from: vi.fn(() => query),
          where: vi.fn(() => query),
          limit: vi.fn(() => query),
          for: vi.fn().mockResolvedValue([]),
        };
        return query;
      }),
      insert: vi.fn(() => ({
        values: vi.fn((values: unknown) => ({
          onConflictDoNothing: vi.fn(() => ({ returning })),
          values,
        })),
      })),
    };
    const deleteCanonicalActivity = vi.fn(async () => undefined);
    await expect(
      deleteRemoteActivitySourceWithCanonicalCleanup(
        transaction as never,
        { ...deletionInput, providerRevision: "2026-09-01T10:00:00.000Z" },
        deleteCanonicalActivity,
      ),
    ).resolves.toEqual({ status: "source_deactivated", activityId: null });
    expect(transaction.insert).toHaveBeenCalledOnce();
    expect(deleteCanonicalActivity).not.toHaveBeenCalled();
  });
});
