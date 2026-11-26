#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  applySqlFile,
  bootstrapSupabaseAuthSchema,
  requireFreshBaseline,
  withDisposableDatabase,
  withDisposableSupabaseStorage,
} from "@repo/db/testing/disposable-database";

await withDisposableDatabase(
  process.argv.slice(2),
  "activity_ingestion",
  async (target, connectionString) => {
    await bootstrapSupabaseAuthSchema(target);
    await withDisposableSupabaseStorage(target, connectionString, async () => {
      await applySqlFile(target, requireFreshBaseline().sourcePath);
      process.env.DATABASE_URL = connectionString;
      process.env.POSTGRES_URL = connectionString;

      const [{ db, pool }, schema, direct, actions, mobileUpload, repositories, drizzle] =
        await Promise.all([
          import("@repo/db/client"),
          import("@repo/db/schema"),
          import("../src/application/activity-file-ingestion/direct-activity-ingestion"),
          import("../src/application/activity-file-ingestion/activity-ingestion-actions"),
          import("../src/application/activity-file-ingestion/mobile-recording-upload"),
          import("../src/infrastructure/repositories"),
          import("drizzle-orm"),
        ]);
      const { activities, activityArtifacts, integrations, profiles, users } = schema;
      const { sql } = drizzle;
      const profileId = randomUUID();
      const otherProfileId = randomUUID();
      try {
        for (const [id, label] of [
          [profileId, "Ingestion owner"],
          [otherProfileId, "Other ingestion owner"],
        ] as const) {
          await db.insert(users).values({
            id,
            name: label,
            email: `${id}@activity-ingestion.test`,
            emailVerified: true,
          });
          await db.insert(profiles).values({
            id,
            email: `${id}@activity-ingestion.test`,
            full_name: label,
            username: `ingestion-${id.slice(0, 8)}`,
            onboarding_status: "completed",
            planning_timezone: "UTC",
            is_public: false,
          });
        }

        const operationId = direct.activityIngestionOperationId(`manual:${randomUUID()}`);
        const beginInput = {
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
        const [first, replay] = await Promise.all([
          direct.beginActivityIngestionOperation(db, beginInput),
          direct.beginActivityIngestionOperation(db, beginInput),
        ]);
        assert.equal(first.id, replay.id);
        assert.equal(first.status, "awaiting_upload");
        await assert.rejects(
          direct.beginActivityIngestionOperation(db, {
            ...beginInput,
            stagingPath: `activities/${profileId}/conflict.fit`,
          }),
          direct.ActivityIngestionOperationConflictError,
        );

        const repository = repositories.createDrizzleActivityIngestionRepository(db);
        assert.equal(
          await repository.getOwned({ profileId: otherProfileId, ingestionId: first.id }),
          null,
        );
        const manualClaims = await Promise.all([
          direct.claimActivityIngestionProcessing(db, {
            profileId,
            ingestionId: first.id,
            operationId,
            source: "manual_import",
          }),
          direct.claimActivityIngestionProcessing(db, {
            profileId,
            ingestionId: first.id,
            operationId,
            source: "manual_import",
          }),
        ]);
        assert.deepEqual(manualClaims.map((claim) => claim.status).sort(), ["claimed", "existing"]);
        assert.equal(
          await direct.failActivityIngestion(db, {
            profileId,
            ingestionId: first.id,
            failureCode: "promotion_failed",
            retryable: true,
          }),
          true,
        );
        const manualRetry = await direct.claimActivityIngestionProcessing(db, {
          profileId,
          ingestionId: first.id,
          operationId,
          source: "manual_import",
        });
        assert.equal(manualRetry.status, "claimed");

        const activityId = randomUUID();
        const artifactId = randomUUID();
        await db.transaction(async (tx) => {
          await tx.execute(sql`set local session_replication_role = replica`);
          await tx.insert(activities).values({
            id: activityId,
            profile_id: profileId,
            name: "Disposable accepted activity",
            started_at: new Date("2026-08-16T10:00:00.000Z"),
            finished_at: new Date("2026-08-16T11:00:00.000Z"),
            elapsed_ms: 3_600_000,
            parser_version: "disposable-v1",
            decoded_contract_version: "disposable-v1",
            materializer_version: "disposable-v1",
          });
        });
        await db.insert(activityArtifacts).values({
          id: artifactId,
          profile_id: profileId,
          digest_algorithm: "sha256",
          digest: "a".repeat(64),
          byte_size: 3,
          bucket: "activity-files",
          path: `artifacts/sha256/${profileId}/${"a".repeat(64)}`,
          media_type: "application/vnd.ant.fit",
          format: "fit",
          availability: "accepted",
          first_accepted_at: new Date(),
        });
        await db.transaction((tx) =>
          direct.acceptActivityIngestion(tx, {
            profileId,
            ingestionId: first.id,
            operationId,
            source: "manual_import",
            artifactId,
            activityId,
            completedAt: new Date(),
          }),
        );
        const safe = await actions.readActivityIngestionSafeStatus({
          db,
          profileId,
          ingestionId: first.id,
        });
        assert.equal(safe.status, "succeeded");
        assert.equal("stagingPath" in safe, false);
        assert.equal("claimToken" in safe, false);
        assert.equal("cancellationReason" in safe, false);

        const [integration] = await db
          .insert(integrations)
          .values({ profile_id: profileId, provider: "wahoo", external_id: randomUUID() })
          .returning({ id: integrations.id });
        assert.ok(integration);
        const providerInput = {
          ...beginInput,
          operationId: direct.activityIngestionOperationId(`provider:${randomUUID()}`),
          source: "provider_sync" as const,
          provider: "wahoo" as const,
          externalId: "provider-activity-1",
          integrationId: integration.id,
          stagingPath: `activities/${profileId}/provider.fit`,
        };
        const provider = await direct.beginActivityIngestionOperation(db, providerInput);
        const providerClaims = await Promise.all([
          direct.claimActivityIngestionProcessing(db, {
            profileId,
            ingestionId: provider.id,
            operationId: provider.operationId,
            source: "provider_sync",
          }),
          direct.claimActivityIngestionProcessing(db, {
            profileId,
            ingestionId: provider.id,
            operationId: provider.operationId,
            source: "provider_sync",
          }),
        ]);
        assert.deepEqual(providerClaims.map((claim) => claim.status).sort(), [
          "claimed",
          "existing",
        ]);
        await direct.failActivityIngestion(db, {
          profileId,
          ingestionId: provider.id,
          failureCode: "dependency_unavailable",
          retryable: true,
        });
        const providerRetryInput = {
          ...providerInput,
          stagingPath: `activities/${profileId}/provider-retry.fit`,
        };
        const providerRetry = await direct.beginActivityIngestionOperation(db, providerRetryInput);
        assert.equal(providerRetry.id, provider.id);
        assert.equal(providerRetry.stagingPath, providerRetryInput.stagingPath);
        assert.equal(providerRetry.provider, provider.provider);
        assert.equal(providerRetry.externalId, provider.externalId);
        const providerRetryClaim = await direct.claimActivityIngestionProcessing(db, {
          profileId,
          ingestionId: provider.id,
          operationId: provider.operationId,
          source: "provider_sync",
        });
        assert.equal(providerRetryClaim.status, "claimed");
        await direct.acceptActivityIngestion(db, {
          profileId,
          ingestionId: provider.id,
          operationId: provider.operationId,
          source: "provider_sync",
          artifactId,
          activityId,
          completedAt: new Date(),
        });
        const providerReplay = await direct.beginActivityIngestionOperation(db, providerRetryInput);
        assert.equal(providerReplay.id, provider.id);
        assert.equal(providerReplay.status, "succeeded");
        assert.equal(providerReplay.provider, "wahoo");
        assert.equal(providerReplay.externalId, "provider-activity-1");
        assert.equal(providerReplay.stagingCleanupPending, true);
        assert.equal(
          await direct.completeActivityIngestionCleanup(db, {
            profileId,
            ingestionId: provider.id,
          }),
          true,
        );
        assert.equal(
          (await repository.getOwned({ profileId, ingestionId: provider.id }))
            ?.stagingCleanupPending,
          false,
        );

        const recordingSessionId = `mobile-retry-${randomUUID()}`;
        const mobileBytes = new Uint8Array([97, 98, 99]);
        const mobileDigest = direct.activityIngestionOperationId("abc");
        const mobileClaimInput = {
          profileId,
          recordingSessionId,
          byteSize: mobileBytes.byteLength,
          sha256: mobileDigest,
          format: "fit" as const,
        };
        const firstMobileClaim = await mobileUpload.beginMobileRecordingUploadClaim(
          db,
          mobileClaimInput,
        );
        assert.equal(firstMobileClaim.status, "upload");
        await direct.recordActivityIngestionUpload(db, {
          profileId,
          ingestionId: firstMobileClaim.ingestionId,
        });
        const mobileOperationId = mobileUpload.mobileRecordingOperationId(recordingSessionId);
        await direct.startActivityIngestionProcessing(db, {
          profileId,
          ingestionId: firstMobileClaim.ingestionId,
          operationId: mobileOperationId,
          source: "mobile_recording",
        });
        assert.equal(
          await direct.failActivityIngestion(db, {
            profileId,
            ingestionId: firstMobileClaim.ingestionId,
            failureCode: "internal",
            retryable: true,
          }),
          true,
        );
        const failedMobileStatus = await actions.readActivityIngestionSafeStatus({
          db,
          profileId,
          ingestionId: firstMobileClaim.ingestionId,
        });
        assert.equal(failedMobileStatus.status, "failed_retryable");
        assert.equal(failedMobileStatus.actions.retry, true);

        const retryMobileClaim = await mobileUpload.beginMobileRecordingUploadClaim(
          db,
          mobileClaimInput,
        );
        assert.equal(retryMobileClaim.status, "upload");
        assert.equal(retryMobileClaim.ingestionId, firstMobileClaim.ingestionId);
        assert.equal(retryMobileClaim.activityId, firstMobileClaim.activityId);
        const resetMobile = await repository.getOwned({
          profileId,
          ingestionId: retryMobileClaim.ingestionId,
        });
        assert.equal(resetMobile?.status, "awaiting_upload");
        assert.equal(resetMobile?.failureCode, null);
        assert.equal(resetMobile?.failedAt, null);
        assert.equal(resetMobile?.startedAt, null);
        assert.equal(resetMobile?.uploadedAt, null);
        assert.equal(resetMobile?.operationId, mobileOperationId);
        assert.equal(resetMobile?.source, "mobile_recording");
        const resetMobileStatus = await actions.readActivityIngestionSafeStatus({
          db,
          profileId,
          ingestionId: retryMobileClaim.ingestionId,
        });
        assert.equal(resetMobileStatus.status, "awaiting_upload");
        assert.equal(resetMobileStatus.actions.retry, false);
        assert.equal("failureCode" in resetMobileStatus, false);
        assert.equal("failedAt" in resetMobileStatus, false);

        await direct.recordActivityIngestionUpload(db, {
          profileId,
          ingestionId: retryMobileClaim.ingestionId,
        });
        const mobileProcessingClaims = await Promise.all([
          direct.claimActivityIngestionProcessing(db, {
            profileId,
            ingestionId: retryMobileClaim.ingestionId,
            operationId: mobileOperationId,
            source: "mobile_recording",
          }),
          direct.claimActivityIngestionProcessing(db, {
            profileId,
            ingestionId: retryMobileClaim.ingestionId,
            operationId: mobileOperationId,
            source: "mobile_recording",
          }),
        ]);
        assert.deepEqual(mobileProcessingClaims.map((claim) => claim.status).sort(), [
          "claimed",
          "existing",
        ]);

        const mobileActivityId = retryMobileClaim.activityId;
        const mobileArtifactId = randomUUID();
        await db.transaction(async (tx) => {
          await tx.execute(sql`set local session_replication_role = replica`);
          await tx.insert(activities).values({
            id: mobileActivityId,
            profile_id: profileId,
            name: "Disposable mobile retry activity",
            started_at: new Date("2026-08-16T12:00:00.000Z"),
            finished_at: new Date("2026-08-16T13:00:00.000Z"),
            elapsed_ms: 3_600_000,
            parser_version: "disposable-v1",
            decoded_contract_version: "disposable-v1",
            materializer_version: "disposable-v1",
          });
        });
        await db.insert(activityArtifacts).values({
          id: mobileArtifactId,
          profile_id: profileId,
          digest_algorithm: "sha256",
          digest: mobileDigest,
          byte_size: mobileBytes.byteLength,
          bucket: "activity-files",
          path: `artifacts/sha256/${profileId}/${mobileDigest}`,
          media_type: "application/vnd.ant.fit",
          format: "fit",
          availability: "accepted",
          first_accepted_at: new Date(),
        });
        await direct.acceptActivityIngestion(db, {
          profileId,
          ingestionId: retryMobileClaim.ingestionId,
          operationId: mobileOperationId,
          source: "mobile_recording",
          artifactId: mobileArtifactId,
          activityId: mobileActivityId,
          completedAt: new Date(),
        });
        const mobileReplay = await mobileUpload.beginMobileRecordingUploadClaim(
          db,
          mobileClaimInput,
        );
        assert.equal(mobileReplay.status, "ready");
        assert.equal(mobileReplay.ingestionId, retryMobileClaim.ingestionId);
        assert.equal(mobileReplay.activityId, mobileActivityId);
        const [mobileActivityCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(activities)
          .where(drizzle.eq(activities.id, mobileActivityId));
        assert.equal(mobileActivityCount?.count, 1);

        console.log(
          "[api:activity-ingestion:disposable] direct, provider, and mobile retry replay passed",
        );
      } finally {
        await pool.end();
      }
    });
  },
);
