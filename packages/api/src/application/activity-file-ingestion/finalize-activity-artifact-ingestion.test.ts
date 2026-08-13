import { describe, expect, it, vi } from "vitest";
import type { getRequiredDb } from "../../db";
import type { ActivityArtifactStorage } from "./artifact-storage";
import { finalizeActivityArtifactIngestion } from "./finalize-activity-artifact-ingestion";

const profileId = "11111111-1111-4111-8111-111111111111";
const stagingPath = `activities/${profileId}/uploads/ride.fit`;
const bytes = new Uint8Array([1, 2, 3]);

function storageFixture(log: string[], options: { failCanonicalRemove?: boolean } = {}) {
  const objects = new Map<string, Uint8Array>();
  objects.set(stagingPath, bytes);
  const storage: ActivityArtifactStorage = {
    storage: {
      from: () => ({
        upload: async (path, body) => {
          log.push(`upload:${path}`);
          objects.set(path, body);
          return { error: null };
        },
        remove: async (paths) => {
          for (const path of paths) {
            log.push(`remove:${path}`);
            if (options.failCanonicalRemove && path.startsWith("artifacts/sha256/")) {
              return { error: { message: "storage unavailable" } };
            }
            objects.delete(path);
          }
          return { error: null };
        },
      }),
    },
    readObjectBounded: async ({ path }) => {
      const data = objects.get(path);
      if (!data) throw new Error("missing object");
      return { data, contentType: "application/octet-stream" };
    },
  };
  return { objects, storage };
}

function quarantineDb(
  options: {
    existingAvailability?: "accepted" | "deleted" | "deletion_pending";
    conflictAvailability?: "accepted" | "deleted" | "deletion_pending";
    ownershipAvailability?: "accepted" | "deleted" | "deletion_pending";
  } = {},
) {
  const inserted: Array<Record<string, unknown>> = [];
  const finalized = vi.fn().mockResolvedValue({ rows: [] });
  let selectCount = 0;
  const tx = {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockImplementation(async () => {
            selectCount += 1;
            const availability =
              selectCount === 1 ? options.existingAvailability : options.conflictAvailability;
            return availability ? [{ availability, id: "artifact-1" }] : [];
          }),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        inserted.push(value);
        return {
          onConflictDoNothing: vi.fn(() => ({
            returning: vi
              .fn()
              .mockResolvedValue(options.conflictAvailability ? [] : [{ id: value.id }]),
          })),
        };
      }),
    })),
  };
  const db = {
    transaction: async <T>(run: (client: typeof tx) => Promise<T>) => run(tx),
    execute: finalized,
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi
            .fn()
            .mockResolvedValue([
              { availability: options.ownershipAvailability ?? "deletion_pending" },
            ]),
        })),
      })),
    })),
  } as unknown as ReturnType<typeof getRequiredDb>;
  return { db, finalized, inserted };
}

