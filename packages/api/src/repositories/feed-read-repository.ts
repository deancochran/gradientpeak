import {
  type ActivityDisplayModel,
  activityDisplayModelSchema,
  canonicalActivityCategorySchema,
  createSemanticMetric,
  type SemanticMetric,
} from "@repo/core";
import { activities, activitySegments, comments, follows, profiles } from "@repo/db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
} from "drizzle-orm";
import { z } from "zod";
import { decodeFeedCursor } from "../application/feed/feedPage";
import { resolveProfileMediaUrl } from "../application/storage/profile-media-url";
import type { getRequiredDb } from "../db";
import type { ActivityQuantifiedDerivedSummary } from "../lib/activity-analysis/derived";
import { projectCompletedActivityCommonLoadMetrics } from "../lib/completed-activity-common-load-metrics";
import { parseCountValue } from "../utils/sql";
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
const feedActivityBaseRowSchema = feedActivityRowSchema.omit({ category_composition: true });
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
      ? or(
          lt(activities.started_at, decodedCursor.startedAt),
          and(
            eq(activities.started_at, decodedCursor.startedAt),
            lt(activities.id, decodedCursor.id),
          ),
        )
      : lt(activities.started_at, decodedCursor.startedAt)
    : undefined;
  const visibleToViewer = or(
    eq(activities.profile_id, viewerId),
    eq(activities.content_visibility, "public"),
    and(
      eq(activities.content_visibility, "followers"),
      // This correlated predicate is required to keep follower visibility in the page query.
      // Its tables and predicate values remain schema-bound Drizzle expressions.
      exists(
        db
          .select({ followerId: follows.follower_id })
          .from(follows)
          .where(
            and(
              eq(follows.follower_id, viewerId),
              eq(follows.following_id, activities.profile_id),
              eq(follows.status, "accepted"),
            ),
          ),
      ),
    ),
  );
  const rows = await db
    .select({
      id: activities.id,
      profile_id: activities.profile_id,
      name: activities.name,
      elapsed_ms: activities.elapsed_ms,
      active_ms: activities.active_ms,
      moving_ms: activities.moving_ms,
      timing_coverage: activities.timing_coverage,
      distance_meters: activities.distance_meters,
      avg_heart_rate: activities.avg_heart_rate,
      max_heart_rate: activities.max_heart_rate,
      avg_power: activities.avg_power,
      max_power: activities.max_power,
      avg_cadence: activities.avg_cadence,
      avg_speed_mps: activities.avg_speed_mps,
      max_speed_mps: activities.max_speed_mps,
      normalized_speed_mps: activities.normalized_speed_mps,
      elevation_gain_meters: activities.elevation_gain_meters,
      calories: activities.calories,
      has_route: isNotNull(activities.polyline),
      started_at: activities.started_at,
      finished_at: activities.finished_at,
      content_visibility: activities.content_visibility,
      profile_username: profiles.username,
      profile_avatar_url: profiles.avatar_url,
    })
    .from(activities)
    .leftJoin(profiles, eq(profiles.id, activities.profile_id))
    .where(
      and(
        visibleToViewer,
        isNotNull(activities.started_at),
        or(isNull(activities.entry_provenance), ne(activities.entry_provenance, "manual")),
        input.profileId ? eq(activities.profile_id, input.profileId) : undefined,
        cursorFilter,
      ),
    )
    .orderBy(desc(activities.started_at), desc(activities.id))
    .limit(input.limit + 1);
  const activityIds = rows.map((row) => row.id);
  const segmentRows =
    activityIds.length === 0
      ? []
      : await db
          .select({
            activity_id: activitySegments.activity_id,
            activity_category: activitySegments.activity_category,
          })
          .from(activitySegments)
          .where(
            and(
              inArray(activitySegments.activity_id, activityIds),
              eq(activitySegments.role, "activity"),
            ),
          )
          .orderBy(asc(activitySegments.activity_id), asc(activitySegments.ordinal));
  const categoriesByActivityId = new Map<string, unknown[]>();
  for (const segment of segmentRows) {
    categoriesByActivityId.set(segment.activity_id, [
      ...(categoriesByActivityId.get(segment.activity_id) ?? []),
      segment.activity_category,
    ]);
  }
  return z.array(feedActivityRowSchema).parse(
    rows.map((row) => ({
      ...feedActivityBaseRowSchema.parse(row),
      category_composition: categoriesByActivityId.get(row.id) ?? [],
    })),
  );
}

export async function loadFeedActivityCommentCounts(db: DbClient, activityIds: string[]) {
  const commentCounts = new Map<string, number>();
  if (activityIds.length === 0) return commentCounts;
  const rows = await db
    .select({ entity_id: comments.entity_id, comments_count: count(comments.id) })
    .from(comments)
    .where(and(eq(comments.entity_type, "activity"), inArray(comments.entity_id, activityIds)))
    .groupBy(comments.entity_id);
  for (const comment of z.array(commentCountRowSchema).parse(rows)) {
    commentCounts.set(comment.entity_id, comment.comments_count);
  }
  return commentCounts;
}
