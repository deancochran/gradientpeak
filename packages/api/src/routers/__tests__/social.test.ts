import { activities, likes, profiles } from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { socialRouter } from "../social";

type SelectTableName = "likes" | "profiles";

type DbPlan = {
  select?: Partial<Record<SelectTableName, Array<unknown[]>>>;
  execute?: Array<Array<Record<string, unknown>>>;
  query?: {
    activities?: unknown[];
  };
};

const SESSION_USER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_USER_ID = "22222222-2222-4222-8222-222222222222";
const FOLLOWER_ID = "33333333-3333-4333-8333-333333333333";
const FOLLOWER_TWO_ID = "44444444-4444-4444-8444-444444444444";
const FOLLOWING_ID = "55555555-5555-4555-8555-555555555555";
const FOLLOWING_TWO_ID = "66666666-6666-4666-8666-666666666666";
const ACTIVITY_ID = "77777777-7777-4777-8777-777777777777";
const COMMENT_ID = "88888888-8888-4888-8888-888888888888";

function getSelectTableName(table: unknown): SelectTableName {
  if (table === likes) return "likes";
  if (table === profiles) return "profiles";
  throw new Error(`Unhandled select table: ${String(table)}`);
}

function createDbMock(plan: DbPlan = {}) {
  const selectQueues = {
    likes: [...(plan.select?.likes ?? [])],
    profiles: [...(plan.select?.profiles ?? [])],
  } satisfies Record<SelectTableName, Array<unknown[]>>;
  const executeQueue = [...(plan.execute ?? [])];
  const activityQueryQueue = [...(plan.query?.activities ?? [])];

  const calls = {
    selects: [] as Array<{ table: SelectTableName }>,
    inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
    deletes: [] as Array<{ table: string; whereArg: unknown }>,
    executes: [] as unknown[],
  };

  return {
    calls,
    db: {
      select: () => {
        let tableName: SelectTableName | null = null;

        const builder: any = {
          from: (table: unknown) => {
            tableName = getSelectTableName(table);
            return builder;
          },
          where: () => builder,
          limit: () => builder,
          then: (onFulfilled: (value: unknown[]) => unknown) => {
            if (!tableName) {
              throw new Error("Select called without table");
            }

            calls.selects.push({ table: tableName });
            return Promise.resolve(selectQueues[tableName].shift() ?? []).then(onFulfilled);
          },
        };

        return builder;
      },
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          calls.inserts.push({ table: table === likes ? "likes" : String(table), values });
          return Promise.resolve();
        },
      }),
      delete: (table: unknown) => ({
        where: (whereArg: unknown) => {
          calls.deletes.push({ table: table === likes ? "likes" : String(table), whereArg });
          return Promise.resolve();
        },
      }),
      execute: async (query: unknown) => {
        calls.executes.push(query);
        return { rows: executeQueue.shift() ?? [] };
      },
      query: {
        activities: {
          findFirst: vi.fn(async () => activityQueryQueue.shift() ?? null),
        },
      },
    },
  };
}

