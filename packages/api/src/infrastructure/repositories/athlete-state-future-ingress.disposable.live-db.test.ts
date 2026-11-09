import { randomUUID } from "node:crypto";
import { COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION } from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { materializeActivityAthleteStateEvidence } from "../../application/athlete-intelligence/athlete-state-evidence";
import { AthleteStateWorkerService } from "../../application/athlete-intelligence/athlete-state-worker";

function normalizedPowerForDuration(durationSeconds: number) {
  const samples = Array.from({ length: durationSeconds / 5 + 1 }, (_, index) => ({
    timestampSeconds: index * 5,
    powerWatts: 200,
  }));
  const result = calculateCyclingNormalizedPower({ samples });
  if (result.status === "unavailable") throw new Error("Expected generated power samples");
  return result;
}

describe("future athlete-state evidence ingress", () => {
  it("queues first and later future effort ingress without advancing publication early", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "athlete_state_future_ingress",
      async (target, url) => {
        await bootstrapSupabaseSchemas(target);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(target, migration);

        const [clientModule, schema, repositoryModule] = await Promise.all([
          import("@repo/db/client"),
          import("@repo/db/schema"),
          import("./drizzle-athlete-derived-state-repository"),
        ]);
        const client = clientModule.createDbClient({ url });
        try {
          const beforeFirstDue = new Date("2026-08-06T12:00:00.000Z");
          const firstEffortRecordedAt = new Date("2026-08-07T10:00:00.000Z");
          const secondEffortRecordedAt = new Date("2026-08-08T10:00:00.000Z");
          const activityFinishedAt = new Date("2026-08-01T10:00:00.000Z");
          const profileId = randomUUID();
          const activityId = randomUUID();
          const artifactId = randomUUID();
          const segmentId = randomUUID();
          const durationMs = 20 * 60_000;
          const activityStartedAt = new Date(activityFinishedAt.getTime() - durationMs);
          const digestSeed = randomUUID().replaceAll("-", "");
          const digest = `${digestSeed}${digestSeed}`;

          await client.db.transaction(async (tx) => {
            await tx.insert(schema.users).values({
              id: profileId,
              name: "Future athlete-state evidence",
              email: `${profileId}@athlete-state-future-ingress.test`,
              emailVerified: true,
            });
            await tx.insert(schema.profiles).values({
              id: profileId,
              email: `${profileId}@athlete-state-future-ingress.test`,
              full_name: "Future athlete-state evidence",
              username: `future-evidence-${profileId.slice(0, 8)}`,
              onboarding_status: "completed",
              planning_timezone: "UTC",
              is_public: false,
            });
            await tx.insert(schema.activities).values({
              id: activityId,
              profile_id: profileId,
              name: "Published historical bike activity",
              started_at: activityStartedAt,
              finished_at: activityFinishedAt,
              elapsed_ms: durationMs,
              active_ms: durationMs,
              moving_ms: durationMs,
              timing_coverage: "complete",
              segments_revision: 1,
              parser_version: "future-ingress-v1",
              decoded_contract_version: "future-ingress-v1",
              materializer_version: "future-ingress-v1",
              segments_generated_at: activityFinishedAt,
              performance_target_snapshot: {
                contractVersion: COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION,
                capturedAt: activityFinishedAt.toISOString(),
                publishedRevision: 0,
                publicationStatus: "available",
                targets: buildPerformanceTargetFactsFixture({
                  athleteId: profileId,
                  asOf: activityStartedAt.toISOString(),
                  bikeThresholdWatts: 250,
                }),
              },
              created_at: activityFinishedAt,
              updated_at: activityFinishedAt,
            });
            await tx.insert(schema.activityArtifacts).values({
              id: artifactId,
              profile_id: profileId,
              digest_algorithm: "sha256",
              digest,
              byte_size: 1_024,
              bucket: "activity-files",
              path: `artifacts/sha256/${profileId}/${digest}`,
              media_type: "application/vnd.ant.fit",
              format: "fit",
              availability: "accepted",
              first_accepted_at: activityFinishedAt,
            });
            await tx.insert(schema.activityArtifactLinks).values({
              id: randomUUID(),
              activity_id: activityId,
              artifact_id: artifactId,
              profile_id: profileId,
              role: "source",
              ordinal: 0,
              is_current: true,
              linked_at: activityFinishedAt,
            });
            await tx.insert(schema.activitySegments).values({
              id: segmentId,
              activity_id: activityId,
              profile_id: profileId,
              ordinal: 0,
              role: "activity",
              activity_category: "bike",
              start_offset_ms: 0,
              end_offset_ms: durationMs,
              source_artifact_id: artifactId,
              source_session_index: 0,
              summary: {
                version: 1,
                timing: { timingCoverage: "complete", activeMs: durationMs, movingMs: durationMs },
                distanceMeters: 10_000,
                averagePowerWatts: 200,
                normalizedPowerResult: normalizedPowerForDuration(durationMs / 1_000),
              },
              summary_version: 1,
              timing_coverage: "complete",
              active_ms: durationMs,
              moving_ms: durationMs,
              segment_revision: 1,
              parser_version: "future-ingress-v1",
              materializer_version: "future-ingress-v1",
              created_at: activityFinishedAt,
            });
            await tx.insert(schema.activityEfforts).values({
              id: randomUUID(),
              created_at: beforeFirstDue,
              profile_id: profileId,
              activity_id: activityId,
              segment_id: segmentId,
              recorded_at: firstEffortRecordedAt,
              activity_category: "bike",
              effort_type: "power",
              source_series: "power",
              duration_seconds: 60,
              distance_meters: null,
              source_artifact_id: artifactId,
              source_revision: 1,
              start_offset_ms: 0,
              end_offset_ms: 60_000,
              window_coverage: 1,
              max_gap_seconds: 1,
              unit: "watts",
              value: 200,
              source: "derived",
              method: "future_power_test",
              calculation_version: "future-ingress-v1",
              quality_score: 0.9,
              provenance: { observation_id: "future-power" },
            });
            await expect(
              materializeActivityAthleteStateEvidence(tx, {
                profileId,
                activityId,
                computedAt: beforeFirstDue,
                contextDb: client.db,
                canonicalEvidenceMaterialChanged: true,
                effortMaterialRecordedAt: firstEffortRecordedAt,
              }),
            ).resolves.toMatchObject({
              effectiveAt: activityFinishedAt,
              materialChanged: true,
            });
          });

          await expect(
            client.db
              .select({ revision: schema.activityAnalysisRevisions.revision })
              .from(schema.activityAnalysisRevisions)
              .where(eq(schema.activityAnalysisRevisions.activity_id, activityId)),
          ).resolves.toEqual([{ revision: 1 }]);
          await expect(
            client.db
              .select({
                activityAnalysisRevision: schema.activityTrainingEffects.activity_analysis_revision,
                sourceRevision: schema.activityTrainingEffects.source_revision,
                capabilityObservation: schema.activityTrainingEffects.capability_observation,
              })
              .from(schema.activityTrainingEffects)
              .where(eq(schema.activityTrainingEffects.activity_id, activityId)),
          ).resolves.toEqual([
            {
              activityAnalysisRevision: 1,
              sourceRevision: 1,
              capabilityObservation: { distanceMeters: 10_000, durationMinutes: 20 },
            },
          ]);
          const repository = repositoryModule.createDrizzleAthleteDerivedStateRepository(client.db);
          await expect(repository.readPendingRecalculation({ profileId })).resolves.toMatchObject({
            earliestAffectedAt: activityFinishedAt.toISOString(),
            sourceRevision: 1,
          });
          await expect(
            repository.claimNextRecalculation({
              claimToken: randomUUID(),
              now: beforeFirstDue.toISOString(),
              claimedAt: beforeFirstDue.toISOString(),
              leaseExpiresAt: new Date(beforeFirstDue.getTime() + 60_000).toISOString(),
            }),
          ).resolves.toBeNull();
          await expect(
            client.db
              .select({ publishedRevision: schema.profileAthleteState.published_revision })
              .from(schema.profileAthleteState)
              .where(eq(schema.profileAthleteState.profile_id, profileId)),
          ).resolves.toEqual([{ publishedRevision: 0 }]);
          await expect(
            new AthleteStateWorkerService({ db: client.db }).processDueJobs({
              limit: 1,
              now: new Date("2026-08-07T11:00:00.000Z"),
            }),
          ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
          await expect(
            client.db
              .select({ publishedRevision: schema.profileAthleteState.published_revision })
              .from(schema.profileAthleteState)
              .where(eq(schema.profileAthleteState.profile_id, profileId)),
          ).resolves.toEqual([{ publishedRevision: 1 }]);

          await client.db.transaction(async (tx) => {
            await tx.insert(schema.activityEfforts).values({
              id: randomUUID(),
              created_at: new Date("2026-08-07T11:00:00.000Z"),
              profile_id: profileId,
              activity_id: activityId,
              segment_id: segmentId,
              recorded_at: secondEffortRecordedAt,
              activity_category: "bike",
              effort_type: "heart_rate",
              source_series: "heart_rate",
              duration_seconds: 1_200,
              distance_meters: null,
              source_artifact_id: artifactId,
              source_revision: 1,
              start_offset_ms: 0,
              end_offset_ms: 1_200_000,
              window_coverage: 1,
              max_gap_seconds: 2,
              unit: "bpm",
              value: 178,
              source: "derived",
              method: "future_lthr_test",
              calculation_version: "future-ingress-v1",
              quality_score: 0.9,
              provenance: { observation_id: "future-lthr" },
            });
            await expect(
              materializeActivityAthleteStateEvidence(tx, {
                profileId,
                activityId,
                computedAt: new Date("2026-08-07T11:00:00.000Z"),
                contextDb: client.db,
                effortMaterialRecordedAt: secondEffortRecordedAt,
              }),
            ).resolves.toMatchObject({
              effectiveAt: secondEffortRecordedAt,
              materialChanged: true,
            });
          });

          await expect(repository.readPendingRecalculation({ profileId })).resolves.toMatchObject({
            earliestAffectedAt: secondEffortRecordedAt.toISOString(),
            sourceRevision: 2,
          });
          await expect(
            client.db
              .select({
                leaseToken: schema.profileAthleteState.lease_token,
                retryAfter: schema.profileAthleteState.retry_after,
              })
              .from(schema.profileAthleteState)
              .where(eq(schema.profileAthleteState.profile_id, profileId)),
          ).resolves.toEqual([{ leaseToken: null, retryAfter: null }]);
          await expect(
            repository.claimNextRecalculation({
              claimToken: randomUUID(),
              now: "2026-08-07T11:00:00.000Z",
              claimedAt: "2026-08-07T11:00:00.000Z",
              leaseExpiresAt: "2026-08-07T11:01:00.000Z",
            }),
          ).resolves.toBeNull();
          await expect(
            client.db
              .select({ publishedRevision: schema.profileAthleteState.published_revision })
              .from(schema.profileAthleteState)
              .where(eq(schema.profileAthleteState.profile_id, profileId)),
          ).resolves.toEqual([{ publishedRevision: 1 }]);

          await expect(
            new AthleteStateWorkerService({ db: client.db }).processDueJobs({
              limit: 1,
              now: new Date("2026-08-08T11:00:00.000Z"),
            }),
          ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
          await expect(
            new AthleteStateWorkerService({ db: client.db }).processDueJobs({
              limit: 1,
              now: new Date("2026-08-08T11:00:00.000Z"),
            }),
          ).resolves.toEqual({ completed: 0, failed: 0, processed: 0 });
          await expect(
            client.db
              .select({ publishedRevision: schema.profileAthleteState.published_revision })
              .from(schema.profileAthleteState)
              .where(eq(schema.profileAthleteState.profile_id, profileId)),
          ).resolves.toEqual([{ publishedRevision: 2 }]);
          await expect(
            client.db
              .select({ sourceRevision: schema.activityTrainingEffects.source_revision })
              .from(schema.activityTrainingEffects)
              .where(eq(schema.activityTrainingEffects.activity_id, activityId)),
          ).resolves.toEqual([{ sourceRevision: 1 }]);
        } finally {
          await client.close();
        }
      },
    );
  });
});
