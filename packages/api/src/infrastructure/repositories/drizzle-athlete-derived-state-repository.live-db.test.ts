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
import { describe, expect, it } from "vitest";

const unavailableNormalizedPower = calculateCyclingNormalizedPower({ samples: [] });

describe("Drizzle athlete-derived recalculation due-time claims", () => {
  it("uses an isolated guarded disposable database for future and due queue claims", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "athlete_derived_due_time",
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
          const now = new Date("2026-08-10T12:00:00.000Z");

          const seedProfile = async () => {
            const id = randomUUID();
            const email = `${id}@athlete-derived-state-repository.test`;
            await client.db.insert(schema.users).values({
              id,
              name: "Derived state test",
              email,
              emailVerified: true,
            });
            await client.db.insert(schema.profiles).values({
              id,
              email,
              full_name: "Derived state test",
              username: `derived-state-${id.slice(0, 8)}`,
              onboarding_status: "completed",
              planning_timezone: "UTC",
              is_public: false,
            });
            return id;
          };
          const seedEffect = async (
            profileId: string,
            effectiveAt: Date,
            sourceRevision: number,
            parentFinishedAt = effectiveAt,
            futureEffortRecordedAt?: Date,
          ) => {
            const activityId = randomUUID();
            const artifactId = randomUUID();
            const segmentId = randomUUID();
            const durationMs = 60_000;
            const startedAt = new Date(parentFinishedAt.getTime() - durationMs);
            const digestSeed = randomUUID().replaceAll("-", "");
            const digest = `${digestSeed}${digestSeed}`;
            await client.db.transaction(async (tx) => {
              await tx.insert(schema.activities).values({
                id: activityId,
                profile_id: profileId,
                name: "Derived state queue effect",
                started_at: startedAt,
                finished_at: parentFinishedAt,
                elapsed_ms: durationMs,
                active_ms: durationMs,
                moving_ms: durationMs,
                timing_coverage: "complete",
                segments_revision: 1,
                parser_version: "disposable-v1",
                decoded_contract_version: "disposable-v1",
                materializer_version: "disposable-v1",
                segments_generated_at: parentFinishedAt,
                created_at: parentFinishedAt,
                updated_at: parentFinishedAt,
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
                first_accepted_at: effectiveAt,
              });
              await tx.insert(schema.activityArtifactLinks).values({
                id: randomUUID(),
                activity_id: activityId,
                artifact_id: artifactId,
                profile_id: profileId,
                role: "source",
                ordinal: 0,
                is_current: true,
                linked_at: effectiveAt,
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
                segment_revision: 1,
                parser_version: "disposable-v1",
                materializer_version: "disposable-v1",
                created_at: effectiveAt,
              });
              await tx.insert(schema.activityAnalysisRevisions).values({
                activity_id: activityId,
                profile_id: profileId,
                revision: 1,
                source_segments_revision: 1,
                analysis_version: "disposable-v1",
                reason: "manual_profile_reprocess",
                performance_target_snapshot: {},
                target_fingerprint: `sha256:${"a".repeat(64)}`,
                segment_load_projection: {},
                output_fingerprint: `sha256:${"b".repeat(64)}`,
                computed_at: parentFinishedAt,
              });
              if (futureEffortRecordedAt) {
                await tx.insert(schema.activityEfforts).values({
                  id: randomUUID(),
                  created_at: parentFinishedAt,
                  profile_id: profileId,
                  activity_id: activityId,
                  segment_id: segmentId,
                  recorded_at: futureEffortRecordedAt,
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
                  source: "imported",
                  method: "disposable-v1",
                  calculation_version: "disposable-v1",
                  quality_score: 1,
                  provenance: {},
                });
              }
              await tx.insert(schema.activityTrainingEffects).values({
                profile_id: profileId,
                activity_id: activityId,
                activity_analysis_revision: 1,
                contract_version: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
                effective_at: effectiveAt,
                planning_date: effectiveAt.toISOString().slice(0, 10),
                source_revision: sourceRevision,
                calculation_version: "disposable-v1",
                input_fingerprint: "c".repeat(64),
                activity_category: "bike",
                common_load: 1,
                evidence_confidence: 1,
                capability_observation: null,
              });
            });
          };
          const request = (
            profileId: string,
            earliestAffectedAt: Date,
            requestedAt: Date,
            sourceRevision = 1,
          ) =>
            athleteRecalculationRequestSchema.parse({
              contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
              profileId,
              idempotencyKey: athleteRecalculationIdempotencyKey(profileId),
              earliestAffectedAt: earliestAffectedAt.toISOString(),
              earliestAffectedPlanningDate: earliestAffectedAt.toISOString().slice(0, 10),
              sourceRevision,
              reasons: ["activity_changed"],
              requestedAt: requestedAt.toISOString(),
            });
          const claimInput = (dueAt = now) => ({
            claimToken: randomUUID(),
            now: dueAt.toISOString(),
            claimedAt: dueAt.toISOString(),
            leaseExpiresAt: new Date(dueAt.getTime() + 60_000).toISOString(),
          });

          const futureOnlyProfileId = await seedProfile();
          await repository.coalesceRecalculationRequest({
            profileId: futureOnlyProfileId,
            request: request(futureOnlyProfileId, new Date(now.getTime() + 1), now),
          });
          await expect(repository.claimNextRecalculation(claimInput())).resolves.toBeNull();

          const futureEffortProfileId = await seedProfile();
          await seedEffect(futureEffortProfileId, now, 1, now, new Date(now.getTime() + 120_000));
          await repository.coalesceRecalculationRequest({
            profileId: futureEffortProfileId,
            request: request(futureEffortProfileId, now, now),
          });
          await expect(repository.claimNextRecalculation(claimInput())).resolves.toBeNull();

          const equalityProfileId = await seedProfile();
          await repository.coalesceRecalculationRequest({
            profileId: equalityProfileId,
            request: request(equalityProfileId, now, now),
          });
          await expect(repository.claimNextRecalculation(claimInput())).resolves.toMatchObject({
            request: { profileId: equalityProfileId, earliestAffectedAt: now.toISOString() },
          });

          const futureParentProfileId = await seedProfile();
          await seedEffect(futureParentProfileId, now, 1, new Date(now.getTime() + 120_000));
          await repository.coalesceRecalculationRequest({
            profileId: futureParentProfileId,
            request: request(futureParentProfileId, now, now),
          });
          await expect(repository.claimNextRecalculation(claimInput())).resolves.toBeNull();

          const futureProfileId = await seedProfile();
          const dueProfileId = await seedProfile();
          await repository.coalesceRecalculationRequest({
            profileId: futureProfileId,
            request: request(
              futureProfileId,
              new Date(now.getTime() + 1),
              new Date(now.getTime() - 60_000),
            ),
          });
          await repository.coalesceRecalculationRequest({
            profileId: dueProfileId,
            request: request(dueProfileId, now, now),
          });
          await expect(repository.claimNextRecalculation(claimInput())).resolves.toMatchObject({
            request: { profileId: dueProfileId },
          });

          const mixedProfileId = await seedProfile();
          const futureAt = new Date(now.getTime() + 60_000);
          await seedEffect(mixedProfileId, now, 1);
          await seedEffect(mixedProfileId, futureAt, 2);
          await repository.coalesceRecalculationRequest({
            profileId: mixedProfileId,
            request: request(mixedProfileId, now, now),
          });
          await repository.coalesceRecalculationRequest({
            profileId: mixedProfileId,
            request: request(mixedProfileId, futureAt, new Date(now.getTime() + 1), 2),
          });
          await expect(
            repository.readPendingRecalculation({ profileId: mixedProfileId }),
          ).resolves.toMatchObject({
            earliestAffectedAt: now.toISOString(),
            sourceRevision: 2,
          });
          await expect(repository.claimNextRecalculation(claimInput())).resolves.toBeNull();
          const futureClaims = [
            await repository.claimNextRecalculation(claimInput(futureAt)),
            await repository.claimNextRecalculation(claimInput(futureAt)),
            await repository.claimNextRecalculation(claimInput(futureAt)),
          ];
          expect(futureClaims.map((claim) => claim?.request.profileId)).toEqual([
            futureProfileId,
            ...[futureOnlyProfileId, mixedProfileId].sort(),
          ]);
          expect(
            futureClaims.find((claim) => claim?.request.profileId === mixedProfileId),
          ).toMatchObject({
            request: { profileId: mixedProfileId, sourceRevision: 2 },
          });

          const historicalProfileId = await seedProfile();
          const historicalNow = new Date("2020-08-10T12:00:00.000Z");
          await repository.coalesceRecalculationRequest({
            profileId: historicalProfileId,
            request: request(historicalProfileId, historicalNow, historicalNow),
          });
          const historicalClaim = await repository.claimNextRecalculation({
            claimToken: randomUUID(),
            now: historicalNow.toISOString(),
            claimedAt: historicalNow.toISOString(),
            leaseExpiresAt: new Date(historicalNow.getTime() + 300_000).toISOString(),
          });
          expect(historicalClaim?.lifecycle).toMatchObject({ state: "processing" });
          if (historicalClaim?.lifecycle.state !== "processing") {
            throw new Error("Expected database-clock lease claim");
          }
          expect(Date.parse(historicalClaim.lifecycle.leaseExpiresAt)).toBeGreaterThan(Date.now());
          await expect(
            repository.transitionRecalculation({
              profileId: historicalProfileId,
              transition: {
                action: "renew",
                claimToken: historicalClaim.lifecycle.claimToken,
                renewedAt: historicalNow.toISOString(),
                leaseExpiresAt: new Date(historicalNow.getTime() + 300_000).toISOString(),
              },
            }),
          ).resolves.toMatchObject({
            status: "updated",
            item: { lifecycle: { state: "processing" } },
          });
        } finally {
          await client.close();
        }
      },
    );
  });
});
