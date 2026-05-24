import type {
  GroupAccessLevel,
  GroupJoinPolicy,
  GroupMembershipRole,
  GroupMembershipStatus,
} from "./constants";

export type GroupMembershipSummary = {
  role: GroupMembershipRole | null;
  status: GroupMembershipStatus | null;
};

export function isActiveGroupMember(membership: GroupMembershipSummary): boolean {
  return membership.status === "active" && membership.role !== null;
}

export function isGroupOwner(membership: GroupMembershipSummary): boolean {
  return membership.status === "active" && membership.role === "owner";
}

export function isGroupAdmin(membership: GroupMembershipSummary): boolean {
  return membership.status === "active" && membership.role === "admin";
}

export function isGroupAdminRole(membership: GroupMembershipSummary): boolean {
  return isGroupOwner(membership) || isGroupAdmin(membership);
}

export function canViewFullGroup(input: {
  accessLevel: GroupAccessLevel;
  viewer: GroupMembershipSummary;
}): boolean {
  return input.accessLevel === "public" || isActiveGroupMember(input.viewer);
}

export function canViewGroupMembers(input: {
  accessLevel: GroupAccessLevel;
  joinPolicy: GroupJoinPolicy;
  viewer: GroupMembershipSummary;
}): boolean {
  if (canViewFullGroup({ accessLevel: input.accessLevel, viewer: input.viewer })) {
    return true;
  }

  return input.accessLevel === "members_only" && input.joinPolicy === "invite_only";
}

export function canEditGroup(viewer: GroupMembershipSummary): boolean {
  return isGroupAdminRole(viewer);
}

export function canInviteToGroup(viewer: GroupMembershipSummary): boolean {
  return isGroupAdminRole(viewer);
}

export function canManageGroupJoinRequests(viewer: GroupMembershipSummary): boolean {
  return isGroupAdminRole(viewer);
}

export function canManageGroupMembers(viewer: GroupMembershipSummary): boolean {
  return isGroupAdminRole(viewer);
}

export function canPromoteGroupMember(viewer: GroupMembershipSummary): boolean {
  return isGroupOwner(viewer);
}

export function canDemoteGroupAdmin(viewer: GroupMembershipSummary): boolean {
  return isGroupOwner(viewer);
}

export function canUpdateGroupMemberRole(input: {
  viewer: GroupMembershipSummary;
  target: GroupMembershipSummary;
  nextRole: Exclude<GroupMembershipRole, "owner">;
}): boolean {
  if (!isGroupOwner(input.viewer) || !isActiveGroupMember(input.target)) return false;
  if (input.target.role === "owner") return false;

  return input.nextRole === "admin" || input.nextRole === "member";
}

export function canRemoveGroupMember(input: {
  viewer: GroupMembershipSummary;
  target: GroupMembershipSummary;
}): boolean {
  if (!isActiveGroupMember(input.target) || input.target.role === "owner") return false;
  if (isGroupOwner(input.viewer)) return true;

  return isGroupAdmin(input.viewer) && input.target.role === "member";
}

export function canTransferGroupOwnership(input: {
  viewer: GroupMembershipSummary;
  target: GroupMembershipSummary;
}): boolean {
  return (
    isGroupOwner(input.viewer) && isActiveGroupMember(input.target) && input.target.role !== "owner"
  );
}

export function canDeleteGroup(viewer: GroupMembershipSummary): boolean {
  return isGroupOwner(viewer);
}

export function canCreateGroupEvent(viewer: GroupMembershipSummary): boolean {
  return isGroupAdminRole(viewer);
}

export function canLeaveGroup(viewer: GroupMembershipSummary): boolean {
  return isActiveGroupMember(viewer) && viewer.role !== "owner";
}
