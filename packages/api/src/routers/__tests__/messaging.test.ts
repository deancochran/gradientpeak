import { conversationParticipants, conversations, messages } from "@repo/db";
import { describe, expect, it } from "vitest";
import { messagingRouter } from "../messaging";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const PEER_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_ID = "33333333-3333-4333-8333-333333333333";
const CONVERSATION_ID = "44444444-4444-4444-8444-444444444444";
const MESSAGE_ID = "55555555-5555-4555-8555-555555555555";

type TableName = "conversationParticipants" | "conversations" | "messages";

type MockPlan = {
  executeErrors?: Error[];
  executeRows?: Array<Array<Record<string, unknown>>>;
  insertedConversationRows?: Array<Array<Record<string, unknown>>>;
  membershipRows?: Array<unknown[]>;
  messageRows?: Array<unknown[]>;
  unreadCountRows?: Array<unknown[]>;
  updatedConversationRows?: Array<Array<Record<string, unknown>>>;
};

function getTableName(table: unknown): TableName {
  if (table === conversationParticipants) return "conversationParticipants";
  if (table === conversations) return "conversations";
  if (table === messages) return "messages";
  throw new Error(`Unhandled table: ${String(table)}`);
}

function createAwaitable<TValue extends object>(value: unknown, extra: TValue): TValue {
  return {
    ...extra,
    then: (onFulfilled: (result: unknown) => unknown, onRejected?: (error: unknown) => unknown) =>
      Promise.resolve(value).then(onFulfilled, onRejected),
  } as TValue;
}

function createConversationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONVERSATION_ID,
    is_group: false,
    group_name: null,
    created_at: new Date("2026-04-03T10:00:00.000Z"),
    last_message_at: null,
    ...overrides,
  };
}

function createConversationSummaryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONVERSATION_ID,
    is_group: false,
    group_name: null,
    created_at: new Date("2026-04-03T10:00:00.000Z"),
    last_message_at: new Date("2026-04-03T12:00:00.000Z"),
    unread_count: "0",
    last_message_id: MESSAGE_ID,
    last_message_conversation_id: CONVERSATION_ID,
    last_message_sender_id: PEER_ID,
    last_message_content: "Latest message",
    last_message_created_at: new Date("2026-04-03T12:00:00.000Z"),
    last_message_deleted_at: null,
    peer_profile_id: PEER_ID,
    peer_profile_username: "peer-athlete",
    peer_profile_full_name: "Peer Athlete",
    peer_profile_avatar_url: "https://example.com/peer.png",
    ...overrides,
  };
}

function createMessageRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MESSAGE_ID,
    conversation_id: CONVERSATION_ID,
    sender_id: PEER_ID,
    content: "Hello there",
    created_at: new Date("2026-04-03T11:00:00.000Z"),
    deleted_at: null,
    read_at: null,
    ...overrides,
  };
}

