import {
  buildGroupViewerState,
  canViewFullGroup,
  canViewGroupMembers,
  GROUP_ACCESS_LEVELS,
  type GROUP_ADMIN_MEMBERSHIP_ROLES,
  GROUP_INVITATION_STATUSES,
  GROUP_JOIN_REQUEST_STATUSES,
  GROUP_MEMBERSHIP_ROLES,
  GROUP_MEMBERSHIP_STATUSES,
  type GroupAccessLevel,
  type GroupJoinPolicy,
  type GroupMembershipRole,
  type GroupMembershipStatus,
  isGroupAdminRole,
  isGroupOwner,
} from "@repo/core/groups";
import { groupInvitations, groupJoinRequests, groupMemberships, profiles } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

export type GroupsDbClient = Pick<ReturnType<typeof getRequiredDb>, "select">;

export const GROUP_ACCESS_LEVEL_PUBLIC = GROUP_ACCESS_LEVELS[0];
export const GROUP_MEMBERSHIP_ROLE_OWNER = GROUP_MEMBERSHIP_ROLES[0];
export const GROUP_MEMBERSHIP_STATUS_ACTIVE = GROUP_MEMBERSHIP_STATUSES[0];
export const GROUP_INVITATION_STATUS_PENDING = GROUP_INVITATION_STATUSES[0];
export const GROUP_JOIN_REQUEST_STATUS_PENDING = GROUP_JOIN_REQUEST_STATUSES[0];

export type ActiveGroupMembership = {
  group_id: string;
  profile_id: string;
  role: GroupMembershipRole;
  status: typeof GROUP_MEMBERSHIP_STATUS_ACTIVE;
};

export type GroupViewerMembership = {
  role: GroupMembershipRole | null;
  status: GroupMembershipStatus | null;
};

export async function getCurrentProfileId(db: GroupsDbClient, sessionUserId: string) {
  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, sessionUserId))
    .limit(1);

  if (!profile) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Current profile not found",
    });
  }

  return profile.id;
}

export async function getGroupMembership(
  db: GroupsDbClient,
  groupId: string,
  profileId: string,
): Promise<GroupViewerMembership> {
  const [membership] = await db
    .select({
      role: groupMemberships.role,
      status: groupMemberships.status,
    })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.group_id, groupId), eq(groupMemberships.profile_id, profileId)))
    .limit(1);

  return membership ?? { role: null, status: null };
}

export async function getActiveGroupMembership(
  db: GroupsDbClient,
  groupId: string,
  profileId: string,
): Promise<ActiveGroupMembership | null> {
  const [membership] = await db
    .select({
      group_id: groupMemberships.group_id,
      profile_id: groupMemberships.profile_id,
      role: groupMemberships.role,
      status: groupMemberships.status,
    })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.group_id, groupId),
        eq(groupMemberships.profile_id, profileId),
        eq(groupMemberships.status, GROUP_MEMBERSHIP_STATUS_ACTIVE),
      ),
    )
    .limit(1);

  return membership
    ? {
        ...membership,
        status: GROUP_MEMBERSHIP_STATUS_ACTIVE,
      }
    : null;
}

export async function buildGroupViewerStateForProfile(
  db: GroupsDbClient,
  input: {
    groupId: string;
    profileId: string;
    accessLevel: GroupAccessLevel;
    joinPolicy: GroupJoinPolicy;
  },
) {
  const [membership, invite, joinRequest] = await Promise.all([
    getGroupMembership(db, input.groupId, input.profileId),
    db
      .select({ id: groupInvitations.id })
      .from(groupInvitations)
      .where(
        and(
          eq(groupInvitations.group_id, input.groupId),
          eq(groupInvitations.invited_profile_id, input.profileId),
          eq(groupInvitations.status, GROUP_INVITATION_STATUS_PENDING),
        ),
      )
      .limit(1),
    db
      .select({ id: groupJoinRequests.id })
      .from(groupJoinRequests)
      .where(
        and(
          eq(groupJoinRequests.group_id, input.groupId),
          eq(groupJoinRequests.profile_id, input.profileId),
          eq(groupJoinRequests.status, GROUP_JOIN_REQUEST_STATUS_PENDING),
        ),
      )
      .limit(1),
  ]);

  return buildGroupViewerState({
    accessLevel: input.accessLevel,
    joinPolicy: input.joinPolicy,
    membershipRole: membership.role,
    membershipStatus: membership.status,
    hasPendingInvite: invite.length > 0,
    hasPendingJoinRequest: joinRequest.length > 0,
  });
}

export async function requireGroupViewAccess(
  db: GroupsDbClient,
  input: {
    groupId: string;
    profileId: string;
    accessLevel: GroupAccessLevel;
  },
) {
  const membership = await getGroupMembership(db, input.groupId, input.profileId);

  if (canViewFullGroup({ accessLevel: input.accessLevel, viewer: membership })) {
    return membership;
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You don't have permission to view this group",
  });
}

export async function requireGroupMemberListAccess(
  db: GroupsDbClient,
  input: {
    groupId: string;
    profileId: string;
    accessLevel: GroupAccessLevel;
    joinPolicy: GroupJoinPolicy;
  },
) {
  const membership = await getGroupMembership(db, input.groupId, input.profileId);

  if (
    canViewGroupMembers({
      accessLevel: input.accessLevel,
      joinPolicy: input.joinPolicy,
      viewer: membership,
    })
  ) {
    return membership;
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You don't have permission to view group members",
  });
}

export async function requireGroupAdmin(db: GroupsDbClient, groupId: string, profileId: string) {
  const membership = await getGroupMembership(db, groupId, profileId);

  if (!isGroupAdminRole(membership)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Group admin access required",
    });
  }

  return {
    ...membership,
    role: membership.role as (typeof GROUP_ADMIN_MEMBERSHIP_ROLES)[number],
    status: GROUP_MEMBERSHIP_STATUS_ACTIVE,
  };
}

export async function requireGroupOwner(db: GroupsDbClient, groupId: string, profileId: string) {
  const membership = await getGroupMembership(db, groupId, profileId);

  if (!isGroupOwner(membership)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Group owner access required",
    });
  }

  return {
    ...membership,
    role: GROUP_MEMBERSHIP_ROLE_OWNER,
    status: GROUP_MEMBERSHIP_STATUS_ACTIVE,
  };
}
