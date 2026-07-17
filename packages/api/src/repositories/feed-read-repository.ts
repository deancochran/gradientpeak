import { publicActivitiesRowSchema, publicCommentsRowSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { decodeFeedCursor } from "../application/feed/feedPage";
import type { getRequiredDb } from "../db";
import { buildUuidInList, parseCountValue } from "../utils/sql";
import { getLikeStats, type LikeStats } from "./like-stats";

type DbClient = ReturnType<typeof getRequiredDb>;
const timestampSchema = z.union([z.date(), z.string()]);
const nullableNumericSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
}, z.number().nullable());

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

const feedActivityRowSchema = publicActivitiesRowSchema
  .pick({
    id: true,
    profile_id: true,
    name: true,
    type: true,
    distance_meters: true,
    duration_seconds: true,
    moving_seconds: true,
    avg_heart_rate: true,
    max_heart_rate: true,
    avg_power: true,
    avg_cadence: true,
    elevation_gain_meters: true,
    calories: true,
    polyline: true,
    activity_file_path: true,
    is_private: true,
    content_visibility: true,
  })
  .extend({
    started_at: timestampSchema,
    finished_at: timestampSchema,
    created_at: timestampSchema,
    profile_username: z.string().nullable(),
    profile_avatar_url: z.string().nullable(),
    elevation_gain_meters: nullableNumericSchema,
    max_power: nullableNumericSchema.optional(),
    avg_speed_mps: nullableNumericSchema.optional(),
    max_speed_mps: nullableNumericSchema.optional(),
    normalized_power: nullableNumericSchema.optional(),
    normalized_speed_mps: nullableNumericSchema.optional(),
    normalized_graded_speed_mps: nullableNumericSchema.optional(),
    ingestion_status: z.string().nullable().optional(),
    ingestion_last_error_message: z.string().nullable().optional(),
    content_visibility: z.enum(["private", "followers", "public"]).optional(),
  });
const feedActivityDetailRowSchema = feedActivityRowSchema.extend({
  notes: publicActivitiesRowSchema.shape.notes,
  max_power: nullableNumericSchema,
  max_cadence: publicActivitiesRowSchema.shape.max_cadence,
  normalized_power: nullableNumericSchema,
  elevation_loss_meters: nullableNumericSchema,
  map_bounds: publicActivitiesRowSchema.shape.map_bounds,
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
  type: z.string(),
  started_at: z.string(),
  finished_at: z.string(),
  distance_meters: z.number(),
  duration_seconds: z.number(),
  moving_seconds: z.number(),
  avg_heart_rate: z.number().nullable(),
  max_heart_rate: z.number().nullable(),
  avg_power: z.number().nullable(),
  avg_cadence: z.number().nullable(),
  elevation_gain_meters: z.number().nullable(),
  calories: z.number().nullable(),
  polyline: z.string().nullable(),
  activity_file_path: z.string().nullable(),
  likes_count: z.number(),
  comments_count: z.number().int().nonnegative(),
  is_private: z.boolean(),
  content_visibility: z.enum(["private", "followers", "public"]).optional(),
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
  map_bounds: publicActivitiesRowSchema.shape.map_bounds,
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
  return feedActivityDtoSchema.parse({
    id: activity.id,
    profile_id: activity.profile_id,
    name: activity.name,
    type: activity.type,
    started_at: toIsoString(activity.started_at),
    finished_at: toIsoString(activity.finished_at),
    distance_meters: activity.distance_meters,
    duration_seconds: activity.duration_seconds,
    moving_seconds: activity.moving_seconds,
    avg_heart_rate: activity.avg_heart_rate,
    max_heart_rate: activity.max_heart_rate,
    avg_power: activity.avg_power,
    avg_cadence: activity.avg_cadence,
    elevation_gain_meters: activity.elevation_gain_meters,
    calories: activity.calories,
    polyline: activity.polyline,
    activity_file_path: activity.activity_file_path,
    likes_count: getLikeStats(options.likeStats, activity.id).likes_count,
    comments_count: options.commentCounts.get(activity.id) ?? 0,
    is_private: activity.is_private,
    ...(activity.content_visibility === undefined
      ? {}
      : { content_visibility: activity.content_visibility }),
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
      a.id, a.profile_id, a.name, a.type, a.started_at, a.finished_at,
      a.distance_meters, a.duration_seconds, a.moving_seconds, a.avg_heart_rate,
      a.max_heart_rate, a.avg_power, a.max_power, a.avg_cadence, a.avg_speed_mps,
      a.max_speed_mps, a.normalized_power, a.normalized_speed_mps,
      a.normalized_graded_speed_mps, a.elevation_gain_meters, a.calories, a.polyline,
      a.activity_file_path, a.is_private, a.content_visibility, a.created_at,
      p.username as profile_username, p.avatar_url as profile_avatar_url,
      afi.status as ingestion_status, afi.last_error_message as ingestion_last_error_message
    from activities a
    left join profiles p on p.id = a.profile_id
    left join lateral (
      select status, last_error_message from activity_file_ingestions
      where activity_id = a.id and profile_id = a.profile_id
      order by updated_at desc limit 1
    ) afi on true
    where a.content_visibility <> 'private'
      and (a.profile_id = ${viewerId}::uuid or a.content_visibility = 'public' or exists (
        select 1 from follows f
        where f.follower_id = ${viewerId}::uuid
          and f.following_id = a.profile_id and f.status = 'accepted'
      ))
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
      a.id, a.profile_id, a.name, a.type, a.notes, a.started_at, a.finished_at,
      a.distance_meters, a.duration_seconds, a.moving_seconds, a.avg_heart_rate,
      a.max_heart_rate, a.avg_power, a.max_power, a.avg_cadence, a.max_cadence,
      a.normalized_power, a.elevation_gain_meters, a.elevation_loss_meters,
      a.calories, a.polyline, a.activity_file_path, a.map_bounds, a.is_private, a.content_visibility,
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
) {
  return feedActivityDetailDtoSchema.parse({
    id: activity.id,
    profile_id: activity.profile_id,
    name: activity.name,
    type: activity.type,
    notes: activity.notes,
    started_at: toIsoString(activity.started_at),
    finished_at: toIsoString(activity.finished_at),
    distance_meters: activity.distance_meters,
    duration_seconds: activity.duration_seconds,
    moving_seconds: activity.moving_seconds,
    avg_heart_rate: activity.avg_heart_rate,
    max_heart_rate: activity.max_heart_rate,
    avg_power: activity.avg_power,
    max_power: activity.max_power,
    avg_cadence: activity.avg_cadence,
    max_cadence: activity.max_cadence,
    normalized_power: activity.normalized_power,
    elevation_gain_meters: activity.elevation_gain_meters,
    elevation_loss_meters: activity.elevation_loss_meters,
    calories: activity.calories,
    polyline: activity.polyline,
    activity_file_path: activity.activity_file_path,
    map_bounds: activity.map_bounds,
    likes_count: getLikeStats(likeStats, activity.id).likes_count,
    is_private: activity.is_private,
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