function createDbMock(plan: MockPlan = {}) {
  const executeErrorQueue = [...(plan.executeErrors ?? [])];
  const executeRowQueue = [...(plan.executeRows ?? [])];
  const insertedConversationQueue = [...(plan.insertedConversationRows ?? [])];
  const membershipQueue = [...(plan.membershipRows ?? [])];
  const messageQueue = [...(plan.messageRows ?? [])];
  const unreadCountQueue = [...(plan.unreadCountRows ?? [])];
  const updatedConversationQueue = [...(plan.updatedConversationRows ?? [])];

  const calls = {
    execute: [] as unknown[],
    inserts: [] as Array<{ table: TableName; values: unknown }>,
    updates: [] as Array<{ table: TableName; values: Record<string, unknown> }>,
  };

  const resolveSelectRows = (table: TableName, joined: boolean) => {
    if (table === "conversationParticipants") {
      return membershipQueue.shift() ?? [];
    }

    if (table === "messages" && joined) {
      return unreadCountQueue.shift() ?? [];
    }

    if (table === "messages") {
      return messageQueue.shift() ?? [];
    }

    return [];
  };

  const createSelectBuilder = () => {
    let joined = false;
    let tableName: TableName | null = null;

    const builder: any = {
      from: (table: unknown) => {
        tableName = getTableName(table);
        return builder;
      },
      innerJoin: () => {
        joined = true;
        return builder;
      },
      where: () => {
        if (tableName === "messages" && joined) {
          return Promise.resolve(resolveSelectRows(tableName, joined));
        }

        return builder;
      },
      orderBy: () => Promise.resolve(resolveSelectRows(tableName!, joined)),
      limit: (count: number) =>
        Promise.resolve(resolveSelectRows(tableName!, joined).slice(0, count)),
      then: (onFulfilled: (rows: unknown[]) => unknown, onRejected?: (error: unknown) => unknown) =>
        Promise.resolve(resolveSelectRows(tableName!, joined)).then(onFulfilled, onRejected),
    };

    return builder;
  };

  const insert = (table: unknown) => {
    const tableName = getTableName(table);

    return {
      values: (values: unknown) => {
        calls.inserts.push({ table: tableName, values });

        return createAwaitable([], {
          returning: async () => {
            if (tableName === "conversations") {
              return insertedConversationQueue.shift() ?? [];
            }

            return [];
          },
        });
      },
    };
  };

  const update = (table: unknown) => {
    const tableName = getTableName(table);

    return {
      set: (values: Record<string, unknown>) => {
        calls.updates.push({ table: tableName, values });

        return {
          where: () =>
            createAwaitable([], {
              returning: async () => {
                if (tableName === "conversations") {
                  return updatedConversationQueue.shift() ?? [];
                }

                return [];
              },
            }),
        };
      },
    };
  };

  const db = {
    select: () => createSelectBuilder(),
    insert,
    update,
    transaction: async (
      callback: (tx: { insert: typeof insert; update: typeof update }) => unknown,
    ) => callback({ insert, update }),
    execute: async (query: unknown) => {
      calls.execute.push(query);

      const error = executeErrorQueue.shift();
      if (error) {
        throw error;
      }

      return { rows: executeRowQueue.shift() ?? [] };
    },
  };

  return { calls, db };
}

