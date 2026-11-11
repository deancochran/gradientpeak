import { likes } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { and, count, eq, inArray, sql } from "drizzle-orm";

export type LikeEntityType = (typeof likes.$inferSelect)["entity_type"];

export type LikeStats = {
  likes_count: number;
  has_liked: boolean;
};

/** Loads canonical like counts and viewer state for one detail ID or a page of IDs. */
export async function loadLikeStats(
  db: DrizzleDbClient,
  input: { entityType: LikeEntityType; entityIds: readonly string[]; viewerProfileId: string },
): Promise<Map<string, LikeStats>> {
  const entityIds = Array.from(new Set(input.entityIds));
  if (entityIds.length === 0) return new Map();

  const rows = await db
    .select({
      entity_id: likes.entity_id,
      likes_count: count(likes.id),
      has_liked: sql<boolean>`bool_or(${likes.profile_id} = ${input.viewerProfileId}::uuid)`,
    })
    .from(likes)
    .where(and(eq(likes.entity_type, input.entityType), inArray(likes.entity_id, entityIds)))
    .groupBy(likes.entity_id);

  return new Map(
    rows.map((row) => [
      row.entity_id,
      { likes_count: Number(row.likes_count), has_liked: Boolean(row.has_liked) },
    ]),
  );
}

export function getLikeStats(stats: Map<string, LikeStats>, entityId: string): LikeStats {
  return stats.get(entityId) ?? { likes_count: 0, has_liked: false };
}
