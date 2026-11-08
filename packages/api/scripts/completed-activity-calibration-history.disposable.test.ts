#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  applySqlFile,
  bootstrapSupabaseAuthSchema,
  requireFreshBaseline,
  withDisposableDatabase,
  withDisposableSupabaseStorage,
} from "@repo/db/testing/disposable-database";

type ActivityCategory = "bike" | "run" | "swim";
type Fixture = {
  externalId: string;
  activityCategory: ActivityCategory;
  startedAt: Date;
  finishedAt: Date;
  values: { power?: number; speed?: number };
  diagnostic?: "missing" | "short";
};

const DAY = 86_400_000;
const historyStart = Date.parse("2026-01-01T10:00:00.000Z");
const expectedLatest = { bike: 266, run: 4.5, swim: 1.5 } as const;
const expectedUnits = {
  bike: "watts",
  run: "meters_per_second",
  swim: "meters_per_second",
} as const;
const expectedMethods = {
  bike: "bike_power_30m",
  run: "run_speed_30m",
  swim: "swim_speed_15m",
} as const;

function activityFixture(
  activityCategory: ActivityCategory,
  ordinal: number,
  values: Fixture["values"],
  diagnostic?: Fixture["diagnostic"],
): Fixture {
  const exactSeconds = activityCategory === "swim" ? 900 : 1_800;
  const durationSeconds =
    diagnostic === "short" ? (activityCategory === "swim" ? 300 : 600) : exactSeconds;
  const startedAt = new Date(
    historyStart + ordinal * DAY + { bike: 0, run: 2, swim: 4 }[activityCategory] * 3_600_000,
  );
  return {
    externalId: `gate6-${activityCategory}-${ordinal}`,
    activityCategory,
    startedAt,
    finishedAt: new Date(startedAt.getTime() + durationSeconds * 1_000),
    values,
    ...(diagnostic ? { diagnostic } : {}),
  };
}

const fixtures: Fixture[] = [
  activityFixture("bike", 0, { power: 250 }),
  activityFixture("run", 0, { speed: 4 }),
  activityFixture("swim", 0, { speed: 1.3 }),
  activityFixture("bike", 1, { power: 252 }),
  activityFixture("run", 1, { speed: 4.04 }),
  activityFixture("swim", 1, { speed: 1.32 }),
  activityFixture("bike", 2, { power: 253 }),
  activityFixture("run", 2, { speed: 4.06 }),
  activityFixture("swim", 2, { speed: 1.33 }),
  activityFixture("bike", 3, { power: 280 }),
  activityFixture("run", 3, { speed: 4.5 }),
  activityFixture("swim", 3, { speed: 1.5 }),
  activityFixture("bike", 4, { power: 240 }, "short"),
  activityFixture("run", 4, {}, "missing"),
  activityFixture("swim", 4, { speed: 1.2 }, "short"),
];