function createCaller(plan: MockPlan = {}, userId = OWNER_ID) {
  const { calls, db } = createDbMock(plan);

  const caller = messagingRouter.createCaller({
    db: db as any,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, calls };
}

describe("messagingRouter", () => {
  it("getOrCreateDM returns an existing direct-message conversation", async () => {
    const { caller, calls } = createCaller({
      executeRows: [[createConversationRow()]],
    });

    await expect(caller.getOrCreateDM({ target_user_id: PEER_ID })).resolves.toEqual({
      id: CONVERSATION_ID,
      is_group: false,
      group_name: null,
      created_at: "2026-04-03T10:00:00.000Z",
      last_message_at: null,
    });

    expect(calls.inserts).toHaveLength(0);
  });

  it("getOrCreateDM rejects unexpected input keys", async () => {
    const { caller } = createCaller();

    await expect(
      caller.getOrCreateDM({ target_user_id: PEER_ID, extra: true } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("createConversation creates participants, the initial message, and updates the summary timestamp", async () => {
    const { caller, calls } = createCaller({
      insertedConversationRows: [
        [
          createConversationRow({
            id: CONVERSATION_ID,
            is_group: true,
            group_name: "Training Squad",
          }),
        ],
      ],
      updatedConversationRows: [
        [
          createConversationRow({
            id: CONVERSATION_ID,
            is_group: true,
            group_name: "Training Squad",
            last_message_at: new Date("2026-04-03T12:00:00.000Z"),
          }),
        ],
      ],
    });

    await expect(
      caller.createConversation({
        participant_ids: [PEER_ID, THIRD_ID, OWNER_ID],
        group_name: "Training Squad",
        initial_message: "Ready for the weekend ride?",
      }),
    ).resolves.toEqual({
      id: CONVERSATION_ID,
      is_group: true,
      group_name: "Training Squad",
      created_at: "2026-04-03T10:00:00.000Z",
      last_message_at: "2026-04-03T12:00:00.000Z",
    });

    expect(calls.inserts).toEqual(
      expect.arrayContaining([
        {
          table: "conversations",
          values: {
            is_group: true,
            group_name: "Training Squad",
          },
        },
        {
          table: "messages",
          values: {
            conversation_id: CONVERSATION_ID,
            sender_id: OWNER_ID,
            content: "Ready for the weekend ride?",
          },
        },
      ]),
    );
    expect(calls.inserts).toContainEqual({
      table: "conversationParticipants",
      values: [
        { conversation_id: CONVERSATION_ID, user_id: PEER_ID },
        { conversation_id: CONVERSATION_ID, user_id: THIRD_ID },
        { conversation_id: CONVERSATION_ID, user_id: OWNER_ID },
      ],
    });
    expect(calls.updates[0]?.table).toBe("conversations");
    expect(calls.updates[0]?.values.last_message_at).toBeInstanceOf(Date);
  });

  it("getConversations normalizes unread counts, peer profile data, and last message details", async () => {
    const { caller } = createCaller({
      executeRows: [[createConversationSummaryRow({ unread_count: "2" })]],
    });

    await expect(caller.getConversations()).resolves.toEqual([
      {
        id: CONVERSATION_ID,
        is_group: false,
        group_name: null,
        created_at: "2026-04-03T10:00:00.000Z",
        last_message_at: "2026-04-03T12:00:00.000Z",
        unread_count: 2,
        last_message: {
          id: MESSAGE_ID,
          conversation_id: CONVERSATION_ID,
          sender_id: PEER_ID,
          content: "Latest message",
          created_at: "2026-04-03T12:00:00.000Z",
          deleted_at: null,
          read_at: undefined,
        },
        peer_profile: {
          id: PEER_ID,
          username: "peer-athlete",
          full_name: "Peer Athlete",
          avatar_url: "https://example.com/peer.png",
        },
      },
    ]);
  });

  it("getMessages returns normalized visible messages for a conversation participant", async () => {
    const { caller } = createCaller({
      membershipRows: [[{ user_id: OWNER_ID }]],
      messageRows: [
        [
          createMessageRow(),
          createMessageRow({
            id: "66666666-6666-4666-8666-666666666666",
            sender_id: OWNER_ID,
            content: "Replying back",
            created_at: new Date("2026-04-03T11:05:00.000Z"),
            read_at: new Date("2026-04-03T11:06:00.000Z"),
          }),
        ],
      ],
    });

    await expect(caller.getMessages({ conversation_id: CONVERSATION_ID })).resolves.toEqual([
      {
        id: MESSAGE_ID,
        conversation_id: CONVERSATION_ID,
        sender_id: PEER_ID,
        content: "Hello there",
        created_at: "2026-04-03T11:00:00.000Z",
        deleted_at: null,
        read_at: null,
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        conversation_id: CONVERSATION_ID,
        sender_id: OWNER_ID,
        content: "Replying back",
        created_at: "2026-04-03T11:05:00.000Z",
        deleted_at: null,
        read_at: "2026-04-03T11:06:00.000Z",
      },
    ]);
  });

  it("sendMessage inserts the message and bumps last_message_at for participants", async () => {
    const { caller, calls } = createCaller({
      membershipRows: [[{ user_id: OWNER_ID }]],
    });

    await expect(
      caller.sendMessage({
        conversation_id: CONVERSATION_ID,
        content: "Ping from the test suite",
      }),
    ).resolves.toEqual({ success: true });

    expect(calls.inserts).toContainEqual({
      table: "messages",
      values: {
        conversation_id: CONVERSATION_ID,
        sender_id: OWNER_ID,
        content: "Ping from the test suite",
      },
    });
    expect(calls.updates[0]?.table).toBe("conversations");
    expect(calls.updates[0]?.values.last_message_at).toBeInstanceOf(Date);
  });

  it("markAsRead currently returns a success sentinel without mutating storage", async () => {
    const { caller, calls } = createCaller();

    await expect(caller.markAsRead({ conversation_id: CONVERSATION_ID })).resolves.toEqual({
      success: true,
    });

    expect(calls.inserts).toHaveLength(0);
    expect(calls.updates).toHaveLength(0);
    expect(calls.execute).toHaveLength(0);
  });

  it("getUnreadCount returns the joined unread-message count as a number", async () => {
    const { caller } = createCaller({
      unreadCountRows: [[{ unread_count: "3" }]],
    });

    await expect(caller.getUnreadCount()).resolves.toBe(3);
  });

  it("getConversations wraps SQL failures so missing-table regressions surface clearly", async () => {
    const { caller } = createCaller({
      executeErrors: [new Error('relation "conversation_participants" does not exist')],
    });

    await expect(caller.getConversations()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: expect.stringContaining("Failed to load conversations"),
    });
  });
});
