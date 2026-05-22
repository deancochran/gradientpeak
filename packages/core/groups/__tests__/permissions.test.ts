import { describe, expect, it } from "vitest";
import {
  GROUP_ACCESS_LEVELS,
  GROUP_JOIN_POLICIES,
  GROUP_MEMBERSHIP_ROLES,
  GROUP_MEMBERSHIP_STATUSES,
  GROUP_RELATIONSHIP_STATES,
} from "../constants";
import { buildGroupViewerState } from "../display-state";
import {
  canCreateGroupEvent,
  canDeleteGroup,
  canEditGroup,
  canRemoveGroupMember,
  canTransferGroupOwnership,
  canUpdateGroupMemberRole,
  canViewFullGroup,
  type GroupMembershipSummary,
  isGroupAdminRole,
} from "../permissions";

const [publicAccessLevel, membersOnlyAccessLevel] = GROUP_ACCESS_LEVELS;
const [openJoinPolicy, requestToJoinPolicy, inviteOnlyJoinPolicy] = GROUP_JOIN_POLICIES;
const [ownerRole, adminRole, memberRole] = GROUP_MEMBERSHIP_ROLES;
const [activeStatus, , removedStatus] = GROUP_MEMBERSHIP_STATUSES;
const [ownerRelationshipState, , , , requestedRelationshipState, , removedRelationshipState] =
  GROUP_RELATIONSHIP_STATES;

const ownerMembership = { role: ownerRole, status: activeStatus } satisfies GroupMembershipSummary;
const adminMembership = { role: adminRole, status: activeStatus } satisfies GroupMembershipSummary;
const memberMembership = {
  role: memberRole,
  status: activeStatus,
} satisfies GroupMembershipSummary;
const removedMembership = {
  role: memberRole,
  status: removedStatus,
} satisfies GroupMembershipSummary;
const nonMember = { role: null, status: null } satisfies GroupMembershipSummary;

describe("group permission helpers", () => {
  it("requires active owner or admin membership for group administration", () => {
    expect(isGroupAdminRole(ownerMembership)).toBe(true);
    expect(isGroupAdminRole(adminMembership)).toBe(true);
    expect(isGroupAdminRole(memberMembership)).toBe(false);
    expect(isGroupAdminRole({ role: adminRole, status: removedStatus })).toBe(false);
  });

  it("allows public group detail for authenticated viewers and members-only detail for members", () => {
    expect(canViewFullGroup({ accessLevel: publicAccessLevel, viewer: nonMember })).toBe(true);
    expect(canViewFullGroup({ accessLevel: membersOnlyAccessLevel, viewer: nonMember })).toBe(
      false,
    );
    expect(
      canViewFullGroup({ accessLevel: membersOnlyAccessLevel, viewer: memberMembership }),
    ).toBe(true);
  });

  it("keeps owner-only actions separate from admin actions", () => {
    expect(canEditGroup(ownerMembership)).toBe(true);
    expect(canEditGroup(adminMembership)).toBe(true);
    expect(canCreateGroupEvent(adminMembership)).toBe(true);
    expect(canDeleteGroup(adminMembership)).toBe(false);
    expect(canDeleteGroup(ownerMembership)).toBe(true);
  });

  it("allows only owners to promote or demote admins and never assigns owner through role update", () => {
    expect(
      canUpdateGroupMemberRole({
        viewer: ownerMembership,
        target: memberMembership,
        nextRole: adminRole,
      }),
    ).toBe(true);
    expect(
      canUpdateGroupMemberRole({
        viewer: adminMembership,
        target: memberMembership,
        nextRole: adminRole,
      }),
    ).toBe(false);
    expect(
      canUpdateGroupMemberRole({
        viewer: ownerMembership,
        target: ownerMembership,
        nextRole: memberRole,
      }),
    ).toBe(false);
  });

  it("allows admins to remove members but not owners or peer admins", () => {
    expect(canRemoveGroupMember({ viewer: ownerMembership, target: adminMembership })).toBe(true);
    expect(canRemoveGroupMember({ viewer: adminMembership, target: memberMembership })).toBe(true);
    expect(canRemoveGroupMember({ viewer: adminMembership, target: adminMembership })).toBe(false);
    expect(canRemoveGroupMember({ viewer: adminMembership, target: ownerMembership })).toBe(false);
  });

  it("limits ownership transfer to active owners targeting active non-owner members", () => {
    expect(canTransferGroupOwnership({ viewer: ownerMembership, target: memberMembership })).toBe(
      true,
    );
    expect(canTransferGroupOwnership({ viewer: adminMembership, target: memberMembership })).toBe(
      false,
    );
    expect(canTransferGroupOwnership({ viewer: ownerMembership, target: removedMembership })).toBe(
      false,
    );
  });
});

describe("group display state helpers", () => {
  it("derives owner display capabilities from the same permission rules", () => {
    expect(
      buildGroupViewerState({
        accessLevel: membersOnlyAccessLevel,
        joinPolicy: openJoinPolicy,
        membershipRole: ownerRole,
        membershipStatus: activeStatus,
      }),
    ).toMatchObject({
      relationshipState: ownerRelationshipState,
      canViewFullGroup: true,
      canEditGroup: true,
      canManageMembers: true,
      canTransferOwnership: true,
      canDeleteGroup: true,
      canJoin: false,
      canLeave: false,
    });
  });

  it("marks pending request viewers without granting member-only access", () => {
    expect(
      buildGroupViewerState({
        accessLevel: membersOnlyAccessLevel,
        joinPolicy: requestToJoinPolicy,
        membershipRole: null,
        membershipStatus: null,
        hasPendingJoinRequest: true,
      }),
    ).toMatchObject({
      relationshipState: requestedRelationshipState,
      canViewFullGroup: false,
      canRequestToJoin: false,
      canAcceptInvite: false,
    });
  });

  it("allows non-members to request access to invite-only groups", () => {
    expect(
      buildGroupViewerState({
        accessLevel: membersOnlyAccessLevel,
        joinPolicy: inviteOnlyJoinPolicy,
        membershipRole: null,
        membershipStatus: null,
      }),
    ).toMatchObject({
      canJoin: false,
      canRequestToJoin: true,
      canViewFullGroup: false,
    });
  });

  it("prevents removed members from immediately rejoining open groups", () => {
    expect(
      buildGroupViewerState({
        accessLevel: publicAccessLevel,
        joinPolicy: openJoinPolicy,
        membershipRole: memberRole,
        membershipStatus: removedStatus,
      }),
    ).toMatchObject({
      relationshipState: removedRelationshipState,
      canJoin: false,
      canViewFullGroup: true,
    });
  });
});
