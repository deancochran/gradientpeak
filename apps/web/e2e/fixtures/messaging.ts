import type { Page } from "@playwright/test";
import { conversationParticipants, conversations, follows, notifications } from "@repo/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";

import { expect, test as sharedTest } from "../fixtures";
import type { AuthenticatedE2EActor } from "../support/actors";
import type { LocalE2EDatabase } from "../support/database";

const actorNames = {
  a: { name: "Messaging Alpha", username: "messaging_alpha" },
  b: { name: "Messaging Bravo", username: "messaging_bravo" },
  c: { name: "Messaging Charlie", username: "messaging_charlie" },
} as const;

type ActorKey = keyof typeof actorNames;
type Actor = AuthenticatedE2EActor & { page: Page; username: string };
type MessagingHarness = {
  actors: Record<ActorKey, Actor>;
  seedFollowRequest: (from: ActorKey, to: ActorKey) => Promise<void>;
  readFollowStatus: (from: ActorKey, to: ActorKey) => Promise<string | null>;
};

export const test = sharedTest.extend<{ messaging: MessagingHarness }>({
  messaging: async ({ actorFactory, e2eCleanup, e2eDatabase, e2eIdentity }, use) => {
    const entries = await Promise.all(
      (Object.keys(actorNames) as ActorKey[]).map(async (key) => {
        const definition = actorNames[key];
        const actor = await actorFactory.create("athlete", {
          fullName: definition.name,
          label: `messaging-${key}`,
          primary: key === "a",
          username: `${definition.username}_${e2eIdentity.suffix(`messaging-${key}`)}`,
        });
        if (!actor.username) throw new Error(`Messaging actor ${key} has no username.`);
        const page = await actor.createPage("/");
        return [key, Object.assign(actor, { page, username: actor.username })] as const;
      }),
    );
    const actors: Record<ActorKey, Actor> = {
      a: entries.find(([key]) => key === "a")?.[1] ?? failMissingActor("a"),
      b: entries.find(([key]) => key === "b")?.[1] ?? failMissingActor("b"),
      c: entries.find(([key]) => key === "c")?.[1] ?? failMissingActor("c"),
    };
    const actorIds = entries.map(([, actor]) => actor.profileId);
    await clearActorState(e2eDatabase, actorIds);
    e2eCleanup.registerExactId({
      kind: "messaging-actor-state",
      id: actorIds.join(":"),
      cleanup: (database) => clearActorState(database, actorIds),
    });

    await use({
      actors,
      seedFollowRequest: async (from, to) => {
        const follower = actors[from].profileId;
        const following = actors[to].profileId;
        const now = new Date();
        await e2eDatabase.typedTransaction(async (transaction) => {
          await transaction
            .insert(follows)
            .values({
              follower_id: follower,
              following_id: following,
              status: "pending",
              created_at: now,
              updated_at: now,
            })
            .onConflictDoUpdate({
              target: [follows.follower_id, follows.following_id],
              set: { status: "pending", updated_at: now },
            });
          await transaction
            .delete(notifications)
            .where(
              and(
                eq(notifications.user_id, following),
                eq(notifications.actor_id, follower),
                eq(notifications.type, "follow_request"),
              ),
            );
          await transaction.insert(notifications).values({
            id: crypto.randomUUID(),
            user_id: following,
            actor_id: follower,
            type: "follow_request",
            created_at: now,
          });
        });
      },
      readFollowStatus: async (from, to) => {
        const [follow] = await e2eDatabase.db
          .select({ status: follows.status })
          .from(follows)
          .where(
            and(
              eq(follows.follower_id, actors[from].profileId),
              eq(follows.following_id, actors[to].profileId),
            ),
          )
          .limit(1);
        return follow?.status ?? null;
      },
    });
  },
});

function failMissingActor(key: ActorKey): never {
  throw new Error(`Messaging actor ${key} was not created.`);
}

async function clearActorState(database: LocalE2EDatabase, actorIds: string[]) {
  await database.typedTransaction(async (transaction) => {
    const actorConversations = await transaction
      .select({ conversation_id: conversationParticipants.conversation_id })
      .from(conversationParticipants)
      .where(inArray(conversationParticipants.user_id, actorIds));
    if (actorConversations.length)
      await transaction.delete(conversations).where(
        inArray(
          conversations.id,
          actorConversations.map((row) => row.conversation_id),
        ),
      );
    await transaction
      .delete(notifications)
      .where(
        or(inArray(notifications.user_id, actorIds), inArray(notifications.actor_id, actorIds)),
      );
    await transaction
      .delete(follows)
      .where(or(inArray(follows.follower_id, actorIds), inArray(follows.following_id, actorIds)));
  });
}

export { expect };
