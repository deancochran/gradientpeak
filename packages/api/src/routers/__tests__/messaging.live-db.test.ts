import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  conversationParticipants,
  conversations,
  messages,
  profiles,
  relationalSchema,
  users,
} from "@repo/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { messagingRouter } from "../messaging";

const seededUserIds: string[] = [];
const seededConversationIds: string[] = [];

async function seedProfile(label: string) {
  const id = randomUUID();
  const email = `${id}@messaging-cursors.test`;
  const now = new Date();
  await db.insert(users).values({
    id,
    name: label,
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(profiles).values({
    id,
    email,
    full_name: label,
    username: `${label}-${id.slice(0, 8)}`,
    language: "en",
    preferred_units: "metric",
    onboarded: true,
    is_public: true,
    created_at: now,
    updated_at: now,
  });
  seededUserIds.push(id);
  return id;
}

function caller(userId: string, database: typeof db = db) {
  return messagingRouter.createCaller({
    db: database,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);
}

async function waitForBlockedBackend(blockedPid: number, blockingPid: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const blocked = await db.execute(sql<{ is_blocked: boolean }>`
      select ${blockingPid}::int = any(pg_blocking_pids(${blockedPid}::int)) as is_blocked
    `);
    if (blocked.rows[0]?.is_blocked) return;
  }

  throw new Error(`Backend ${blockedPid} did not block behind backend ${blockingPid}.`);
}

afterEach(async () => {
  if (seededUserIds.length === 0) return;
  if (seededConversationIds.length > 0) {
    await db.delete(conversations).where(inArray(conversations.id, seededConversationIds));
  }
  await db.delete(profiles).where(inArray(profiles.id, seededUserIds));
  await db.delete(users).where(inArray(users.id, seededUserIds));
  seededConversationIds.length = 0;
  seededUserIds.length = 0;
});

afterAll(async () => pool.end());

describe("messaging participant cursors against PostgreSQL", () => {
  it("persists independent unread state for three actors and hides the group from outsiders", async () => {
    const actorA = await seedProfile("actor-a");
    const actorB = await seedProfile("actor-b");
    const actorC = await seedProfile("actor-c");
    const outsider = await seedProfile("outsider");
    const a = caller(actorA);
    const b = caller(actorB);
    const c = caller(actorC);
    const denied = caller(outsider);

    const group = await a.createConversation({
      participant_ids: [actorB, actorC],
      group_name: "Three actor group",
    });
    seededConversationIds.push(group.id);
    await a.sendMessage({ conversation_id: group.id, content: "Message from A" });

    await expect(a.getUnreadCount()).resolves.toBe(0);
    await expect(b.getUnreadCount()).resolves.toBe(1);
    await expect(c.getUnreadCount()).resolves.toBe(1);

    await b.markAsRead({ conversation_id: group.id });
    await expect(b.getUnreadCount()).resolves.toBe(0);
    await expect(c.getUnreadCount()).resolves.toBe(1);

    await c.sendMessage({ conversation_id: group.id, content: "Message from C" });
    await expect(a.getUnreadCount()).resolves.toBe(1);
    await expect(b.getUnreadCount()).resolves.toBe(1);
    await expect(c.getUnreadCount()).resolves.toBe(1);

    await c.markAsRead({ conversation_id: group.id });
    await expect(c.getUnreadCount()).resolves.toBe(0);
    await expect(b.getUnreadCount()).resolves.toBe(1);

    const memberships = await db.execute(sql<{
      last_read_at: Date | null;
      last_read_message_id: string | null;
      user_id: string;
    }>`
      select user_id, last_read_at, last_read_message_id
      from conversation_participants
      where conversation_id = ${group.id}::uuid
    `);
    expect(
      memberships.rows.find((membership) => membership.user_id === actorA)?.last_read_at,
    ).toBeNull();
    expect(
      memberships.rows.find((membership) => membership.user_id === actorA)?.last_read_message_id,
    ).toBeNull();
    expect(
      memberships.rows.find((membership) => membership.user_id === actorB)?.last_read_at,
    ).not.toBeNull();
    expect(
      memberships.rows.find((membership) => membership.user_id === actorB)?.last_read_message_id,
    ).not.toBeNull();
    expect(
      memberships.rows.find((membership) => membership.user_id === actorC)?.last_read_at,
    ).not.toBeNull();

    await expect(denied.getMessages({ conversation_id: group.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(denied.markAsRead({ conversation_id: group.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      denied.sendMessage({ conversation_id: group.id, content: "Unauthorized" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("uses message IDs to order equal timestamps and never regresses the cursor", async () => {
    const reader = await seedProfile("tie-reader");
    const sender = await seedProfile("tie-sender");
    const conversationId = randomUUID();
    const lowerMessageId = "11111111-1111-4111-8111-111111111111";
    const higherMessageId = "22222222-2222-4222-8222-222222222222";
    const createdAt = new Date("2026-07-21T10:00:00.000Z");
    seededConversationIds.push(conversationId);

    await db.insert(conversations).values({ id: conversationId, is_group: false });
    await db.insert(conversationParticipants).values([
      { conversation_id: conversationId, user_id: reader },
      { conversation_id: conversationId, user_id: sender },
    ]);
    await db.insert(messages).values([
      {
        id: lowerMessageId,
        conversation_id: conversationId,
        sender_id: sender,
        content: "equal timestamp lower ID",
        created_at: createdAt,
      },
      {
        id: higherMessageId,
        conversation_id: conversationId,
        sender_id: sender,
        content: "equal timestamp higher ID",
        created_at: createdAt,
      },
    ]);

    const readerCaller = caller(reader);
    await expect(readerCaller.getUnreadCount()).resolves.toBe(2);
    await expect(readerCaller.markAsRead({ conversation_id: conversationId })).resolves.toEqual({
      success: true,
    });
    await expect(readerCaller.getUnreadCount()).resolves.toBe(0);

    await db
      .update(messages)
      .set({ deleted_at: new Date("2026-07-21T10:05:00.000Z") })
      .where(eq(messages.id, higherMessageId));
    await expect(readerCaller.markAsRead({ conversation_id: conversationId })).resolves.toEqual({
      success: true,
    });

    const cursor = await db.execute(sql<{
      last_read_at: Date | null;
      last_read_message_id: string | null;
    }>`
      select last_read_at, last_read_message_id
      from conversation_participants
      where conversation_id = ${conversationId}::uuid
        and user_id = ${reader}::uuid
    `);
    expect(new Date(String(cursor.rows[0]?.last_read_at))).toEqual(createdAt);
    expect(cursor.rows[0]?.last_read_message_id).toBe(higherMessageId);
  });

  it("preserves a newer cursor when an older mark-as-read update resumes", async () => {
    const reader = await seedProfile("concurrent-reader");
    const sender = await seedProfile("concurrent-sender");
    const conversationId = randomUUID();
    const olderMessageId = "33333333-3333-4333-8333-333333333333";
    const newerMessageId = "44444444-4444-4444-8444-444444444444";
    const olderCreatedAt = new Date("2026-07-21T11:00:00.000Z");
    const newerCreatedAt = new Date("2026-07-21T11:01:00.000Z");
    seededConversationIds.push(conversationId);

    await db.insert(conversations).values({ id: conversationId, is_group: false });
    await db.insert(conversationParticipants).values([
      { conversation_id: conversationId, user_id: reader },
      { conversation_id: conversationId, user_id: sender },
    ]);
    await db.insert(messages).values({
      id: olderMessageId,
      conversation_id: conversationId,
      sender_id: sender,
      content: "older candidate",
      created_at: olderCreatedAt,
    });

    const readerCaller = caller(reader);
    await expect(readerCaller.getUnreadCount()).resolves.toBe(1);

    const staleConnection = await pool.connect();
    const advancingConnection = await pool.connect();
    try {
      const staleDb = drizzle({
        client: staleConnection,
        schema: relationalSchema,
        casing: "snake_case",
      });
      const advancingDb = drizzle({
        client: advancingConnection,
        schema: relationalSchema,
        casing: "snake_case",
      });
      const stalePidResult = await staleDb.execute(
        sql<{ pid: number }>`select pg_backend_pid() as pid`,
      );
      const advancingPidResult = await advancingDb.execute(
        sql<{ pid: number }>`select pg_backend_pid() as pid`,
      );
      const stalePid = Number(stalePidResult.rows[0]?.pid);
      const advancingPid = Number(advancingPidResult.rows[0]?.pid);
      let staleMark: Promise<{ success: boolean }> | undefined;

      await advancingDb.transaction(async (tx) => {
        await tx.execute(sql`
          select 1
          from conversation_participants
          where conversation_id = ${conversationId}::uuid
            and user_id = ${reader}::uuid
          for update
        `);

        staleMark = caller(reader, staleDb as never).markAsRead({
          conversation_id: conversationId,
        });
        await waitForBlockedBackend(stalePid, advancingPid);

        await tx.insert(messages).values({
          id: newerMessageId,
          conversation_id: conversationId,
          sender_id: sender,
          content: "newer candidate",
          created_at: newerCreatedAt,
        });
        await caller(reader, tx as never).markAsRead({ conversation_id: conversationId });
      });

      if (!staleMark) throw new Error("The staged mark-as-read request did not start.");
      await expect(staleMark).resolves.toEqual({ success: true });
    } finally {
      staleConnection.release();
      advancingConnection.release();
    }

    const cursor = await db.execute(sql<{
      last_read_at: Date | null;
      last_read_message_id: string | null;
    }>`
      select last_read_at, last_read_message_id
      from conversation_participants
      where conversation_id = ${conversationId}::uuid
        and user_id = ${reader}::uuid
    `);
    expect(new Date(String(cursor.rows[0]?.last_read_at))).toEqual(newerCreatedAt);
    expect(cursor.rows[0]?.last_read_message_id).toBe(newerMessageId);
    await expect(readerCaller.getUnreadCount()).resolves.toBe(0);
    await expect(readerCaller.getConversations()).resolves.toEqual([
      expect.objectContaining({ id: conversationId, unread_count: 0 }),
    ]);
  });

  it("marks an authorized empty conversation without inventing a cursor", async () => {
    const actorA = await seedProfile("empty-a");
    const actorB = await seedProfile("empty-b");
    const empty = await caller(actorA).getOrCreateDM({ target_user_id: actorB });
    seededConversationIds.push(empty.id);

    await expect(caller(actorA).markAsRead({ conversation_id: empty.id })).resolves.toEqual({
      success: true,
    });

    const cursor = await db.execute(sql<{
      last_read_at: Date | null;
      last_read_message_id: string | null;
    }>`
      select last_read_at, last_read_message_id
      from conversation_participants
      where conversation_id = ${empty.id}::uuid
        and user_id = ${actorA}::uuid
    `);
    expect(cursor.rows[0]).toEqual({ last_read_at: null, last_read_message_id: null });
  });
});
