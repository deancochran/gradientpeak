import type { getRequiredDb } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  buildActivityDerivedSummaryMap,
  loadActivitySegmentsByActivityId,
} from "../../lib/activity-analysis";
import {
  feedResponseSchema,
  listFeedActivityRows,
  loadFeedActivityCommentCounts,
  mapFeedActivity,
} from "../../repositories/feed-read-repository";
import { loadLikeStats } from "../../repositories/like-stats";
import { buildFeedPage } from "./feedPage";

type DbClient = ReturnType<typeof getRequiredDb>;

export type { FeedActivity } from "../../repositories/feed-read-repository";
export { feedResponseSchema };

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
  const ownedActivities = activities.filter((activity) => activity.profile_id === viewerId);
  const segmentMap = await loadActivitySegmentsByActivityId(
    db,
    ownedActivities.map((activity) => activity.id),
  );
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
      activities: ownedActivities.map((activity) => ({
        ...activity,
        segments: segmentMap.get(activity.id) ?? [],
      })),
    }),
  ]);
  for (const activity of activities) {
    if (activity.profile_id !== viewerId) derivedMap.delete(activity.id);
  }
  return feedResponseSchema.parse(
    buildFeedPage({
      rows: activities,
      limit: input.limit,
      mapRow: (activity) => mapFeedActivity(activity, { commentCounts, derivedMap, likeStats }),
    }),
  );
}
