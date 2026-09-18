import {
  conversationParticipants,
  conversations,
  messages,
  notifications,
  profiles,
} from "@repo/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { E2EDrizzleTransaction, LocalE2EDatabase } from "../support/database";

export type MessagingNotificationSeedIds = {
  conversationId: string;
  historyMessageId: string;
  incomingMessageId: string;
  notificationIds: {
    follower: string;
    invitation: string;
    message: string;
  };
};

export async function clearMessagingNotifications(
  database: LocalE2EDatabase,
  ids: MessagingNotificationSeedIds,
) {
  await database.typedTransaction((transaction) =>
    clearMessagingNotificationsInTransaction(transaction, ids),
  );
}

export async function seedMessagingNotifications(
  database: LocalE2EDatabase,
  actors: { athleteEmail: string; coachEmail: string },
  ids: MessagingNotificationSeedIds,
) {
  await database.typedTransaction(async (transaction) => {
    const actorRows = await transaction
      .select({ email: profiles.email, id: profiles.id })
      .from(profiles)
      .where(inArray(profiles.email, [actors.athleteEmail, actors.coachEmail]));
    const athleteId = actorRows.find((row) => row.email === actors.athleteEmail)?.id;
    const coachId = actorRows.find((row) => row.email === actors.coachEmail)?.id;

    if (!athleteId || !coachId) {
      throw new Error(
        "Messaging E2E actors must be provisioned before their journey data is seeded.",
      );
    }

    await clearMessagingNotificationsInTransaction(transaction, ids);

    const conversationCreatedAt = new Date("2026-07-20T08:00:00.000Z");
    const historyCreatedAt = new Date("2026-07-20T08:05:00.000Z");
    const historyReadAt = new Date("2026-07-20T08:06:00.000Z");
    const incomingCreatedAt = new Date("2026-07-20T08:10:00.000Z");

    await transaction.insert(conversations).values({
      id: ids.conversationId,
      is_group: false,
      created_at: conversationCreatedAt,
      last_message_at: incomingCreatedAt,
    });
    await transaction.insert(conversationParticipants).values([
      {
        conversation_id: ids.conversationId,
        user_id: athleteId,
        created_at: conversationCreatedAt,
      },
      { conversation_id: ids.conversationId, user_id: coachId, created_at: conversationCreatedAt },
    ]);
    await transaction.insert(messages).values([
      {
        id: ids.historyMessageId,
        conversation_id: ids.conversationId,
        sender_id: coachId,
        content: "Earlier training note",
        created_at: historyCreatedAt,
        read_at: historyReadAt,
      },
      {
        id: ids.incomingMessageId,
        conversation_id: ids.conversationId,
        sender_id: coachId,
        content: "Seeded unread hello",
        created_at: incomingCreatedAt,
      },
    ]);
    await transaction.insert(notifications).values([
      {
        id: ids.notificationIds.message,
        user_id: athleteId,
        actor_id: coachId,
        type: "new_message",
        entity_id: ids.conversationId,
        created_at: new Date("2026-07-20T09:00:00.000Z"),
      },
      {
        id: ids.notificationIds.invitation,
        user_id: athleteId,
        actor_id: coachId,
        type: "coaching_invitation",
        created_at: new Date("2026-07-20T08:50:00.000Z"),
      },
      {
        id: ids.notificationIds.follower,
        user_id: athleteId,
        actor_id: coachId,
        type: "new_follower",
        read_at: new Date("2026-07-20T08:45:00.000Z"),
        created_at: new Date("2026-07-20T08:40:00.000Z"),
      },
    ]);
  });
}

async function clearMessagingNotificationsInTransaction(
  transaction: E2EDrizzleTransaction,
  ids: MessagingNotificationSeedIds,
) {
  await transaction
    .delete(notifications)
    .where(inArray(notifications.id, Object.values(ids.notificationIds)));
  await transaction.delete(conversations).where(eq(conversations.id, ids.conversationId));
}
