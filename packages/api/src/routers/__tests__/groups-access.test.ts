import type { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { requireGroupAdmin, requireGroupOwner, requireGroupViewAccess } from "../groups";
import { requireGroupMemberListAccess } from "../groups/access";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";

function createDbMock(rows: unknown[][]) {
  const queues = [...rows];

  return {
    select: () => {
      const builder: any = {
        from: () => builder,
        where: () => builder,
        limit: () => builder,
        then: (onFulfilled: (value: unknown[]) => unknown) =>
          Promise.resolve(queues.shift() ?? []).then(onFulfilled),
      };

      return builder;
    },
  } as any;
}

describe("group access helpers", () => {
  it("allows public group viewing but blocks members-only viewing for non-members", async () => {
    const publicDb = createDbMock([[{ role: null, status: null }]]);
    const membersOnlyDb = createDbMock([[{ role: null, status: null }]]);

    await expect(
      requireGroupViewAccess(publicDb, {
        groupId: GROUP_ID,
        profileId: PROFILE_ID,
        accessLevel: "public",
      }),
    ).resolves.toMatchObject({ role: null, status: null });
    await expect(
      requireGroupViewAccess(membersOnlyDb, {
        groupId: GROUP_ID,
        profileId: PROFILE_ID,
        accessLevel: "members_only",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You don't have permission to view this group",
    } satisfies Partial<TRPCError>);
  });

  it("allows invite-only members-only member lists to support join discovery without exposing full content", async () => {
    const inviteOnlyDb = createDbMock([[{ role: null, status: null }]]);
    const requestToJoinDb = createDbMock([[{ role: null, status: null }]]);

    await expect(
      requireGroupMemberListAccess(inviteOnlyDb, {
        groupId: GROUP_ID,
        profileId: PROFILE_ID,
        accessLevel: "members_only",
        joinPolicy: "invite_only",
      }),
    ).resolves.toMatchObject({ role: null, status: null });
    await expect(
      requireGroupMemberListAccess(requestToJoinDb, {
        groupId: GROUP_ID,
        profileId: PROFILE_ID,
        accessLevel: "members_only",
        joinPolicy: "request_to_join",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You don't have permission to view group members",
    } satisfies Partial<TRPCError>);
  });

  it("allows active owners and admins to administer a group", async () => {
    const ownerDb = createDbMock([[{ role: "owner", status: "active" }]]);
    const adminDb = createDbMock([[{ role: "admin", status: "active" }]]);

    await expect(requireGroupAdmin(ownerDb, GROUP_ID, PROFILE_ID)).resolves.toMatchObject({
      role: "owner",
      status: "active",
    });
    await expect(requireGroupAdmin(adminDb, GROUP_ID, PROFILE_ID)).resolves.toMatchObject({
      role: "admin",
      status: "active",
    });
  });

  it("rejects non-admin memberships for admin access", async () => {
    const db = createDbMock([[{ role: "member", status: "active" }]]);

    await expect(requireGroupAdmin(db, GROUP_ID, PROFILE_ID)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Group admin access required",
    } satisfies Partial<TRPCError>);
  });

  it("requires an active owner for owner-only access", async () => {
    const ownerDb = createDbMock([[{ role: "owner", status: "active" }]]);
    const adminDb = createDbMock([[{ role: "admin", status: "active" }]]);

    await expect(requireGroupOwner(ownerDb, GROUP_ID, PROFILE_ID)).resolves.toMatchObject({
      role: "owner",
      status: "active",
    });
    await expect(requireGroupOwner(adminDb, GROUP_ID, PROFILE_ID)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Group owner access required",
    } satisfies Partial<TRPCError>);
  });
});