describe("activity artifact ingestion finalizer", () => {
  it("parses before promotion, submits once, and removes staging after acceptance", async () => {
    const log: string[] = [];
    const { objects, storage } = storageFixture(log);

    await expect(
      finalizeActivityArtifactIngestion({} as never, {
        profileId,
        storage,
        bucket: "activity-files",
        stagingPath,
        bytes,
        format: "fit",
        parse: () => {
          log.push("parse");
          return { activity: "parsed" };
        },
        submit: async ({ parsedData, artifact }) => {
          log.push("submit");
          expect(parsedData).toEqual({ activity: "parsed" });
          expect(objects.has(artifact.path)).toBe(true);
          return { id: "activity-1" };
        },
      }),
    ).resolves.toEqual({ id: "activity-1" });

    expect(log[0]).toBe("parse");
    expect(log.findIndex((entry) => entry.startsWith("upload:"))).toBeGreaterThan(0);
    expect(log.indexOf("submit")).toBeGreaterThan(
      log.findIndex((entry) => entry.startsWith("upload:")),
    );
    expect(objects.has(stagingPath)).toBe(false);
  });

  it("removes staging without creating canonical bytes when parsing fails", async () => {
    const log: string[] = [];
    const { objects, storage } = storageFixture(log);

    await expect(
      finalizeActivityArtifactIngestion({} as never, {
        profileId,
        storage,
        bucket: "activity-files",
        stagingPath,
        bytes,
        format: "fit",
        parse: () => {
          throw new Error("invalid file");
        },
        submit: vi.fn(),
      }),
    ).rejects.toThrow("invalid file");

    expect(log.some((entry) => entry.startsWith("upload:"))).toBe(false);
    expect(objects.has(stagingPath)).toBe(false);
  });

  it("records quarantine authority before deleting canonical bytes after persistence fails", async () => {
    const log: string[] = [];
    const { objects, storage } = storageFixture(log);
    const { db, finalized, inserted } = quarantineDb();

    await expect(
      finalizeActivityArtifactIngestion(db, {
        profileId,
        storage,
        bucket: "activity-files",
        stagingPath,
        bytes,
        format: "fit",
        parse: () => ({ activity: "parsed" }),
        submit: async () => {
          throw new Error("persistence failed");
        },
      }),
    ).rejects.toThrow("persistence failed");

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      profile_id: profileId,
      availability: "deletion_pending",
      digest_algorithm: "sha256",
    });
    expect(finalized).toHaveBeenCalledTimes(2);
    expect(objects.size).toBe(0);
  });

  it("retains discoverable quarantine authority when canonical cleanup fails", async () => {
    const log: string[] = [];
    const { objects, storage } = storageFixture(log, { failCanonicalRemove: true });
    const { db, finalized, inserted } = quarantineDb();

    await expect(
      finalizeActivityArtifactIngestion(db, {
        profileId,
        storage,
        bucket: "activity-files",
        stagingPath,
        bytes,
        format: "fit",
        parse: () => ({ activity: "parsed" }),
        submit: async () => {
          throw new Error("persistence failed");
        },
      }),
    ).rejects.toThrow("persistence failed");

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ availability: "deletion_pending" });
    expect(finalized).not.toHaveBeenCalled();
    expect([...objects.keys()]).toEqual([expect.stringMatching(/^artifacts\/sha256\//)]);
  });

  it("never removes canonical bytes when a concurrent accepted artifact wins quarantine", async () => {
    const log: string[] = [];
    const { objects, storage } = storageFixture(log);
    const { db, finalized, inserted } = quarantineDb({ existingAvailability: "accepted" });

    await expect(
      finalizeActivityArtifactIngestion(db, {
        profileId,
        storage,
        bucket: "activity-files",
        stagingPath,
        bytes,
        format: "fit",
        parse: () => ({ activity: "parsed" }),
        submit: async () => {
          throw new Error("persistence failed");
        },
      }),
    ).rejects.toThrow("persistence failed");

    expect(inserted).toHaveLength(0);
    expect(finalized).not.toHaveBeenCalled();
    expect([...objects.keys()]).toEqual([expect.stringMatching(/^artifacts\/sha256\//)]);
  });

  it("does not use a losing deterministic id as deletion authority", async () => {
    const log: string[] = [];
    const { objects, storage } = storageFixture(log);
    const { db, finalized, inserted } = quarantineDb({ conflictAvailability: "accepted" });

    await expect(
      finalizeActivityArtifactIngestion(db, {
        profileId,
        storage,
        bucket: "activity-files",
        stagingPath,
        bytes,
        format: "fit",
        parse: () => ({ activity: "parsed" }),
        submit: async () => {
          throw new Error("persistence failed");
        },
      }),
    ).rejects.toThrow("persistence failed");

    expect(inserted).toHaveLength(1);
    expect(finalized).not.toHaveBeenCalled();
    expect([...objects.keys()]).toEqual([expect.stringMatching(/^artifacts\/sha256\//)]);
  });
});
