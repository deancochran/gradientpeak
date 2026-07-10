import { analyzeActivityDerivedMetrics } from "@repo/core";
import {
  activities,
  activityFileIngestions,
  activityGeometry,
  activityImports,
  activityLaps,
  activityPlans,
  activitySummaries,
  likes,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivityDerivedSummaryMap,
  mapActivityToDerivedResponse,
  mapActivityToListDerivedResponse,
  resolveActivityContextAsOf,
} from "../../lib/activity-analysis";
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

const tssSortMaxCandidates = 500;

function mergeActivitySummary<T extends typeof activities.$inferSelect>(
  activity: T,
  summary: typeof activitySummaries.$inferSelect | null,
): T {
  if (!summary) return activity;
  return {
    ...activity,
    ...Object.fromEntries(
      [
        "duration_seconds",
        "moving_seconds",
        "distance_meters",
        "elevation_gain_meters",
        "elevation_loss_meters",
        "calories",
        "avg_heart_rate",
        "max_heart_rate",
        "avg_power",
        "max_power",
        "normalized_power",
        "avg_cadence",
        "max_cadence",
        "avg_speed_mps",
        "max_speed_mps",
        "normalized_speed_mps",
        "normalized_graded_speed_mps",
        "avg_temperature",
        "avg_swolf",
        "efficiency_factor",
        "aerobic_decoupling",
        "pool_length",
        "total_strokes",
      ].map((key) => [key, summary[key as keyof typeof summary]]),
    ),
  } as T;
}

function mergeActivitySplitTables<T extends typeof activities.$inferSelect>(
  activity: T,
  split: {
    geometry?: typeof activityGeometry.$inferSelect | null;
    import?: typeof activityImports.$inferSelect | null;
    laps?: unknown[];
    summary?: typeof activitySummaries.$inferSelect | null;
  },
): T {
  const merged = mergeActivitySummary(activity, split.summary ?? null);
  const legacy = merged as typeof merged & Record<string, unknown>;
  const imported = split.import ?? null;
  const geometry = split.geometry ?? null;
  return {
    ...merged,
    provider: imported?.provider ?? legacy.provider,
    external_id: imported?.external_id ?? legacy.external_id,
    device_manufacturer: imported?.device_manufacturer ?? legacy.device_manufacturer,
    device_product: imported?.device_product ?? legacy.device_product,
    activity_file_path: imported?.activity_file_path ?? legacy.activity_file_path,
    activity_file_size: imported?.activity_file_size ?? legacy.activity_file_size,
    import_source: imported?.import_source ?? legacy.import_source,
    import_file_type: imported?.import_file_type ?? legacy.import_file_type,
    import_original_file_name:
      imported?.import_original_file_name ?? legacy.import_original_file_name,
    polyline: geometry?.polyline ?? legacy.polyline,
    map_bounds: geometry?.map_bounds ?? legacy.map_bounds,
    laps: split.laps ?? legacy.laps,
  } as T;
}

