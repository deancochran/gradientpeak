import { randomUUID } from "node:crypto";
import { type ActivityFileIngestionRow, activityArtifacts, activityFileIngestions } from "@repo/db";
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { getRequiredDb } from "../db";

type DbClient = ReturnType<typeof getRequiredDb>;

export interface CreateMobileRecordingUploadClaimInput {
  profileId: string;
  operationKey: string;
  stagingBucket: string;
  stagingPath: string;
  expectedSha256: string;
  expectedByteSize: number;
  expectedFormat: "fit" | "gpx" | "tcx";
  expectedMediaType: string;
  now?: Date;
}

function exactClaimScope(input: { ingestionId: string; profileId: string; operationKey: string }) {
  return and(
    eq(activityFileIngestions.id, input.ingestionId),
    eq(activityFileIngestions.profile_id, input.profileId),
    eq(activityFileIngestions.source, "mobile_recording"),
    eq(activityFileIngestions.operation_key, input.operationKey),
  );
}

export async function loadMobileRecordingUploadClaim(
  db: DbClient,
  input: { ingestionId: string; profileId: string; operationKey: string },
) {
  return db.query.activityFileIngestions.findFirst({ where: exactClaimScope(input) });
}

export async function createOrLoadMobileRecordingUploadClaim(
  db: DbClient,
  input: CreateMobileRecordingUploadClaimInput,
): Promise<ActivityFileIngestionRow> {
  const now = input.now ?? new Date();
  const [created] = await db
    .insert(activityFileIngestions)
    .values({
      profile_id: input.profileId,
      source: "mobile_recording",
      operation_key: input.operationKey,
      staging_bucket: input.stagingBucket,
      staging_path: input.stagingPath,
      expected_sha256: input.expectedSha256,
      expected_byte_size: input.expectedByteSize,
      expected_format: input.expectedFormat,
      expected_media_type: input.expectedMediaType,
      status: "pending_upload",
      requested_at: now,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing({
      target: [activityFileIngestions.profile_id, activityFileIngestions.operation_key],
    })
    .returning();

  if (created) return created;

  const existing = await db.query.activityFileIngestions.findFirst({
    where: and(
      eq(activityFileIngestions.profile_id, input.profileId),
      eq(activityFileIngestions.operation_key, input.operationKey),
    ),
  });
  if (!existing) throw new Error("Mobile recording upload claim conflict could not be loaded");
  return existing;
}

/**
 * Atomically obtains the existing ingestion processing lease. The preliminary
 * uploaded transition and processing claim live in one short transaction; no
 * storage I/O is performed while the lease transaction is open.
 */
export async function claimMobileRecordingUpload(
  db: DbClient,
  input: {
    ingestionId: string;
    profileId: string;
    operationKey: string;
    now?: Date;
    leaseDurationMs?: number;
  },
) {
  const now = input.now ?? new Date();
  const claimToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + (input.leaseDurationMs ?? 5 * 60 * 1_000));

  return db.transaction(async (tx) => {
    await tx
      .update(activityFileIngestions)
      .set({
        status: "uploaded",
        received_at: now,
        claim_token: null,
        lease_expires_at: null,
        last_error_code: null,
        last_error_message: null,
        failed_at: null,
        updated_at: now,
      })
      .where(
        and(
          exactClaimScope(input),
          inArray(activityFileIngestions.status, ["pending_upload", "failed"]),
        ),
      );

    const [claimed] = await tx
      .update(activityFileIngestions)
      .set({
        status: "processing",
        claim_token: claimToken,
        lease_expires_at: leaseExpiresAt,
        attempt_count: sql`${activityFileIngestions.attempt_count} + 1`,
        started_at: now,
        last_error_code: null,
        last_error_message: null,
        failed_at: null,
        updated_at: now,
      })
      .where(
        and(
          exactClaimScope(input),
          or(
            eq(activityFileIngestions.status, "uploaded"),
            and(
              eq(activityFileIngestions.status, "processing"),
              or(
                isNull(activityFileIngestions.lease_expires_at),
                lte(activityFileIngestions.lease_expires_at, sql`clock_timestamp()`),
              ),
            ),
          ),
        ),
      )
      .returning();

    return claimed ?? null;
  });
}

export async function markMobileRecordingUploadFailed(
  db: DbClient,
  input: {
    ingestionId: string;
    profileId: string;
    operationKey: string;
    claimToken: string;
    errorCode: string;
    errorMessage: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const [failed] = await db
    .update(activityFileIngestions)
    .set({
      status: "failed",
      claim_token: null,
      lease_expires_at: null,
      failed_at: now,
      last_error_code: input.errorCode,
      last_error_message: input.errorMessage,
      updated_at: now,
    })
    .where(
      and(
        exactClaimScope(input),
        eq(activityFileIngestions.status, "processing"),
        eq(activityFileIngestions.claim_token, input.claimToken),
        gt(activityFileIngestions.lease_expires_at, sql`clock_timestamp()`),
      ),
    )
    .returning({ id: activityFileIngestions.id });
  return Boolean(failed);
}

export async function markMobileRecordingStagingCleaned(
  db: DbClient,
  input: { ingestionId: string; profileId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const [cleaned] = await db
    .update(activityFileIngestions)
    .set({
      staging_cleanup_pending: false,
      staging_cleaned_at: now,
      staging_cleanup_error: null,
      updated_at: now,
    })
    .where(
      and(
        eq(activityFileIngestions.id, input.ingestionId),
        eq(activityFileIngestions.profile_id, input.profileId),
        eq(activityFileIngestions.source, "mobile_recording"),
        eq(activityFileIngestions.status, "ready"),
        eq(activityFileIngestions.staging_cleanup_pending, true),
      ),
    )
    .returning({ id: activityFileIngestions.id });
  return Boolean(cleaned);
}

export async function recordMobileRecordingStagingCleanupFailure(
  db: DbClient,
  input: { ingestionId: string; profileId: string; errorCode: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const [pending] = await db
    .update(activityFileIngestions)
    .set({
      staging_cleanup_pending: true,
      staging_cleaned_at: null,
      staging_cleanup_error: input.errorCode,
      updated_at: now,
    })
    .where(
      and(
        eq(activityFileIngestions.id, input.ingestionId),
        eq(activityFileIngestions.profile_id, input.profileId),
        eq(activityFileIngestions.source, "mobile_recording"),
        eq(activityFileIngestions.status, "ready"),
        eq(activityFileIngestions.staging_cleanup_pending, true),
      ),
    )
    .returning({ id: activityFileIngestions.id });
  return Boolean(pending);
}

export async function listPendingMobileRecordingStagingCleanup(
  db: DbClient,
  input: { profileId: string; limit: number },
) {
  return db
    .select()
    .from(activityFileIngestions)
    .where(
      and(
        eq(activityFileIngestions.profile_id, input.profileId),
        eq(activityFileIngestions.source, "mobile_recording"),
        eq(activityFileIngestions.status, "ready"),
        eq(activityFileIngestions.staging_cleanup_pending, true),
      ),
    )
    .orderBy(asc(activityFileIngestions.updated_at))
    .limit(input.limit);
}

export async function loadAcceptedActivityArtifact(
  db: DbClient,
  input: { artifactId: string; profileId: string },
) {
  return db.query.activityArtifacts.findFirst({
    where: and(
      eq(activityArtifacts.id, input.artifactId),
      eq(activityArtifacts.profile_id, input.profileId),
      eq(activityArtifacts.availability, "accepted"),
    ),
  });
}
