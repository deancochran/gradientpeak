import type { Pool } from "pg";

export const TEST_CONVERSATION_ID = "a1000000-0000-4000-8000-000000000001";
export const TEST_INCOMING_MESSAGE_ID = "a2000000-0000-4000-8000-000000000001";
export const TEST_HISTORY_MESSAGE_ID = "a2000000-0000-4000-8000-000000000002";
export const TEST_NOTIFICATION_IDS = {
  message: "a3000000-0000-4000-8000-000000000001",
  invitation: "a3000000-0000-4000-8000-000000000002",
  follower: "a3000000-0000-4000-8000-000000000003",
} as const;

export async function clearMessagingNotifications(pool: Pool) {
  await pool.query('delete from "notifications" where "id" = any($1::uuid[])', [
    Object.values(TEST_NOTIFICATION_IDS),
  ]);
  await pool.query('delete from "conversations" where "id" = $1', [TEST_CONVERSATION_ID]);
}

export async function seedMessagingNotifications(
  pool: Pool,
  actors: { athleteEmail: string; coachEmail: string },
) {
  const actorResult = await pool.query<{ email: string; id: string }>(
    'select "id", "email" from "profiles" where "email" = any($1::text[])',
    [[actors.athleteEmail, actors.coachEmail]],
  );
  const athleteId = actorResult.rows.find((row) => row.email === actors.athleteEmail)?.id;
  const coachId = actorResult.rows.find((row) => row.email === actors.coachEmail)?.id;

  if (!athleteId || !coachId) {
    throw new Error(
      "Messaging E2E actors must be provisioned before their journey data is seeded.",
    );
  }

  await pool.query("begin");
  try {
    await clearMessagingNotifications(pool);

    await pool.query(
      `insert into "conversations" ("id", "is_group", "created_at", "last_message_at")
       values ($1, false, '2026-07-20T08:00:00.000Z', '2026-07-20T08:10:00.000Z')`,
      [TEST_CONVERSATION_ID],
    );
    await pool.query(
      `insert into "conversation_participants" ("conversation_id", "user_id", "created_at")
       values
         ($1, $2, '2026-07-20T08:00:00.000Z'),
         ($1, $3, '2026-07-20T08:00:00.000Z')`,
      [TEST_CONVERSATION_ID, athleteId, coachId],
    );
    await pool.query(
      `insert into "messages" (
         "id", "conversation_id", "sender_id", "content", "created_at", "read_at"
       ) values
         ($1, $3, $4, 'Earlier training note', '2026-07-20T08:05:00.000Z', '2026-07-20T08:06:00.000Z'),
         ($2, $3, $4, 'Seeded unread hello', '2026-07-20T08:10:00.000Z', null)`,
      [TEST_HISTORY_MESSAGE_ID, TEST_INCOMING_MESSAGE_ID, TEST_CONVERSATION_ID, coachId],
    );
    await pool.query(
      `insert into "notifications" (
         "id", "user_id", "actor_id", "type", "entity_id", "read_at", "created_at"
       ) values
         ($1, $4, $5, 'new_message', $6, null, '2026-07-20T09:00:00.000Z'),
         ($2, $4, $5, 'coaching_invitation', null, null, '2026-07-20T08:50:00.000Z'),
         ($3, $4, $5, 'new_follower', null, '2026-07-20T08:45:00.000Z', '2026-07-20T08:40:00.000Z')`,
      [
        TEST_NOTIFICATION_IDS.message,
        TEST_NOTIFICATION_IDS.invitation,
        TEST_NOTIFICATION_IDS.follower,
        athleteId,
        coachId,
        TEST_CONVERSATION_ID,
      ],
    );
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}
