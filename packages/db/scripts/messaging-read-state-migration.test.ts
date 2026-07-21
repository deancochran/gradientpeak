#!/usr/bin/env tsx

import { resolve } from "node:path";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";

const baseline = resolve(dbPackageRoot, "supabase/migrations/20260713034500_baseline.sql");
const readCursorMigration = resolve(
  dbPackageRoot,
  "supabase/migrations/20260721025436_add_participant_messaging_read_cursor.sql",
);

const readerId = "11111111-1111-4111-8111-111111111111";
const senderId = "22222222-2222-4222-8222-222222222222";
const thirdId = "33333333-3333-4333-8333-333333333333";
const holeDmId = "44444444-4444-4444-8444-444444444441";
const firstUnreadDmId = "44444444-4444-4444-8444-444444444442";
const allReadDmId = "44444444-4444-4444-8444-444444444443";
const equalTimestampDmId = "44444444-4444-4444-8444-444444444444";
const groupId = "55555555-5555-4555-8555-555555555555";

await withDisposableDatabase(process.argv.slice(2), "messaging_read_cursor", async (target) => {
  await bootstrapSupabaseSchemas(target);
  await applySqlFile(target, baseline);

  await target.query(`
    insert into public.users (id, name, email, email_verified) values
      ('${readerId}', 'Reader', 'reader@messaging.test', true),
      ('${senderId}', 'Sender', 'sender@messaging.test', true),
      ('${thirdId}', 'Third', 'third@messaging.test', true);

    insert into public.profiles (id, email) values
      ('${readerId}', 'reader@messaging.test'),
      ('${senderId}', 'sender@messaging.test'),
      ('${thirdId}', 'third@messaging.test');

    insert into public.conversations (id, is_group, group_name) values
      ('${holeDmId}', false, null),
      ('${firstUnreadDmId}', false, null),
      ('${allReadDmId}', false, null),
      ('${equalTimestampDmId}', false, null),
      ('${groupId}', true, 'Migration group');

    insert into public.conversation_participants (conversation_id, user_id) values
      ('${holeDmId}', '${readerId}'),
      ('${holeDmId}', '${senderId}'),
      ('${firstUnreadDmId}', '${readerId}'),
      ('${firstUnreadDmId}', '${senderId}'),
      ('${allReadDmId}', '${readerId}'),
      ('${allReadDmId}', '${senderId}'),
      ('${equalTimestampDmId}', '${readerId}'),
      ('${equalTimestampDmId}', '${senderId}'),
      ('${groupId}', '${readerId}'),
      ('${groupId}', '${senderId}'),
      ('${groupId}', '${thirdId}');

    insert into public.messages
      (id, conversation_id, sender_id, content, created_at, read_at)
    values
      ('66666666-6666-4666-8666-666666666661', '${holeDmId}', '${senderId}', 'read prefix', '2026-07-20T10:00:00Z', '2026-07-20T10:05:00Z'),
      ('66666666-6666-4666-8666-666666666662', '${holeDmId}', '${senderId}', 'unread hole', '2026-07-20T11:00:00Z', null),
      ('66666666-6666-4666-8666-666666666663', '${holeDmId}', '${senderId}', 'read after hole', '2026-07-20T12:00:00Z', '2026-07-20T12:05:00Z'),
      ('77777777-7777-4777-8777-777777777771', '${firstUnreadDmId}', '${senderId}', 'first unread', '2026-07-20T10:00:00Z', null),
      ('77777777-7777-4777-8777-777777777772', '${firstUnreadDmId}', '${senderId}', 'later read', '2026-07-20T11:00:00Z', '2026-07-20T11:05:00Z'),
      ('88888888-8888-4888-8888-888888888881', '${allReadDmId}', '${senderId}', 'all read first', '2026-07-20T10:00:00Z', '2026-07-20T10:05:00Z'),
      ('88888888-8888-4888-8888-888888888882', '${allReadDmId}', '${senderId}', 'all read latest', '2026-07-20T11:00:00Z', '2026-07-20T11:05:00Z'),
      ('99999999-9999-4999-8999-999999999991', '${equalTimestampDmId}', '${senderId}', 'equal read prefix', '2026-07-20T10:00:00Z', '2026-07-20T10:05:00Z'),
      ('99999999-9999-4999-8999-999999999992', '${equalTimestampDmId}', '${senderId}', 'equal unread hole', '2026-07-20T10:00:00Z', null),
      ('99999999-9999-4999-8999-999999999993', '${equalTimestampDmId}', '${senderId}', 'equal read after hole', '2026-07-20T10:00:00Z', '2026-07-20T10:05:00Z'),
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '${groupId}', '${senderId}', 'ambiguous group receipt', '2026-07-20T12:00:00Z', '2026-07-20T12:05:00Z');
  `);

  await applySqlFile(target, readCursorMigration);

  const cursors = await target.query<{
    conversation_id: string;
    last_read_at: Date | null;
    last_read_message_id: string | null;
    user_id: string;
  }>(`
    select conversation_id, user_id, last_read_at, last_read_message_id
    from public.conversation_participants
    order by conversation_id, user_id
  `);
  const cursorFor = (conversationId: string, userId = readerId) =>
    cursors.rows.find((row) => row.conversation_id === conversationId && row.user_id === userId);

  expectCursor(
    cursorFor(holeDmId),
    "66666666-6666-4666-8666-666666666661",
    "2026-07-20T10:00:00.000Z",
  );
  expectCursor(cursorFor(firstUnreadDmId), null, null);
  expectCursor(
    cursorFor(allReadDmId),
    "88888888-8888-4888-8888-888888888882",
    "2026-07-20T11:00:00.000Z",
  );
  expectCursor(
    cursorFor(equalTimestampDmId),
    "99999999-9999-4999-8999-999999999991",
    "2026-07-20T10:00:00.000Z",
  );

  if (
    cursors.rows.some(
      (row) =>
        row.conversation_id === groupId &&
        (row.last_read_at !== null || row.last_read_message_id !== null),
    )
  ) {
    throw new Error("ambiguous legacy group receipts must leave every cursor null");
  }

  if (
    cursors.rows.some((row) => (row.last_read_at === null) !== (row.last_read_message_id === null))
  ) {
    throw new Error("migration produced an inconsistent read cursor pair");
  }
});

function expectCursor(
  cursor: { last_read_at: Date | null; last_read_message_id: string | null } | undefined,
  expectedMessageId: string | null,
  expectedTimestamp: string | null,
) {
  if (
    cursor?.last_read_message_id !== expectedMessageId ||
    (cursor?.last_read_at?.toISOString() ?? null) !== expectedTimestamp
  ) {
    throw new Error(
      `expected cursor (${expectedTimestamp}, ${expectedMessageId}), got (${cursor?.last_read_at?.toISOString() ?? null}, ${cursor?.last_read_message_id ?? null})`,
    );
  }
}

console.log("Messaging read-state migration/backfill fixture passed.");