function createCaller(plan: DbPlan = {}, userId = SESSION_USER_ID) {
  const { db, calls } = createDbMock(plan);

  const caller = socialRouter.createCaller({
    db: db as any,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("socialRouter", () => {
  it("followUser creates a pending request for private profiles", async () => {
    const { caller, calls } = createCaller({
      select: {
        profiles: [[{ is_public: false }]],
      },
      execute: [
        [],
        [{ follower_id: SESSION_USER_ID, following_id: TARGET_USER_ID, status: "pending" }],
        [{ has_notification: false }],
        [],
      ],
    });

    const result = await caller.followUser({ target_user_id: TARGET_USER_ID });

    expect(result).toEqual({
      follower_id: SESSION_USER_ID,
      following_id: TARGET_USER_ID,
      status: "pending",
    });
    expect(calls.selects).toEqual([{ table: "profiles" }]);
    expect(calls.executes).toHaveLength(4);
  });

  it("unfollowUser deletes the relationship and returns success", async () => {
    const { caller, calls } = createCaller({ execute: [[]] });

    const result = await caller.unfollowUser({ target_user_id: TARGET_USER_ID });

    expect(result).toEqual({ success: true });
    expect(calls.executes).toHaveLength(1);
  });

  it("acceptFollowRequest accepts a pending request and notifies the follower", async () => {
    const { caller, calls } = createCaller({
      execute: [
        [{ follower_id: FOLLOWER_ID, following_id: SESSION_USER_ID, status: "pending" }],
        [],
        [],
        [],
      ],
    });

    const result = await caller.acceptFollowRequest({ follower_id: FOLLOWER_ID });

    expect(result).toEqual({ success: true });
    expect(calls.executes).toHaveLength(4);
  });

  it("rejectFollowRequest removes a pending request", async () => {
    const { caller, calls } = createCaller({
      execute: [
        [{ follower_id: FOLLOWER_ID, following_id: SESSION_USER_ID, status: "pending" }],
        [],
        [],
      ],
    });

    const result = await caller.rejectFollowRequest({ follower_id: FOLLOWER_ID });

    expect(result).toEqual({ success: true });
    expect(calls.executes).toHaveLength(3);
  });

  it("toggleLike inserts a like when the viewer can access the activity", async () => {
    const { caller, calls } = createCaller({
      select: {
        likes: [[]],
      },
      query: {
        activities: [{ profile_id: TARGET_USER_ID, is_private: false }],
      },
    });

    const result = await caller.toggleLike({ entity_id: ACTIVITY_ID, entity_type: "activity" });

    expect(result).toEqual({ liked: true });
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0]).toMatchObject({
      table: "likes",
      values: {
        profile_id: SESSION_USER_ID,
        entity_id: ACTIVITY_ID,
        entity_type: "activity",
      },
    });
  });

  it("getFollowers returns follower rows with relationship status for the viewer", async () => {
    const { caller } = createCaller({
      execute: [
        [
          {
            id: FOLLOWER_ID,
            username: "follower-one",
            avatar_url: "https://example.com/one.png",
            is_public: true,
            created_at: "2026-04-01T12:00:00.000Z",
            updated_at: "2026-04-01T12:00:00.000Z",
          },
          {
            id: FOLLOWER_TWO_ID,
            username: "follower-two",
            avatar_url: null,
            is_public: false,
            created_at: "2026-03-31T12:00:00.000Z",
            updated_at: "2026-03-31T12:00:00.000Z",
          },
        ],
        [{ value: 3 }],
        [{ follower_id: FOLLOWER_ID, status: "accepted" }],
      ],
    });

    const result = await caller.getFollowers({ user_id: TARGET_USER_ID, limit: 2 });

    expect(result).toEqual({
      users: [
        {
          id: FOLLOWER_ID,
          username: "follower-one",
          avatar_url: "https://example.com/one.png",
          is_public: true,
          created_at: "2026-04-01T12:00:00.000Z",
          updated_at: "2026-04-01T12:00:00.000Z",
          follow_status: "accepted",
        },
        {
          id: FOLLOWER_TWO_ID,
          username: "follower-two",
          avatar_url: null,
          is_public: false,
          created_at: "2026-03-31T12:00:00.000Z",
          updated_at: "2026-03-31T12:00:00.000Z",
          follow_status: null,
        },
      ],
      total: 3,
      hasMore: true,
      nextCursor: "index:2",
    });
  });

  it("getFollowing returns followed users with viewer-specific relationship status", async () => {
    const { caller } = createCaller({
      execute: [
        [
          {
            id: FOLLOWING_ID,
            username: "following-one",
            avatar_url: "https://example.com/following.png",
            is_public: true,
            created_at: "2026-04-02T12:00:00.000Z",
            updated_at: "2026-04-02T12:00:00.000Z",
          },
          {
            id: FOLLOWING_TWO_ID,
            username: "following-two",
            avatar_url: null,
            is_public: true,
            created_at: "2026-04-01T12:00:00.000Z",
            updated_at: "2026-04-01T12:00:00.000Z",
          },
        ],
        [{ value: 2 }],
        [{ following_id: FOLLOWING_TWO_ID, status: "pending" }],
      ],
    });

    const result = await caller.getFollowing({ user_id: TARGET_USER_ID, limit: 2 });

    expect(result).toEqual({
      users: [
        {
          id: FOLLOWING_ID,
          username: "following-one",
          avatar_url: "https://example.com/following.png",
          is_public: true,
          created_at: "2026-04-02T12:00:00.000Z",
          updated_at: "2026-04-02T12:00:00.000Z",
          follow_status: null,
        },
        {
          id: FOLLOWING_TWO_ID,
          username: "following-two",
          avatar_url: null,
          is_public: true,
          created_at: "2026-04-01T12:00:00.000Z",
          updated_at: "2026-04-01T12:00:00.000Z",
          follow_status: "pending",
        },
      ],
      total: 2,
      hasMore: false,
      nextCursor: undefined,
    });
  });

  it("searchUsers trims the query and returns paginated matches", async () => {
    const { caller } = createCaller({
      execute: [
        [
          {
            id: TARGET_USER_ID,
            username: "target-runner",
            avatar_url: null,
            is_public: true,
            created_at: "2026-04-03T12:00:00.000Z",
            updated_at: "2026-04-03T12:00:00.000Z",
          },
        ],
        [{ value: 1 }],
      ],
    });

    const result = await caller.searchUsers({ query: "  target  ", limit: 1, offset: 0 });

    expect(result).toEqual({
      users: [
        {
          id: TARGET_USER_ID,
          username: "target-runner",
          avatar_url: null,
          is_public: true,
          created_at: "2026-04-03T12:00:00.000Z",
          updated_at: "2026-04-03T12:00:00.000Z",
        },
      ],
      total: 1,
      hasMore: false,
      nextCursor: undefined,
    });
  });

  it("searchUsers rejects unexpected input keys", async () => {
    const { caller } = createCaller();

    await expect(
      caller.searchUsers({ query: "target", limit: 1, offset: 0, extra: true } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("addComment stores trimmed content and serializes the timestamp", async () => {
    const createdAt = new Date("2026-04-03T12:30:00.000Z");
    const { caller } = createCaller({
      execute: [
        [
          {
            id: COMMENT_ID,
            profile_id: SESSION_USER_ID,
            entity_id: ACTIVITY_ID,
            entity_type: "activity",
            content: "nice work",
            created_at: createdAt,
          },
        ],
      ],
      query: {
        activities: [{ profile_id: TARGET_USER_ID, is_private: false }],
      },
    });

    const result = await caller.addComment({
      entity_id: ACTIVITY_ID,
      entity_type: "activity",
      content: "  nice work  ",
    });

    expect(result).toEqual({
      id: COMMENT_ID,
      profile_id: SESSION_USER_ID,
      entity_id: ACTIVITY_ID,
      entity_type: "activity",
      content: "nice work",
      created_at: createdAt.toISOString(),
    });
  });

  it("deleteComment allows owners to remove their comment", async () => {
    const { caller, calls } = createCaller({
      execute: [[{ profile_id: SESSION_USER_ID }], []],
    });

    const result = await caller.deleteComment({ comment_id: COMMENT_ID });

    expect(result).toEqual({ success: true });
    expect(calls.executes).toHaveLength(2);
  });

  it("getComments returns serialized comments with nested profile data", async () => {
    const createdAt = new Date("2026-04-03T14:00:00.000Z");
    const { caller } = createCaller({
      execute: [
        [
          {
            id: COMMENT_ID,
            content: "Strong ride",
            created_at: createdAt,
            profile_id: TARGET_USER_ID,
            profile_username: "target-runner",
            profile_avatar_url: "https://example.com/avatar.png",
          },
        ],
        [{ value: 2 }],
      ],
      query: {
        activities: [{ profile_id: TARGET_USER_ID, is_private: false }],
      },
    });

    const result = await caller.getComments({
      entity_id: ACTIVITY_ID,
      entity_type: "activity",
      limit: 1,
    });

    expect(result).toEqual({
      comments: [
        {
          id: COMMENT_ID,
          content: "Strong ride",
          created_at: createdAt.toISOString(),
          profile: {
            id: TARGET_USER_ID,
            username: "target-runner",
            avatar_url: "https://example.com/avatar.png",
          },
        },
      ],
      total: 2,
      hasMore: true,
      nextCursor: "index:1",
    });
  });

  it("getComments allows system training plans with null owner profile_id", async () => {
    const createdAt = new Date("2026-04-03T14:00:00.000Z");
    const trainingPlanId = "99999999-9999-4999-8999-999999999999";

    const { caller } = createCaller({
      execute: [
        [
          {
            profile_id: null,
            is_system_template: true,
            template_visibility: "public",
          },
        ],
        [
          {
            id: COMMENT_ID,
            content: "Pinned session",
            created_at: createdAt,
            profile_id: TARGET_USER_ID,
            profile_username: "target-runner",
            profile_avatar_url: null,
          },
        ],
        [{ value: 1 }],
      ],
    });

    const result = await caller.getComments({
      entity_id: trainingPlanId,
      entity_type: "training_plan",
      limit: 20,
    });

    expect(result).toEqual({
      comments: [
        {
          id: COMMENT_ID,
          content: "Pinned session",
          created_at: createdAt.toISOString(),
          profile: {
            id: TARGET_USER_ID,
            username: "target-runner",
            avatar_url: null,
          },
        },
      ],
      total: 1,
      hasMore: false,
      nextCursor: undefined,
    });
  });
});
