import { randomUUID } from "node:crypto";
import { completedSegmentSummarySchema } from "@repo/core/activity-segments";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityAnalysisRevisions,
  activitySegments,
  profileAthleteState,
  profiles,
  users,
} from "@repo/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  claimNextAthleteState,
  markAthleteStateDirty,
} from "../../repositories/athlete-state-repository";
import { reprocessProfileActivityAnalysis } from "./reprocess-profile-activity-analysis";

const seededProfileIds: string[] = [];
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

function completedRunSummary(durationMs: number) {
  return completedSegmentSummarySchema.parse({
    version: 1,
    timing: { timingCoverage: "complete", activeMs: durationMs, movingMs: durationMs },
    distanceMeters: 1_000,
    normalizedPowerResult: unavailableNormalizedPowerResult,
  });
}

function hasGuardedDisposableDatabase() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return (
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      /^gradientpeak_api_live_db_\d+_\d+$/.test(url.pathname.slice(1))
    );
  } catch {
    return false;
  }
}

const describeDisposable = hasGuardedDisposableDatabase() ? describe : describe.skip;

async function seedProfile() {
  const profileId = randomUUID();
  const email = `${profileId}@analysis-replay.test`;
  seededProfileIds.push(profileId);
  await db.insert(users).values({
    id: profileId,
    name: "Analysis replay fixture",
    email,
    emailVerified: true,
  });
  await db.insert(profiles).values({
    id: profileId,
    email,
    planning_timezone: "UTC",
  });
  return profileId;
}

async function seedActivity(input: {
  profileId: string;
  label: string;
  startedAt: Date | null;
  finishedAt: Date | null;
}) {
  const activityId = randomUUID();
  const { finishedAt, startedAt } = input;
  if (startedAt === null || finishedAt === null) {
    await db.insert(activities).values({
      id: activityId,
      profile_id: input.profileId,
      name: input.label,
      entry_provenance: "manual",
      manual_activity_category: "run",
      diary_date: "2026-01-15",
      diary_timezone: "UTC",
      started_at: null,
      finished_at: null,
      parser_version: "analysis-replay-live-test-v1",
      decoded_contract_version: "analysis-replay-live-test-v1",
      materializer_version: "analysis-replay-live-test-v1",
    });
    return activityId;
  }

  const durationMs = finishedAt.getTime() - startedAt.getTime();
  await db.transaction(async (tx) => {
    await tx.insert(activities).values({
      id: activityId,
      profile_id: input.profileId,
      name: input.label,
      started_at: startedAt,
      finished_at: finishedAt,
      elapsed_ms: durationMs,
      active_ms: durationMs,
      moving_ms: durationMs,
      timing_coverage: "complete",
      segments_revision: 1,
      parser_version: "analysis-replay-live-test-v1",
      decoded_contract_version: "analysis-replay-live-test-v1",
      materializer_version: "analysis-replay-live-test-v1",
      segments_generated_at: finishedAt,
      distance_meters: 1_000,
    });
    await tx.insert(activitySegments).values({
      id: randomUUID(),
      activity_id: activityId,
      profile_id: input.profileId,
      ordinal: 0,
      role: "activity",
      activity_category: "run",
      start_offset_ms: 0,
      end_offset_ms: durationMs,
      summary: completedRunSummary(durationMs),
      summary_version: 1,
      timing_coverage: "complete",
      active_ms: durationMs,
      moving_ms: durationMs,
      segment_revision: 1,
      parser_version: "analysis-replay-live-test-v1",
      materializer_version: "analysis-replay-live-test-v1",
      created_at: finishedAt,
    });
  });
  return activityId;
}

afterEach(async () => {
  const profileIds = seededProfileIds.splice(0);
  if (profileIds.length === 0) return;
  await db.delete(activities).where(inArray(activities.profile_id, profileIds));
  await db.delete(profiles).where(inArray(profiles.id, profileIds));
  await db.delete(users).where(inArray(users.id, profileIds));
});

afterAll(async () => pool.end());

