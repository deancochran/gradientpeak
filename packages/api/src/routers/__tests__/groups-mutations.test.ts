import { groupInvitations, groupJoinRequests, groupMemberships, groups } from "@repo/db";
import type { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import {
  buildGroupInvitationRow,
  buildGroupJoinRequestRow,
  buildGroupMembershipRow,
  buildGroupRow,
  GROUP_TEST_IDS,
} from "../../test/builders/groups";
import { createRouterCaller } from "../../test/router";
import { groupsRouter } from "../groups";

const VIEWER_ID = GROUP_TEST_IDS.viewerId;
const GROUP_ID = GROUP_TEST_IDS.groupId;
const TARGET_ID = GROUP_TEST_IDS.targetId;
const INVITATION_ID = GROUP_TEST_IDS.invitationId;
const JOIN_REQUEST_ID = GROUP_TEST_IDS.joinRequestId;

type DbPlan = {
  select?: unknown[][];
  insertReturning?: unknown[][];
  updateReturning?: unknown[][];
};

function createDbMock(plan: DbPlan = {}) {
  const selectQueue = [...(plan.select ?? [])];
  const insertReturningQueue = [...(plan.insertReturning ?? [])];
  const updateReturningQueue = [...(plan.updateReturning ?? [])];
  const insertCalls: Array<{ table: unknown; values: unknown }> = [];
  const updateCalls: Array<{ table: unknown; values: unknown }> = [];
  let transactionCount = 0;

  const db: any = {
    select: () => {
      const builder: any = {
        from: () => builder,
        innerJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => builder,
        then: (resolve: (rows: unknown[]) => unknown) =>
          Promise.resolve(selectQueue.shift() ?? []).then(resolve),
      };
      return builder;
    },
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        insertCalls.push({ table, values });
        return {
          returning: async () => insertReturningQueue.shift() ?? [],
          onConflictDoNothing: () => ({
            returning: async () => insertReturningQueue.shift() ?? [],
          }),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => {
        updateCalls.push({ table, values });
        return {
          where: () => ({ returning: async () => updateReturningQueue.shift() ?? [] }),
        };
      },
    }),
    transaction: async (callback: (tx: any) => unknown) => {
      transactionCount += 1;
      return callback(db);
    },
  };

  return {
    db,
    insertCalls,
    updateCalls,
    get transactionCount() {
      return transactionCount;
    },
  };
}

function createCaller(db: unknown, userId = VIEWER_ID) {
  return createRouterCaller(groupsRouter, { db, userId });
}

