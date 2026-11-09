import { createHash } from "node:crypto";
import {
  type AthletePerformanceTargetFacts,
  athletePerformanceTargetFactsSchema,
  type CommonLoadResult,
  commonLoadResultSchema,
  completedActivityPerformanceTargetSnapshotSchema,
} from "@repo/core";
import { activities, activityAnalysisRevisions, activitySegments } from "@repo/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleQueryExecutor, DrizzleTransactionClient } from "../db";
import type { ActivityAnalysisPerformanceTargetSelection } from "./activity-analysis-repository";

export const MANUAL_ACTIVITY_ANALYSIS_VERSION = "manual-profile-activity-analysis-v1";

const segmentLoadProjectionSchema = z
  .object({
    version: z.literal(1),
    segments: z
      .array(
        z
          .object({
            segmentId: z.string().uuid(),
            activityCategory: z.enum(["bike", "other", "run", "strength", "swim"]),
            commonLoad: commonLoadResultSchema,
          })
          .strict(),
      )
      .min(1)
      .max(1_000),
  })
  .strict();

export type ActivityAnalysisSegmentLoadProjection = {
  version: 1;
  segments: Array<{
    segmentId: string;
    activityCategory: "bike" | "other" | "run" | "strength" | "swim";
    commonLoad: CommonLoadResult;
  }>;
};

export type ActivityAnalysisRevision = {
  activityId: string;
  profileId: string;
  revision: number;
  sourceSegmentsRevision: number;
  analysisVersion: typeof MANUAL_ACTIVITY_ANALYSIS_VERSION;
  performanceTargets: AthletePerformanceTargetFacts;
  targetFingerprint: string;
  segmentLoadProjection: ActivityAnalysisSegmentLoadProjection;
  outputFingerprint: string;
};

function canonicalJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "computedAsOf")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

