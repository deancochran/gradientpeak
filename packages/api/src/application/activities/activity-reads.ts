import {
  type ActivityDerivedMetrics,
  type ActivityListDerivedSummary,
  parseActivityLapRecords,
} from "@repo/core";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityFileIngestions,
  activityPlans,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, ilike, lt, lte, or, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  type ActivitySegmentReadRow,
  buildActivityDerivedSummaryMap,
  buildActivitySegmentDerivedSummaries,
  loadActivitySegmentsByActivityId,
  mapActivityToDerivedResponse,
  mapActivityToListDerivedResponse,
} from "../../lib/activity-analysis";
import { getLikeStats, loadLikeStats } from "../../repositories/like-stats";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";
import {
  type ActivityCompositionMode,
  buildActivityCompositionCondition,
  describeActivityComposition,
  type MatchedCategorySummary,
  matchedCategorySortValue,
  summarizeMatchedCategory,
} from "./activity-discovery";

type Db = ReturnType<typeof getRequiredDb>;
type ActivityCategory = NonNullable<ActivitySegmentReadRow["category"]>;

export type ActivityListQueryInput = {
  limit: number;
  cursor?: string;
  activity_category?: ActivityCategory;
  composition_mode: ActivityCompositionMode;
  search?: string;
  date_from?: string;
  date_to?: string;
  sort_by: "date" | "distance" | "duration" | "tss";
  sort_order: "asc" | "desc";
};

const tssSortBatchSize = 200;
export const tssSortMaximumHistory = 10_000;

type ActivityRow = typeof activities.$inferSelect;
type ActivityReadRow = ActivityRow & {
  segments: ActivitySegmentReadRow[];
};

function decorateActivity(
  activity: ActivityReadRow,
  matchedCategorySummary: MatchedCategorySummary | null = null,
) {
  const { segments: _segments, ...publicActivity } = activity;
  return {
    ...publicActivity,
    ...describeActivityComposition(activity.segments),
    matched_category_summary: matchedCategorySummary,
  };
}

type ActivityMetricCandidate = {
  activity: ActivityReadRow;
  derived: ActivityListDerivedSummary | null;
  matchedCategorySummary: MatchedCategorySummary | null;
};

function compareMetricCandidates(
  a: ActivityMetricCandidate,
  b: ActivityMetricCandidate,
  sortBy: "distance" | "duration" | "tss",
  sortOrder: ActivityListQueryInput["sort_order"],
) {
  const aValue = a.matchedCategorySummary
    ? matchedCategorySortValue(a.matchedCategorySummary, sortBy)
    : (a.derived?.tss ?? null);
  const bValue = b.matchedCategorySummary
    ? matchedCategorySortValue(b.matchedCategorySummary, sortBy)
    : (b.derived?.tss ?? null);
  if (aValue !== bValue) {
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
  }

  const startedAtDifference = b.activity.started_at.getTime() - a.activity.started_at.getTime();
  return startedAtDifference || a.activity.id.localeCompare(b.activity.id);
}

export function normalizeActivityLaps<T extends typeof activities.$inferSelect>(activity: T): T {
  return { ...activity, laps: parseActivityLapRecords(activity.laps) };
}

