import { randomUUID } from "node:crypto";

import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activitySegments,
  profileAthleteState,
  profileGoals,
  profiles,
  thresholdEvaluationEfforts,
  thresholdEvaluations,
  thresholds,
  users,
} from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const historyCoordination = vi.hoisted(() => ({
  waitBeforeQuery: null as null | (() => Promise<void>),
}));

vi.mock("../../repositories/threshold-overview-repository", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../repositories/threshold-overview-repository")>();
  return {
    ...actual,
    readPublishedThresholdHistory: async (
      ...args: Parameters<typeof actual.readPublishedThresholdHistory>
    ) => {
      await historyCoordination.waitBeforeQuery?.();
      return actual.readPublishedThresholdHistory(...args);
    },
  };
});

import { readGoalProgress } from "./read-goal-progress";
import { readThresholdOverview } from "./read-threshold-overview";

const seededProfileIds: string[] = [];
const NOW = new Date("2026-08-10T12:00:00.000Z");

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function pauseAfterSnapshotMetadata() {
  const metadataRead = deferred();
  const continueRead = deferred();
  let paused = false;
  const root = {
    $client: {},
    transaction: (
      read: (executor: unknown) => Promise<unknown>,
      options: { accessMode: "read only"; isolationLevel: "repeatable read" },
    ) =>
      db.transaction(async (tx) => {
        const executor = new Proxy(tx, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            if (property === "execute") {
              return async (...args: unknown[]) => {
                const result = await (value as (...queryArgs: unknown[]) => Promise<unknown>).apply(
                  target,
                  args,
                );
                if (!paused) {
                  paused = true;
                  metadataRead.resolve();
                  await continueRead.promise;
                }
                return result;
              };
            }
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return read(executor);
      }, options),
  } as never;
  return { root, metadataRead: metadataRead.promise, continueRead: continueRead.resolve };
}

async function seedEvidence() {
  const profileId = randomUUID();
  const goalId = randomUUID();
  const oldThresholdId = randomUUID();
  const newThresholdId = randomUUID();
  const email = `${profileId}@evidence-snapshot-coherence.test`;
  const oldEvidence = {
    activityId: randomUUID(),
    artifactId: randomUUID(),
    segmentId: randomUUID(),
    effortId: randomUUID(),
    evaluationId: randomUUID(),
    thresholdId: oldThresholdId,
    value: 240,
    effectiveAt: new Date("2026-08-01T12:00:00.000Z"),
  };
  const newEvidence = {
    activityId: randomUUID(),
    artifactId: randomUUID(),
    segmentId: randomUUID(),
    effortId: randomUUID(),
    evaluationId: randomUUID(),
    thresholdId: newThresholdId,
    value: 260,
    effectiveAt: new Date("2026-08-09T12:00:00.000Z"),
  };
  seededProfileIds.push(profileId);

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: profileId,
      name: "Evidence snapshot coherence",
      email,
      emailVerified: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await tx.insert(profiles).values({
      id: profileId,
      email,
      planning_timezone: "UTC",
      created_at: NOW,
      updated_at: NOW,
    });
    await tx.insert(profileAthleteState).values({
      profile_id: profileId,
      source_revision: 1,
      published_revision: 1,
      fitness: 42,
      fatigue: 36,
      evidence_confidence: 0.8,
      coverage_start_at: oldEvidence.effectiveAt,
      coverage_end_at: oldEvidence.effectiveAt,
      last_activity_at: oldEvidence.effectiveAt,
      algorithm_version: "athlete-state-projection-v1",
      computed_at: NOW,
      updated_at: NOW,
    });
    await tx.insert(profileGoals).values({
      id: goalId,
      profile_id: profileId,
      title: "Raise FTP",
      priority: 5,
      activity_category: "bike",
      target_date: "2026-10-01",
      target_payload: {
        type: "threshold",
        metric: "power",
        activity_category: "bike",
        value: 280,
      },
      created_at: NOW,
      updated_at: NOW,
    });

    for (const evidence of [oldEvidence, newEvidence]) {
      const startedAt = new Date(evidence.effectiveAt.getTime() - 1_800_000);
      const digest = randomUUID().replaceAll("-", "").repeat(2);
      await tx.insert(activities).values({
        id: evidence.activityId,
        profile_id: profileId,
        name: `${evidence.value} W threshold ride`,
        started_at: startedAt,
        finished_at: evidence.effectiveAt,
        elapsed_ms: 1_800_000,
        active_ms: 1_800_000,
        moving_ms: 1_800_000,
        timing_coverage: "complete",
        segments_revision: 1,
        parser_version: "evidence-snapshot-coherence-v1",
        decoded_contract_version: "evidence-snapshot-coherence-v1",
        materializer_version: "evidence-snapshot-coherence-v1",
        segments_generated_at: NOW,
        created_at: NOW,
        updated_at: NOW,
      });
      await tx.insert(activityArtifacts).values({
        id: evidence.artifactId,
        profile_id: profileId,
        digest_algorithm: "sha256",
        digest,
        byte_size: 1_024,
        bucket: "activity-files",
        path: `artifacts/sha256/${profileId}/${digest}`,
        media_type: "application/vnd.ant.fit",
        format: "fit",
        availability: "accepted",
        first_accepted_at: NOW,
      });
      await tx.insert(activityArtifactLinks).values({
        id: randomUUID(),
        activity_id: evidence.activityId,
        artifact_id: evidence.artifactId,
        profile_id: profileId,
        role: "source",
        ordinal: 0,
        is_current: true,
        linked_at: NOW,
      });
      await tx.insert(activitySegments).values({
        id: evidence.segmentId,
        activity_id: evidence.activityId,
        profile_id: profileId,
        ordinal: 0,
        role: "activity",
        activity_category: "bike",
        start_offset_ms: 0,
        end_offset_ms: 1_800_000,
        source_artifact_id: evidence.artifactId,
        source_session_index: 0,
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 1_800_000, movingMs: 1_800_000 },
        },
        summary_version: 1,
        timing_coverage: "complete",
        active_ms: 1_800_000,
        moving_ms: 1_800_000,
        segment_revision: 1,
        parser_version: "evidence-snapshot-coherence-v1",
        materializer_version: "evidence-snapshot-coherence-v1",
        created_at: NOW,
      });
      await tx.insert(activityEfforts).values({
        id: evidence.effortId,
        created_at: NOW,
        profile_id: profileId,
        activity_id: evidence.activityId,
        segment_id: evidence.segmentId,
        recorded_at: evidence.effectiveAt,
        activity_category: "bike",
        effort_type: "power",
        source_series: "power",
        duration_seconds: 1_800,
        source_artifact_id: evidence.artifactId,
        source_revision: 1,
        start_offset_ms: 0,
        end_offset_ms: 1_800_000,
        window_coverage: 1,
        max_gap_seconds: 2,
        unit: "watts",
        value: evidence.value,
        source: "imported",
        method: "activity_file_best_effort",
        calculation_version: "best-effort-extraction-v1",
        provenance: { fixture: "evidence-snapshot-coherence" },
      });
      await tx.insert(thresholdEvaluations).values({
        id: evidence.evaluationId,
        profile_id: profileId,
        activity_category: "bike",
        metric: "power",
        method: "bike_power_30m",
        outcome: "qualified",
        value: evidence.value,
        unit: "watts",
        confidence: 0.9,
        observed_at: evidence.effectiveAt,
        rejection_reason: null,
        policy_version: "threshold-policy-v1",
        diagnostics: { fixture: "evidence-snapshot-coherence" },
        source_activity_id: evidence.activityId,
        source_revision: 1,
        created_at: NOW,
      });
      await tx.insert(thresholdEvaluationEfforts).values({
        evaluation_id: evidence.evaluationId,
        effort_id: evidence.effortId,
        profile_id: profileId,
        activity_category: "bike",
        activity_id: evidence.activityId,
        source_revision: 1,
        metric: "power",
        effort_type: "power",
        source_series: "power",
        role: "primary",
        ordinal: 0,
      });
    }
    await tx.insert(thresholds).values({
      id: oldEvidence.thresholdId,
      profile_id: profileId,
      activity_category: "bike",
      metric: "power",
      evaluation_id: oldEvidence.evaluationId,
      evaluation_outcome: "qualified",
      value: oldEvidence.value,
      unit: "watts",
      confidence: 0.9,
      method: "bike_power_30m",
      effective_at: oldEvidence.effectiveAt,
      policy_version: "threshold-policy-v1",
      created_at: NOW,
    });
  });
  return { profileId, goalId, oldEvidence, newEvidence };
}

