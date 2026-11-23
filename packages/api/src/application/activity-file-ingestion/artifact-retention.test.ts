import { describe, expect, it, vi } from "vitest";
import { createActivityArtifactRetentionService } from "./artifact-retention";

function dbWithArtifact(artifact: unknown) {
  const execute = vi.fn().mockResolvedValue({ rows: [] });
  return {
    execute,
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(artifact ? [artifact] : []) })),
      })),
    })),
  };
}

function storage(removeResult: unknown = { error: null }) {
  const remove = vi.fn().mockResolvedValue(removeResult);
  return { remove, service: { storage: { from: vi.fn(() => ({ remove })) } } };
}

function lifecycleDb(input: {
  artifacts: Array<{
    id: string;
    profile_id: string;
    availability: string;
    bucket: string;
    path: string;
  }>;
  linkedIds?: string[];
}) {
  const artifacts = new Map(input.artifacts.map((artifact) => [artifact.id, artifact]));
  let profileBatchReturned = false;
  let linkedBatchReturned = false;
  const execute = vi.fn().mockResolvedValue({ rows: [] });
  const select = vi.fn((fields?: unknown) => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (linkedBatchReturned) return [];
              linkedBatchReturned = true;
              return (input.linkedIds ?? []).map((id) => ({ id }));
            }),
          })),
        })),
      })),
      where: vi.fn(() =>
        fields
          ? {
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => {
                  if (profileBatchReturned) return [];
                  profileBatchReturned = true;
                  return [...artifacts.keys()].map((id) => ({ id }));
                }),
              })),
            }
          : {
              limit: vi.fn(async () => {
                const artifact = input.artifacts.shift();
                if (artifact) artifacts.delete(artifact.id);
                return artifact ? [artifact] : [];
              }),
            },
      ),
    })),
  }));
  return { execute, select };
}

describe("activity artifact retention", () => {
  it("checks profile ownership before invoking service-authority lifecycle functions", async () => {
    const db = dbWithArtifact(null);
    const files = storage();
    await expect(
      createActivityArtifactRetentionService(db as never, files.service as never).deleteForProfile({
        artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        profileId: "profile-without-ownership",
      }),
    ).resolves.toEqual({ status: "purged" });
    expect(db.execute).not.toHaveBeenCalled();
    expect(files.remove).not.toHaveBeenCalled();
  });

  it("requests revocation, deletes storage, finalizes, and purges in order", async () => {
    const db = dbWithArtifact({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      profile_id: "profile-1",
      availability: "accepted",
      bucket: "activity-files",
      path: "artifacts/sha256/profile-1/digest",
    });
    const files = storage();
    await expect(
      createActivityArtifactRetentionService(db as never, files.service as never).deleteForProfile({
        artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        profileId: "profile-1",
      }),
    ).resolves.toEqual({ status: "purged" });
    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(files.remove).toHaveBeenCalledWith(["artifacts/sha256/profile-1/digest"]);
    expect(db.execute.mock.invocationCallOrder[0]).toBeLessThan(
      files.remove.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("retries deletion_pending without requesting revocation again", async () => {
    const db = dbWithArtifact({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      profile_id: "profile-1",
      availability: "deletion_pending",
      bucket: "activity-files",
      path: "artifacts/sha256/profile-1/digest",
    });
    const files = storage();
    await createActivityArtifactRetentionService(
      db as never,
      files.service as never,
    ).deleteForProfile({
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      profileId: "profile-1",
    });
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("does not finalize when storage deletion fails", async () => {
    const db = dbWithArtifact({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      profile_id: "profile-1",
      availability: "deletion_pending",
      bucket: "activity-files",
      path: "artifacts/sha256/profile-1/digest",
    });
    const files = storage({ error: { message: "denied" } });
    await expect(
      createActivityArtifactRetentionService(db as never, files.service as never).deleteForProfile({
        artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        profileId: "profile-1",
      }),
    ).rejects.toThrow("Failed to delete retained activity artifact storage bytes");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("retries safely after storage fails following lifecycle revocation", async () => {
    const accepted = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      profile_id: "profile-1",
      availability: "accepted",
      bucket: "activity-files",
      path: "artifacts/sha256/profile-1/digest",
    };
    const limit = vi
      .fn()
      .mockResolvedValueOnce([accepted])
      .mockResolvedValueOnce([{ ...accepted, availability: "deletion_pending" }]);
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })),
      })),
    };
    const remove = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "transient" } })
      .mockResolvedValueOnce({ error: null });
    const service = createActivityArtifactRetentionService(
      db as never,
      {
        storage: { from: vi.fn(() => ({ remove })) },
      } as never,
    );

    await expect(
      service.deleteForProfile({ artifactId: accepted.id, profileId: "profile-1" }),
    ).rejects.toThrow("Failed to delete retained activity artifact storage bytes");
    await expect(
      service.deleteForProfile({ artifactId: accepted.id, profileId: "profile-1" }),
    ).resolves.toEqual({ status: "purged" });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it("deletes every current and historical artifact linked to an activity", async () => {
    const ids = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
    const db = lifecycleDb({
      linkedIds: ids,
      artifacts: ids.map((id, index) => ({
        id,
        profile_id: "profile-1",
        availability: "accepted",
        bucket: "activity-files",
        path: `artifacts/sha256/profile-1/digest-${index}`,
      })),
    });
    const files = storage();

    await expect(
      createActivityArtifactRetentionService(db as never, files.service as never).deleteForActivity(
        {
          activityId: "activity-1",
          profileId: "profile-1",
        },
      ),
    ).resolves.toBe(2);
    expect(files.remove).toHaveBeenNthCalledWith(1, ["artifacts/sha256/profile-1/digest-0"]);
    expect(files.remove).toHaveBeenNthCalledWith(2, ["artifacts/sha256/profile-1/digest-1"]);
  });

  it("deletes multiple profile artifacts in bounded resumable batches", async () => {
    const ids = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
    const db = lifecycleDb({
      artifacts: ids.map((id, index) => ({
        id,
        profile_id: "profile-1",
        availability: index === 0 ? "accepted" : "deletion_pending",
        bucket: "activity-files",
        path: `artifacts/sha256/profile-1/digest-${index}`,
      })),
    });
    const files = storage();

    await expect(
      createActivityArtifactRetentionService(
        db as never,
        files.service as never,
      ).deleteAllForProfile("profile-1", 2),
    ).resolves.toBe(2);
    expect(files.remove).toHaveBeenCalledTimes(2);
  });
});
