import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { activityFileIngestions, profiles, users } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  ActivityFileIngestionClaimLostError,
  createActivityFileIngestion,
  markProcessing,
  markUploaded,
} from "../../application/activity-file-ingestion/ingestion-state";
import {
  claimMobileRecordingUpload,
  createOrLoadMobileRecordingUploadClaim,
  markMobileRecordingUploadFailed,
} from "../../repositories/mobile-recording-upload-repository";

const profileIds: string[] = [];

async function seedProfile() {
  const id = randomUUID();
  const email = `${id}@gradientpeak.test`;
  const now = new Date();
  await db.insert(users).values({
    id,
    name: "Ingestion Live DB Test",
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(profiles).values({
    id,
    email,
    full_name: "Ingestion Live DB Test",
    username: `ingestion-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    is_public: false,
    planning_timezone: "UTC",
    created_at: now,
    updated_at: now,
  });
  profileIds.push(id);
  return id;
}

afterEach(async () => {
  while (profileIds.length) {
    const id = profileIds.pop();
    if (!id) continue;
    await db.delete(profiles).where(eq(profiles.id, id));
    await db.delete(users).where(eq(users.id, id));
  }
});

afterAll(async () => {
  await pool.end();
});

describe("activity file ingestion lease fencing", () => {
  it("reclaims only an expired processing lease using the database clock", async () => {
    const profileId = await seedProfile();
    const ingestion = await createActivityFileIngestion(db, {
      activityId: null,
      profileId,
      source: "manual_import",
      operationKey: `manual_import:${randomUUID()}`,
    });
    await markUploaded(db, { id: ingestion.id, profileId });
    await db
      .update(activityFileIngestions)
      .set({
        status: "processing",
        claim_token: randomUUID(),
        lease_expires_at: new Date(Date.now() - 1_000),
      })
      .where(
        and(
          eq(activityFileIngestions.id, ingestion.id),
          eq(activityFileIngestions.profile_id, profileId),
        ),
      );

    const reclaimed = await markProcessing(db, { id: ingestion.id, profileId });
    expect(reclaimed.claim_token).not.toBeNull();
    expect(reclaimed.attempt_count).toBe(1);

    await expect(markProcessing(db, { id: ingestion.id, profileId })).rejects.toBeInstanceOf(
      ActivityFileIngestionClaimLostError,
    );
  });

  it("reuses one nullable row for concurrent same-operation creation", async () => {
    const profileId = await seedProfile();
    const operationKey = `manual_import:${randomUUID()}`;
    const [first, second] = await Promise.all([
      createActivityFileIngestion(db, {
        activityId: null,
        profileId,
        source: "manual_import",
        operationKey,
      }),
      createActivityFileIngestion(db, {
        activityId: null,
        profileId,
        source: "manual_import",
        operationKey,
      }),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.activity_id).toBeNull();
  });

  it("creates one immutable mobile claim and grants only one active lease", async () => {
    const profileId = await seedProfile();
    const operationKey = `mobile-recording:${randomUUID()}`;
    const expectedSha256 = "a".repeat(64);
    const input = {
      profileId,
      operationKey,
      stagingBucket: "activity-files",
      stagingPath: `mobile-recordings/${profileId}/session.fit`,
      expectedSha256,
      expectedByteSize: 3,
      expectedFormat: "fit" as const,
      expectedMediaType: "application/vnd.ant.fit",
    };

    const [first, second] = await Promise.all([
      createOrLoadMobileRecordingUploadClaim(db, input),
      createOrLoadMobileRecordingUploadClaim(db, input),
    ]);
    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({
      status: "pending_upload",
      expected_sha256: expectedSha256,
      expected_byte_size: 3,
      expected_format: "fit",
    });

    const [claimA, claimB] = await Promise.all([
      claimMobileRecordingUpload(db, {
        ingestionId: first.id,
        profileId,
        operationKey,
      }),
      claimMobileRecordingUpload(db, {
        ingestionId: first.id,
        profileId,
        operationKey,
      }),
    ]);
    const claimed = claimA ?? claimB;
    expect(claimed?.status).toBe("processing");
    expect([claimA, claimB].filter(Boolean)).toHaveLength(1);
    expect(claimed?.claim_token).not.toBeNull();

    expect(
      await markMobileRecordingUploadFailed(db, {
        ingestionId: first.id,
        profileId,
        operationKey,
        claimToken: randomUUID(),
        errorCode: "wrong_worker",
        errorMessage: "Wrong worker must not complete the lease",
      }),
    ).toBe(false);
    expect(
      await markMobileRecordingUploadFailed(db, {
        ingestionId: first.id,
        profileId,
        operationKey,
        claimToken: claimed?.claim_token ?? randomUUID(),
        errorCode: "test_failure",
        errorMessage: "Synthetic failure",
      }),
    ).toBe(true);
  });

  it("enforces complete hash-bound claim and cleanup metadata", async () => {
    const profileId = await seedProfile();
    const base = {
      profile_id: profileId,
      source: "mobile_recording" as const,
      operation_key: `mobile-recording:${randomUUID()}`,
    };

    await expect(
      db.insert(activityFileIngestions).values({
        ...base,
        staging_bucket: "activity-files",
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(activityFileIngestions).values({
        ...base,
        operation_key: `mobile-recording:${randomUUID()}`,
        staging_bucket: "activity-files",
        staging_path: `mobile-recordings/${profileId}/invalid.fit`,
        expected_sha256: "INVALID",
        expected_byte_size: 3,
        expected_format: "fit",
        expected_media_type: "application/vnd.ant.fit",
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(activityFileIngestions).values({
        ...base,
        operation_key: `mobile-recording:${randomUUID()}`,
        status: "processing",
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(activityFileIngestions).values({
        ...base,
        operation_key: `mobile-recording:${randomUUID()}`,
        staging_cleanup_pending: true,
      }),
    ).rejects.toThrow();
  });
});
