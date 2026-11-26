import { randomUUID } from "node:crypto";
import { COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION } from "@repo/core";
import {
  ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  athleteRecalculationIdempotencyKey,
  athleteRecalculationRequestSchema,
} from "@repo/core/athlete-derived-state";
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
  const result = calculateCyclingNormalizedPower({
    samples: Array.from({ length: durationSeconds / 5 + 1 }, (_, index) => ({
      timestampSeconds: index * 5,
      powerWatts: 200,
    })),
  });
  if (result.status === "unavailable") throw new Error("Expected generated power samples");
  return result;
}

describe("athlete-state raw provider source eligibility", () => {
  it("replays current confirmed raw-provider effects and delays a future raw parent", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "athlete_state_raw_provider",
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
          const integrationId = randomUUID();
          const historicalAt = new Date("2026-08-01T10:00:00.000Z");
          const now = new Date("2026-08-06T12:00:00.000Z");
          const futureAt = new Date("2026-08-08T10:00:00.000Z");
          const durationMs = 20 * 60_000;
          await client.db.transaction(async (tx) => {
            await tx.insert(schema.users).values({
              id: profileId,
              name: "Raw provider athlete",
              email: `${profileId}@athlete-state-raw-provider.test`,
              emailVerified: true,
            });
            await tx.insert(schema.profiles).values({
              id: profileId,
              email: `${profileId}@athlete-state-raw-provider.test`,
              full_name: "Raw provider athlete",
              username: `raw-provider-${profileId.slice(0, 8)}`,
              onboarding_status: "completed",
              planning_timezone: "UTC",
              is_public: false,
            });
            await tx.insert(schema.integrations).values({
              id: integrationId,
              profile_id: profileId,
              provider: "strava",
              external_id: `raw-provider-${profileId}`,
            });
          });
          const seedRawActivity = async (finishedAt: Date, confirmed = true) => {
            const activityId = randomUUID();
            await client.db.transaction(async (tx) => {
              await tx.insert(schema.activities).values({
                id: activityId,
                profile_id: profileId,
                name: "Current Strava raw activity",
                started_at: new Date(finishedAt.getTime() - durationMs),
                finished_at: finishedAt,
                elapsed_ms: durationMs,
                active_ms: durationMs,
                moving_ms: durationMs,
                timing_coverage: "complete",
                segments_revision: 1,
                parser_version: "strava-raw-v1",
                decoded_contract_version: "strava-raw-v1",
                materializer_version: "strava-raw-v1",
                canonical_evidence_tier: "raw_samples",
                segments_generated_at: finishedAt,
                performance_target_snapshot: {
                  contractVersion: COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION,
                  capturedAt: finishedAt.toISOString(),
                  publishedRevision: 0,
                  publicationStatus: "available",
                  targets: buildPerformanceTargetFactsFixture({
                    athleteId: profileId,
                    asOf: new Date(finishedAt.getTime() - durationMs).toISOString(),
                    bikeThresholdWatts: 250,
                  }),
                },
                created_at: finishedAt,
                updated_at: finishedAt,
              });
              await tx.insert(schema.activitySegments).values({
                id: activityId,
                activity_id: activityId,
                profile_id: profileId,
                ordinal: 0,
                role: "activity",
                activity_category: "bike",
                start_offset_ms: 0,
                end_offset_ms: durationMs,
                source_artifact_id: null,
                source_session_index: null,
                raw_type_string: "Ride",
                raw_sport_string: "Ride",
                summary: {
                  version: 1,
                  timing: {
                    timingCoverage: "complete",
                    activeMs: durationMs,
                    movingMs: durationMs,
                  },
                  distanceMeters: 1_000,
                  averagePowerWatts: 200,
                  normalizedPowerResult: normalizedPowerForDuration(durationMs / 1_000),
                },
                summary_version: 1,
                timing_coverage: "complete",
                active_ms: durationMs,
                moving_ms: durationMs,
                segment_revision: 1,
                parser_version: "strava-raw-v1",
                materializer_version: "strava-raw-v1",
                created_at: finishedAt,
              });
              if (confirmed) {
                await tx.insert(schema.activitySourceReferences).values({
                  profile_id: profileId,
                  activity_id: activityId,
                  resolution_status: "confirmed",
                  relationship_kind: "imported",
                  integration_id: integrationId,
                  provider: "strava",
                  provider_external_id: activityId,
                  artifact_sha256: null,
                });
              }
            });
            return activityId;
          };
          const historicalActivityId = await seedRawActivity(historicalAt);
          const repository = repositoryModule.createDrizzleAthleteDerivedStateRepository(client.db);
          const materialized = await client.db.transaction((tx) =>
            materializeActivityAthleteStateEvidence(tx, {
              profileId,
              activityId: historicalActivityId,
              computedAt: now,
              contextDb: client.db,
              canonicalEvidenceMaterialChanged: true,
              allowIncrementalApply: false,
            }),
          );
          expect(materialized).toMatchObject({ effectiveAt: historicalAt, materialChanged: true });
          expect(materialized.commonLoad).not.toBeNull();
          if (materialized.commonLoad === null)
            throw new Error("Expected usable raw-provider load");
          expect(materialized.commonLoad).toBeGreaterThan(0);
          await expect(
            repository.listActivityTrainingEffects({
              profileId,
              fromEffectiveAt: historicalAt.toISOString(),
              throughSourceRevision: 1,
              limit: 10,
            }),
          ).resolves.toMatchObject({ items: [{ activityId: historicalActivityId }] });
          const [persistedEffect] = await client.db
            .select({ commonLoad: schema.activityTrainingEffects.common_load })
            .from(schema.activityTrainingEffects)
            .where(eq(schema.activityTrainingEffects.activity_id, historicalActivityId));
          expect(persistedEffect).toBeDefined();
          expect(persistedEffect?.commonLoad).toBeCloseTo(materialized.commonLoad);
          await expect(
            new AthleteStateWorkerService({ db: client.db }).processDueJobs({ limit: 1, now }),
          ).resolves.toEqual({ completed: 1, failed: 0, processed: 1 });
          await expect(
            client.db
              .select({ publishedRevision: schema.profileAthleteState.published_revision })
              .from(schema.profileAthleteState)
              .where(eq(schema.profileAthleteState.profile_id, profileId)),
          ).resolves.toEqual([{ publishedRevision: 1 }]);
          const published = await repository.readPublishedDailyTrainingLoadRange({
            profileId,
            startDate: "2026-08-01",
            endDate: "2026-08-02",
          });
          expect(published?.publishedRevision).toBe(1);
          const historicalDay = published?.days.find((day) => day.planningDate === "2026-08-01");
          expect(historicalDay?.commonLoad).toBeGreaterThan(0);
          expect(historicalDay?.commonLoad).toBeCloseTo(materialized.commonLoad);
          await seedRawActivity(futureAt, false);
          await repository.coalesceRecalculationRequest({
            profileId,
            request: athleteRecalculationRequestSchema.parse({
              contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
              profileId,
              idempotencyKey: athleteRecalculationIdempotencyKey(profileId),
              earliestAffectedAt: historicalAt.toISOString(),
              earliestAffectedPlanningDate: "2026-08-01",
              sourceRevision: 2,
              reasons: ["activity_changed"],
              requestedAt: now.toISOString(),
            }),
          });
          await expect(
            repository.claimNextRecalculation({
              claimToken: randomUUID(),
              now: now.toISOString(),
              claimedAt: now.toISOString(),
              leaseExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
            }),
          ).resolves.toMatchObject({ request: { profileId, sourceRevision: 2 } });
          await seedRawActivity(futureAt);
          await repository.coalesceRecalculationRequest({
            profileId,
            request: athleteRecalculationRequestSchema.parse({
              contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
              profileId,
              idempotencyKey: athleteRecalculationIdempotencyKey(profileId),
              earliestAffectedAt: historicalAt.toISOString(),
              earliestAffectedPlanningDate: "2026-08-01",
              sourceRevision: 3,
              reasons: ["activity_changed"],
              requestedAt: now.toISOString(),
            }),
          });
          await expect(
            repository.claimNextRecalculation({
              claimToken: randomUUID(),
              now: now.toISOString(),
              claimedAt: now.toISOString(),
              leaseExpiresAt: new Date(now.getTime() + 60_000).toISOString(),
            }),
          ).resolves.toBeNull();
          await expect(
            repository.claimNextRecalculation({
              claimToken: randomUUID(),
              now: new Date(futureAt.getTime() + 1).toISOString(),
              claimedAt: new Date(futureAt.getTime() + 1).toISOString(),
              leaseExpiresAt: new Date(futureAt.getTime() + 60_001).toISOString(),
            }),
          ).resolves.toMatchObject({ request: { profileId } });
          await expect(
            client.db
              .select({ id: schema.activitySourceReferences.id })
              .from(schema.activitySourceReferences)
              .where(eq(schema.activitySourceReferences.activity_id, historicalActivityId)),
          ).resolves.toHaveLength(1);
        } finally {
          await client.close();
        }
      },
    );
  });
});
