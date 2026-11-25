import type { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { buildGroupRow, GROUP_TEST_IDS } from "../../test/builders/groups";
import { createQueryMapDbMock } from "../../test/mock-query-db";
import { createRouterCaller } from "../../test/router";
import { groupsRouter } from "../groups";

const VIEWER_ID = GROUP_TEST_IDS.viewerId;
const GROUP_ID = GROUP_TEST_IDS.groupId;
const TARGET_ID = "99999999-9999-4999-8999-999999999999";

function createCaller(db: ReturnType<typeof createQueryMapDbMock>["db"]) {
  return createRouterCaller(groupsRouter, { db, userId: VIEWER_ID });
}

describe("groups admin capability boundaries", () => {
  it("requires an active admin to invite profiles", async () => {
    const { db, callLog } = createQueryMapDbMock({
      profiles: { data: [{ id: VIEWER_ID }], error: null },
      groups: { data: [buildGroupRow()], error: null },
      group_memberships: {
        data: [{ role: "member", status: "active" }],
        error: null,
      },
    });

    await expect(
      createCaller(db).inviteProfiles({ groupId: GROUP_ID, profileIds: [TARGET_ID] }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Group admin access required",
    } satisfies Partial<TRPCError>);
    expect(callLog.filter((call) => call.operation === "insert")).toHaveLength(0);
  });

  it("does not expose members to a non-member of a request-to-join group", async () => {
    const { db } = createQueryMapDbMock({
      profiles: { data: [{ id: VIEWER_ID }], error: null },
      groups: {
        data: [buildGroupRow({ access_level: "members_only", join_policy: "request_to_join" })],
        error: null,
      },
      group_memberships: { data: [], error: null },
    });

    await expect(createCaller(db).members({ groupId: GROUP_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You don't have permission to view group members",
    } satisfies Partial<TRPCError>);
  });
});
