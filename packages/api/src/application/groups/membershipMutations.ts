import { GROUP_MEMBERSHIP_ROLES, GROUP_MEMBERSHIP_STATUSES } from "@repo/core/groups";
import { groupMemberships } from "@repo/db";
import { and, count, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

type MembershipRow = typeof groupMemberships.$inferSelect;
type GroupsMutationDb = Pick<ReturnType<typeof getRequiredDb>, "select" | "insert" | "update">;

const GROUP_MEMBERSHIP_ROLE_OWNER = GROUP_MEMBERSHIP_ROLES[0];
const GROUP_MEMBERSHIP_ROLE_MEMBER = GROUP_MEMBERSHIP_ROLES[2];
const GROUP_MEMBERSHIP_STATUS_ACTIVE = GROUP_MEMBERSHIP_STATUSES[0];

export async function getActiveGroupOwnerCount(db: GroupsMutationDb, groupId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.group_id, groupId),
        eq(groupMemberships.role, GROUP_MEMBERSHIP_ROLE_OWNER),
        eq(groupMemberships.status, GROUP_MEMBERSHIP_STATUS_ACTIVE),
      ),
    );

  return row?.value ?? 0;
}

export async function setGroupMembershipActive(
  db: GroupsMutationDb,
  input: {
    groupId: string;
    profileId: string;
    role?: typeof GROUP_MEMBERSHIP_ROLE_MEMBER | typeof GROUP_MEMBERSHIP_ROLE_OWNER;
  },
) {
  const role = input.role ?? GROUP_MEMBERSHIP_ROLE_MEMBER;
  const now = new Date();
  const [membership] = await db
    .select()
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.group_id, input.groupId),
        eq(groupMemberships.profile_id, input.profileId),
      ),
    )
    .limit(1);

  if (membership) {
    const [updated] = await db
      .update(groupMemberships)
      .set({ role, status: GROUP_MEMBERSHIP_STATUS_ACTIVE, updated_at: now })
      .where(
        and(
          eq(groupMemberships.group_id, input.groupId),
          eq(groupMemberships.profile_id, input.profileId),
        ),
      )
      .returning();

    return updated as MembershipRow;
  }

  const [created] = await db
    .insert(groupMemberships)
    .values({
      group_id: input.groupId,
      profile_id: input.profileId,
      role,
      status: GROUP_MEMBERSHIP_STATUS_ACTIVE,
    })
    .returning();

  return created as MembershipRow;
}
