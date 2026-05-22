import type {
  GroupAccessLevel,
  GroupJoinPolicy,
  GroupMembershipRole,
  GroupRelationshipState,
} from "./types";

export function formatGroupAccessLevel(accessLevel: GroupAccessLevel) {
  return accessLevel === "members_only" ? "Private" : "Public";
}

export function formatGroupJoinPolicy(joinPolicy: GroupJoinPolicy) {
  switch (joinPolicy) {
    case "open":
      return "Open join";
    case "request_to_join":
    case "invite_only":
      return "Invite only";
  }
}

export function formatGroupMembershipRole(role: GroupMembershipRole) {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "member":
      return "Member";
  }
}

export function formatGroupRelationshipState(state: GroupRelationshipState) {
  switch (state) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "member":
      return "Member";
    case "invited":
      return "Invited";
    case "requested":
      return "Requested";
    case "removed":
      return "Removed";
    case "non_member":
      return "Not joined";
  }
}

export function getGroupPrimaryAction(viewer?: {
  canAcceptInvite?: boolean;
  canJoin?: boolean;
  canRequestToJoin?: boolean;
  canLeave?: boolean;
}) {
  if (!viewer) return null;
  if (viewer.canAcceptInvite) return "acceptInvite" as const;
  if (viewer.canJoin) return "join" as const;
  if (viewer.canRequestToJoin) return "requestToJoin" as const;
  if (viewer.canLeave) return "leave" as const;

  return null;
}
