import { GROUP_JOIN_REQUEST_STATUSES } from "@repo/core/groups";
import { groupJoinRequests } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

type GroupsMutationDb = Pick<ReturnType<typeof getRequiredDb>, "select" | "insert">;
type JoinRequestRow = typeof groupJoinRequests.$inferSelect;

const GROUP_JOIN_REQUEST_STATUS_PENDING = GROUP_JOIN_REQUEST_STATUSES[0];

export async function createOrGetPendingGroupJoinRequest(
  db: GroupsMutationDb,
  input: { groupId: string; profileId: string },
): Promise<JoinRequestRow | null> {
  const [created] = await db
    .insert(groupJoinRequests)
    .values({
      group_id: input.groupId,
      profile_id: input.profileId,
      status: GROUP_JOIN_REQUEST_STATUS_PENDING,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [winner] = await db
    .select()
    .from(groupJoinRequests)
    .where(
      and(
        eq(groupJoinRequests.group_id, input.groupId),
        eq(groupJoinRequests.profile_id, input.profileId),
        eq(groupJoinRequests.status, GROUP_JOIN_REQUEST_STATUS_PENDING),
      ),
    )
    .limit(1);

  return winner ?? null;
}
