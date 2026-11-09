import { describe, expect, it } from "vitest";
import {
  buildGroupJoinRequestRow,
  buildGroupRow,
  GROUP_TEST_IDS,
} from "../../test/builders/groups";
import { createRouterCaller } from "../../test/router";
import { groupsRouter } from "../groups";

function createDbMock(rows: unknown[][]) {
  const queue = [...rows];
  // biome-ignore lint/suspicious/noExplicitAny: fluent Drizzle test double
  const db: any = {
    select: () => {
      // biome-ignore lint/suspicious/noExplicitAny: fluent Drizzle test double
      const builder: any = {
        from: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => builder,
        offset: () => builder,
        // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are promise-like
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(queue.shift() ?? []).then(resolve),
      };
      return builder;
    },
  };
  return db;
}

describe("groupsRouter listDiscoverable", () => {
  it("returns canonical viewer state and preserves members-only redaction", async () => {
    const privateGroup = buildGroupRow({
      access_level: "members_only",
      description: "Members train here",
      cover_url: "private-cover.jpg",
      join_policy: "invite_only",
    });
    const db = createDbMock([
      [{ id: GROUP_TEST_IDS.viewerId }],
      [
        {
          group: privateGroup,
          membershipRole: null,
          membershipStatus: null,
          invitationId: GROUP_TEST_IDS.invitationId,
          joinRequestId: null,
        },
      ],
    ]);
    const caller = createRouterCaller(groupsRouter, { db, userId: GROUP_TEST_IDS.viewerId });

    const result = await caller.listDiscoverable({ limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: GROUP_TEST_IDS.groupId,
      description: null,
      cover_url: null,
      viewer: {
        relationshipState: "invited",
        hasPendingInvite: true,
        hasPendingJoinRequest: false,
        canAcceptInvite: true,
        canJoin: false,
        canRequestToJoin: false,
      },
    });
  });

  it("marks active memberships and pending requests as non-selectable relationship states", async () => {
    const activeGroup = buildGroupRow({ description: "Visible to members" });
    const requestedGroup = buildGroupRow({
      id: "99999999-9999-4999-8999-999999999999",
      join_policy: "invite_only",
    });
    const db = createDbMock([
      [{ id: GROUP_TEST_IDS.viewerId }],
      [
        {
          group: activeGroup,
          membershipRole: "member",
          membershipStatus: "active",
          invitationId: null,
          joinRequestId: null,
        },
        {
          group: requestedGroup,
          membershipRole: null,
          membershipStatus: null,
          invitationId: null,
          joinRequestId: GROUP_TEST_IDS.joinRequestId,
        },
      ],
    ]);
    const caller = createRouterCaller(groupsRouter, { db, userId: GROUP_TEST_IDS.viewerId });

    const result = await caller.listDiscoverable({ limit: 20 });

    expect(result.items.map((item) => item.viewer)).toMatchObject([
      {
        relationshipState: "member",
        membershipStatus: "active",
        canJoin: false,
        canRequestToJoin: false,
        canAcceptInvite: false,
      },
      {
        relationshipState: "requested",
        hasPendingJoinRequest: true,
        canJoin: false,
        canRequestToJoin: false,
        canAcceptInvite: false,
      },
    ]);
  });

  it("returns an index cursor for explicitly sorted discovery pages", async () => {
    const olderGroup = buildGroupRow({ created_at: new Date("2026-01-01T00:00:00.000Z") });
    const newerGroup = buildGroupRow({
      id: "99999999-9999-4999-8999-999999999999",
      created_at: new Date("2026-02-01T00:00:00.000Z"),
    });
    const row = (group: typeof olderGroup) => ({
      group,
      membershipRole: null,
      membershipStatus: null,
      invitationId: null,
      joinRequestId: null,
    });
    const db = createDbMock([
      [{ id: GROUP_TEST_IDS.viewerId }],
      [row(olderGroup), row(newerGroup)],
    ]);
    const caller = createRouterCaller(groupsRouter, { db, userId: GROUP_TEST_IDS.viewerId });

    const result = await caller.listDiscoverable({ limit: 1, sort_by: "oldest" });

    expect(result.items[0]?.id).toBe(olderGroup.id);
    expect(result.nextCursor).toBe("index:1");
  });
});

describe("groupsRouter myJoinRequests", () => {
  it("returns pending requests with group context so a requester can cancel them", async () => {
    const group = buildGroupRow();
    const request = buildGroupJoinRequestRow();
    const db = createDbMock([[{ id: GROUP_TEST_IDS.viewerId }], [{ request, group }]]);
    const caller = createRouterCaller(groupsRouter, { db, userId: GROUP_TEST_IDS.viewerId });

    const result = await caller.myJoinRequests({ limit: 20 });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: request.id,
        group_id: group.id,
        status: "pending",
        group: expect.objectContaining({ id: group.id, name: group.name }),
      }),
    ]);
  });
});
