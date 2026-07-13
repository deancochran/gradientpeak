import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import { buildActivityDerivedSummaryMap } from "../../lib/activity-analysis";
import {
  feedActivityDetailDtoSchema,
  feedResponseSchema,
  listFeedActivityRows,
  loadFeedActivityCommentCounts,
  loadFeedActivityComments,
  loadFeedActivityDetail,
  mapFeedActivity,
  mapFeedActivityDetail,
} from "../../repositories/feed-read-repository";
import { loadLikeStats } from "../../repositories/like-stats";
import { buildFeedPage } from "./feedPage";

type DbClient = ReturnType<typeof getRequiredDb>;

export type { FeedActivity } from "../../repositories/feed-read-repository";
export { feedActivityDetailDtoSchema, feedResponseSchema };

export async function getFeedForViewer({
  db,
  viewerId,
  input,
}: {
  db: DbClient;
  viewerId: string;
  input: { cursor?: string | null; limit: number };
}) {
  const activities = await listFeedActivityRows(db, viewerId, input);
  const activityIds = activities.map((activity) => activity.id);
  const [likeStats, commentCounts, derivedMap] = await Promise.all([
    loadLikeStats(db, {
      entityType: "activity",
      entityIds: activityIds,
      viewerProfileId: viewerId,
    }),
    loadFeedActivityCommentCounts(db, activityIds),
    buildActivityDerivedSummaryMap({
      store: createActivityAnalysisStore(db),
      profileId: viewerId,
      activities: activities.map((activity) => ({
        ...activity,
        max_power: activity.max_power ?? null,
        avg_speed_mps: activity.avg_speed_mps ?? null,
        max_speed_mps: activity.max_speed_mps ?? null,
        normalized_power: activity.normalized_power ?? null,
        normalized_speed_mps: activity.normalized_speed_mps ?? null,
        normalized_graded_speed_mps: activity.normalized_graded_speed_mps ?? null,
      })),
    }),
  ]);
  return feedResponseSchema.parse(
    buildFeedPage({
      rows: activities,
      limit: input.limit,
      mapRow: (activity) => mapFeedActivity(activity, { commentCounts, derivedMap, likeStats }),
    }),
  );
}

export async function getFeedActivityForViewer({
  db,
  viewerId,
  activityId,
}: {
  db: DbClient;
  viewerId: string;
  activityId: string;
}) {
  const activity = await loadFeedActivityDetail(db, viewerId, activityId);
  const [likeStats, comments] = await Promise.all([
    loadLikeStats(db, {
      entityType: "activity",
      entityIds: [activityId],
      viewerProfileId: viewerId,
    }),
    loadFeedActivityComments(db, activityId),
  ]);
  return mapFeedActivityDetail(activity, likeStats, comments);
}
