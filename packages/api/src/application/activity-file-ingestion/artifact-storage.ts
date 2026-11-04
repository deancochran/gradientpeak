import { createHash } from "node:crypto";
import { activityArtifactContentPath } from "@repo/core/activity-artifacts";
import { MAX_ACTIVITY_FILE_SIZE_BYTES } from "@repo/core/activity-files";
import type { ActivityFileType } from "@repo/core/server/activity-files";

export { activityArtifactContentPath } from "@repo/core/activity-artifacts";

interface StorageError {
  message: string;
  statusCode?: string | number;
}

export interface ActivityArtifactStorage {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array,
        options: { contentType: string; upsert: false },
      ): Promise<{ error: StorageError | null }>;
      remove(paths: string[]): Promise<{ error?: StorageError | null } | unknown>;
    };
  };
  readObjectBounded(input: {
    bucket: string;
    path: string;
    maxBytes: number;
  }): Promise<{ data: Uint8Array; contentType: string; contentLength?: number }>;
}

export interface PromotedActivityArtifact {
  sha256: string;
  byteSize: number;
  bucket: string;
  path: string;
  mediaType: string;
  format: ActivityFileType;
  stagingPath: string;
  /** True only when this promotion, rather than a concurrent writer, created `path`. */
  createdDestination: boolean;
}

export function activityArtifactSha256(bytes: Uint8Array): string {
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
  if (input.bucket !== "activity-files") {
    throw new Error("Accepted activity artifact must use the canonical private bucket");
  }
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
  const { data: bytes } = await storage.readObjectBounded({
    bucket: input.bucket,
    path: input.path,
    maxBytes: MAX_ACTIVITY_FILE_SIZE_BYTES,
  });
  if (bytes.byteLength !== input.byteSize || activityArtifactSha256(bytes) !== input.sha256) {
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
  const sha256 = activityArtifactSha256(input.bytes);
  const path = activityArtifactContentPath(input.profileId, sha256);
  const mediaType = input.mediaType || "application/octet-stream";
  const { error } = await storage.storage.from(input.bucket).upload(path, input.bytes, {
    contentType: mediaType,
    upsert: false,
  });
  const createdDestination = !error;
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
    createdDestination,
  };
}

export async function cleanupActivityArtifactStaging(
  storage: ActivityArtifactStorage,
  artifact: Pick<PromotedActivityArtifact, "bucket" | "stagingPath" | "path">,
) {
  if (artifact.stagingPath === artifact.path) return;
  const result = await storage.storage.from(artifact.bucket).remove([artifact.stagingPath]);
  if (
    result &&
    typeof result === "object" &&
    "error" in result &&
    result.error &&
    typeof result.error === "object" &&
    "message" in result.error
  ) {
    throw new Error("Failed to remove staged activity artifact");
  }
}

/** Remove only a destination that the current promotion invocation created. */
export async function cleanupOwnedPromotedActivityArtifact(
  storage: ActivityArtifactStorage,
  artifact: Pick<PromotedActivityArtifact, "bucket" | "path" | "createdDestination">,
) {
  if (!artifact.createdDestination) return { removed: false, skipped: true } as const;
  const result = await storage.storage.from(artifact.bucket).remove([artifact.path]);
  if (result && typeof result === "object" && "error" in result && result.error) {
    throw new Error("Failed to remove owned promoted activity artifact");
  }
  return { removed: true, skipped: false } as const;
}
