import { thresholdOverviewResponseSchema } from "../../contracts/threshold-overview";
import type { DrizzleQueryExecutor } from "../../db";
import {
  readPublishedThresholdHistory,
  type ThresholdHistoryCursor,
} from "../../repositories/threshold-overview-repository";
import { readPublishedAthleteStateSnapshot } from "./published-athlete-state";

export async function readThresholdOverview(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  historyLimit: number;
  historyCursor?: ThresholdHistoryCursor;
  now?: Date;
}) {
  const [snapshot, history] = await Promise.all([
    readPublishedAthleteStateSnapshot({ db: input.db, profileId: input.profileId, now: input.now }),
    readPublishedThresholdHistory(input.db, {
      profileId: input.profileId,
      limit: input.historyLimit,
      ...(input.historyCursor ? { cursor: input.historyCursor } : {}),
    }),
  ]);
  return thresholdOverviewResponseSchema.parse({
    current: snapshot.performanceTargets,
    history: {
      items: history.items.map(({ createdAt: _createdAt, ...item }) => ({
        ...item,
        effectiveAt: item.effectiveAt.toISOString(),
        sourceActivities: item.sourceActivities.map((activity) => ({
          ...activity,
          finishedAt: activity.finishedAt.toISOString(),
        })),
      })),
      nextCursor: history.nextCursor
        ? {
            effectiveAt: history.nextCursor.effectiveAt.toISOString(),
            createdAt: history.nextCursor.createdAt.toISOString(),
            thresholdId: history.nextCursor.thresholdId,
          }
        : null,
    },
    publication: {
      computedAt: snapshot.computedAt,
      status:
        snapshot.freshness === "fresh"
          ? "available"
          : snapshot.freshness === "stale"
            ? "stale"
            : "unavailable",
      publishedRevision: snapshot.revisions.published,
    },
  });
}