describeDisposable(
  "profile activity analysis reprocessing against a guarded disposable database",
  () => {
    it("uses finished lower bounds, retains start-based upper bounds, and advances the start/id cursor exactly once", async () => {
      const profileId = await seedProfile();
      const from = new Date("2026-01-15T10:00:00.000Z");
      const to = new Date("2026-01-15T12:00:00.000Z");
      const crossingFromId = await seedActivity({
        profileId,
        label: "crosses dirty lower boundary",
        startedAt: new Date("2026-01-15T09:00:00.000Z"),
        finishedAt: from,
      });
      const olderFinishedId = await seedActivity({
        profileId,
        label: "finished before dirty lower boundary",
        startedAt: new Date("2026-01-15T09:30:00.000Z"),
        finishedAt: new Date("2026-01-15T09:59:59.999Z"),
      });
      const laterIds = await Promise.all(
        Array.from({ length: 24 }, (_, index) => {
          const startedAt = new Date(from.getTime() + (index + 1) * 60_000);
          return seedActivity({
            profileId,
            label: `eligible activity ${index + 1}`,
            startedAt,
            finishedAt: new Date(startedAt.getTime() + 30 * 60_000),
          });
        }),
      );
      const crossingToId = await seedActivity({
        profileId,
        label: "crosses upper boundary",
        startedAt: new Date("2026-01-15T11:30:00.000Z"),
        finishedAt: new Date("2026-01-15T12:30:00.000Z"),
      });
      const startedAtToId = await seedActivity({
        profileId,
        label: "starts at upper boundary",
        startedAt: to,
        finishedAt: new Date("2026-01-15T12:30:00.000Z"),
      });
      const manualWithoutInstantsId = await seedActivity({
        profileId,
        label: "manual entry without instants",
        startedAt: null,
        finishedAt: null,
      });
      const expectedIds = [crossingFromId, ...laterIds, crossingToId];
      const now = new Date();

      await db.transaction((tx) =>
        markAthleteStateDirty(tx, { profileId, effectiveAt: from, now }),
      );
      const firstClaim = await claimNextAthleteState(db, {
        now,
        leaseMilliseconds: 300_000,
        profileId,
      });
      if (!firstClaim) throw new Error("Expected first replay claim");
      const first = await reprocessProfileActivityAnalysis(db, {
        profileId,
        apply: true,
        confirmProfileId: profileId,
        from,
        to,
        now,
        claimedAthleteState: firstClaim,
      });
      const [checkpoint] = await db
        .select({
          startedAt: profileAthleteState.activity_analysis_cursor_started_at,
          activityId: profileAthleteState.activity_analysis_cursor_activity_id,
        })
        .from(profileAthleteState)
        .where(eq(profileAthleteState.profile_id, profileId));
      if (!checkpoint?.startedAt || !checkpoint.activityId) {
        throw new Error("Expected durable replay checkpoint");
      }

      const secondClaim = await claimNextAthleteState(db, {
        now,
        leaseMilliseconds: 300_000,
        profileId,
      });
      if (!secondClaim) throw new Error("Expected continuation replay claim");
      const second = await reprocessProfileActivityAnalysis(db, {
        profileId,
        apply: true,
        confirmProfileId: profileId,
        from,
        to,
        now,
        claimedAthleteState: secondClaim,
      });
      const materialized = await db
        .select({
          activityId: activityAnalysisRevisions.activity_id,
          revision: activityAnalysisRevisions.revision,
        })
        .from(activityAnalysisRevisions)
        .where(eq(activityAnalysisRevisions.profile_id, profileId))
        .orderBy(
          asc(activityAnalysisRevisions.activity_id),
          asc(activityAnalysisRevisions.revision),
        );
      const expectedOrder = await db
        .select({ id: activities.id, startedAt: activities.started_at })
        .from(activities)
        .where(inArray(activities.id, expectedIds))
        .orderBy(asc(activities.started_at), asc(activities.id));

      expect(first).toMatchObject({
        scopedActivities: 25,
        appendedRevisions: 25,
        durableRefresh: "continued",
      });
      expect(second).toMatchObject({
        scopedActivities: 1,
        appendedRevisions: 1,
        durableRefresh: "completed",
      });
      expect(checkpoint).toEqual({
        startedAt: expectedOrder[24]?.startedAt,
        activityId: expectedOrder[24]?.id,
      });
      expect(materialized).toHaveLength(expectedIds.length);
      expect(materialized.map(({ activityId }) => activityId).sort()).toEqual(
        [...expectedIds].sort(),
      );
      expect(new Set(materialized.map(({ activityId }) => activityId)).size).toBe(
        expectedIds.length,
      );
      expect(materialized.every(({ revision }) => revision === 1)).toBe(true);
      expect(materialized.map(({ activityId }) => activityId)).not.toContain(olderFinishedId);
      expect(materialized.map(({ activityId }) => activityId)).not.toContain(startedAtToId);
      expect(materialized.map(({ activityId }) => activityId)).not.toContain(
        manualWithoutInstantsId,
      );
    });
  },
);
