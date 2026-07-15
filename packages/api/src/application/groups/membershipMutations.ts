import { GROUP_MEMBERSHIP_ROLES, GROUP_MEMBERSHIP_STATUSES } from "@repo/core/groups";
import { groupMemberships } from "@repo/db";
import { and, count, eq, sql } from "drizzle-orm";
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
    .insert(groupMemberships)
    .values({
      group_id: input.groupId,
      profile_id: input.profileId,
      role,
      status: GROUP_MEMBERSHIP_STATUS_ACTIVE,
    })
    .onConflictDoUpdate({
      target: [groupMemberships.group_id, groupMemberships.profile_id],
      set: {
        role: sql`case when ${groupMemberships.role} in ('owner', 'admin') then ${groupMemberships.role} else ${role} end`,
        status: sql`case when ${groupMemberships.status} = 'removed' then ${groupMemberships.status} else ${GROUP_MEMBERSHIP_STATUS_ACTIVE} end`,
        updated_at: now,
      },
    })
    .returning();

  return membership as MembershipRow;
}
