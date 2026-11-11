import { createHash, randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { activities, activityArtifacts, integrations, profiles, users } from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { readActivityIngestionSafeStatus } from "../../application/activity-file-ingestion/activity-ingestion-actions";
import {
  ActivityIngestionOperationConflictError,
  acceptActivityIngestion,
  activityIngestionOperationId,
  beginActivityIngestionOperation,
  claimActivityIngestionProcessing,
  failActivityIngestion,
  recordActivityIngestionUpload,
  startActivityIngestionProcessing,
} from "../../application/activity-file-ingestion/direct-activity-ingestion";
import { beginMobileRecordingUploadClaim } from "../../application/activity-file-ingestion/mobile-recording-upload";
import { createDrizzleActivityIngestionRepository } from "../../infrastructure/repositories";

const profileIds: string[] = [];

async function seedProfile() {
  const id = randomUUID();
  const email = `${id}@gradientpeak.test`;
  await db.insert(users).values({
    id,
    name: "Ingestion Live DB Test",
    email,
    emailVerified: true,
  });
  await db.insert(profiles).values({
    id,
    email,
    full_name: "Ingestion Live DB Test",
    username: `ingestion-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    is_public: false,
    planning_timezone: "UTC",
  });
  profileIds.push(id);
  return id;
}

async function seedAcceptedTargets(
  profileId: string,
  digest: string,
  requestedActivityId?: string,
) {
  const activityId = requestedActivityId ?? randomUUID();
  const artifactId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.insert(activities).values({
      id: activityId,
      profile_id: profileId,
      name: "Ingestion race accepted activity",
      started_at: new Date("2026-08-16T10:00:00.000Z"),
      finished_at: new Date("2026-08-16T11:00:00.000Z"),
      elapsed_ms: 3_600_000,
      parser_version: "live-db-v1",
      decoded_contract_version: "live-db-v1",
      materializer_version: "live-db-v1",
    });
  });
  await db.insert(activityArtifacts).values({
    id: artifactId,
    profile_id: profileId,
    digest_algorithm: "sha256",
    digest,
    byte_size: 3,
    bucket: "activity-files",
    path: `artifacts/sha256/${profileId}/${digest}`,
    media_type: "application/vnd.ant.fit",
    format: "fit",
    availability: "accepted",
    first_accepted_at: new Date(),
  });
  return { activityId, artifactId };
}

afterEach(async () => {
  for (const id of profileIds.splice(0)) {
    await db.transaction(async (tx) => {
      await tx.delete(activities).where(eq(activities.profile_id, id));
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true)`,
      );
      await tx
        .update(activityArtifacts)
        .set({ availability: "deletion_pending", deletion_requested_at: new Date() })
        .where(eq(activityArtifacts.profile_id, id));
      await tx
        .update(activityArtifacts)
        .set({ availability: "deleted", deleted_at: new Date() })
        .where(eq(activityArtifacts.profile_id, id));
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true)`,
      );
      await tx.delete(activityArtifacts).where(eq(activityArtifacts.profile_id, id));
    });
    await db.delete(profiles).where(eq(profiles.id, id));
    await db.delete(users).where(eq(users.id, id));
  }
});

afterAll(async () => pool.end());

describe("direct activity ingestion lifecycle", () => {
  it("converges exact replays, rejects metadata conflicts, and scopes ownership", async () => {
    const profileId = await seedProfile();
    const otherProfileId = await seedProfile();
    const operationId = activityIngestionOperationId(`manual:${randomUUID()}`);
    const input = {
      profileId,
      operationId,
      source: "manual_import" as const,
      stagingBucket: "activity-files",
      stagingPath: `activities/${profileId}/upload.fit`,
      expectedSha256: "a".repeat(64),
      expectedByteSize: 3,
      expectedFormat: "fit" as const,
      expectedMediaType: "application/vnd.ant.fit" as const,
      uploaded: true,
    };
    const [first, second] = await Promise.all([
      beginActivityIngestionOperation(db, input),
      beginActivityIngestionOperation(db, input),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.status).toBe("awaiting_upload");
    await expect(
      beginActivityIngestionOperation(db, { ...input, stagingPath: "different.fit" }),
    ).rejects.toBeInstanceOf(ActivityIngestionOperationConflictError);
    await expect(
      createDrizzleActivityIngestionRepository(db).readSafeStatus({
        profileId: otherProfileId,
        ingestionId: first.id,
      }),
    ).resolves.toBeNull();
  });

  it("moves retryable failures back through processing on request resubmission", async () => {
    const profileId = await seedProfile();
    const operationId = activityIngestionOperationId(`manual:${randomUUID()}`);
    const operation = await beginActivityIngestionOperation(db, {
      profileId,
      operationId,
      source: "manual_import",
      stagingBucket: "activity-files",
      stagingPath: `activities/${profileId}/upload.fit`,
      expectedSha256: "b".repeat(64),
      expectedByteSize: 3,
      expectedFormat: "fit",
      expectedMediaType: "application/vnd.ant.fit",
      uploaded: true,
    });
    await expect(
      startActivityIngestionProcessing(db, {
        profileId,
        ingestionId: operation.id,
        operationId,
        source: "manual_import",
      }),
    ).resolves.toMatchObject({ status: "processing" });
    await expect(
      failActivityIngestion(db, {
        profileId,
        ingestionId: operation.id,
        failureCode: "promotion_failed",
        retryable: true,
      }),
    ).resolves.toBe(true);
    await expect(
      startActivityIngestionProcessing(db, {
        profileId,
        ingestionId: operation.id,
        operationId,
        source: "manual_import",
      }),
    ).resolves.toMatchObject({ status: "processing", failureCode: null, failedAt: null });
  });

  it("reissues the mobile upload claim after a server failure and converges on one activity", async () => {
    const profileId = await seedProfile();
    const recordingSessionId = `mobile-retry-${randomUUID()}`;
    const bytes = new Uint8Array([97, 98, 99]);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const claimInput = {
      profileId,
      recordingSessionId,
      byteSize: bytes.byteLength,
      sha256: digest,
      format: "fit" as const,
    };
    const firstClaim = await beginMobileRecordingUploadClaim(db, claimInput);
    expect(firstClaim).toMatchObject({ status: "upload" });
    await recordActivityIngestionUpload(db, {
      profileId,
      ingestionId: firstClaim.ingestionId,
    });
    await expect(
      startActivityIngestionProcessing(db, {
        profileId,
        ingestionId: firstClaim.ingestionId,
        operationId: activityIngestionOperationId(`mobile_recording:${recordingSessionId}`),
        source: "mobile_recording",
      }),
    ).resolves.toMatchObject({ status: "processing" });
    await expect(
      failActivityIngestion(db, {
        profileId,
        ingestionId: firstClaim.ingestionId,
        failureCode: "internal",
        retryable: true,
      }),
    ).resolves.toBe(true);
    await expect(
      readActivityIngestionSafeStatus({ db, profileId, ingestionId: firstClaim.ingestionId }),
    ).resolves.toMatchObject({ status: "failed_retryable", actions: { retry: true } });

    const retryClaim = await beginMobileRecordingUploadClaim(db, claimInput);
    expect(retryClaim).toMatchObject({
      status: "upload",
      ingestionId: firstClaim.ingestionId,
      activityId: firstClaim.activityId,
    });
    const resetStatus = await readActivityIngestionSafeStatus({
      db,
      profileId,
      ingestionId: firstClaim.ingestionId,
    });
    expect(resetStatus).toMatchObject({ status: "awaiting_upload", actions: { retry: false } });
    expect(resetStatus).not.toHaveProperty("failureCode");
    expect(resetStatus).not.toHaveProperty("failedAt");

    await recordActivityIngestionUpload(db, {
      profileId,
      ingestionId: retryClaim.ingestionId,
    });
    const retryProcessingClaims = await Promise.all([
      claimActivityIngestionProcessing(db, {
        profileId,
        ingestionId: retryClaim.ingestionId,
        operationId: activityIngestionOperationId(`mobile_recording:${recordingSessionId}`),
        source: "mobile_recording",
      }),
      claimActivityIngestionProcessing(db, {
        profileId,
        ingestionId: retryClaim.ingestionId,
        operationId: activityIngestionOperationId(`mobile_recording:${recordingSessionId}`),
        source: "mobile_recording",
      }),
    ]);
    expect(retryProcessingClaims.map((claim) => claim.status).sort()).toEqual([
      "claimed",
      "existing",
    ]);

    const accepted = await seedAcceptedTargets(profileId, digest, retryClaim.activityId);
    await acceptActivityIngestion(db, {
      profileId,
      ingestionId: retryClaim.ingestionId,
      operationId: activityIngestionOperationId(`mobile_recording:${recordingSessionId}`),
      source: "mobile_recording",
      ...accepted,
      completedAt: new Date(),
    });
    await expect(beginMobileRecordingUploadClaim(db, claimInput)).resolves.toMatchObject({
      status: "ready",
      ingestionId: retryClaim.ingestionId,
      activityId: retryClaim.activityId,
    });
    const [activityCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activities)
      .where(eq(activities.id, retryClaim.activityId));
    expect(activityCount?.count).toBe(1);
  });

  it("gives one concurrent manual replay ownership, then reaches success after one transient failure", async () => {
    const profileId = await seedProfile();
    const operationId = activityIngestionOperationId(`manual-race:${randomUUID()}`);
    const operation = await beginActivityIngestionOperation(db, {
      profileId,
      operationId,
      source: "manual_import",
      stagingBucket: "activity-files",
      stagingPath: `activities/${profileId}/concurrent.fit`,
      expectedSha256: "d".repeat(64),
      expectedByteSize: 3,
      expectedFormat: "fit",
      expectedMediaType: "application/vnd.ant.fit",
      uploaded: true,
    });

    const concurrent = await Promise.all([
      claimActivityIngestionProcessing(db, {
        profileId,
        ingestionId: operation.id,
        operationId,
        source: "manual_import",
      }),
      claimActivityIngestionProcessing(db, {
        profileId,
        ingestionId: operation.id,
        operationId,
        source: "manual_import",
      }),
    ]);
    expect(concurrent.map((claim) => claim.status).sort()).toEqual(["claimed", "existing"]);
    expect(concurrent.find((claim) => claim.status === "existing")?.operation.status).toBe(
      "processing",
    );

    await expect(
      failActivityIngestion(db, {
        profileId,
        ingestionId: operation.id,
        failureCode: "dependency_unavailable",
        retryable: true,
      }),
    ).resolves.toBe(true);
    await expect(
      claimActivityIngestionProcessing(db, {
        profileId,
        ingestionId: operation.id,
        operationId,
        source: "manual_import",
      }),
    ).resolves.toMatchObject({ status: "claimed", operation: { status: "processing" } });

    const accepted = await seedAcceptedTargets(profileId, "d".repeat(64));
    await expect(
      acceptActivityIngestion(db, {
        profileId,
        ingestionId: operation.id,
        operationId,
        source: "manual_import",
        ...accepted,
        completedAt: new Date(),
      }),
    ).resolves.toMatchObject({ status: "succeeded" });
  });

  it("keeps provider identity and fresh staging across a concurrent replay and retry", async () => {
    const profileId = await seedProfile();
    const [integration] = await db
      .insert(integrations)
      .values({ profile_id: profileId, provider: "wahoo", external_id: randomUUID() })
      .returning({ id: integrations.id });
    expect(integration).toBeDefined();
    const operationId = activityIngestionOperationId(`provider-race:${randomUUID()}`);
    const baseInput = {
      profileId,
      operationId,
      source: "provider_sync" as const,
      provider: "wahoo" as const,
      externalId: "provider-concurrent-1",
      integrationId: integration?.id ?? "",
      stagingBucket: "activity-files",
      stagingPath: `activities/${profileId}/provider-original.fit`,
      expectedSha256: "e".repeat(64),
      expectedByteSize: 3,
      expectedFormat: "fit" as const,
      expectedMediaType: "application/vnd.ant.fit" as const,
      uploaded: true,
    };
    const operation = await beginActivityIngestionOperation(db, baseInput);
    const concurrent = await Promise.all([
      claimActivityIngestionProcessing(db, {
        profileId,
        ingestionId: operation.id,
        operationId,
        source: "provider_sync",
      }),
      claimActivityIngestionProcessing(db, {
        profileId,
        ingestionId: operation.id,
        operationId,
        source: "provider_sync",
      }),
    ]);
    expect(concurrent.map((claim) => claim.status).sort()).toEqual(["claimed", "existing"]);

    await failActivityIngestion(db, {
      profileId,
      ingestionId: operation.id,
      failureCode: "dependency_unavailable",
      retryable: true,
    });
    const retryPath = `activities/${profileId}/provider-retry.fit`;
    const retry = await beginActivityIngestionOperation(db, {
      ...baseInput,
      stagingPath: retryPath,
    });
    expect(retry).toMatchObject({
      id: operation.id,
      provider: "wahoo",
      externalId: "provider-concurrent-1",
      stagingPath: retryPath,
    });
    await expect(
      claimActivityIngestionProcessing(db, {
        profileId,
        ingestionId: operation.id,
        operationId,
        source: "provider_sync",
      }),
    ).resolves.toMatchObject({ status: "claimed" });

    const accepted = await seedAcceptedTargets(profileId, "e".repeat(64));
    await acceptActivityIngestion(db, {
      profileId,
      ingestionId: operation.id,
      operationId,
      source: "provider_sync",
      ...accepted,
      completedAt: new Date(),
    });
    await expect(
      beginActivityIngestionOperation(db, { ...baseInput, stagingPath: retryPath }),
    ).resolves.toMatchObject({
      id: operation.id,
      status: "succeeded",
      provider: "wahoo",
      externalId: "provider-concurrent-1",
    });
  });

  it("projects status without staging or internal failure details", async () => {
    const profileId = await seedProfile();
    const operation = await beginActivityIngestionOperation(db, {
      profileId,
      operationId: activityIngestionOperationId(`mobile:${randomUUID()}`),
      source: "mobile_recording",
      stagingBucket: "activity-files",
      stagingPath: `mobile-recordings/${profileId}/session.fit`,
      expectedSha256: "c".repeat(64),
      expectedByteSize: 3,
      expectedFormat: "fit",
      expectedMediaType: "application/vnd.ant.fit",
      uploaded: false,
    });
    const safe = await createDrizzleActivityIngestionRepository(db).readSafeStatus({
      profileId,
      ingestionId: operation.id,
    });
    expect(safe).toMatchObject({ id: operation.id, status: "awaiting_upload" });
    expect(safe).not.toHaveProperty("stagingPath");
    expect(safe).not.toHaveProperty("stagingCleanupError");
    expect(safe).not.toHaveProperty("provider");
  });
});
