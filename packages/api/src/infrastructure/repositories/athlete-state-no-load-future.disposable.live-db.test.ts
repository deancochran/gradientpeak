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

function normalizedPowerForDuration(durationSeconds: number) {
  const result = calculateCyclingNormalizedPower({
    samples: Array.from({ length: durationSeconds / 5 + 1 }, (_, index) => ({
      timestampSeconds: index * 5,
      powerWatts: 200,
    })),
  });
  if (result.status === "unavailable") throw new Error("Expected generated power samples");
  return result;
}

describe("athlete-state no-load future evidence", () => {
  it("keeps a historical replay queued until a valid future effort is due after canonical no-load materialization removes its effect", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "athlete_state_no_load_future",
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
          const profileId = randomUUID();
          const activityId = randomUUID();
          const artifactId = randomUUID();
          const segmentId = randomUUID();
          const finishedAt = new Date("2026-08-01T10:00:00.000Z");
          const materializedAt = new Date("2026-08-06T12:00:00.000Z");
          const futureEffortAt = new Date("2026-08-08T10:00:00.000Z");
          const durationMs = 20 * 60_000;
          const digestSeed = randomUUID().replaceAll("-", "");
          const digest = `${digestSeed}${digestSeed}`;
          const usableSummary = {
            version: 1 as const,
            timing: {
              timingCoverage: "complete" as const,
              activeMs: durationMs,
              movingMs: durationMs,
            },
            distanceMeters: 10_000,
            averagePowerWatts: 200,
            normalizedPowerResult: normalizedPowerForDuration(durationMs / 1_000),
          };

          await client.db.transaction(async (tx) => {
            await tx.insert(schema.users).values({
              id: profileId,
              name: "No-load future evidence fixture",
              email: `${profileId}@athlete-state-no-load-future.test`,
              emailVerified: true,
            });
            await tx.insert(schema.profiles).values({
              id: profileId,
              email: `${profileId}@athlete-state-no-load-future.test`,
              full_name: "No-load future evidence fixture",
              username: `no-load-future-${profileId.slice(0, 8)}`,
              onboarding_status: "completed",
              planning_timezone: "UTC",
              is_public: false,
            });
            await tx.insert(schema.activities).values({
              id: activityId,
              profile_id: profileId,
              name: "Historical bike activity with future effort",
              started_at: new Date(finishedAt.getTime() - durationMs),
              finished_at: finishedAt,
              elapsed_ms: durationMs,
              active_ms: durationMs,
              moving_ms: durationMs,
              timing_coverage: "complete",
              segments_revision: 1,
              parser_version: "no-load-future-v1",
              decoded_contract_version: "no-load-future-v1",
              materializer_version: "no-load-future-v1",
              segments_generated_at: finishedAt,
              performance_target_snapshot: {
                contractVersion: COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION,
                capturedAt: finishedAt.toISOString(),
                publishedRevision: 0,
                publicationStatus: "available",
                targets: buildPerformanceTargetFactsFixture({
                  athleteId: profileId,
                  asOf: finishedAt.toISOString(),
                  bikeThresholdWatts: 250,
                }),
              },
              created_at: finishedAt,
              updated_at: finishedAt,
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
              first_accepted_at: finishedAt,
            });
            await tx.insert(schema.activityArtifactLinks).values({
              id: randomUUID(),
              activity_id: activityId,
              artifact_id: artifactId,
              profile_id: profileId,
              role: "source",
              ordinal: 0,
              is_current: true,
              linked_at: finishedAt,
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
              summary: usableSummary,
              summary_version: 1,
              timing_coverage: "complete",
              active_ms: durationMs,
              moving_ms: durationMs,
              segment_revision: 1,
              parser_version: "no-load-future-v1",
              materializer_version: "no-load-future-v1",
              created_at: finishedAt,
            });
            await tx.insert(schema.activityEfforts).values({
              id: randomUUID(),
              created_at: materializedAt,
              profile_id: profileId,
              activity_id: activityId,
              segment_id: segmentId,
              recorded_at: futureEffortAt,
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
              method: "no_load_future_power",
              calculation_version: "no-load-future-v1",
              quality_score: 0.9,
              provenance: { observation_id: "future-power" },
            });
            await expect(
              materializeActivityAthleteStateEvidence(tx, {
                profileId,
                activityId,
                computedAt: materializedAt,
                contextDb: tx,
                canonicalEvidenceMaterialChanged: true,
                effortMaterialRecordedAt: futureEffortAt,
              }),
            ).resolves.toMatchObject({ effectiveAt: finishedAt, materialChanged: true });
          });

          const repository = repositoryModule.createDrizzleAthleteDerivedStateRepository(client.db);
          await expect(
            client.db
              .select({ activityId: schema.activityTrainingEffects.activity_id })
              .from(schema.activityTrainingEffects)
              .where(eq(schema.activityTrainingEffects.activity_id, activityId)),
          ).resolves.toEqual([{ activityId }]);

          await client.db.transaction(async (tx) => {
            await tx
              .update(schema.activitySegments)
              .set({
                summary: {
                  ...usableSummary,
                  averagePowerWatts: undefined,
                  normalizedPowerResult: calculateCyclingNormalizedPower({ samples: [] }),
                },
              })
              .where(eq(schema.activitySegments.id, segmentId));
            await expect(
              materializeActivityAthleteStateEvidence(tx, {
                profileId,
                activityId,
                computedAt: materializedAt,
                contextDb: tx,
                canonicalEvidenceMaterialChanged: true,
              }),
            ).resolves.toMatchObject({
              commonLoad: null,
              effectiveAt: finishedAt,
              materialChanged: true,
            });
          });

          await expect(
            client.db
              .select({ activityId: schema.activityTrainingEffects.activity_id })
              .from(schema.activityTrainingEffects)
              .where(eq(schema.activityTrainingEffects.activity_id, activityId)),
          ).resolves.toEqual([]);
          await expect(repository.readPendingRecalculation({ profileId })).resolves.toMatchObject({
            earliestAffectedAt: finishedAt.toISOString(),
            sourceRevision: 2,
          });
          await expect(
            repository.claimNextRecalculation({
              claimToken: randomUUID(),
              now: materializedAt.toISOString(),
              claimedAt: materializedAt.toISOString(),
              leaseExpiresAt: new Date(materializedAt.getTime() + 60_000).toISOString(),
            }),
          ).resolves.toBeNull();
          await expect(
            repository.claimNextRecalculation({
              claimToken: randomUUID(),
              now: new Date(futureEffortAt.getTime() + 1).toISOString(),
              claimedAt: new Date(futureEffortAt.getTime() + 1).toISOString(),
              leaseExpiresAt: new Date(futureEffortAt.getTime() + 60_001).toISOString(),
            }),
          ).resolves.toMatchObject({ request: { profileId, sourceRevision: 2 } });
        } finally {
          await client.close();
        }
      },
    );
  });
});
