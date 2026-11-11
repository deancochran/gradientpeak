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

function normalizedPower() {
  const result = calculateCyclingNormalizedPower({
    samples: Array.from({ length: 241 }, (_, index) => ({
      timestampSeconds: index * 5,
      powerWatts: 200,
    })),
  });
  if (result.status === "unavailable") throw new Error("Expected valid fixture power");
  return result;
}

describe("athlete-state immutable effect persistence boundary", () => {
  it("rejects changed same-identity scalar and capability content", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "athlete_state_canonical_conflict",
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
          const durationMs = 20 * 60_000;
          const summary = {
            version: 1,
            timing: {
              timingCoverage: "complete" as const,
              activeMs: durationMs,
              movingMs: durationMs,
            },
            distanceMeters: 10_000,
            averagePowerWatts: 200,
            normalizedPowerResult: normalizedPower(),
          };
          const digestSeed = randomUUID().replaceAll("-", "");
          await client.db.transaction(async (tx) => {
            await tx.insert(schema.users).values({
              id: profileId,
              name: "Canonical conflict fixture",
              email: `${profileId}@athlete-state-canonical-conflict.test`,
              emailVerified: true,
            });
            await tx.insert(schema.profiles).values({
              id: profileId,
              email: `${profileId}@athlete-state-canonical-conflict.test`,
              full_name: "Canonical conflict fixture",
              username: `canonical-conflict-${profileId.slice(0, 8)}`,
              onboarding_status: "completed",
              planning_timezone: "UTC",
              is_public: false,
            });
            await tx.insert(schema.activities).values({
              id: activityId,
              profile_id: profileId,
              name: "Canonical conflict bike activity",
              started_at: new Date(finishedAt.getTime() - durationMs),
              finished_at: finishedAt,
              elapsed_ms: durationMs,
              active_ms: durationMs,
              moving_ms: durationMs,
              timing_coverage: "complete",
              segments_revision: 1,
              parser_version: "canonical-conflict-v1",
              decoded_contract_version: "canonical-conflict-v1",
              materializer_version: "canonical-conflict-v1",
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
              digest: `${digestSeed}${digestSeed}`,
              byte_size: 1_024,
              bucket: "activity-files",
              path: `artifacts/sha256/${profileId}/${digestSeed}${digestSeed}`,
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
              summary,
              summary_version: 1,
              timing_coverage: "complete",
              active_ms: durationMs,
              moving_ms: durationMs,
              segment_revision: 1,
              parser_version: "canonical-conflict-v1",
              materializer_version: "canonical-conflict-v1",
              created_at: finishedAt,
            });
            await materializeActivityAthleteStateEvidence(tx, {
              profileId,
              activityId,
              computedAt: new Date("2026-08-02T00:00:00.000Z"),
              contextDb: tx,
              canonicalEvidenceMaterialChanged: true,
              deferAthleteStateRefresh: true,
              targetSourceRevision: 1,
            });
          });

          const repository = repositoryModule.createDrizzleAthleteDerivedStateRepository(client.db);
          const original = await repository.readActivityTrainingEffect({
            profileId,
            activityId,
            activityAnalysisRevision: 1,
          });
          expect(original).not.toBeNull();
          if (!original) throw new Error("Expected original immutable training effect");
          await expect(
            client.db
              .select({
                revision: schema.activityTrainingEffects.activity_analysis_revision,
                sourceRevision: schema.activityTrainingEffects.source_revision,
              })
              .from(schema.activityTrainingEffects)
              .where(eq(schema.activityTrainingEffects.activity_id, activityId)),
          ).resolves.toEqual([{ revision: 1, sourceRevision: 1 }]);

          for (const candidate of [
            {
              ...original,
              stimulus: { ...original.stimulus, commonLoad: original.stimulus.commonLoad + 1 },
            },
            {
              ...original,
              stimulus: {
                ...original.stimulus,
                capabilityObservation: { distanceMeters: 11_000, durationMinutes: 20 },
              },
            },
          ]) {
            await expect(
              repository.upsertActivityTrainingEffect({ profileId, effect: candidate }),
            ).resolves.toEqual({ status: "identity_conflict" });
          }
          await expect(
            repository.readActivityTrainingEffect({
              profileId,
              activityId,
              activityAnalysisRevision: 1,
            }),
          ).resolves.toEqual(original);
          await expect(
            client.db
              .select({ sourceRevision: schema.profileAthleteState.source_revision })
              .from(schema.profileAthleteState)
              .where(eq(schema.profileAthleteState.profile_id, profileId)),
          ).resolves.toEqual([{ sourceRevision: 0 }]);
          await expect(
            client.db
              .select()
              .from(schema.athleteRecalculationQueue)
              .where(eq(schema.athleteRecalculationQueue.profile_id, profileId)),
          ).resolves.toEqual([]);
        } finally {
          await client.close();
        }
      },
    );
  });
});
