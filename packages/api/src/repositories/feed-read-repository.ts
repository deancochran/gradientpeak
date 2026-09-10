import {
  type ActivityDisplayModel,
  activityDisplayModelSchema,
  canonicalActivityCategorySchema,
  createSemanticMetric,
  type SemanticMetric,
} from "@repo/core";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { decodeFeedCursor } from "../application/feed/feedPage";
import { resolveProfileMediaUrl } from "../application/storage/profile-media-url";
import type { getRequiredDb } from "../db";
import type { ActivityQuantifiedDerivedSummary } from "../lib/activity-analysis/derived";
import { projectCompletedActivityCommonLoadMetrics } from "../lib/completed-activity-common-load-metrics";
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

const feedActivityRowSchema = z
  .object({
    id: z.string().uuid(),
    profile_id: z.string().uuid(),
    name: z.string(),
    category_composition: z.array(canonicalActivityCategorySchema),
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
    has_route: z.boolean(),
    started_at: timestampSchema,
    finished_at: timestampSchema,
    profile_username: z.string().nullable(),
    profile_avatar_url: z.string().nullable(),
    elevation_gain_meters: nullableNumericSchema,
    max_power: nullableNumericSchema.optional(),
    avg_speed_mps: nullableNumericSchema.optional(),
    max_speed_mps: nullableNumericSchema.optional(),
    normalized_speed_mps: nullableNumericSchema.optional(),
    content_visibility: z.enum(["private", "followers", "public"]),
  })
  .strict();
const commentCountRowSchema = z.object({
  entity_id: z.string().uuid(),
  comments_count: z.preprocess(parseCountValue, z.number().int().nonnegative()),
});

export const feedActivityDtoSchema = activityDisplayModelSchema;
export const feedResponseSchema = z.strictObject({
  items: z.array(feedActivityDtoSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export type FeedActivity = ActivityDisplayModel;
export type FeedActivityRow = z.infer<typeof feedActivityRowSchema>;

function feedDisplayMetrics(input: {
  derived: ActivityQuantifiedDerivedSummary | null;
  distanceMeters: number;
  elapsedSeconds: number;
  activeSeconds: number | null;
  movingSeconds: number | null;
  timingCoverage: FeedActivityRow["timing_coverage"];
}): SemanticMetric[] {
  const metrics = projectCompletedActivityCommonLoadMetrics(
    input.derived?.observationQuantification,
  );
  metrics.push(
    {
      key: "distance",
      label: "Distance",
      status: "available",
      value: input.distanceMeters,
      unit: "meters",
      reason: null,
    },
    {
      key: "elapsed_duration",
      label: "Elapsed",
      status: "available",
      value: input.elapsedSeconds,
      unit: "seconds",
      reason: null,
    },
  );
  if (input.activeSeconds !== null) {
    metrics.push(
      createSemanticMetric({
        key: "active_duration",
        label: "Active",
        status: input.timingCoverage === "partial" ? "partial" : "available",
        value: input.activeSeconds,
        unit: "seconds",
        reason: input.timingCoverage === "partial" ? "source_coverage_partial" : null,
      }),
    );
  }
  if (input.movingSeconds !== null) {
    metrics.push(
      createSemanticMetric({
        key: "moving_duration",
        label: "Moving",
        status: input.timingCoverage === "partial" ? "partial" : "available",
        value: input.movingSeconds,
        unit: "seconds",
        reason: input.timingCoverage === "partial" ? "source_coverage_partial" : null,
      }),
    );
  }
  return metrics;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toDisplayOwner(input: { id: string; username: string | null; avatarUrl: string | null }) {
  return {
    id: input.id,
    username: input.username?.trim() || null,
    avatarUrl: resolveProfileMediaUrl(input.avatarUrl, input.id),
  };
}

export function mapFeedActivity(
  activity: FeedActivityRow,
  options: {
    commentCounts: Map<string, number>;
    derivedMap: Map<string, ActivityQuantifiedDerivedSummary>;
    likeStats: Map<string, LikeStats>;
    viewerId: string;
  },
): FeedActivity {
  const activityKind =
    activity.category_composition.length === 0
      ? "unknown"
      : activity.category_composition.length === 1
        ? "single"
        : "multisport";
  const hasTiming = activity.timing_coverage !== "unavailable";
  const derived = options.derivedMap.get(activity.id) ?? null;
  const elapsedSeconds = activity.elapsed_ms / 1000;
  const activeSeconds = hasTiming && activity.active_ms !== null ? activity.active_ms / 1000 : null;
  const movingSeconds = hasTiming && activity.moving_ms !== null ? activity.moving_ms / 1000 : null;
  return feedActivityDtoSchema.parse({
    contractVersion: "activity-display-v1",
    id: activity.id,
    href: `/activities/${activity.id}`,
    owner: toDisplayOwner({
      id: activity.profile_id,
      username: activity.profile_username,
      avatarUrl: activity.profile_avatar_url,
    }),
    time: {
      startedAt: toIsoString(activity.started_at),
      finishedAt: toIsoString(activity.finished_at),
    },
    activityComposition: { kind: activityKind, categories: activity.category_composition },
    title: activity.name.trim() || "Activity",
    notes: null,
    metrics: feedDisplayMetrics({
      derived,
      distanceMeters: activity.distance_meters,
      elapsedSeconds,
      activeSeconds,
      movingSeconds,
      timingCoverage: activity.timing_coverage,
    }),
    visibility: activity.content_visibility,
    engagement: {
      likes: getLikeStats(options.likeStats, activity.id).likes_count,
      comments: options.commentCounts.get(activity.id) ?? 0,
      viewerHasLiked: getLikeStats(options.likeStats, activity.id).has_liked,
    },
    capabilities: {
      canLike: true,
      canComment: true,
      canShare: activity.content_visibility === "public",
      canEdit: activity.profile_id === options.viewerId,
      canDelete: activity.profile_id === options.viewerId,
      hasRoute: activity.has_route,
    },
  });
}

export async function listFeedActivityRows(
  db: DbClient,
  viewerId: string,
  input: { cursor?: string | null; limit: number; profileId?: string },
) {
  const decodedCursor = decodeFeedCursor(input.cursor);
  const cursorFilter = decodedCursor
    ? decodedCursor.id
      ? sql`and (a.started_at < ${decodedCursor.startedAt} or (a.started_at = ${decodedCursor.startedAt} and a.id < ${decodedCursor.id}::uuid))`
      : sql`and a.started_at < ${decodedCursor.startedAt}`
    : sql``;
  const profileFilter = input.profileId ? sql`and a.profile_id = ${input.profileId}::uuid` : sql``;
  const result = await db.execute(sql<FeedActivityRow>`
    select
      a.id, a.profile_id, a.name, a.started_at, a.finished_at,
      coalesce((
        select jsonb_agg(s.activity_category order by s.ordinal) from activity_segments s
        where s.activity_id = a.id and s.role = 'activity'
      ), '[]'::jsonb) as category_composition,
      a.distance_meters, a.elapsed_ms, a.active_ms, a.moving_ms, a.timing_coverage,
      a.avg_heart_rate,
      a.max_heart_rate, a.avg_power, a.max_power, a.avg_cadence, a.avg_speed_mps,
      a.max_speed_mps, a.normalized_speed_mps,
       a.elevation_gain_meters, a.calories, (a.polyline is not null) as has_route,
       a.content_visibility,
      p.username as profile_username, p.avatar_url as profile_avatar_url
    from activities a
    left join profiles p on p.id = a.profile_id
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
      ${profileFilter}
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