describe("groupsRouter mutations", () => {
  it("creates a group and owner membership in one transaction", async () => {
    const createdGroup = buildGroupRow();
    const mock = createDbMock({
      select: [[{ id: VIEWER_ID }], []],
      insertReturning: [[createdGroup]],
    });
    const caller = createCaller(mock.db);

    const result = await caller.create({
      name: "Gradient Peak Club",
      access_level: "public",
      join_policy: "open",
    });

    expect(result.group).toMatchObject({ id: GROUP_ID, slug: "gradient-peak-club" });
    expect(mock.transactionCount).toBe(1);
    expect(mock.insertCalls).toHaveLength(2);
    expect(mock.insertCalls[0]).toMatchObject({ table: groups });
    expect(mock.insertCalls[0]?.values).toMatchObject({
      created_by_profile_id: VIEWER_ID,
      name: "Gradient Peak Club",
      slug: "gradient-peak-club",
      access_level: "public",
      join_policy: "open",
    });
    expect(mock.insertCalls[1]).toMatchObject({ table: groupMemberships });
    expect(mock.insertCalls[1]?.values).toMatchObject({
      group_id: GROUP_ID,
      profile_id: VIEWER_ID,
      role: "owner",
      status: "active",
    });
  });

  it("rejects group updates from non-admin members", async () => {
    const { db } = createDbMock({
      select: [[{ id: VIEWER_ID }], [buildGroupRow()], [{ role: "member", status: "active" }]],
    });
    const caller = createCaller(db);

    await expect(caller.update({ groupId: GROUP_ID, name: "New Name" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Group admin access required",
    } satisfies Partial<TRPCError>);
  });

  it("accepts an invite by activating membership and marking the invite accepted transactionally", async () => {
    const acceptedInvite = buildGroupInvitationRow({ status: "accepted" });
    const activeMembership = buildGroupMembershipRow({ role: "member" });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ invitation: buildGroupInvitationRow(), group: buildGroupRow() }],
        [],
      ],
      insertReturning: [[activeMembership]],
      updateReturning: [[acceptedInvite]],
    });
    const caller = createCaller(mock.db);

    const result = await caller.acceptInvite({ invitationId: INVITATION_ID });

    expect(mock.transactionCount).toBe(1);
    expect(result.invitation.status).toBe("accepted");
    expect(result.membership).toMatchObject({
      group_id: GROUP_ID,
      profile_id: VIEWER_ID,
      role: "member",
      status: "active",
    });
    expect(mock.insertCalls[0]).toMatchObject({ table: groupMemberships });
    expect(mock.updateCalls[0]).toMatchObject({ table: groupInvitations });
    expect(mock.updateCalls[0]?.values).toMatchObject({ status: "accepted" });
  });

  it("creates access requests for invite-only groups", async () => {
    const joinRequest = buildGroupJoinRequestRow();
    const mock = createDbMock({
      select: [[{ id: VIEWER_ID }], [buildGroupRow({ join_policy: "invite_only" })], [], []],
      insertReturning: [[joinRequest]],
    });
    const caller = createCaller(mock.db);

    const result = await caller.requestToJoin({ groupId: GROUP_ID });

    expect(result.joinRequest).toMatchObject({ id: JOIN_REQUEST_ID, status: "pending" });
    expect(mock.insertCalls[0]).toMatchObject({ table: groupJoinRequests });
    expect(mock.insertCalls[0]?.values).toMatchObject({
      group_id: GROUP_ID,
      profile_id: VIEWER_ID,
      status: "pending",
    });
  });

  it("rejects join requests for open groups because they should be joined directly", async () => {
    const mock = createDbMock({
      select: [[{ id: VIEWER_ID }], [buildGroupRow({ join_policy: "open" })]],
    });
    const caller = createCaller(mock.db);

    await expect(caller.requestToJoin({ groupId: GROUP_ID })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This group is open to join directly",
    } satisfies Partial<TRPCError>);
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("rejects join requests from active members", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [buildGroupRow({ join_policy: "invite_only" })],
        [{ role: "member", status: "active" }],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(caller.requestToJoin({ groupId: GROUP_ID })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "You are already a member of this group",
    } satisfies Partial<TRPCError>);
    expect(mock.insertCalls).toHaveLength(0);
  });

  it("prevents removed members from rejoining open groups directly", async () => {
    const mock = createDbMock({
      select: [[{ id: VIEWER_ID }], [buildGroupRow()], [{ role: "member", status: "removed" }]],
    });
    const caller = createCaller(mock.db);

    await expect(caller.join({ groupId: GROUP_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot automatically rejoin this group",
    } satisfies Partial<TRPCError>);
    expect(mock.insertCalls).toHaveLength(0);
    expect(mock.updateCalls).toHaveLength(0);
  });

  it("blocks the sole active owner from leaving the group", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [buildGroupRow()],
        [{ role: "owner", status: "active" }],
        [{ value: 1 }],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(caller.leave({ groupId: GROUP_ID })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The sole owner cannot leave the group",
    } satisfies Partial<TRPCError>);
    expect(mock.updateCalls).toHaveLength(0);
  });

  it("approves join requests by marking the request reviewed and activating membership", async () => {
    const approvedRequest = buildGroupJoinRequestRow({ status: "approved", profile_id: TARGET_ID });
    const activeMembership = buildGroupMembershipRow({ profile_id: TARGET_ID, role: "member" });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [{ request: buildGroupJoinRequestRow({ profile_id: TARGET_ID }), group: buildGroupRow() }],
        [{ role: "admin", status: "active" }],
        [],
      ],
      updateReturning: [[approvedRequest]],
      insertReturning: [[activeMembership]],
    });
    const caller = createCaller(mock.db);

    const result = await caller.reviewJoinRequest({
      requestId: JOIN_REQUEST_ID,
      decision: "approve",
    });

    expect(mock.transactionCount).toBe(1);
    expect(result.joinRequest).toMatchObject({ id: JOIN_REQUEST_ID, status: "approved" });
    expect(result.membership).toMatchObject({
      group_id: GROUP_ID,
      profile_id: TARGET_ID,
      role: "member",
      status: "active",
    });
    expect(mock.updateCalls[0]).toMatchObject({ table: groupJoinRequests });
    expect(mock.updateCalls[0]?.values).toMatchObject({ status: "approved" });
    expect(mock.insertCalls[0]).toMatchObject({ table: groupMemberships });
  });

  it("rejects already-reviewed join requests", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [
          {
            request: buildGroupJoinRequestRow({ status: "approved", profile_id: TARGET_ID }),
            group: buildGroupRow(),
          },
        ],
        [{ role: "admin", status: "active" }],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.reviewJoinRequest({ requestId: JOIN_REQUEST_ID, decision: "approve" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Join request has already been reviewed",
    } satisfies Partial<TRPCError>);
    expect(mock.updateCalls).toHaveLength(0);
  });

  it("prevents admins from removing owners", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [buildGroupRow()],
        [{ role: "admin", status: "active" }],
        [{ role: "owner", status: "active" }],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.removeMember({ groupId: GROUP_ID, profileId: TARGET_ID }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot remove this group member",
    } satisfies Partial<TRPCError>);
    expect(mock.updateCalls).toHaveLength(0);
  });

  it("rejects invitation acceptance by profiles other than the invite target", async () => {
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [
          {
            invitation: buildGroupInvitationRow({ invited_profile_id: TARGET_ID }),
            group: buildGroupRow(),
          },
        ],
      ],
    });
    const caller = createCaller(mock.db);

    await expect(caller.acceptInvite({ invitationId: INVITATION_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot accept this invitation",
    } satisfies Partial<TRPCError>);
    expect(mock.transactionCount).toBe(0);
  });

  it("prevents non-owners from changing member roles", async () => {
    const mock = createDbMock({
      select: [[{ id: VIEWER_ID }], [buildGroupRow()], [{ role: "admin", status: "active" }]],
    });
    const caller = createCaller(mock.db);

    await expect(
      caller.updateMemberRole({ groupId: GROUP_ID, profileId: TARGET_ID, role: "admin" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Group owner access required",
    } satisfies Partial<TRPCError>);
    expect(mock.updateCalls).toHaveLength(0);
  });

  it("transfers ownership by demoting the acting owner and promoting the target in one transaction", async () => {
    const targetOwner = buildGroupMembershipRow({ profile_id: TARGET_ID, role: "owner" });
    const mock = createDbMock({
      select: [
        [{ id: VIEWER_ID }],
        [buildGroupRow()],
        [{ role: "owner", status: "active" }],
        [{ role: "member", status: "active" }],
      ],
      updateReturning: [[targetOwner]],
    });
    const caller = createCaller(mock.db);

    const result = await caller.transferOwnership({
      groupId: GROUP_ID,
      targetProfileId: TARGET_ID,
      previousOwnerRole: "admin",
    });

    expect(mock.transactionCount).toBe(1);
    expect(result.membership).toMatchObject({
      profile_id: TARGET_ID,
      role: "owner",
      status: "active",
    });
    expect(mock.updateCalls).toHaveLength(2);
    expect(mock.updateCalls[0]).toMatchObject({ table: groupMemberships });
    expect(mock.updateCalls[0]?.values).toMatchObject({ role: "admin" });
    expect(mock.updateCalls[1]).toMatchObject({ table: groupMemberships });
    expect(mock.updateCalls[1]?.values).toMatchObject({ role: "owner", status: "active" });
  });
});
