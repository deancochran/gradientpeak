#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DrizzleDbClient } from "@repo/db/client";
import { notifications, profiles, users } from "@repo/db/schema";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { eq } from "drizzle-orm";

// @repo/db/client owns a module-level pool. This inert disposable-local URL only
// permits its isolated client factory to load; all fixture writes use the fresh URL.
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function seedPerson(db: DrizzleDbClient, label: string) {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    name: label,
    email: `${label}-${id}@notifications.disposable.test`,
    emailVerified: true,
  });
  await db.insert(profiles).values({
    id,
    email: `${label}-profile-${id}@notifications.disposable.test`,
    username: `${label}-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    is_public: false,
  });
  return id;
}

/**
 * Proves notification history paging and read updates against a fresh, guarded
 * local PostgreSQL target. The harness creates and drops only its unique DB.
 */
await withDisposableDatabase(process.argv.slice(2), "api_notifications", async (target, url) => {
  await bootstrapSupabaseSchemas(target);
  for (const migrationPath of requireFreshBaseline().migrationPaths) {
    await applySqlFile(target, migrationPath);
  }

  const { createDbClient } = await import("@repo/db/client");
  const { createNotificationOperations } = await import(
    "../src/application/notifications/notificationOperations"
  );
  const client = createDbClient({ url });
  try {
    const recipient = await seedPerson(client.db, "notification-recipient");
    const otherRecipient = await seedPerson(client.db, "notification-other-recipient");
    const actor = await seedPerson(client.db, "notification-actor");
    const tiedCreatedAt = new Date("2026-11-03T12:00:00.000Z");
    const olderCreatedAt = new Date("2026-11-03T11:00:00.000Z");
    const tiedIds = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000004",
      "10000000-0000-4000-8000-000000000005",
    ];
    const olderId = "10000000-0000-4000-8000-000000000006";
    const otherId = "20000000-0000-4000-8000-000000000001";

    await client.db.insert(notifications).values([
      ...tiedIds.map((id) => ({
        id,
        user_id: recipient,
        actor_id: actor,
        type: "new_message" as const,
        entity_id: null,
        read_at: null,
        created_at: tiedCreatedAt,
      })),
      {
        id: olderId,
        user_id: recipient,
        actor_id: actor,
        type: "new_message" as const,
        entity_id: null,
        read_at: null,
        created_at: olderCreatedAt,
      },
      {
        id: otherId,
        user_id: otherRecipient,
        actor_id: actor,
        type: "new_message" as const,
        entity_id: null,
        read_at: null,
        created_at: tiedCreatedAt,
      },
    ]);

    const operations = createNotificationOperations(client.db);
    const expectedIds = [...tiedIds].reverse().concat(olderId);
    const seenIds: string[] = [];
    let cursor: { createdAt: Date; id: string } | null = null;
    let finalCursor: { createdAt: string; id: string } | null = null;
    do {
      const page = await operations.getHistory({
        recipientProfileId: recipient,
        limit: 2,
        cursor,
        view: "all",
      });
      seenIds.push(...page.items.map((item) => item.id));
      finalCursor = page.nextCursor;
      cursor = page.nextCursor
        ? { createdAt: new Date(page.nextCursor.createdAt), id: page.nextCursor.id }
        : null;
    } while (cursor);
    assert.deepEqual(seenIds, expectedIds, "keyset paging has no skipped or duplicate rows");
    assert.equal(new Set(seenIds).size, expectedIds.length);
    assert.equal(finalCursor, null, "the final history page has no cursor");

    const firstPage = await operations.getHistory({
      recipientProfileId: recipient,
      limit: 2,
      view: "all",
    });
    assert.deepEqual(
      firstPage.items.map((item) => item.id),
      expectedIds.slice(0, 2),
      "UUID descending order deterministically breaks equal-timestamp ties",
    );
    assert.deepEqual(firstPage.nextCursor, {
      createdAt: tiedCreatedAt.toISOString(),
      id: expectedIds[1],
    });

    await operations.markRead({ recipientProfileId: recipient, notificationIds: [otherId] });
    const [otherRow] = await client.db
      .select({ readAt: notifications.read_at })
      .from(notifications)
      .where(eq(notifications.id, otherId));
    assert.equal(
      otherRow?.readAt,
      null,
      "a recipient cannot mark another recipient's notification read",
    );

    const firstId = expectedIds[0];
    if (!firstId) throw new Error("expected a seeded notification");
    await operations.markRead({ recipientProfileId: recipient, notificationIds: [firstId] });
    const unreadSeenIds: string[] = [];
    cursor = null;
    do {
      const page = await operations.getHistory({
        recipientProfileId: recipient,
        limit: 2,
        cursor,
        view: "unread",
      });
      unreadSeenIds.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor
        ? { createdAt: new Date(page.nextCursor.createdAt), id: page.nextCursor.id }
        : null;
    } while (cursor);
    assert.deepEqual(
      unreadSeenIds,
      expectedIds.slice(1),
      "unread paging respects its cursor and filter",
    );
  } finally {
    await client.close();
  }
});