export async function listActivitiesForProfile({
  db,
  profileId,
  input,
}: {
  db: Db;
  profileId: string;
  input: ActivityListQueryInput;
}) {
  const offset = parseIndexCursor(input.cursor);
  const conditions = [eq(activities.profile_id, profileId)];
  const compositionCondition = buildActivityCompositionCondition({
    activityId: activities.id,
    ...(input.activity_category === undefined ? {} : { category: input.activity_category }),
    ...(input.composition_mode === undefined ? {} : { mode: input.composition_mode }),
  });
  if (compositionCondition) conditions.push(compositionCondition);
  if (input.search) {
    const searchCondition = or(
      ilike(activities.name, `%${input.search}%`),
      ilike(activities.notes, `%${input.search}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (input.date_from) conditions.push(gte(activities.started_at, new Date(input.date_from)));
  if (input.date_to) conditions.push(lte(activities.started_at, new Date(input.date_to)));
  const whereClause = and(...conditions);
  const distance = sql<number>`${activities.distance_meters}`;
  const duration = sql<number>`coalesce(${activities.active_ms}, ${activities.elapsed_ms})`;
  const requiresBoundedMetricScan =
    input.sort_by === "tss" ||
    (input.activity_category !== undefined &&
      (input.sort_by === "distance" || input.sort_by === "duration"));
  if (requiresBoundedMetricScan) {
    return db.transaction(
      async (tx) => {
        // Drizzle transactions expose the read APIs used below but intentionally omit the
        // root client's `$client` property from their type.
        const snapshotDb = tx as unknown as Db;
        const totalRows = await tx.select({ total: count() }).from(activities).where(whereClause);
        const total = Number(totalRows[0]?.total ?? 0);
        // Exact sorting by dynamically derived TSS is necessarily O(N). The explicit ceiling
        // bounds request memory/CPU while keeping the existing index cursor and global ordering
        // contract truthful. Callers above the ceiling must narrow the activity filters.
        if (total > tssSortMaximumHistory) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              input.sort_by === "tss"
                ? `TSS sorting supports at most ${tssSortMaximumHistory} matching activities; narrow the activity filters.`
                : `Category metric sorting supports at most ${tssSortMaximumHistory} matching activities; narrow the activity filters.`,
          });
        }

        // Scan the transaction snapshot by the stable (started_at, id) key instead of offset so
        // every internal batch has an indexable plan and cannot skip/duplicate rows. Evidence and
        // likes are loaded through the same transaction, preserving one repeatable-read snapshot.
        const candidates: ActivityMetricCandidate[] = [];
        let scanCursor: Pick<ActivityRow, "id" | "started_at"> | undefined;
        while (candidates.length < total) {
          const scanWhere = scanCursor
            ? and(
                whereClause,
                or(
                  lt(activities.started_at, scanCursor.started_at),
                  and(
                    eq(activities.started_at, scanCursor.started_at),
                    lt(activities.id, scanCursor.id),
                  ),
                ),
              )
            : whereClause;
          const batch = (await tx
            .select()
            .from(activities)
            .where(scanWhere)
            .orderBy(desc(activities.started_at), desc(activities.id))
            .limit(Math.min(tssSortBatchSize, total - candidates.length))) as ActivityRow[];
          if (batch.length === 0) break;

          const normalizedBatch = batch.map(normalizeActivityLaps);
          const segments = await loadActivitySegmentsByActivityId(
            snapshotDb,
            normalizedBatch.map((activity) => activity.id),
          );
          candidates.push(
            ...normalizedBatch.map((activity) => ({
              activity: { ...activity, segments: segments.get(activity.id) ?? [] },
              derived: null,
              matchedCategorySummary: null,
            })),
          );
          const lastActivity = normalizedBatch.at(-1);
          if (!lastActivity || batch.length < tssSortBatchSize) break;
          scanCursor = {
            id: lastActivity.id,
            started_at: lastActivity.started_at,
          };
        }

        const analysisStore = createActivityAnalysisStore(snapshotDb);
        const [derivedByActivityId, segmentDerived] = await Promise.all([
          buildActivityDerivedSummaryMap({
            store: analysisStore,
            profileId,
            activities: candidates.map(({ activity }) => activity),
          }),
          input.activity_category
            ? buildActivitySegmentDerivedSummaries({
                store: analysisStore,
                profileId,
                activities: candidates.map(({ activity }) => activity),
              })
            : Promise.resolve([]),
        ]);
        const segmentDerivedByActivityId = new Map<string, typeof segmentDerived>();
        for (const summary of segmentDerived) {
          segmentDerivedByActivityId.set(summary.activity_id, [
            ...(segmentDerivedByActivityId.get(summary.activity_id) ?? []),
            summary,
          ]);
        }
        for (const candidate of candidates) {
          const derivedSegments = segmentDerivedByActivityId.get(candidate.activity.id);
          candidate.derived = derivedByActivityId.get(candidate.activity.id) ?? null;
          candidate.matchedCategorySummary = input.activity_category
            ? summarizeMatchedCategory({
                segments: candidate.activity.segments,
                category: input.activity_category,
                ...(derivedSegments === undefined ? {} : { derivedSegments }),
              })
            : null;
        }

        const page = candidates
          .sort((a, b) =>
            compareMetricCandidates(
              a,
              b,
              input.sort_by as "distance" | "duration" | "tss",
              input.sort_order,
            ),
          )
          .slice(offset, offset + input.limit);
        const likeStats = await loadLikeStats(snapshotDb, {
          entityType: "activity",
          entityIds: page.map(({ activity }) => activity.id),
          viewerProfileId: profileId,
        });
        const items = page.map(({ activity, derived, matchedCategorySummary }) =>
          mapActivityToListDerivedResponse({
            activity: {
              ...decorateActivity(activity, matchedCategorySummary),
              likes_count: getLikeStats(likeStats, activity.id).likes_count,
            },
            has_liked: getLikeStats(likeStats, activity.id).has_liked,
            derived,
          }),
        );
        return {
          items,
          total,
          ...buildIndexPageInfo({ offset, limit: input.limit, total }),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  const rowsPromise =
    input.sort_by === "distance" || input.sort_by === "duration"
      ? db
          .select({ activity: activities })
          .from(activities)
          .where(whereClause)
          .orderBy(
            input.sort_order === "asc"
              ? input.sort_by === "distance"
                ? distance
                : duration
              : sql`${input.sort_by === "distance" ? distance : duration} desc nulls last`,
            desc(activities.started_at),
            asc(activities.id),
          )
          .limit(input.limit)
          .offset(offset)
      : db
          .select()
          .from(activities)
          .where(whereClause)
          .orderBy(
            input.sort_order === "asc" ? activities.started_at : desc(activities.started_at),
            asc(activities.id),
          )
          .limit(input.limit)
          .offset(offset);
  const totalRowsPromise = db.select({ total: count() }).from(activities).where(whereClause);

  const [totalRows, rawRows] = await Promise.all([totalRowsPromise, rowsPromise]);
  const total = Number(totalRows[0]?.total ?? 0);
  const activityRows = rawRows.map((row) =>
    row && typeof row === "object" && "activity" in row ? row.activity : row,
  ) as Array<typeof activities.$inferSelect>;
  const normalized = activityRows.map(normalizeActivityLaps);
  const segments = await loadActivitySegmentsByActivityId(
    db,
    normalized.map((activity) => activity.id),
  );
  const data: ActivityReadRow[] = normalized.map((activity) => ({
    ...activity,
    segments: segments.get(activity.id) ?? [],
  }));
  const analysisStore = createActivityAnalysisStore(db);
  const [derived, segmentDerived] = await Promise.all([
    buildActivityDerivedSummaryMap({
      store: analysisStore,
      profileId,
      activities: data,
    }),
    input.activity_category
      ? buildActivitySegmentDerivedSummaries({
          store: analysisStore,
          profileId,
          activities: data,
        })
      : Promise.resolve([]),
  ]);
  const segmentDerivedByActivityId = new Map<string, typeof segmentDerived>();
  for (const summary of segmentDerived) {
    segmentDerivedByActivityId.set(summary.activity_id, [
      ...(segmentDerivedByActivityId.get(summary.activity_id) ?? []),
      summary,
    ]);
  }
  const ids = data.map((activity) => activity.id);
  const likeStats = await loadLikeStats(db, {
    entityType: "activity",
    entityIds: ids,
    viewerProfileId: profileId,
  });
  const items = data.map((activity) => {
    const derivedSegments = segmentDerivedByActivityId.get(activity.id);
    return mapActivityToListDerivedResponse({
      activity: {
        ...decorateActivity(
          activity,
          input.activity_category
            ? summarizeMatchedCategory({
                segments: activity.segments,
                category: input.activity_category,
                ...(derivedSegments === undefined ? {} : { derivedSegments }),
              })
            : null,
        ),
        likes_count: getLikeStats(likeStats, activity.id).likes_count,
      },
      has_liked: getLikeStats(likeStats, activity.id).has_liked,
      derived: derived.get(activity.id) ?? null,
    });
  });
  return {
    items,
    total,
    ...buildIndexPageInfo({ offset, limit: input.limit, total }),
  };
}

export async function getActivityByIdForViewer({
  db,
  activityId,
  viewerId,
}: {
  db: Db;
  activityId: string;
  viewerId: string;
}) {
  const access = await db.query.activities.findFirst({
    columns: { profile_id: true, is_private: true, content_visibility: true },
    where: eq(activities.id, activityId),
  });
  if (!access) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have permission to view this activity",
    });
  }
  const visibility = access
    ? (access.content_visibility ?? (access.is_private ? "private" : "followers"))
    : "private";
  const followResult =
    visibility === "followers" && access?.profile_id !== viewerId
      ? await db.execute(sql`
          select 1 from follows
          where follower_id = ${viewerId}::uuid
            and following_id = ${access.profile_id}::uuid
            and status = 'accepted'
          limit 1
        `)
      : ({ rows: [] } as { rows: unknown[] });
  if (
    access.profile_id !== viewerId &&
    visibility !== "public" &&
    (visibility !== "followers" || followResult.rows.length === 0)
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have permission to view this activity",
    });
  const [record, likeStats, ingestion, currentArtifact] = await Promise.all([
    db
      .select({ activity: activities, activityPlan: activityPlans })
      .from(activities)
      .leftJoin(activityPlans, eq(activities.activity_plan_id, activityPlans.id))
      .where(eq(activities.id, activityId))
      .limit(1),
    loadLikeStats(db, {
      entityType: "activity",
      entityIds: [activityId],
      viewerProfileId: viewerId,
    }),
    db.query.activityFileIngestions?.findFirst({
      columns: {
        id: true,
        status: true,
        source: true,
        last_error_message: true,
      },
      where: and(
        eq(activityFileIngestions.activity_id, activityId),
        eq(activityFileIngestions.profile_id, viewerId),
      ),
      orderBy: desc(activityFileIngestions.updated_at),
    }) ?? Promise.resolve(undefined),
    db
      .select({
        id: activityArtifacts.id,
        digest_algorithm: activityArtifacts.digest_algorithm,
        digest: activityArtifacts.digest,
        byte_size: activityArtifacts.byte_size,
        media_type: activityArtifacts.media_type,
        format: activityArtifacts.format,
        original_name: activityArtifacts.original_name,
        availability: activityArtifacts.availability,
        first_accepted_at: activityArtifacts.first_accepted_at,
      })
      .from(activityArtifactLinks)
      .innerJoin(activityArtifacts, eq(activityArtifacts.id, activityArtifactLinks.artifact_id))
      .where(
        and(
          eq(activityArtifactLinks.activity_id, activityId),
          eq(activityArtifactLinks.role, "source"),
          eq(activityArtifactLinks.is_current, true),
          eq(activityArtifacts.availability, "accepted"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);
  const row = record[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
  const normalizedActivity = normalizeActivityLaps(row.activity);
  const segments = await loadActivitySegmentsByActivityId(db, [normalizedActivity.id]);
  const activity: ActivityReadRow = {
    ...normalizedActivity,
    segments: segments.get(normalizedActivity.id) ?? [],
  };
  const derived: ActivityDerivedMetrics = {
    stress: {
      tss: null,
      tss_identity: null,
      intensity_factor: null,
      method: null,
      unavailable_reason:
        activity.profile_id === viewerId ? "activity_data_missing" : "private_data",
      trimp: null,
      trimp_source: null,
      training_effect: null,
    },
    zones: { hr: [], power: [] },
    computed_as_of: activity.started_at.toISOString(),
  };
  const ownedDerived =
    activity.profile_id === viewerId
      ? await buildActivityDerivedSummaryMap({
          store: createActivityAnalysisStore(db),
          profileId: activity.profile_id,
          activities: [activity],
        })
      : null;
  const parentDerived = ownedDerived?.get(activity.id);
  const resolvedDerived: ActivityDerivedMetrics = parentDerived
    ? {
        stress: {
          ...parentDerived,
          trimp: null,
          trimp_source: null,
          training_effect: null,
        },
        zones: { hr: [], power: [] },
        computed_as_of: parentDerived.computed_as_of,
      }
    : derived;
  const response = mapActivityToDerivedResponse({
    activity: {
      ...decorateActivity(activity),
      likes_count: getLikeStats(likeStats, activityId).likes_count,
      activity_plans:
        activity.profile_id === viewerId && row.activityPlan
          ? {
              ...row.activityPlan,
              created_at:
                row.activityPlan.created_at instanceof Date
                  ? row.activityPlan.created_at.toISOString()
                  : row.activityPlan.created_at,
              updated_at:
                row.activityPlan.updated_at instanceof Date
                  ? row.activityPlan.updated_at.toISOString()
                  : row.activityPlan.updated_at,
            }
          : null,
    },
    has_liked: getLikeStats(likeStats, activityId).has_liked,
    derived: resolvedDerived,
  });
  return {
    ...response,
    activity: {
      ...response.activity,
      segments: activity.segments,
      current_artifact: currentArtifact,
      ingestion: ingestion ?? null,
    },
  };
}