async function loadSplitMaps(db: Db, profileId: string, activityIds: string[]) {
  if (!activityIds.length)
    return {
      summaries: new Map<string, typeof activitySummaries.$inferSelect>(),
      imports: new Map<string, typeof activityImports.$inferSelect>(),
      geometries: new Map<string, typeof activityGeometry.$inferSelect>(),
    };
  const [summaries, imports, geometries] = await Promise.all([
    db
      .select()
      .from(activitySummaries)
      .where(
        and(
          eq(activitySummaries.profile_id, profileId),
          inArray(activitySummaries.activity_id, activityIds),
        ),
      ),
    db
      .select()
      .from(activityImports)
      .where(
        and(
          eq(activityImports.profile_id, profileId),
          inArray(activityImports.activity_id, activityIds),
        ),
      ),
    db
      .select()
      .from(activityGeometry)
      .where(
        and(
          eq(activityGeometry.profile_id, profileId),
          inArray(activityGeometry.activity_id, activityIds),
        ),
      ),
  ]);
  return {
    summaries: new Map(summaries.map((row) => [row.activity_id, row])),
    imports: new Map(imports.map((row) => [row.activity_id, row])),
    geometries: new Map(geometries.map((row) => [row.activity_id, row])),
  };
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
  const distance = sql<number>`${activitySummaries.distance_meters}`;
  const duration = sql<number>`${activitySummaries.duration_seconds}`;
  const candidateLimit = Math.min(
    Math.max(offset + input.limit, input.limit),
    tssSortMaxCandidates,
  );
  const rowsPromise =
    input.sort_by === "tss"
      ? db
          .select()
          .from(activities)
          .where(whereClause)
          .orderBy(desc(activities.started_at))
          .limit(candidateLimit)
      : input.sort_by === "distance" || input.sort_by === "duration"
        ? db
            .select({ activity: activities })
            .from(activities)
            .leftJoin(activitySummaries, eq(activities.id, activitySummaries.activity_id))
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
            .orderBy(
              input.sort_order === "asc" ? activities.started_at : desc(activities.started_at),
            )
            .limit(input.limit)
            .offset(offset);
  const [totalRows, rawRows] = await Promise.all([
    db.select({ total: count() }).from(activities).where(whereClause),
    rowsPromise,
  ]);
  const activityRows = rawRows.map((row) =>
    row && typeof row === "object" && "activity" in row ? row.activity : row,
  ) as Array<typeof activities.$inferSelect>;
  const splits = await loadSplitMaps(
    db,
    profileId,
    activityRows.map((activity) => activity.id),
  );
  const data = activityRows.map((activity) =>
    mergeActivitySplitTables(activity, {
      summary: splits.summaries.get(activity.id),
      import: splits.imports.get(activity.id),
      geometry: splits.geometries.get(activity.id),
    }),
  );
  const derived = await buildActivityDerivedSummaryMap({
    store: createActivityAnalysisStore(db),
    profileId,
    activities: data as any,
  });
  const ids = data.map((activity) => activity.id);
  const likeRows = ids.length
    ? await db
        .select({ entity_id: likes.entity_id })
        .from(likes)
        .where(
          and(
            eq(likes.profile_id, profileId),
            eq(likes.entity_type, "activity"),
            inArray(likes.entity_id, ids),
          ),
        )
    : [];
  const liked = new Set(likeRows.map((row) => row.entity_id));
  let items = data.map((activity) =>
    mapActivityToListDerivedResponse({
      activity,
      has_liked: liked.has(activity.id),
      derived: derived.get(activity.id) ?? null,
    }),
  );
  if (input.sort_by === "tss")
    items = items
      .sort((a: any, b: any) =>
        input.sort_order === "asc"
          ? (a.derived?.tss ?? -Infinity) - (b.derived?.tss ?? -Infinity)
          : (b.derived?.tss ?? -Infinity) - (a.derived?.tss ?? -Infinity),
      )
      .slice(offset, offset + input.limit);
  return {
    items,
    total: Number(totalRows[0]?.total ?? 0),
    ...buildIndexPageInfo({ offset, limit: input.limit, total: Number(totalRows[0]?.total ?? 0) }),
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
  const [record, likeData, ingestion] = await Promise.all([
    db
      .select({ activity: activities, activityPlan: activityPlans })
      .from(activities)
      .leftJoin(activityPlans, eq(activities.activity_plan_id, activityPlans.id))
      .where(eq(activities.id, activityId))
      .limit(1),
    db.query.likes.findFirst({
      columns: { id: true },
      where: and(
        eq(likes.profile_id, viewerId),
        eq(likes.entity_type, "activity"),
        eq(likes.entity_id, activityId),
      ),
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
  const [lapRows, summary, imported, geometry] = await Promise.all([
    db
      .select({ payload: activityLaps.payload })
      .from(activityLaps)
      .where(
        and(
          eq(activityLaps.activity_id, activityId),
          eq(activityLaps.profile_id, row.activity.profile_id),
        ),
      )
      .orderBy(activityLaps.lap_index),
    db.query.activitySummaries.findFirst({
      where: and(
        eq(activitySummaries.activity_id, activityId),
        eq(activitySummaries.profile_id, row.activity.profile_id),
      ),
    }),
    db.query.activityImports.findFirst({
      where: and(
        eq(activityImports.activity_id, activityId),
        eq(activityImports.profile_id, row.activity.profile_id),
      ),
    }),
    db.query.activityGeometry.findFirst({
      where: and(
        eq(activityGeometry.activity_id, activityId),
        eq(activityGeometry.profile_id, row.activity.profile_id),
      ),
    }),
  ]);
  const activity = mergeActivitySplitTables(row.activity, {
    summary,
    import: imported,
    geometry,
    laps:
      summary || imported || geometry || lapRows.length
        ? lapRows.map((lap) => lap.payload).filter((payload) => payload !== undefined)
        : undefined,
  });
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
      activity_plans: row.activityPlan
        ? {
            ...row.activityPlan,
            idx: row.activityPlan.idx ?? 0,
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
    has_liked: !!likeData,
    derived,
  });
  return { ...response, activity: { ...response.activity, ingestion: ingestion ?? null } };
}

export { mergeActivitySummary };