export function activityAnalysisFingerprint(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function parseTargetSnapshot(value: unknown, profileId: string): AthletePerformanceTargetFacts {
  const snapshot = athletePerformanceTargetFactsSchema.parse(value);
  if (snapshot.athleteId !== profileId) {
    throw new Error("Activity analysis performance target owner does not match the profile");
  }
  return snapshot;
}

function parseOriginalTargetSnapshot(
  value: unknown,
  profileId: string,
): AthletePerformanceTargetFacts {
  const snapshot = completedActivityPerformanceTargetSnapshotSchema.parse(value);
  if (snapshot.targets.athleteId !== profileId) {
    throw new Error("Original activity performance target owner does not match the profile");
  }
  return snapshot.targets;
}

type PersistedRevision = typeof activityAnalysisRevisions.$inferSelect;
type PersistedRevisionContent = Pick<
  PersistedRevision,
  | "activity_id"
  | "profile_id"
  | "revision"
  | "source_segments_revision"
  | "analysis_version"
  | "performance_target_snapshot"
  | "target_fingerprint"
  | "segment_load_projection"
  | "output_fingerprint"
>;

function parseValidRevision(row: PersistedRevisionContent): ActivityAnalysisRevision | null {
  if (row.analysis_version !== MANUAL_ACTIVITY_ANALYSIS_VERSION) return null;
  try {
    const performanceTargets = parseTargetSnapshot(row.performance_target_snapshot, row.profile_id);
    const segmentLoadProjection = segmentLoadProjectionSchema.parse(row.segment_load_projection);
    if (
      row.target_fingerprint !== activityAnalysisFingerprint(performanceTargets) ||
      row.output_fingerprint !== activityAnalysisFingerprint(segmentLoadProjection)
    ) {
      return null;
    }
    return {
      activityId: row.activity_id,
      profileId: row.profile_id,
      revision: row.revision,
      sourceSegmentsRevision: row.source_segments_revision,
      analysisVersion: MANUAL_ACTIVITY_ANALYSIS_VERSION,
      performanceTargets,
      targetFingerprint: row.target_fingerprint,
      segmentLoadProjection,
      outputFingerprint: row.output_fingerprint,
    };
  } catch {
    return null;
  }
}

/** Selects the newest valid append-only revision matching each activity's current segment revision. */
export async function selectActivityAnalysisPerformanceTargets(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    activities: Array<{ activityId: string; segmentsRevision?: number }>;
  },
): Promise<Map<string, ActivityAnalysisPerformanceTargetSelection>> {
  if (input.activities.length === 0) return new Map();
  const requested = new Map(
    input.activities.map((activity) => [activity.activityId, activity.segmentsRevision]),
  );
  if (requested.size !== input.activities.length) {
    throw new Error("Duplicate activity analysis selection request");
  }
  const rows = await db
    .select({
      activityId: activities.id,
      activitySegmentsRevision: activities.segments_revision,
      originalSnapshot: activities.performance_target_snapshot,
      revision: activityAnalysisRevisions.revision,
      revisionSegmentsRevision: activityAnalysisRevisions.source_segments_revision,
      revisionAnalysisVersion: activityAnalysisRevisions.analysis_version,
      revisionSnapshot: activityAnalysisRevisions.performance_target_snapshot,
      revisionTargetFingerprint: activityAnalysisRevisions.target_fingerprint,
      revisionProjection: activityAnalysisRevisions.segment_load_projection,
      revisionOutputFingerprint: activityAnalysisRevisions.output_fingerprint,
      revisionProfileId: activityAnalysisRevisions.profile_id,
    })
    .from(activities)
    .leftJoin(
      activityAnalysisRevisions,
      and(
        eq(activityAnalysisRevisions.activity_id, activities.id),
        eq(activityAnalysisRevisions.profile_id, activities.profile_id),
        eq(activityAnalysisRevisions.source_segments_revision, activities.segments_revision),
      ),
    )
    .where(
      and(
        eq(activities.profile_id, input.profileId),
        inArray(activities.id, [...requested.keys()]),
      ),
    )
    .orderBy(activities.id, desc(activityAnalysisRevisions.revision));

  const selections = new Map<string, ActivityAnalysisPerformanceTargetSelection>();
  const rowsByActivityId = new Map<string, typeof rows>();
  for (const row of rows) {
    rowsByActivityId.set(row.activityId, [...(rowsByActivityId.get(row.activityId) ?? []), row]);
  }
  for (const [activityId, requestedSegmentsRevision] of requested) {
    const activityRows = (rowsByActivityId.get(activityId) ?? []).filter(
      (row) =>
        row.activityId === activityId &&
        (requestedSegmentsRevision === undefined ||
          row.activitySegmentsRevision === requestedSegmentsRevision),
    );
    const expectedSegmentsRevision = activityRows[0]?.activitySegmentsRevision;
    if (expectedSegmentsRevision === undefined) continue;
    for (const row of activityRows) {
      if (
        row.revision === null ||
        row.revisionSegmentsRevision !== expectedSegmentsRevision ||
        row.revisionAnalysisVersion === null ||
        row.revisionSnapshot === null ||
        row.revisionTargetFingerprint === null ||
        row.revisionProjection === null ||
        row.revisionOutputFingerprint === null ||
        row.revisionProfileId === null
      ) {
        continue;
      }
      const revision = parseValidRevision({
        activity_id: row.activityId,
        profile_id: row.revisionProfileId,
        revision: row.revision,
        source_segments_revision: row.revisionSegmentsRevision,
        analysis_version: row.revisionAnalysisVersion,
        performance_target_snapshot: row.revisionSnapshot,
        target_fingerprint: row.revisionTargetFingerprint,
        segment_load_projection: row.revisionProjection,
        output_fingerprint: row.revisionOutputFingerprint,
      });
      if (!revision || revision.profileId !== input.profileId) continue;
      selections.set(activityId, {
        activityId,
        source: "analysis_revision",
        sourceSegmentsRevision: expectedSegmentsRevision,
        revision: revision.revision,
        performanceTargets: revision.performanceTargets,
      });
      break;
    }
    if (selections.has(activityId)) continue;
    const originalSnapshot = activityRows[0]?.originalSnapshot;
    if (originalSnapshot !== null && originalSnapshot !== undefined) {
      selections.set(activityId, {
        activityId,
        source: "original_snapshot",
        sourceSegmentsRevision: expectedSegmentsRevision,
        revision: null,
        performanceTargets: parseOriginalTargetSnapshot(originalSnapshot, input.profileId),
      });
    }
  }
  return selections;
}

