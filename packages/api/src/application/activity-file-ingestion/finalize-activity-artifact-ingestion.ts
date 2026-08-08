import { activityArtifactContentPath } from "@repo/core/activity-artifacts";
import type { ActivityFileType } from "@repo/core/server/activity-files";
import { activityArtifacts } from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { activityArtifactId } from "../activities/submit-activity";
import {
  type ActivityArtifactStorage,
  activityArtifactSha256,
  cleanupActivityArtifactStaging,
  cleanupOwnedPromotedActivityArtifact,
  type PromotedActivityArtifact,
  promoteActivityArtifact,
} from "./artifact-storage";

type DbClient = ReturnType<typeof getRequiredDb>;

/**
 * Records cleanup authority before removing canonical bytes created by a failed
 * submission. The digest lock prevents deleting bytes accepted concurrently.
 */
async function quarantineFailedPromotion(
  db: DbClient,
  promoted: PromotedActivityArtifact,
  profileId: string,
) {
  if (!promoted.createdDestination) return null;
  const artifactId = activityArtifactId(profileId, promoted.sha256, promoted.byteSize);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${profileId}:${promoted.sha256}`}))`,
    );
    const [acceptedArtifact] = await tx
      .select({ availability: activityArtifacts.availability })
      .from(activityArtifacts)
      .where(
        and(
          eq(activityArtifacts.profile_id, profileId),
          eq(activityArtifacts.bucket, promoted.bucket),
          eq(activityArtifacts.path, promoted.path),
          eq(activityArtifacts.digest, promoted.sha256),
          eq(activityArtifacts.byte_size, promoted.byteSize),
        ),
      )
      .limit(1);
    if (acceptedArtifact?.availability === "accepted") return null;
    await tx
      .insert(activityArtifacts)
      .values({
        id: artifactId,
        profile_id: profileId,
        digest_algorithm: "sha256",
        digest: promoted.sha256,
        byte_size: promoted.byteSize,
        bucket: promoted.bucket,
        path: promoted.path,
        media_type: promoted.mediaType,
        format: promoted.format,
        availability: "deletion_pending",
        deletion_requested_at: new Date(),
      })
      .onConflictDoNothing();
    return artifactId;
  });
}

async function cleanupUnpromotedStaging(
  storage: ActivityArtifactStorage,
  input: { profileId: string; bucket: string; stagingPath: string; bytes: Uint8Array },
) {
  const sha256 = activityArtifactSha256(input.bytes);
  await cleanupActivityArtifactStaging(storage, {
    bucket: input.bucket,
    stagingPath: input.stagingPath,
    path: activityArtifactContentPath(input.profileId, sha256),
  });
}

/**
 * Sole provider/manual/enrichment artifact finalizer. Parsing happens before
 * promotion; successful submissions clean staging, while failed submissions
 * either remove their owned canonical object or leave durable deletion authority.
 */
export async function finalizeActivityArtifactIngestion<TParsed, TResult>(
  db: DbClient,
  input: {
    profileId: string;
    storage: ActivityArtifactStorage;
    bucket: string;
    stagingPath: string;
    bytes: Uint8Array;
    format: ActivityFileType;
    mediaType?: string | null;
    expectedSha256?: string;
    parse: () => TParsed | Promise<TParsed>;
    submit: (input: {
      parsedData: TParsed;
      artifact: PromotedActivityArtifact;
    }) => Promise<TResult>;
  },
): Promise<TResult> {
  let parsedData: TParsed;
  try {
    parsedData = await input.parse();
  } catch (error) {
    await cleanupUnpromotedStaging(input.storage, input).catch(() => undefined);
    throw error;
  }

  let promoted: PromotedActivityArtifact;
  try {
    promoted = await promoteActivityArtifact(input.storage, {
      profileId: input.profileId,
      bucket: input.bucket,
      stagingPath: input.stagingPath,
      bytes: input.bytes,
      format: input.format,
      ...(input.mediaType === undefined ? {} : { mediaType: input.mediaType }),
    });
  } catch (error) {
    await cleanupUnpromotedStaging(input.storage, input).catch(() => undefined);
    throw error;
  }

  try {
    if (input.expectedSha256 && input.expectedSha256 !== promoted.sha256) {
      throw new Error("Activity artifact digest does not match staged bytes");
    }
    const result = await input.submit({ parsedData, artifact: promoted });
    await cleanupActivityArtifactStaging(input.storage, promoted);
    return result;
  } catch (error) {
    await cleanupActivityArtifactStaging(input.storage, promoted).catch(() => undefined);
    const deletionArtifactId = await quarantineFailedPromotion(db, promoted, input.profileId);
    if (deletionArtifactId) {
      try {
        await cleanupOwnedPromotedActivityArtifact(input.storage, promoted);
        await db.execute(
          sql`select public.finalize_activity_artifact_deletion(${deletionArtifactId}::uuid, true)`,
        );
      } catch {
        // The deletion_pending row is durable repair authority. Never log path,
        // digest, or provider identity from this shared failure boundary.
      }
    }
    throw error;
  }
}
