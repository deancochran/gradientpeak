import { canonicalSportSchema } from "@repo/core";
import { publicCommentsRowSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { decodeFeedCursor } from "../application/feed/feedPage";
import type { getRequiredDb } from "../db";
import { deriveNormalizedPowerCompatibilityProjectionFromSegments } from "../lib/activity-analysis/activity-normalized-power";
import { buildUuidInList, parseCountValue } from "../utils/sql";
import { getLikeStats, type LikeStats } from "./like-stats";

type DbClient = ReturnType<typeof getRequiredDb>;
const timestampSchema = z.coerce.date();
const nullableNumericSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
}, z.number().nullable());
const positiveIntegerSchema = z.preprocess((value) => Number(value), z.number().int().positive());
const nullableNonnegativeIntegerSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
}, z.number().int().nonnegative().nullable());

const feedDerivedSchema = z
  .object({
    tss: z.number().nullable(),
    intensity_factor: z.number().nullable(),
    computed_as_of: z.string(),
  })
  .nullable();
const feedIngestionSchema = z
  .object({ status: z.string().nullable(), last_error_message: z.string().nullable() })
  .nullable();
const feedProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

const feedActivityRowSchema = z
  .object({
    id: z.string().uuid(),
    profile_id: z.string().uuid(),
    name: z.string(),
    category_composition: z.array(canonicalSportSchema),
    elapsed_ms: positiveIntegerSchema,
    active_ms: nullableNonnegativeIntegerSchema,
    moving_ms: nullableNonnegativeIntegerSchema,
    timing_coverage: z.enum(["complete", "partial", "unavailable"]),
    distance_meters: z.number().int().nonnegative(),
    avg_heart_rate: z.number().int().nullable(),
    max_heart_rate: z.number().int().nullable(),
    avg_power: z.number().int().nullable(),
    avg_cadence: z.number().int().nullable(),
    calories: z.number().int().nullable(),
    polyline: z.string().nullable(),
    is_private: z.boolean(),
    started_at: timestampSchema,
    finished_at: timestampSchema,
    created_at: timestampSchema,
    profile_username: z.string().nullable(),
    profile_avatar_url: z.string().nullable(),
    elevation_gain_meters: nullableNumericSchema,
    max_power: nullableNumericSchema.optional(),
    avg_speed_mps: nullableNumericSchema.optional(),
    max_speed_mps: nullableNumericSchema.optional(),
    normalized_speed_mps: nullableNumericSchema.optional(),
    normalized_graded_speed_mps: nullableNumericSchema.optional(),
    ingestion_status: z.string().nullable().optional(),
    ingestion_last_error_message: z.string().nullable().optional(),
    content_visibility: z.enum(["private", "followers", "public"]),
  })
  .strict();
const feedActivityDetailRowSchema = feedActivityRowSchema.extend({
  notes: z.string().nullable(),
  max_power: nullableNumericSchema,
  max_cadence: z.number().int().nullable(),
  elevation_loss_meters: nullableNumericSchema,
  map_bounds: z.unknown().nullable(),
  viewer_follows_owner: z.boolean(),
});
const commentCountRowSchema = z.object({
  entity_id: z.string().uuid(),
  comments_count: z.preprocess(parseCountValue, z.number().int().nonnegative()),
});
const activityCommentRowSchema = publicCommentsRowSchema
  .pick({ id: true, content: true, created_at: true })
  .extend({
    created_at: timestampSchema,
    profile_id: z.string().uuid().nullable(),
    profile_username: z.string().nullable(),
    profile_avatar_url: z.string().nullable(),
  });

