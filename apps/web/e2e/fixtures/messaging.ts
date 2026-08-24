import type { Page } from "@playwright/test";

import { expect, test as sharedTest } from "../fixtures";
import type { AuthenticatedE2EActor } from "../support/actors";
import type { E2EQuery } from "../support/database";

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
    const actors = Object.fromEntries(entries) as Record<ActorKey, Actor>;
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
        await e2eDatabase.query(
          `insert into "follows" ("follower_id", "following_id", "status", "created_at", "updated_at")
           values ($1, $2, 'pending', now(), now())
           on conflict ("follower_id", "following_id") do update
           set "status" = 'pending', "updated_at" = now()`,
          [follower, following],
        );
        await e2eDatabase.query(
          `delete from "notifications"
           where "user_id" = $2 and "actor_id" = $1 and "type" = 'follow_request'`,
          [follower, following],
        );
        await e2eDatabase.query(
          `insert into "notifications" ("id", "user_id", "actor_id", "type", "created_at")
           values (gen_random_uuid(), $2, $1, 'follow_request', now())`,
          [follower, following],
        );
      },
      readFollowStatus: async (from, to) => {
        const result = await e2eDatabase.query<{ status: string }>(
          'select "status" from "follows" where "follower_id" = $1 and "following_id" = $2',
          [actors[from].profileId, actors[to].profileId],
        );
        return result.rows[0]?.status ?? null;
      },
    });
  },
});

async function clearActorState(database: E2EQuery, actorIds: string[]) {
  await database.query(
    `delete from "conversations" where "id" in (
       select "conversation_id" from "conversation_participants" where "user_id" = any($1::uuid[])
     )`,
    [actorIds],
  );
  await database.query(
    `delete from "notifications" where "user_id" = any($1::uuid[]) or "actor_id" = any($1::uuid[])`,
    [actorIds],
  );
  await database.query(
    `delete from "follows" where "follower_id" = any($1::uuid[]) or "following_id" = any($1::uuid[])`,
    [actorIds],
  );
}

export { expect };
