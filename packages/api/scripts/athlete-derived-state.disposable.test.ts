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
  "athlete_derived_state",
  async (target, connectionString) => {
    await bootstrapSupabaseAuthSchema(target);
    await withDisposableSupabaseStorage(target, connectionString, async () => {
      await applySqlFile(target, requireFreshBaseline().sourcePath);
      process.env.DATABASE_URL = connectionString;
      process.env.POSTGRES_URL = connectionString;

      const [{ db, pool }, schema, services, workerModule, drizzle] = await Promise.all([
        import("@repo/db/client"),
        import("@repo/db/schema"),
        import("../src/application/athlete-intelligence/record-activity-training-effect"),
        import("../src/application/athlete-intelligence/athlete-state-worker"),
        import("drizzle-orm"),
      ]);
      const repositoryModule = await import(
        "../src/infrastructure/repositories/drizzle-athlete-derived-state-repository"
      );
      const requestModule = await import(
        "../src/application/athlete-intelligence/request-athlete-recalculation"
      );
      const readModule = await import(
        "../src/application/athlete-intelligence/read-published-athlete-load"
      );
      const thresholdModule = await import(
        "../src/application/athlete-intelligence/replace-threshold-evidence"
      );
      const activeThresholdModule = await import(
        "../src/application/athlete-intelligence/read-active-threshold-evidence"
      );
      const core = await import("@repo/core/athlete-derived-state");
      const { eq, sql } = drizzle;
      const { activities, activityAnalysisRevisions, profiles, users } = schema;
      const profileId = randomUUID();
      const otherProfileId = randomUUID();
      const activityId = randomUUID();
      try {
        for (const [id, label] of [
          [profileId, "Athlete derived owner"],
          [otherProfileId, "Other athlete"],
        ] as const) {
          await db.insert(users).values({
            id,
            name: label,
            email: `${id}@athlete-derived.test`,
            emailVerified: true,
          });
          await db.insert(profiles).values({
            id,
            email: `${id}@athlete-derived.test`,
            full_name: label,
            username: `derived-${id.slice(0, 8)}`,
            onboarding_status: "completed",
            planning_timezone: "UTC",
            is_public: false,
          });
        }
        await db.transaction(async (tx) => {
          await tx.execute(sql`set local session_replication_role = replica`);
          await tx.insert(activities).values({
            id: activityId,
            profile_id: profileId,
            name: "Revisioned ride",
            started_at: new Date("2026-08-10T11:00:00.000Z"),
            finished_at: new Date("2026-08-10T12:00:00.000Z"),
            elapsed_ms: 3_600_000,
            segments_revision: 1,
            parser_version: "disposable-v1",
            decoded_contract_version: "disposable-v1",
            materializer_version: "disposable-v1",
          });
        });
        const insertAnalysisRevision = async (revision: number) => {
          await db.insert(activityAnalysisRevisions).values({
            activity_id: activityId,
            profile_id: profileId,
            revision,
            source_segments_revision: 1,
            analysis_version: "manual-profile-activity-analysis-v1",
            reason: "manual_profile_reprocess",
            performance_target_snapshot: {},
            target_fingerprint: `sha256:${String(revision).padStart(64, "a").slice(-64)}`,
            segment_load_projection: {},
            output_fingerprint: `sha256:${String(revision).padStart(64, "b").slice(-64)}`,
            computed_at: new Date("2026-08-10T12:00:00.000Z"),
          });
        };
        await insertAnalysisRevision(1);
        const repository = repositoryModule.createDrizzleAthleteDerivedStateRepository(db);
        const effect = (revision: number, sourceRevision: number, effectiveAt: string) => ({
          contractVersion: core.ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
          profileId,
          activityId,
          activityAnalysisRevision: revision,
          effectiveAt,
          planningDate: effectiveAt.slice(0, 10),
          sourceRevision,
          calculationVersion: "effect-v1",
          inputFingerprint: String(revision).padStart(64, "c").slice(-64),
          stimulus: {
            kind: "observed" as const,
            sourceId: activityId,
            occurredAt: effectiveAt,
            activityCategory: "bike" as const,
            commonLoad: revision === 1 ? 50 : 40,
            evidenceConfidence: 0.9,
            capabilityObservation: null,
          },
        });
        const latestRequest = {
          profileId,
          expectedPublishedRevision: 0,
          targetSourceRevision: 1,
          effect: effect(1, 1, "2026-08-10T12:00:00.000Z"),
        };
        assert.equal(
          (await services.recordActivityTrainingEffect({ repository, request: latestRequest }))
            .status,
          "applied",
        );
        assert.equal(
          (await services.recordActivityTrainingEffect({ repository, request: latestRequest }))
            .status,
          "applied",
        );

        await insertAnalysisRevision(2);
        const older = await services.recordActivityTrainingEffect({
          repository,
          request: {
            profileId,
            expectedPublishedRevision: 1,
            targetSourceRevision: 2,
            effect: effect(2, 2, "2026-08-05T12:00:00.000Z"),
          },
        });
        assert.equal(older.status, "rebuild_requested");
        await requestModule.requestAthleteRecalculation({
          repository,
          profileId,
          request: requestModule.buildAthleteRecalculationRequest({
            profileId,
            earliestAffectedAt: "2026-08-04T12:00:00.000Z",
            earliestAffectedPlanningDate: "2026-08-04",
            sourceRevision: 3,
            reasons: ["threshold_changed"],
            requestedAt: "2026-08-11T00:00:00.000Z",
          }),
        });
        const pending = await repository.readPendingRecalculation({ profileId });
        assert.equal(pending?.earliestAffectedAt, "2026-08-04T12:00:00.000Z");
        assert.equal(pending?.sourceRevision, 3);
        assert.deepEqual(pending?.reasons, ["analysis_replaced", "threshold_changed"]);

        const publicationState = {
          computedAt: "2026-08-10T12:00:00.000Z",
          fitness: 1,
          fatigue: 1,
          evidenceConfidence: 0.9,
          coverageStartAt: "2026-08-05T12:00:00.000Z",
          coverageEndAt: "2026-08-10T12:00:00.000Z",
          lastActivityAt: "2026-08-10T12:00:00.000Z",
          calculationVersion: "athlete-state-projection-v1",
          capabilities: [],
        };
        assert.equal(
          (
            await repository.publishDailyTrainingLoad({
              profileId,
              fromPlanningDate: "2026-08-04",
              expectedPublishedRevision: 0,
              targetPublishedRevision: 3,
              claimToken: randomUUID(),
              days: [],
              state: publicationState,
            })
          ).status,
          "stale_revision",
        );
        assert.equal(
          (
            await repository.publishDailyTrainingLoad({
              profileId,
              fromPlanningDate: "2026-08-04",
              expectedPublishedRevision: 1,
              targetPublishedRevision: 3,
              claimToken: randomUUID(),
              days: [],
              state: publicationState,
            })
          ).status,
          "lease_lost",
        );

        const worker = new workerModule.AthleteDerivedStateWorkerService({ db });
        assert.deepEqual(await worker.processDueJobs({ limit: 1 }), {
          completed: 1,
          failed: 0,
          processed: 1,
        });
        const published = await readModule.readPublishedAthleteLoad({
          repository,
          profileId,
          startDate: "2026-08-01",
          endDate: "2026-08-31",
        });
        assert.equal(published.publishedRevision, 3);
        assert.ok(published.days.every((day) => day.sourceRevision === 3));
        assert.equal(published.days.length, 1);
        assert.equal(published.days[0]?.commonLoad, 40);

        const thresholdRecord = {
          contractVersion: core.ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
          profileId,
          calculationVersion: "threshold-v1",
          confidence: 1,
          evidence: {
            evidenceId: randomUUID(),
            activityId,
            activityCategory: "bike" as const,
            metric: "power" as const,
            unit: "watts" as const,
            method: "bike_power_30m" as const,
            value: 280,
            sourceSeriesId: "power-primary",
            sourceSeriesMetric: "power" as const,
            startTimestampSeconds: 0,
            endTimestampSeconds: 1800,
            exactWindowSeconds: 1800,
            conversionFactor: 1,
            policyVersion: "threshold-policy-v1" as const,
            plausibilityVersion: "threshold-plausibility-v1" as const,
            observedAt: "2026-08-10T12:00:00.000Z",
          },
          lifecycle: { status: "active" as const, invalidatedAt: null },
        };
        await thresholdModule.replaceThresholdEvidence({
          repository,
          profileId,
          activityId,
          evidence: [thresholdRecord],
        });
        await assert.rejects(
          thresholdModule.replaceThresholdEvidence({
            repository,
            profileId: otherProfileId,
            activityId,
            evidence: [{ ...thresholdRecord, profileId: otherProfileId }],
          }),
        );
        assert.equal(
          (
            await activeThresholdModule.readActiveThresholdEvidence({
              repository,
              profileId,
              fromObservedAt: "2026-01-01T00:00:00.000Z",
              limit: 10,
            })
          ).items.length,
          1,
        );

        await db.transaction(async (tx) => {
          const transactional = repositoryModule.createDrizzleAthleteDerivedStateRepository(tx);
          await thresholdModule.deleteThresholdEvidence({
            repository: transactional,
            profileId,
            activityId,
          });
          await tx.delete(activities).where(eq(activities.id, activityId));
          await requestModule.requestAthleteRecalculation({
            repository: transactional,
            profileId,
            request: requestModule.buildAthleteRecalculationRequest({
              profileId,
              earliestAffectedAt: "2026-08-05T12:00:00.000Z",
              earliestAffectedPlanningDate: "2026-08-05",
              sourceRevision: 4,
              reasons: ["activity_deleted"],
              requestedAt: "2026-08-12T00:00:00.000Z",
            }),
          });
        });
        assert.equal(
          (
            await activeThresholdModule.readActiveThresholdEvidence({
              repository,
              profileId,
              fromObservedAt: "2026-01-01T00:00:00.000Z",
              limit: 10,
            })
          ).items.length,
          0,
        );
        assert.equal((await repository.readPendingRecalculation({ profileId }))?.sourceRevision, 4);
        console.log("[api:athlete-derived-state:disposable] passed");
      } finally {
        await pool.end();
      }
    });
  },
);
