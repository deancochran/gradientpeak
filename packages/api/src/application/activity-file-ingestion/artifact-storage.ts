import { createHash } from "node:crypto";
import { activityArtifactContentPath } from "@repo/core/activity-artifacts";
import type { ActivityFileType } from "@repo/core/server/activity-files";

export { activityArtifactContentPath } from "@repo/core/activity-artifacts";

interface StorageError {
  message: string;
  statusCode?: string | number;
}

interface StoredBlob {
  arrayBuffer(): Promise<ArrayBuffer>;
  type?: string;
}

export interface ActivityArtifactStorage {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: StoredBlob | null; error: StorageError | null }>;
      upload(
        path: string,
        body: Uint8Array,
        options: { contentType: string; upsert: false },
      ): Promise<{ error: StorageError | null }>;
      remove(paths: string[]): Promise<unknown>;
    };
  };
}

export interface PromotedActivityArtifact {
  sha256: string;
  byteSize: number;
  bucket: string;
  path: string;
  mediaType: string;
  format: ActivityFileType;
  stagingPath: string;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Re-read a claimed accepted object; client metadata alone is never evidence of acceptance. */
export async function verifyAcceptedActivityArtifact(
  storage: ActivityArtifactStorage,
  input: {
    profileId: string;
    sha256: string;
    byteSize: number;
    bucket: string;
    path: string;
    mediaType: string;
    format: ActivityFileType;
    originalName?: string | null;
  },
) {
  const expectedPath = activityArtifactContentPath(input.profileId, input.sha256);
  if (input.path !== expectedPath) {
    throw new Error("Accepted activity artifact path does not match profile and digest");
  }
  await verifyDestination(storage, input);
  return input;
}

async function verifyDestination(
  storage: ActivityArtifactStorage,
  input: { bucket: string; path: string; sha256: string; byteSize: number },
) {
  const { data, error } = await storage.storage.from(input.bucket).download(input.path);
  if (error || !data) throw new Error("Failed to verify promoted activity artifact");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength !== input.byteSize || digest(bytes) !== input.sha256) {
    throw new Error("Content-addressed activity artifact destination does not match source bytes");
  }
}

/** Promote staging bytes without overwrite, accepting an existing destination only after verification. */
export async function promoteActivityArtifact(
  storage: ActivityArtifactStorage,
  input: {
    profileId: string;
    bucket: string;
    stagingPath: string;
    bytes: Uint8Array;
    format: ActivityFileType;
    mediaType?: string | null;
  },
): Promise<PromotedActivityArtifact> {
  const sha256 = digest(input.bytes);
  const path = activityArtifactContentPath(input.profileId, sha256);
  const mediaType = input.mediaType || "application/octet-stream";
  const { error } = await storage.storage.from(input.bucket).upload(path, input.bytes, {
    contentType: mediaType,
    upsert: false,
  });
  if (error) {
    const conflict =
      String(error.statusCode) === "409" ||
      /already exists|duplicate|conflict/i.test(error.message);
    if (!conflict) throw new Error(`Failed to promote activity artifact: ${error.message}`);
  }
  await verifyDestination(storage, {
    bucket: input.bucket,
    path,
    sha256,
    byteSize: input.bytes.byteLength,
  });
  return {
    sha256,
    byteSize: input.bytes.byteLength,
    bucket: input.bucket,
    path,
    mediaType,
    format: input.format,
    stagingPath: input.stagingPath,
  };
}

export async function cleanupActivityArtifactStaging(
  storage: ActivityArtifactStorage,
  artifact: Pick<PromotedActivityArtifact, "bucket" | "stagingPath" | "path">,
) {
  if (artifact.stagingPath === artifact.path) return;
  await storage.storage.from(artifact.bucket).remove([artifact.stagingPath]);
}
