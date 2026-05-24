import type {
  GroupAccessLevel,
  GroupJoinPolicy,
  GroupMembershipRole,
  GroupMembershipStatus,
  GroupRelationshipState,
} from "./constants";
import {
  canCreateGroupEvent,
  canDeleteGroup,
  canEditGroup,
  canInviteToGroup,
  canLeaveGroup,
  canManageGroupJoinRequests,
  canManageGroupMembers,
  canViewFullGroup,
  canViewGroupMembers,
  type GroupMembershipSummary,
  isActiveGroupMember,
  isGroupOwner,
} from "./permissions";

export type GroupViewerState = {
  membershipRole: GroupMembershipRole | null;
  membershipStatus: GroupMembershipStatus | null;
  relationshipState: GroupRelationshipState;
  hasPendingInvite: boolean;
  hasPendingJoinRequest: boolean;
  canViewFullGroup: boolean;
  canViewMembers: boolean;
  canViewGroupEvents: boolean;
  canJoin: boolean;
  canRequestToJoin: boolean;
  canAcceptInvite: boolean;
  canLeave: boolean;
  canEditGroup: boolean;
  canInvite: boolean;
  canManageJoinRequests: boolean;
  canManageMembers: boolean;
  canPromoteMembers: boolean;
  canDemoteAdmins: boolean;
  canRemoveMembers: boolean;
  canTransferOwnership: boolean;
  canDeleteGroup: boolean;
  canCreateGroupEvent: boolean;
};

export type BuildGroupViewerStateInput = {
  accessLevel: GroupAccessLevel;
  joinPolicy: GroupJoinPolicy;
  membershipRole: GroupMembershipRole | null;
  membershipStatus: GroupMembershipStatus | null;
  hasPendingInvite?: boolean;
  hasPendingJoinRequest?: boolean;
};

export function getGroupRelationshipState(input: {
  membership: GroupMembershipSummary;
  hasPendingInvite: boolean;
  hasPendingJoinRequest: boolean;
}): GroupRelationshipState {
  if (input.membership.status === "removed") return "removed";
  if (input.membership.status === "active" && input.membership.role) return input.membership.role;
  if (input.hasPendingInvite) return "invited";
  if (input.hasPendingJoinRequest) return "requested";

  return "non_member";
}

export function buildGroupViewerState(input: BuildGroupViewerStateInput): GroupViewerState {
  const membership = {
    role: input.membershipRole,
    status: input.membershipStatus,
  } satisfies GroupMembershipSummary;
  const hasPendingInvite = input.hasPendingInvite ?? false;
  const hasPendingJoinRequest = input.hasPendingJoinRequest ?? false;
  const hasFullAccess = canViewFullGroup({ accessLevel: input.accessLevel, viewer: membership });
  const isActiveMember = isActiveGroupMember(membership);
  const isRemoved = membership.status === "removed";
  const canAdministerMembers = canManageGroupMembers(membership);
  const canOwnerManageRoles = isGroupOwner(membership);

  return {
    membershipRole: membership.role,
    membershipStatus: membership.status,
    relationshipState: getGroupRelationshipState({
      membership,
      hasPendingInvite,
      hasPendingJoinRequest,
    }),
    hasPendingInvite,
    hasPendingJoinRequest,
    canViewFullGroup: hasFullAccess,
    canViewMembers: canViewGroupMembers({
      accessLevel: input.accessLevel,
      joinPolicy: input.joinPolicy,
      viewer: membership,
    }),
    canViewGroupEvents: hasFullAccess,
    canJoin: input.joinPolicy === "open" && !isActiveMember && !isRemoved,
    canRequestToJoin:
      input.joinPolicy !== "open" && !isActiveMember && !isRemoved && !hasPendingJoinRequest,
    canAcceptInvite: hasPendingInvite && !isActiveMember,
    canLeave: canLeaveGroup(membership),
    canEditGroup: canEditGroup(membership),
    canInvite: canInviteToGroup(membership),
    canManageJoinRequests: canManageGroupJoinRequests(membership),
    canManageMembers: canAdministerMembers,
    canPromoteMembers: canOwnerManageRoles,
    canDemoteAdmins: canOwnerManageRoles,
    canRemoveMembers: canAdministerMembers,
    canTransferOwnership: canOwnerManageRoles,
    canDeleteGroup: canDeleteGroup(membership),
    canCreateGroupEvent: canCreateGroupEvent(membership),
  };
}