export const feedActivityDtoSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  name: z.string(),
  type: canonicalSportSchema.nullable(),
  activity_kind: z.enum(["single", "multisport", "unknown"]),
  activity_categories: z.array(canonicalSportSchema),
  started_at: z.string(),
  finished_at: z.string(),
  distance_meters: z.number(),
  elapsed_seconds: z.number().positive(),
  duration_seconds: z.number().nonnegative().nullable(),
  moving_seconds: z.number().nonnegative().nullable(),
  avg_heart_rate: z.number().nullable(),
  max_heart_rate: z.number().nullable(),
  avg_power: z.number().nullable(),
  avg_cadence: z.number().nullable(),
  elevation_gain_meters: z.number().nullable(),
  calories: z.number().nullable(),
  polyline: z.string().nullable(),
  likes_count: z.number(),
  comments_count: z.number().int().nonnegative(),
  is_private: z.boolean(),
  content_visibility: z.enum(["private", "followers", "public"]),
  created_at: z.string(),
  profile: feedProfileSchema,
  has_liked: z.boolean(),
  derived: feedDerivedSchema,
  ingestion: feedIngestionSchema.optional(),
});
export const feedResponseSchema = z.object({
  items: z.array(feedActivityDtoSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
const activityCommentDtoSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  created_at: z.string(),
  profile: feedProfileSchema.nullable(),
});
export const feedActivityDetailDtoSchema = feedActivityDtoSchema.omit({ derived: true }).extend({
  notes: z.string().nullable(),
  max_power: z.number().nullable(),
  max_cadence: z.number().nullable(),
  normalized_power: z.number().nullable(),
  elevation_loss_meters: z.number().nullable(),
  map_bounds: z.unknown().nullable(),
  comments_count: z.number().int().nonnegative(),
  comments: z.array(activityCommentDtoSchema),
});

export type FeedActivity = z.infer<typeof feedActivityDtoSchema>;
export type FeedActivityRow = z.infer<typeof feedActivityRowSchema>;
export type FeedActivityDetailRow = z.infer<typeof feedActivityDetailRowSchema>;

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function mapFeedActivity(
  activity: FeedActivityRow,
  options: {
    commentCounts: Map<string, number>;
    derivedMap: Map<string, FeedActivity["derived"]>;
    likeStats: Map<string, LikeStats>;
  },
): FeedActivity {
  const category =
    activity.category_composition.length === 1 ? (activity.category_composition[0] ?? null) : null;
  const activityKind =
    activity.category_composition.length === 0
      ? "unknown"
      : activity.category_composition.length === 1
        ? "single"
        : "multisport";
  const hasTiming = activity.timing_coverage !== "unavailable";
  return feedActivityDtoSchema.parse({
    id: activity.id,
    profile_id: activity.profile_id,
    name: activity.name,
    type: category,
    activity_kind: activityKind,
    activity_categories: activity.category_composition,
    started_at: toIsoString(activity.started_at),
    finished_at: toIsoString(activity.finished_at),
    distance_meters: activity.distance_meters,
    elapsed_seconds: activity.elapsed_ms / 1000,
    duration_seconds: hasTiming && activity.active_ms !== null ? activity.active_ms / 1000 : null,
    moving_seconds: hasTiming && activity.moving_ms !== null ? activity.moving_ms / 1000 : null,
    avg_heart_rate: activity.avg_heart_rate,
    max_heart_rate: activity.max_heart_rate,
    avg_power: activity.avg_power,
    avg_cadence: activity.avg_cadence,
    elevation_gain_meters: activity.elevation_gain_meters,
    calories: activity.calories,
    polyline: activity.polyline,
    likes_count: getLikeStats(options.likeStats, activity.id).likes_count,
    comments_count: options.commentCounts.get(activity.id) ?? 0,
    is_private: activity.is_private,
    content_visibility: activity.content_visibility,
    created_at: toIsoString(activity.created_at),
    profile: {
      id: activity.profile_id,
      username: activity.profile_username,
      avatar_url: activity.profile_avatar_url,
    },
    has_liked: getLikeStats(options.likeStats, activity.id).has_liked,
    derived: options.derivedMap.get(activity.id) ?? null,
    ingestion: activity.ingestion_status
      ? {
          status: activity.ingestion_status,
          last_error_message: activity.ingestion_last_error_message ?? null,
        }
      : null,
  });
}

export async function listFeedActivityRows(
  db: DbClient,
  viewerId: string,
  input: { cursor?: string | null; limit: number },
) {
  const decodedCursor = decodeFeedCursor(input.cursor);
  const cursorFilter = decodedCursor
    ? decodedCursor.id
      ? sql`and (a.started_at < ${decodedCursor.startedAt} or (a.started_at = ${decodedCursor.startedAt} and a.id < ${decodedCursor.id}::uuid))`
      : sql`and a.started_at < ${decodedCursor.startedAt}`
    : sql``;
  const result = await db.execute(sql<FeedActivityRow>`
    select
      a.id, a.profile_id, a.name, a.started_at, a.finished_at,
      coalesce(array(
        select s.category from activity_segments s
        where s.activity_id = a.id and s.role = 'activity'
        order by s.ordinal
      ), array[]::text[]) as category_composition,
      a.distance_meters, a.elapsed_ms, a.active_ms, a.moving_ms, a.timing_coverage,
      a.avg_heart_rate,
      a.max_heart_rate, a.avg_power, a.max_power, a.avg_cadence, a.avg_speed_mps,
       a.max_speed_mps, a.normalized_speed_mps,
      a.normalized_graded_speed_mps, a.elevation_gain_meters, a.calories, a.polyline,
      a.is_private, a.content_visibility, a.created_at,
      p.username as profile_username, p.avatar_url as profile_avatar_url,
      afi.status as ingestion_status, afi.last_error_message as ingestion_last_error_message
    from activities a
    left join profiles p on p.id = a.profile_id
    left join lateral (
      select status, last_error_message from activity_file_ingestions
      where activity_id = a.id and profile_id = a.profile_id
      order by updated_at desc limit 1
    ) afi on true
    where (
      a.profile_id = ${viewerId}::uuid
      or a.content_visibility = 'public'
      or (
        a.content_visibility = 'followers'
        and exists (
          select 1 from follows f
          where f.follower_id = ${viewerId}::uuid
            and f.following_id = a.profile_id and f.status = 'accepted'
        )
      )
    )
      ${cursorFilter}
    order by a.started_at desc, a.id desc
    limit ${input.limit + 1}
  `);
  return z.array(feedActivityRowSchema).parse(result.rows);
}

export async function loadFeedActivityCommentCounts(db: DbClient, activityIds: string[]) {
  const commentCounts = new Map<string, number>();
  if (activityIds.length === 0) return commentCounts;
  const result = await db.execute(sql`
    select c.entity_id, count(*)::int as comments_count
    from comments c
    where c.entity_type = 'activity' and c.entity_id in (${buildUuidInList(activityIds)})
    group by c.entity_id
  `);
  for (const comment of z.array(commentCountRowSchema).parse(result.rows)) {
    commentCounts.set(comment.entity_id, comment.comments_count);
  }
  return commentCounts;
}

export async function loadFeedActivityDetail(db: DbClient, viewerId: string, activityId: string) {
  const result = await db.execute(sql<FeedActivityDetailRow>`
    select
      a.id, a.profile_id, a.name, a.notes, a.started_at, a.finished_at,
      coalesce(array(
        select s.category from activity_segments s
        where s.activity_id = a.id and s.role = 'activity'
        order by s.ordinal
      ), array[]::text[]) as category_composition,
      a.distance_meters, a.elapsed_ms, a.active_ms, a.moving_ms, a.timing_coverage,
      a.avg_heart_rate,
      a.max_heart_rate, a.avg_power, a.max_power, a.avg_cadence, a.max_cadence,
       a.elevation_gain_meters, a.elevation_loss_meters,
      a.calories, a.polyline, a.map_bounds, a.is_private, a.content_visibility,
      a.created_at, p.username as profile_username, p.avatar_url as profile_avatar_url,
      exists (
        select 1 from follows f where f.follower_id = ${viewerId}::uuid
          and f.following_id = a.profile_id and f.status = 'accepted'
      ) as viewer_follows_owner
    from activities a
    left join profiles p on p.id = a.profile_id
    where a.id = ${activityId}::uuid
    limit 1
  `);
  const activity = result.rows[0] ? feedActivityDetailRowSchema.parse(result.rows[0]) : null;
  if (!activity) throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
  const visibility = activity.content_visibility ?? (activity.is_private ? "private" : "followers");
  if (
    activity.profile_id !== viewerId &&
    visibility !== "public" &&
    (visibility !== "followers" || !activity.viewer_follows_owner)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have permission to view this activity",
    });
  }
  return activity;
}

