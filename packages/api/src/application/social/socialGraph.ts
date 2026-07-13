import { TRPCError } from "@trpc/server";
import type { getRequiredDb } from "../../db";
import {
  getFollowRecord,
  getProfileVisibility,
  loadSocialGraph,
} from "../../repositories/social-graph-repository";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";

type DbClient = ReturnType<typeof getRequiredDb>;

export async function readSocialGraph({
  db,
  viewerId,
  targetUserId,
  direction,
  limit,
  cursor,
}: {
  db: DbClient;
  viewerId: string;
  targetUserId: string;
  direction: "followers" | "following";
  limit: number;
  cursor?: string;
}) {
  if (targetUserId !== viewerId) {
    const visibility = await getProfileVisibility(db, targetUserId);
    if (visibility === null) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
    }
    if (visibility === false) {
      const relationship = await getFollowRecord(db, viewerId, targetUserId);
      if (relationship?.status !== "accepted") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to view this profile's social graph",
        });
      }
    }
  }
  const offset = parseIndexCursor(cursor);
  const result = await loadSocialGraph(db, {
    viewerId,
    targetUserId,
    direction,
    limit,
    offset,
  });
  return {
    ...result,
    ...buildIndexPageInfo({ offset, limit, total: result.total }),
  };
}