function closeTo(actual: number, expected: number, message: string) {
  assert.ok(
    Math.abs(actual - expected) < 0.000_01,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

async function runProof(
  connectionString: string,
  storageConfig: { url: string; serviceRoleKey: string },
) {
  process.env.DATABASE_URL = connectionString;
  process.env.POSTGRES_URL = connectionString;
  process.env.NEXT_PRIVATE_SUPABASE_URL = storageConfig.url;
  process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY = storageConfig.serviceRoleKey;

  const [{ db, pool }, schema, drizzle, importedArtifacts, calibrations, analysis, storage] =
    await Promise.all([
      import("@repo/db/client"),
      import("@repo/db/schema"),
      import("drizzle-orm"),
      import("../src/application/activity-file-ingestion/submit-imported-activity-artifact"),
      import("../src/application/performance-model/reconcile-thresholds"),
      import("../src/application/activity-analysis/reprocess-profile-activity-analysis"),
      import("../src/storage-service"),
    ]);
  const targets = await import(
    "../src/application/performance-model/get-athlete-performance-model-as-of"
  );

  const {
    activities,
    activityAnalysisRevisions,
    activityEfforts,
    activitySourceReferences,
    integrations,
    profiles,
    thresholdEvaluationEfforts,
    thresholdEvaluations,
    thresholds,
    users,
  } = schema;
  const { and, asc, eq, inArray, sql } = drizzle;
  const { submitImportedActivityArtifact } = importedArtifacts;
  const storageClient = storage.getApiStorageService();

  async function seedProfile(label: string) {
    const profileId = randomUUID();
    const email = `${label}-${profileId}@gate6.test`;
    await db.insert(users).values({
      id: profileId,
      name: `Gate6 ${label}`,
      email,
      emailVerified: true,
    });
    await db.insert(profiles).values({
      id: profileId,
      email,
      full_name: `Gate6 ${label}`,
      username: `gate6-${profileId.slice(0, 8)}`,
      onboarding_status: "completed",
    });
    const [integration] = await db
      .insert(integrations)
      .values({ profile_id: profileId, provider: "wahoo", external_id: `gate6-${label}` })
      .returning({ id: integrations.id });
    assert.ok(integration, "import source integration was not created");
    return { profileId, integrationId: integration.id };
  }

  function recordsFor(input: Fixture) {
    const durationSeconds = Math.round(
      (input.finishedAt.getTime() - input.startedAt.getTime()) / 1_000,
    );
    return Array.from({ length: durationSeconds + 1 }, (_, second) => ({
      sessionMessageIndex: 0,
      lapMessageIndex: 0,
      timestamp: new Date(input.startedAt.getTime() + second * 1_000),
      distance:
        second *
        (input.activityCategory === "bike"
          ? 8
          : input.values.speed === undefined
            ? 0
            : input.values.speed),
      ...(input.values.power === undefined ? {} : { power: input.values.power }),
      ...(input.values.speed === undefined ? {} : { speed: input.values.speed }),
      ...(input.activityCategory === "run" ? { altitude: 100 } : {}),
      ...(input.activityCategory === "swim"
        ? {
            positionLat: 40 + second / 1_000_000,
            positionLong: -105 - second / 1_000_000,
          }
        : {}),
    }));
  }

  function buildImport(input: Fixture, owner: Awaited<ReturnType<typeof seedProfile>>) {
    const elapsedSeconds = (input.finishedAt.getTime() - input.startedAt.getTime()) / 1_000;
    const distanceMeters =
      input.activityCategory === "bike"
        ? elapsedSeconds * 8
        : Math.round(elapsedSeconds * (input.values.speed ?? 0));
    const records = recordsFor(input);
    const lap = {
      messageIndex: 0,
      sessionMessageIndex: 0,
      startTime: input.startedAt,
      totalTime: elapsedSeconds,
      totalDistance: distanceMeters,
      ...(input.values.speed === undefined ? {} : { avgSpeed: input.values.speed }),
      ...(input.values.power === undefined ? {} : { avgPower: input.values.power }),
    };
    const rawSport = { bike: "cycling", run: "running", swim: "swimming" }[input.activityCategory];
    const parsedActivity = {
      metadata: {
        activityId: input.externalId,
        name: `Gate6 ${input.externalId}`,
        startTime: input.startedAt,
        type: rawSport,
        manufacturer: "GradientPeak fixture",
        product: "Disposable Storage E2E",
      },
      summary: {
        totalTime: elapsedSeconds,
        totalDistance: distanceMeters,
        ...(input.values.speed === undefined ? {} : { avgSpeed: input.values.speed }),
        ...(input.values.power === undefined ? {} : { avgPower: input.values.power }),
      },
      records,
      laps: [lap],
      sessions: [
        {
          messageIndex: 0,
          rawSport,
          startTime: input.startedAt,
          endTime: input.finishedAt,
          totalElapsedTime: elapsedSeconds,
          totalTimerTime: elapsedSeconds,
          totalMovingTime: elapsedSeconds,
          totalDistance: distanceMeters,
          ...(input.values.speed === undefined ? {} : { avgSpeed: input.values.speed }),
          laps: [lap],
          records,
        },
      ],
      segments: [
        {
          sessionMessageIndex: 0,
          role: "activity" as const,
          activity_category: input.activityCategory,
          rawSport,
          startTime: input.startedAt,
          endTime: input.finishedAt,
        },
      ],
    };
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        contract: "gate6-disposable-standard-activity-v1",
        externalId: input.externalId,
        finishedAt: input.finishedAt.toISOString(),
        activityCategory: input.activityCategory,
        startedAt: input.startedAt.toISOString(),
        values: input.values,
      }),
    );
    const activityFilePath = `activities/${owner.profileId}/providers/wahoo/${input.externalId}.fit`;
    return {
      bytes,
      parsedActivity,
      activity: {
        activityFilePath,
        activityFileSize: bytes.byteLength,
        activityPlanId: null,
        avgCadence: null,
        avgHeartRate: null,
        avgPower: input.values.power ?? null,
        avgSpeedMps: input.values.speed ?? null,
        calories: null,
        distanceMeters,
        durationSeconds: elapsedSeconds,
        elevationGainMeters: null,
        externalId: input.externalId,
        finishedAt: input.finishedAt.toISOString(),
        integrationId: owner.integrationId,
        integrationGeneration: 1,
        contentVisibility: "private" as const,
        providerActiveDurationSeconds: elapsedSeconds,
        name: `Gate6 ${input.externalId}`,
        normalizedPower: null,
        polyline: null,
        profileId: owner.profileId,
        provider: "wahoo" as const,
        providerUpdatedAt: input.finishedAt.toISOString(),
        startedAt: input.startedAt.toISOString(),
        type: rawSport,
      },
    };
  }

  async function importHistory(
    owner: Awaited<ReturnType<typeof seedProfile>>,
    order: readonly Fixture[],
  ) {
    for (const item of order) {
      const built = buildImport(item, owner);
      const uploaded = await storageClient.storage
        .from("activity-files")
        .upload(built.activity.activityFilePath, built.bytes, {
          contentType: "application/vnd.ant.fit",
          upsert: false,
        });
      assert.equal(uploaded.error, null, `staging upload failed for ${item.externalId}`);
      const result = await submitImportedActivityArtifact(db, {
        activity: built.activity,
        parsedActivity: built.parsedActivity,
        artifactSha256: createHash("sha256").update(built.bytes).digest("hex"),
        deferAthleteStateRefresh: true,
        deferPerformanceCalibration: true,
      });
      assert.ok(result.id);
    }
  }

  async function finalize(owner: Awaited<ReturnType<typeof seedProfile>>) {
    return db.transaction(async (tx) => {
      return calibrations.finalizeThresholdsAfterHistoryImport(tx, {
        profileId: owner.profileId,
        asOf: new Date("2026-02-01T00:00:00.000Z"),
        now: new Date("2026-02-01T00:00:00.000Z"),
      });
    });
  }

  async function counts(profileId: string) {
    const result = await db.execute(sql`
      select
        (select count(*)::integer from activities where profile_id = ${profileId}::uuid) activities,
        (select count(*)::integer from activity_artifacts where profile_id = ${profileId}::uuid) artifacts,
        (select count(*)::integer from activity_efforts where profile_id = ${profileId}::uuid) efforts,
        (select count(*)::integer from activity_file_ingestions where profile_id = ${profileId}::uuid) ingestions,
        (select count(*)::integer from threshold_evaluations where profile_id = ${profileId}::uuid) evaluations,
        (select count(*)::integer from threshold_evaluation_efforts where profile_id = ${profileId}::uuid) evaluation_links,
        (select count(*)::integer from thresholds where profile_id = ${profileId}::uuid) thresholds,
        (select count(*)::integer from activity_analysis_revisions where profile_id = ${profileId}::uuid) revisions,
        (select count(*)::integer from storage.objects
          where bucket_id = 'activity-files' and name like ${`artifacts/sha256/${profileId}/%`}) storage_objects,
        (select count(*)::integer from storage.objects
          where bucket_id = 'activity-files' and name like ${`activities/${profileId}/providers/wahoo/%`}) staging_objects
    `);
    const row = result.rows[0];
    return {
      activities: Number(row?.activities),
      artifacts: Number(row?.artifacts),
      efforts: Number(row?.efforts),
      ingestions: Number(row?.ingestions),
      evaluations: Number(row?.evaluations),
      evaluationLinks: Number(row?.evaluation_links),
      thresholds: Number(row?.thresholds),
      revisions: Number(row?.revisions),
      storageObjects: Number(row?.storage_objects),
      stagingObjects: Number(row?.staging_objects),
    };
  }

  async function semanticHistory(profileId: string) {
    const rows = await db
      .select({
        activityCategory: thresholds.activity_category,
        value: thresholds.value,
        effectiveAt: thresholds.effective_at,
        method: thresholds.method,
        supersedesId: thresholds.supersedes_id,
        evaluationId: thresholds.evaluation_id,
        sourceExternalId: activitySourceReferences.provider_external_id,
      })
      .from(thresholds)
      .innerJoin(thresholdEvaluations, eq(thresholdEvaluations.id, thresholds.evaluation_id))
      .innerJoin(
        activitySourceReferences,
        eq(activitySourceReferences.activity_id, thresholdEvaluations.source_activity_id),
      )
      .where(eq(thresholds.profile_id, profileId))
      .orderBy(asc(thresholds.activity_category), asc(thresholds.effective_at));
    const evaluationIds = rows.map(({ evaluationId }) => evaluationId);
    const links = await db
      .select({
        evaluationId: thresholdEvaluationEfforts.evaluation_id,
        externalId: activitySourceReferences.provider_external_id,
        role: thresholdEvaluationEfforts.role,
        ordinal: thresholdEvaluationEfforts.ordinal,
        sourceSeries: thresholdEvaluationEfforts.source_series,
        durationSeconds: activityEfforts.duration_seconds,
      })
      .from(thresholdEvaluationEfforts)
      .innerJoin(activityEfforts, eq(activityEfforts.id, thresholdEvaluationEfforts.effort_id))
      .innerJoin(
        activitySourceReferences,
        eq(activitySourceReferences.activity_id, thresholdEvaluationEfforts.activity_id),
      )
      .where(inArray(thresholdEvaluationEfforts.evaluation_id, evaluationIds))
      .orderBy(
        asc(thresholdEvaluationEfforts.evaluation_id),
        asc(thresholdEvaluationEfforts.role),
        asc(thresholdEvaluationEfforts.ordinal),
      );
    return rows.map((row, index) => ({
      activityCategory: row.activityCategory,
      value: row.value,
      effectiveAt: row.effectiveAt.toISOString(),
      method: row.method,
      hasPredecessor: row.supersedesId !== null,
      sourceExternalId: row.sourceExternalId,
      links: links
        .filter(({ evaluationId }) => evaluationId === row.evaluationId)
        .map(({ evaluationId: _evaluationId, ...link }) => link),
      ordinal: index,
    }));
  }

  async function assertProvenance(profileId: string) {
    const history = await semanticHistory(profileId);
    for (const activityCategory of ["bike", "run", "swim"] as const) {
      const chain = history.filter((entry) => entry.activityCategory === activityCategory);
      assert.equal(
        chain.length,
        3,
        `${activityCategory} must publish provisional, confirmation, and update`,
      );
      assert.deepEqual(
        chain.map(({ hasPredecessor }) => hasPredecessor),
        [false, true, true],
      );
      assert.deepEqual(
        chain.map(({ links }) => links.length),
        [1, 2, 1],
        `${activityCategory} threshold provenance must retain primary/supporting effort links`,
      );
      for (const threshold of chain) {
        assert.equal(threshold.method, expectedMethods[activityCategory]);
        assert.equal(
          threshold.links.find(({ role }) => role === "primary")?.externalId,
          threshold.sourceExternalId,
          `${activityCategory} threshold must cite its source evaluation activity through the primary effort`,
        );
        for (const link of threshold.links) {
          assert.equal(link.durationSeconds, activityCategory === "swim" ? 900 : 1_800);
          assert.equal(
            link.sourceSeries,
            activityCategory === "bike"
              ? "power"
              : activityCategory === "run"
                ? "grade_adjusted_speed"
                : "swim_speed",
          );
          assert.match(link.externalId, new RegExp(`^gate6-${activityCategory}-`));
        }
      }
      closeTo(
        chain.at(-1)?.value ?? 0,
        expectedLatest[activityCategory],
        `${activityCategory} latest threshold`,
      );
    }

    const diagnostics = await db
      .select({
        externalId: activitySourceReferences.provider_external_id,
        outcome: thresholdEvaluations.outcome,
        reason: thresholdEvaluations.rejection_reason,
        evaluationId: thresholdEvaluations.id,
      })
      .from(thresholdEvaluations)
      .innerJoin(
        activitySourceReferences,
        eq(activitySourceReferences.activity_id, thresholdEvaluations.source_activity_id),
      )
      .where(
        and(
          eq(thresholdEvaluations.profile_id, profileId),
          eq(thresholdEvaluations.outcome, "rejected"),
        ),
      )
      .orderBy(asc(activitySourceReferences.provider_external_id));
    assert.deepEqual(
      diagnostics.map(({ externalId, reason }) => ({ externalId, reason })),
      [
        { externalId: "gate6-bike-4", reason: "exact_window_incomplete" },
        { externalId: "gate6-run-4", reason: "exact_window_incomplete" },
        { externalId: "gate6-swim-4", reason: "exact_window_incomplete" },
      ],
    );
    const rejectedLinks = await db
      .select({ id: thresholdEvaluationEfforts.evaluation_id })
      .from(thresholdEvaluationEfforts)
      .where(
        inArray(
          thresholdEvaluationEfforts.evaluation_id,
          diagnostics.map(({ evaluationId }) => evaluationId),
        ),
      );
    assert.equal(
      rejectedLinks.length,
      0,
      "rejected missing windows must not synthesize effort links",
    );
    const diagnosticActivityIds = await db
      .select({ id: activities.id })
      .from(activities)
      .innerJoin(activitySourceReferences, eq(activitySourceReferences.activity_id, activities.id))
      .where(
        inArray(
          activitySourceReferences.provider_external_id,
          diagnostics.map(({ externalId }) => externalId),
        ),
      );
    const syntheticExactEfforts = await db
      .select({ id: activityEfforts.id })
      .from(activityEfforts)
      .where(
        and(
          inArray(
            activityEfforts.activity_id,
            diagnosticActivityIds.map(({ id }) => id),
          ),
          inArray(activityEfforts.duration_seconds, [900, 1_800]),
        ),
      );
    assert.equal(
      syntheticExactEfforts.length,
      0,
      "short/missing activities must not gain exact efforts",
    );
  }

  async function assertNativeFacts(profileId: string) {
    const facts = await targets.getAthleteThresholdTargetFactsAsOf(
      { athleteId: profileId, asOf: new Date("2026-01-20T00:00:00.000Z") },
      db,
    );
    for (const activityCategory of ["bike", "run", "swim"] as const) {
      const fact = facts.thresholds[activityCategory];
      assert.equal(fact.status, "available");
      if (fact.status !== "available") continue;
      closeTo(
        fact.value,
        expectedLatest[activityCategory],
        `${activityCategory} native target fact`,
      );
      assert.equal(fact.unit, expectedUnits[activityCategory]);
      assert.equal(fact.method, expectedMethods[activityCategory]);
      assert.equal(fact.state, "confirmed");
      assert.ok(fact.thresholdId);
      assert.ok(fact.evaluationId);
    }
  }

  async function assertHistoricalAnalysis(profileId: string) {
    const result = await analysis.reprocessProfileActivityAnalysis(db, {
      profileId,
      apply: true,
      confirmProfileId: profileId,
      now: new Date("2026-02-02T00:00:00.000Z"),
    });
    assert.equal(result.scopedActivities, fixtures.length);
    assert.equal(result.appendedRevisions, fixtures.length);
    const probes = await db
      .select({
        externalId: activitySourceReferences.provider_external_id,
        snapshot: activityAnalysisRevisions.performance_target_snapshot,
      })
      .from(activityAnalysisRevisions)
      .innerJoin(activities, eq(activities.id, activityAnalysisRevisions.activity_id))
      .innerJoin(activitySourceReferences, eq(activitySourceReferences.activity_id, activities.id))
      .where(
        and(
          eq(activityAnalysisRevisions.profile_id, profileId),
          inArray(activitySourceReferences.provider_external_id, [
            "gate6-bike-4",
            "gate6-run-4",
            "gate6-swim-4",
          ]),
        ),
      );
    assert.equal(probes.length, 3);
    for (const probe of probes) {
      const activityCategory = probe.externalId.split("-")[1] as ActivityCategory;
      const snapshot = probe.snapshot as {
        thresholds: Record<ActivityCategory, { status: string; value?: number; unit?: string }>;
      };
      const fact = snapshot.thresholds[activityCategory];
      assert.equal(fact.status, "available");
      closeTo(
        fact.value ?? 0,
        expectedLatest[activityCategory],
        `${activityCategory} completed analysis target`,
      );
      assert.equal(fact.unit, expectedUnits[activityCategory]);
    }
  }

  try {
    const chronological = await seedProfile("chronological");
    await importHistory(chronological, fixtures);
    assert.equal((await finalize(chronological)).changed, true);
    await assertProvenance(chronological.profileId);
    await assertNativeFacts(chronological.profileId);
    await assertHistoricalAnalysis(chronological.profileId);
    const firstCounts = await counts(chronological.profileId);
    assert.deepEqual(firstCounts, {
      activities: 15,
      artifacts: 15,
      efforts: 135,
      ingestions: 15,
      evaluations: 15,
      evaluationLinks: 15,
      thresholds: 9,
      revisions: 15,
      storageObjects: 15,
      stagingObjects: 0,
    });
    const firstOutput = await semanticHistory(chronological.profileId);

    await importHistory(chronological, fixtures);
    assert.equal((await finalize(chronological)).changed, false);
    const replayAnalysis = await analysis.reprocessProfileActivityAnalysis(db, {
      profileId: chronological.profileId,
      apply: true,
      confirmProfileId: chronological.profileId,
      now: new Date("2026-02-03T00:00:00.000Z"),
    });
    assert.equal(replayAnalysis.appendedRevisions, 0);
    assert.deepEqual(await counts(chronological.profileId), firstCounts);
    assert.deepEqual(await semanticHistory(chronological.profileId), firstOutput);

    const reordered = await seedProfile("reordered");
    const reorderedPages = [
      ...fixtures.slice(9, 12),
      ...fixtures.slice(0, 3),
      ...fixtures.slice(12),
      ...fixtures.slice(6, 9),
      ...fixtures.slice(3, 6),
    ];
    await importHistory(reordered, reorderedPages);
    assert.equal((await finalize(reordered)).changed, true);
    await assertProvenance(reordered.profileId);
    await assertNativeFacts(reordered.profileId);
    assert.deepEqual(await semanticHistory(reordered.profileId), firstOutput);

    const finalCounts = await counts(chronological.profileId);
    console.log(
      `[api:calibration-history:disposable] baseline=${requireFreshBaseline().filename} activities=${finalCounts.activities} artifacts=${finalCounts.artifacts} storage=${finalCounts.storageObjects} staging=${finalCounts.stagingObjects} efforts=${finalCounts.efforts} ingestions=${finalCounts.ingestions} evaluations=${finalCounts.evaluations} links=${finalCounts.evaluationLinks} thresholds=${finalCounts.thresholds} revisions=${finalCounts.revisions}`,
    );
    console.log(
      "[api:calibration-history:disposable] exact provenance, rejected diagnostics, replay idempotence, page-order invariance, historical analysis, and native target facts passed",
    );
  } finally {
    await pool.end();
  }
}

await withDisposableDatabase(
  process.argv.slice(2),
  "calibration_history",
  async (target, connectionString) => {
    await bootstrapSupabaseAuthSchema(target);
    await withDisposableSupabaseStorage(target, connectionString, async (storage) => {
      await applySqlFile(target, requireFreshBaseline().sourcePath);
      await runProof(connectionString, storage);
    });
  },
);