async function publishReplacement(input: Awaited<ReturnType<typeof seedEvidence>>) {
  await db.transaction(async (tx) => {
    await tx.delete(thresholds).where(eq(thresholds.id, input.oldEvidence.thresholdId));
    await tx.insert(thresholds).values({
      id: input.newEvidence.thresholdId,
      profile_id: input.profileId,
      activity_category: "bike",
      metric: "power",
      evaluation_id: input.newEvidence.evaluationId,
      evaluation_outcome: "qualified",
      value: input.newEvidence.value,
      unit: "watts",
      confidence: 0.9,
      method: "bike_power_30m",
      effective_at: input.newEvidence.effectiveAt,
      policy_version: "threshold-policy-v1",
      created_at: NOW,
    });
    await tx
      .update(profileAthleteState)
      .set({ source_revision: 2, published_revision: 2, updated_at: NOW })
      .where(eq(profileAthleteState.profile_id, input.profileId));
  });
}

afterEach(async () => {
  historyCoordination.waitBeforeQuery = null;
  for (const profileId of seededProfileIds.splice(0)) {
    await db.transaction(async (tx) => {
      await tx.delete(activities).where(eq(activities.profile_id, profileId));
      await tx.delete(profileGoals).where(eq(profileGoals.profile_id, profileId));
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true)`,
      );
      await tx
        .update(activityArtifacts)
        .set({ availability: "deletion_pending", deletion_requested_at: NOW })
        .where(eq(activityArtifacts.profile_id, profileId));
      await tx
        .update(activityArtifacts)
        .set({ availability: "deleted", deleted_at: NOW })
        .where(eq(activityArtifacts.profile_id, profileId));
      await tx.execute(
        sql`select set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true)`,
      );
      await tx.delete(activityArtifacts).where(eq(activityArtifacts.profile_id, profileId));
      await tx.delete(users).where(eq(users.id, profileId));
    });
  }
});

afterAll(async () => pool.end());

type EvidenceRead = {
  revision: number | null | undefined;
  thresholdId: string | null | undefined;
  value: number | undefined;
};

async function assertSnapshotCoherence(input: {
  fixture: Awaited<ReturnType<typeof seedEvidence>>;
  read: (
    fixture: Awaited<ReturnType<typeof seedEvidence>>,
    database: unknown,
  ) => Promise<EvidenceRead>;
}) {
  const paused = pauseAfterSnapshotMetadata();
  historyCoordination.waitBeforeQuery = () => paused.metadataRead;

  const staleRead = input.read(input.fixture, paused.root);
  await paused.metadataRead;
  await publishReplacement(input.fixture);
  paused.continueRead();

  await expect(staleRead).resolves.toEqual({
    revision: 1,
    thresholdId: input.fixture.oldEvidence.thresholdId,
    value: input.fixture.oldEvidence.value,
  });
  await expect(input.read(input.fixture, db)).resolves.toEqual({
    revision: 2,
    thresholdId: input.fixture.newEvidence.thresholdId,
    value: input.fixture.newEvidence.value,
  });
}

describe("evidence snapshot coherence", () => {
  it.each([
    {
      name: "threshold overview",
      read: async (fixture: Awaited<ReturnType<typeof seedEvidence>>, database: unknown) => {
        const result = await readThresholdOverview({
          db: database as never,
          profileId: fixture.profileId,
          historyLimit: 10,
          now: NOW,
        });
        return {
          revision: result.publication.publishedRevision,
          thresholdId: result.current?.thresholds.bike.thresholdId,
          value: result.history.items[0]?.value,
        };
      },
    },
    {
      name: "goal progress",
      read: async (fixture: Awaited<ReturnType<typeof seedEvidence>>, database: unknown) => {
        const result = await readGoalProgress({
          db: database as never,
          profileId: fixture.profileId,
          goalId: fixture.goalId,
          now: NOW,
        });
        return {
          revision: result.publication?.publishedRevision,
          thresholdId: result.provenance?.current?.thresholdId,
          value: result.provenance?.current?.value,
        };
      },
    },
  ])("$name keeps snapshot metadata and threshold history on one database revision", async ({
    read,
  }) => {
    const fixture = await seedEvidence();
    await assertSnapshotCoherence({ fixture, read });
  });
});
