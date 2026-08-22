import type { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { buildGroupInvitationRow, buildGroupRow, GROUP_TEST_IDS } from "../../test/builders/groups";
import { createRouterCaller } from "../../test/router";
import { groupsRouter } from "../groups";

const VIEWER_ID = GROUP_TEST_IDS.viewerId;
const GROUP_ID = GROUP_TEST_IDS.groupId;
const TARGET_ID = "99999999-9999-4999-8999-999999999999";

function createDbMock(selectRows: unknown[][]) {
  const selectQueue = [...selectRows];
  const insertCalls: Array<{ table: unknown; values: unknown }> = [];

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
        return { returning: async () => [] };
      },
    }),
    transaction: async (callback: (tx: any) => unknown) => callback(db),
  };

  return { db, insertCalls };
}

function createCaller(db: unknown) {
  return createRouterCaller(groupsRouter, { db, userId: VIEWER_ID });
}

describe("groups admin capability boundaries", () => {
  it("requires an active admin to invite profiles", async () => {
    const { db, insertCalls } = createDbMock([
      [{ id: VIEWER_ID }],
      [buildGroupRow()],
      [{ role: "member", status: "active" }],
    ]);

    await expect(
      createCaller(db).inviteProfiles({ groupId: GROUP_ID, profileIds: [TARGET_ID] }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Group admin access required",
    } satisfies Partial<TRPCError>);
    expect(insertCalls).toHaveLength(0);
  });

  it("returns an existing pending invitation when an admin repeats an invite", async () => {
    const existingInvitation = buildGroupInvitationRow({ invited_profile_id: TARGET_ID });
    const { db, insertCalls } = createDbMock([
      [{ id: VIEWER_ID }],
      [buildGroupRow()],
      [{ role: "admin", status: "active" }],
      [{ id: TARGET_ID }],
      [],
      [existingInvitation],
    ]);

    const result = await createCaller(db).inviteProfiles({
      groupId: GROUP_ID,
      profileIds: [TARGET_ID],
    });

    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0]).toMatchObject({
      id: existingInvitation.id,
      invited_profile_id: TARGET_ID,
      status: "pending",
    });
    expect(insertCalls).toHaveLength(0);
  });

  it("does not expose members to a non-member of a request-to-join group", async () => {
    const { db } = createDbMock([
      [{ id: VIEWER_ID }],
      [buildGroupRow({ access_level: "members_only", join_policy: "request_to_join" })],
      [],
    ]);

    await expect(createCaller(db).members({ groupId: GROUP_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You don't have permission to view group members",
    } satisfies Partial<TRPCError>);
  });
});
