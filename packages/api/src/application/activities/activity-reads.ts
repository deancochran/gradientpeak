import {
  type ActivityListDerivedSummary,
  analyzeActivityDerivedMetrics,
  parseActivityLapRecords,
} from "@repo/core";
import { activities, activityFileIngestions, activityPlans } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivityDerivedSummaryMap,
  mapActivityToDerivedResponse,
  mapActivityToListDerivedResponse,
  resolveActivityContextAsOf,
} from "../../lib/activity-analysis";
import { getLikeStats, loadLikeStats } from "../../repositories/like-stats";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";

type Db = ReturnType<typeof getRequiredDb>;

export type ActivityListQueryInput = {
  limit: number;
  cursor?: string;
  activity_category?: NonNullable<typeof activities.$inferSelect.type>;
  search?: string;
  date_from?: string;
  date_to?: string;
  sort_by: "date" | "distance" | "duration" | "tss";
  sort_order: "asc" | "desc";
};

const tssSortBatchSize = 200;

type ActivityRow = typeof activities.$inferSelect;

function compareTssCandidates(
  a: { activity: ActivityRow; derived: ActivityListDerivedSummary | null },
  b: { activity: ActivityRow; derived: ActivityListDerivedSummary | null },
  sortOrder: ActivityListQueryInput["sort_order"],
) {
  const aTss = a.derived?.tss ?? null;
  const bTss = b.derived?.tss ?? null;
  if (aTss !== bTss) {
    if (aTss === null) return sortOrder === "asc" ? -1 : 1;
    if (bTss === null) return sortOrder === "asc" ? 1 : -1;
    return sortOrder === "asc" ? aTss - bTss : bTss - aTss;
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
  if (input.activity_category) conditions.push(eq(activities.type, input.activity_category));
  if (input.search)
    conditions.push(
      or(
        ilike(activities.name, `%${input.search}%`),
        ilike(activities.notes, `%${input.search}%`),
      )!,
    );
  if (input.date_from) conditions.push(gte(activities.started_at, new Date(input.date_from)));
  if (input.date_to) conditions.push(lte(activities.started_at, new Date(input.date_to)));
  const whereClause = and(...conditions);
  const distance = sql<number>`${activities.distance_meters}`;
  const duration = sql<number>`${activities.duration_seconds}`;
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
              : desc(input.sort_by === "distance" ? distance : duration),
          )
          .limit(input.limit)
          .offset(offset)
      : db
          .select()
          .from(activities)
          .where(whereClause)
          .orderBy(input.sort_order === "asc" ? activities.started_at : desc(activities.started_at))
          .limit(input.limit)
          .offset(offset);
  const totalRowsPromise = db.select({ total: count() }).from(activities).where(whereClause);
  if (input.sort_by === "tss") {
    const totalRows = await totalRowsPromise;
    const total = Number(totalRows[0]?.total ?? 0);
    // TSS depends on the athlete context at each activity timestamp and therefore cannot be
    // expressed as a canonical activities-table sort. Read every matching row in bounded
    // batches, load one fixed evidence snapshot for the candidates, then apply one deterministic
    // global ordering before slicing the page. Cross-request cursor stability under new writes
    // intentionally retains the existing index-offset semantics.
    const candidates: Array<{
      activity: ActivityRow;
      derived: ActivityListDerivedSummary | null;
    }> = [];
    for (let batchOffset = 0; batchOffset < total; batchOffset += tssSortBatchSize) {
      const batch = (await db
        .select()
        .from(activities)
        .where(whereClause)
        .orderBy(desc(activities.started_at), desc(activities.id))
        .limit(tssSortBatchSize)
        .offset(batchOffset)) as ActivityRow[];
      if (batch.length === 0) break;
      const normalizedBatch = batch.map(normalizeActivityLaps);
      candidates.push(
        ...normalizedBatch.map((activity) => ({
          activity,
          derived: null,
        })),
      );
      if (batch.length < tssSortBatchSize) break;
    }

    const derivedByActivityId = await buildActivityDerivedSummaryMap({
      store: createActivityAnalysisStore(db),
      profileId,
      activities: candidates.map(({ activity }) => activity),
    });
    for (const candidate of candidates) {
      candidate.derived = derivedByActivityId.get(candidate.activity.id) ?? null;
    }

    const page = candidates
      .sort((a, b) => compareTssCandidates(a, b, input.sort_order))
      .slice(offset, offset + input.limit);
    const likeStats = await loadLikeStats(db, {
      entityType: "activity",
      entityIds: page.map(({ activity }) => activity.id),
      viewerProfileId: profileId,
    });
    const items = page.map(({ activity, derived }) =>
      mapActivityToListDerivedResponse({
        activity: {
          ...activity,
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
  }

  const [totalRows, rawRows] = await Promise.all([totalRowsPromise, rowsPromise]);
  const total = Number(totalRows[0]?.total ?? 0);
  const activityRows = rawRows.map((row) =>
    row && typeof row === "object" && "activity" in row ? row.activity : row,
  ) as Array<typeof activities.$inferSelect>;
  const data = activityRows.map(normalizeActivityLaps);
  const derived = await buildActivityDerivedSummaryMap({
    store: createActivityAnalysisStore(db),
    profileId,
    activities: data,
  });
  const ids = data.map((activity) => activity.id);
  const likeStats = await loadLikeStats(db, {
    entityType: "activity",
    entityIds: ids,
    viewerProfileId: profileId,
  });
  const items = data.map((activity) =>
    mapActivityToListDerivedResponse({
      activity: { ...activity, likes_count: getLikeStats(likeStats, activity.id).likes_count },
      has_liked: getLikeStats(likeStats, activity.id).has_liked,
      derived: derived.get(activity.id) ?? null,
    }),
  );
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
    columns: { profile_id: true, is_private: true },
    where: eq(activities.id, activityId),
  });
  if (!access || (access.profile_id !== viewerId && access.is_private))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have permission to view this activity",
    });
  const [record, likeStats, ingestion] = await Promise.all([
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
      columns: { id: true, status: true, source: true, last_error_message: true },
      where: and(
        eq(activityFileIngestions.activity_id, activityId),
        eq(activityFileIngestions.profile_id, viewerId),
      ),
      orderBy: desc(activityFileIngestions.updated_at),
    }) ?? Promise.resolve(undefined),
  ]);
  const row = record[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
  const activity = normalizeActivityLaps(row.activity);
  const context = await resolveActivityContextAsOf({
    store: createActivityAnalysisStore(db),
    profileId: activity.profile_id,
    activityTimestamp: activity.finished_at,
  });
  const values = activity as typeof activity & Record<string, number | null>;
  const derived = analyzeActivityDerivedMetrics({
    activity: {
      id: activity.id,
      type: activity.type,
      started_at: activity.started_at.toISOString(),
      finished_at: activity.finished_at.toISOString(),
      duration_seconds: values.duration_seconds ?? 0,
      moving_seconds: values.moving_seconds ?? 0,
      distance_meters: values.distance_meters ?? 0,
      avg_heart_rate: values.avg_heart_rate,
      max_heart_rate: values.max_heart_rate,
      avg_power: values.avg_power,
      max_power: values.max_power,
      avg_speed_mps: values.avg_speed_mps,
      max_speed_mps: values.max_speed_mps,
      normalized_power: values.normalized_power,
      normalized_speed_mps: values.normalized_speed_mps,
      normalized_graded_speed_mps: values.normalized_graded_speed_mps,
    },
    context,
  });
  const response = mapActivityToDerivedResponse({
    activity: {
      ...activity,
      likes_count: getLikeStats(likeStats, activityId).likes_count,
      activity_plans: row.activityPlan
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
    derived,
  });
  return { ...response, activity: { ...response.activity, ingestion: ingestion ?? null } };
}