export async function appendActivityAnalysisRevision(
  tx: DrizzleTransactionClient,
  input: {
    activityId: string;
    profileId: string;
    sourceSegmentsRevision: number;
    performanceTargets: AthletePerformanceTargetFacts;
    targetFingerprint: string;
    segmentLoadProjection: ActivityAnalysisSegmentLoadProjection;
    outputFingerprint: string;
    computedAt: Date;
  },
): Promise<ActivityAnalysisRevision> {
  const performanceTargets = parseTargetSnapshot(input.performanceTargets, input.profileId);
  const segmentLoadProjection = segmentLoadProjectionSchema.parse(input.segmentLoadProjection);
  if (input.targetFingerprint !== activityAnalysisFingerprint(performanceTargets)) {
    throw new Error("Activity analysis target fingerprint does not match its snapshot");
  }
  if (input.outputFingerprint !== activityAnalysisFingerprint(segmentLoadProjection)) {
    throw new Error("Activity analysis output fingerprint does not match its projection");
  }
  const [ownedActivity] = await tx
    .select({ segmentsRevision: activities.segments_revision })
    .from(activities)
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)))
    .limit(1)
    .for("update");
  if (!ownedActivity) throw new Error("Activity analysis revision activity is unavailable");
  if (ownedActivity.segmentsRevision !== input.sourceSegmentsRevision) {
    throw new Error("Activity segment revision changed during analysis reprocessing");
  }
  const currentSegments = await tx
    .select({ id: activitySegments.id })
    .from(activitySegments)
    .where(
      and(
        eq(activitySegments.activity_id, input.activityId),
        eq(activitySegments.profile_id, input.profileId),
        eq(activitySegments.segment_revision, input.sourceSegmentsRevision),
        eq(activitySegments.role, "activity"),
      ),
    )
    .orderBy(asc(activitySegments.ordinal));
  if (
    currentSegments.length !== segmentLoadProjection.segments.length ||
    currentSegments.some(
      (segment, index) => segment.id !== segmentLoadProjection.segments[index]?.segmentId,
    )
  ) {
    throw new Error("Activity analysis projection does not match the owned current segments");
  }
  const [latest] = await tx
    .select({ revision: activityAnalysisRevisions.revision })
    .from(activityAnalysisRevisions)
    .where(
      and(
        eq(activityAnalysisRevisions.activity_id, input.activityId),
        eq(activityAnalysisRevisions.profile_id, input.profileId),
      ),
    )
    .orderBy(desc(activityAnalysisRevisions.revision))
    .limit(1);
  const revision = (latest?.revision ?? 0) + 1;
  const [inserted] = await tx
    .insert(activityAnalysisRevisions)
    .values({
      activity_id: input.activityId,
      profile_id: input.profileId,
      revision,
      source_segments_revision: input.sourceSegmentsRevision,
      analysis_version: MANUAL_ACTIVITY_ANALYSIS_VERSION,
      reason: "manual_profile_reprocess",
      performance_target_snapshot: performanceTargets,
      target_fingerprint: input.targetFingerprint,
      segment_load_projection: segmentLoadProjection,
      output_fingerprint: input.outputFingerprint,
      computed_at: input.computedAt,
    })
    .returning({ revision: activityAnalysisRevisions.revision });
  if (!inserted) throw new Error("Activity analysis revision append failed");
  return {
    activityId: input.activityId,
    profileId: input.profileId,
    revision: inserted.revision,
    sourceSegmentsRevision: input.sourceSegmentsRevision,
    analysisVersion: MANUAL_ACTIVITY_ANALYSIS_VERSION,
    performanceTargets,
    targetFingerprint: input.targetFingerprint,
    segmentLoadProjection,
    outputFingerprint: input.outputFingerprint,
  };
}

export async function readMatchingActivityAnalysisRevision(
  db: DrizzleQueryExecutor,
  input: { activityId: string; profileId: string; sourceSegmentsRevision: number },
): Promise<ActivityAnalysisRevision | null> {
  const rows = await db
    .select()
    .from(activityAnalysisRevisions)
    .where(
      and(
        eq(activityAnalysisRevisions.activity_id, input.activityId),
        eq(activityAnalysisRevisions.profile_id, input.profileId),
        eq(activityAnalysisRevisions.source_segments_revision, input.sourceSegmentsRevision),
      ),
    )
    .orderBy(desc(activityAnalysisRevisions.revision));
  for (const row of rows) {
    const revision = parseValidRevision(row);
    if (revision) return revision;
  }
  return null;
}

export async function lockProfileActivityAnalysisScope(
  tx: DrizzleTransactionClient,
  profileId: string,
): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profileId}, 1))`);
}