export async function loadFeedActivityComments(db: DbClient, activityId: string) {
  const result = await db.execute(sql`
    select c.id, c.content, c.created_at, p.id as profile_id,
      p.username as profile_username, p.avatar_url as profile_avatar_url
    from comments c
    left join profiles p on p.id = c.profile_id
    where c.entity_id = ${activityId}::uuid and c.entity_type = 'activity'
    order by c.created_at asc
  `);
  return z.array(activityCommentDtoSchema).parse(
    z
      .array(activityCommentRowSchema)
      .parse(result.rows)
      .map((comment) => ({
        id: comment.id,
        content: comment.content,
        created_at: toIsoString(comment.created_at),
        profile: comment.profile_id
          ? {
              id: comment.profile_id,
              username: comment.profile_username,
              avatar_url: comment.profile_avatar_url,
            }
          : null,
      })),
  );
}

export function mapFeedActivityDetail(
  activity: FeedActivityDetailRow,
  likeStats: Map<string, LikeStats>,
  comments: z.infer<typeof activityCommentDtoSchema>[],
  segments: readonly { role: string; summary: unknown }[],
) {
  const category =
    activity.category_composition.length === 1 ? (activity.category_composition[0] ?? null) : null;
  const activityKind =
    activity.category_composition.length === 0
      ? "unknown"
      : activity.category_composition.length === 1
        ? "single"
        : "multisport";
  const hasTiming = activity.timing_coverage !== "unavailable";
  return feedActivityDetailDtoSchema.parse({
    id: activity.id,
    profile_id: activity.profile_id,
    name: activity.name,
    type: category,
    activity_kind: activityKind,
    activity_categories: activity.category_composition,
    notes: activity.notes,
    started_at: toIsoString(activity.started_at),
    finished_at: toIsoString(activity.finished_at),
    distance_meters: activity.distance_meters,
    elapsed_seconds: activity.elapsed_ms / 1000,
    duration_seconds: hasTiming && activity.active_ms !== null ? activity.active_ms / 1000 : null,
    moving_seconds: hasTiming && activity.moving_ms !== null ? activity.moving_ms / 1000 : null,
    avg_heart_rate: activity.avg_heart_rate,
    max_heart_rate: activity.max_heart_rate,
    avg_power: activity.avg_power,
    max_power: activity.max_power,
    avg_cadence: activity.avg_cadence,
    max_cadence: activity.max_cadence,
    normalized_power: deriveNormalizedPowerCompatibilityProjectionFromSegments(segments),
    elevation_gain_meters: activity.elevation_gain_meters,
    elevation_loss_meters: activity.elevation_loss_meters,
    calories: activity.calories,
    polyline: activity.polyline,
    map_bounds: activity.map_bounds,
    likes_count: getLikeStats(likeStats, activity.id).likes_count,
    is_private: activity.is_private,
    content_visibility: activity.content_visibility,
    created_at: toIsoString(activity.created_at),
    profile: {
      id: activity.profile_id,
      username: activity.profile_username,
      avatar_url: activity.profile_avatar_url,
    },
    has_liked: getLikeStats(likeStats, activity.id).has_liked,
    comments_count: comments.length,
    comments,
  });
}
