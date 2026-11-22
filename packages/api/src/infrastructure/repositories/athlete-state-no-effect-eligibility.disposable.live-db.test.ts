import { randomUUID } from "node:crypto";
import {
  ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  athleteRecalculationIdempotencyKey,
  athleteRecalculationRequestSchema,
} from "@repo/core/athlete-derived-state";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const unavailableNormalizedPower = calculateCyclingNormalizedPower({ samples: [] });

describe("athlete-state no-effect claim eligibility", () => {
  it("uses only current accepted future source evidence to delay historical queues", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "athlete_state_no_effect_eligibility",
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
          const repository = repositoryModule.createDrizzleAthleteDerivedStateRepository(client.db);
          const now = new Date("2026-08-06T12:00:00.000Z");
          const historicalAt = new Date("2026-08-01T10:00:00.000Z");
          const futureAt = new Date("2026-08-08T10:00:00.000Z");
          const durationMs = 60_000;

          const request = (profileId: string, earliestAffectedAt = historicalAt) =>
            athleteRecalculationRequestSchema.parse({
              contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
              profileId,
              idempotencyKey: athleteRecalculationIdempotencyKey(profileId),
              earliestAffectedAt: earliestAffectedAt.toISOString(),
              earliestAffectedPlanningDate: earliestAffectedAt.toISOString().slice(0, 10),
              sourceRevision: 1,
              reasons: ["activity_changed"],
              requestedAt: now.toISOString(),
            });
          const claim = (at: Date) => ({
            claimToken: randomUUID(),
            now: at.toISOString(),
            claimedAt: at.toISOString(),
            leaseExpiresAt: new Date(at.getTime() + 60_000).toISOString(),
          });
          const seedProfile = async (label: string) => {
            const profileId = randomUUID();
            const email = `${profileId}@athlete-state-no-effect-eligibility.test`;
            await client.db.insert(schema.users).values({
              id: profileId,
              name: label,
              email,
              emailVerified: true,
            });
            await client.db.insert(schema.profiles).values({
              id: profileId,
              email,
              full_name: label,
              username: `no-effect-${profileId.slice(0, 8)}`,
              onboarding_status: "completed",
              planning_timezone: "UTC",
              is_public: false,
            });
            return profileId;
          };
          const seedActivity = async (
            profileId: string,
            input: {
              finishedAt: Date;
              artifactLifecycle?: "accepted" | "deletion_pending";
              currentSource?: boolean;
              segmentRevision?: number;
              activitySegmentsRevision?: number;
              futureEffortAt?: Date;
            },
          ) => {
            const activityId = randomUUID();
            const artifactId = randomUUID();
            const segmentId = randomUUID();
            const segmentRevision = input.segmentRevision ?? 1;
            const digestSeed = randomUUID().replaceAll("-", "");
            const digest = `${digestSeed}${digestSeed}`;
            const lifecycle = input.artifactLifecycle ?? "accepted";
            await client.db.transaction(async (tx) => {
              await tx.insert(schema.activities).values({
                id: activityId,
                profile_id: profileId,
                name: "Canonical source graph",
                started_at: new Date(input.finishedAt.getTime() - durationMs),
                finished_at: input.finishedAt,
                elapsed_ms: durationMs,
                active_ms: durationMs,
                moving_ms: durationMs,
                timing_coverage: "complete",
                segments_revision: input.activitySegmentsRevision ?? segmentRevision,
                parser_version: "no-effect-eligibility-v1",
                decoded_contract_version: "no-effect-eligibility-v1",
                materializer_version: "no-effect-eligibility-v1",
                segments_generated_at: input.finishedAt,
                created_at: input.finishedAt,
                updated_at: input.finishedAt,
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
                availability: lifecycle,
                first_accepted_at: input.finishedAt,
                ...(lifecycle === "deletion_pending" ? { deletion_requested_at: now } : {}),
              });
              await tx.insert(schema.activityArtifactLinks).values({
                id: randomUUID(),
                activity_id: activityId,
                artifact_id: artifactId,
                profile_id: profileId,
                role: "source",
                ordinal: 0,
                is_current: input.currentSource ?? true,
                linked_at: input.finishedAt,
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
                  timing: {
                    timingCoverage: "complete",
                    activeMs: durationMs,
                    movingMs: durationMs,
                  },
                  distanceMeters: 1_000,
                  normalizedPowerResult: unavailableNormalizedPower,
                },
                summary_version: 1,
                timing_coverage: "complete",
                active_ms: durationMs,
                moving_ms: durationMs,
                segment_revision: segmentRevision,
                parser_version: "no-effect-eligibility-v1",
                materializer_version: "no-effect-eligibility-v1",
                created_at: input.finishedAt,
              });
              if (input.futureEffortAt) {
                await tx.insert(schema.activityEfforts).values({
                  id: randomUUID(),
                  created_at: now,
                  profile_id: profileId,
                  activity_id: activityId,
                  segment_id: segmentId,
                  recorded_at: input.futureEffortAt,
                  activity_category: "bike",
                  effort_type: "power",
                  source_series: "power",
                  duration_seconds: 60,
                  distance_meters: null,
                  source_artifact_id: artifactId,
                  source_revision: segmentRevision,
                  start_offset_ms: 0,
                  end_offset_ms: 60_000,
                  window_coverage: 1,
                  max_gap_seconds: 1,
                  unit: "watts",
                  value: 200,
                  source: "derived",
                  method: "no_effect_eligibility",
                  calculation_version: "no-effect-eligibility-v1",
                  quality_score: 0.9,
                  provenance: { observation_id: "future-effort" },
                });
              }
            });
            return { activityId, artifactId, segmentId };
          };
          const queueHistorical = async (profileId: string) => {
            await repository.coalesceRecalculationRequest({
              profileId,
              request: request(profileId),
            });
            await expect(
              client.db
                .select({ activityId: schema.activityTrainingEffects.activity_id })
                .from(schema.activityTrainingEffects)
                .where(eq(schema.activityTrainingEffects.profile_id, profileId)),
            ).resolves.toEqual([]);
          };
          const seedRetainedEffect = async (profileId: string, finishedAt: Date) => {
            const source = await seedActivity(profileId, { finishedAt });
            await client.db.transaction(async (tx) => {
              await tx.insert(schema.activityAnalysisRevisions).values({
                activity_id: source.activityId,
                profile_id: profileId,
                revision: 1,
                source_segments_revision: 1,
                analysis_version: "no-effect-eligibility-v1",
                reason: "manual_profile_reprocess",
                performance_target_snapshot: {},
                target_fingerprint: `sha256:${"a".repeat(64)}`,
                segment_load_projection: {},
                output_fingerprint: `sha256:${"b".repeat(64)}`,
                computed_at: now,
              });
              await tx.insert(schema.activityTrainingEffects).values({
                profile_id: profileId,
                activity_id: source.activityId,
                activity_analysis_revision: 1,
                contract_version: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
                effective_at: finishedAt,
                planning_date: finishedAt.toISOString().slice(0, 10),
                source_revision: 1,
                calculation_version: "no-effect-eligibility-v1",
                input_fingerprint: "c".repeat(64),
                activity_category: "bike",
                common_load: 1,
                evidence_confidence: 1,
                capability_observation: null,
              });
              await tx.execute(
                sql`select public.request_activity_artifact_deletion(${source.artifactId}::uuid)`,
              );
            });
            return source;
          };

          const historicalProfileId = await seedProfile("Historical no-future evidence");
          await seedActivity(historicalProfileId, { finishedAt: historicalAt });
          await queueHistorical(historicalProfileId);
          await expect(repository.claimNextRecalculation(claim(now))).resolves.toMatchObject({
            request: { profileId: historicalProfileId },
          });

          const futureParentProfileId = await seedProfile("Future parent without effect");
          await seedActivity(futureParentProfileId, { finishedAt: futureAt });
          await queueHistorical(futureParentProfileId);
          await expect(repository.claimNextRecalculation(claim(now))).resolves.toBeNull();
          await expect(
            repository.claimNextRecalculation(claim(new Date(futureAt.getTime() + 1))),
          ).resolves.toMatchObject({ request: { profileId: futureParentProfileId } });

          const staleEffortProfileId = await seedProfile("Stale and non-current future effort");
          await seedActivity(staleEffortProfileId, { finishedAt: historicalAt });
          await seedActivity(staleEffortProfileId, {
            finishedAt: historicalAt,
            currentSource: false,
            futureEffortAt: futureAt,
          });
          await seedActivity(staleEffortProfileId, {
            finishedAt: historicalAt,
            activitySegmentsRevision: 2,
            futureEffortAt: futureAt,
          });
          await queueHistorical(staleEffortProfileId);
          await expect(repository.claimNextRecalculation(claim(now))).resolves.toMatchObject({
            request: { profileId: staleEffortProfileId },
          });

          const deletionPendingProfileId = await seedProfile("Deleted future parent effect");
          const deletedFuture = await seedRetainedEffect(deletionPendingProfileId, futureAt);
          await repository.coalesceRecalculationRequest({
            profileId: deletionPendingProfileId,
            request: request(deletionPendingProfileId),
          });
          await expect(
            client.db
              .select({ availability: schema.activityArtifacts.availability })
              .from(schema.activityArtifacts)
              .where(eq(schema.activityArtifacts.id, deletedFuture.artifactId)),
          ).resolves.toEqual([{ availability: "deletion_pending" }]);
          await expect(
            client.db
              .select({ sourceArtifactId: schema.activitySegments.source_artifact_id })
              .from(schema.activitySegments)
              .where(eq(schema.activitySegments.id, deletedFuture.segmentId)),
          ).resolves.toEqual([{ sourceArtifactId: null }]);
          await expect(
            client.db
              .select({ id: schema.activityArtifactLinks.id })
              .from(schema.activityArtifactLinks)
              .where(eq(schema.activityArtifactLinks.artifact_id, deletedFuture.artifactId)),
          ).resolves.toEqual([]);
          await expect(
            client.db
              .select({ activityId: schema.activityTrainingEffects.activity_id })
              .from(schema.activityTrainingEffects)
              .where(eq(schema.activityTrainingEffects.activity_id, deletedFuture.activityId)),
          ).resolves.toEqual([{ activityId: deletedFuture.activityId }]);
          await expect(
            repository.listActivityTrainingEffects({
              profileId: deletionPendingProfileId,
              fromEffectiveAt: historicalAt.toISOString(),
              throughSourceRevision: 1,
              limit: 10,
            }),
          ).resolves.toEqual({ items: [], hasMore: false });
          await expect(repository.claimNextRecalculation(claim(now))).resolves.toMatchObject({
            request: { profileId: deletionPendingProfileId },
          });
        } finally {
          await client.close();
        }
      },
    );
  });
});
