import { type BrowserContext, test as base, expect, type Page } from "@playwright/test";
import { Pool } from "pg";

const actors = {
  a: {
    email: "messaging-a@gradientpeak.local",
    name: "Messaging Alpha",
    username: "messaging_alpha",
  },
  b: {
    email: "messaging-b@gradientpeak.local",
    name: "Messaging Bravo",
    username: "messaging_bravo",
  },
  c: {
    email: "messaging-c@gradientpeak.local",
    name: "Messaging Charlie",
    username: "messaging_charlie",
  },
} as const;
// biome-ignore lint/security/noSecrets: Public local-only E2E credential.
const password = "MessagingPlaywright123!";

type ActorKey = keyof typeof actors;
type Actor = { context: BrowserContext; id: string; page: Page; username: string };
type MessagingHarness = {
  actors: Record<ActorKey, Actor>;
  seedFollowRequest: (from: ActorKey, to: ActorKey) => Promise<void>;
  readFollowStatus: (from: ActorKey, to: ActorKey) => Promise<string | null>;
};

function databaseUrl() {
  const value =
    process.env.DATABASE_URL ??
    // biome-ignore lint/security/noSecrets: Supabase's documented local-only database URL.
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Messaging E2E support only mutates a local database.");
  }
  return value;
}

async function provision(context: BrowserContext, key: ActorKey, pool: Pool): Promise<Actor> {
  const actor = actors[key];
  let response = await context.request.post("/api/auth/sign-in/email", {
    data: { email: actor.email, password },
  });
  if (!response.ok()) {
    await context.request.post("/api/auth/sign-up/email", {
      data: { email: actor.email, name: actor.name, password },
    });
    await pool.query('update "users" set "email_verified" = true where "email" = $1', [
      actor.email,
    ]);
    response = await context.request.post("/api/auth/sign-in/email", {
      data: { email: actor.email, password },
    });
  }
  if (!response.ok()) throw new Error(`Unable to authenticate messaging actor ${key}.`);
  const user = await pool.query<{ id: string }>('select "id" from "users" where "email" = $1', [
    actor.email,
  ]);
  const id = user.rows[0]?.id;
  if (!id) throw new Error(`Messaging actor ${key} has no user row.`);
  await pool.query(
    `insert into "profiles" ("id", "email", "full_name", "username", "onboarded", "is_public")
     values ($1, $2, $3, $4, true, true)
     on conflict ("id") do update set
       "email" = excluded."email", "full_name" = excluded."full_name",
       "username" = excluded."username", "onboarded" = true, "is_public" = true`,
    [id, actor.email, actor.name, actor.username],
  );
  const page = await context.newPage();
  return { context, id, page, username: actor.username };
}

export const test = base.extend<{ messaging: MessagingHarness }>({
  messaging: async ({ browser }, use) => {
    const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
    const lock = "gradientpeak-web-e2e:shared-actor-state";
    let lockAcquired = false;
    const contexts: BrowserContext[] = [];
    let actorIds: string[] = [];
    let primaryError: unknown;
    try {
      // biome-ignore lint/security/noSecrets: Static PostgreSQL lock query, not a credential.
      await pool.query("select pg_advisory_lock(hashtext($1))", [lock]);
      lockAcquired = true;
      await pool.query('delete from "rate_limits"');
      const entries = await Promise.all(
        (Object.keys(actors) as ActorKey[]).map(async (key) => {
          const context = await browser.newContext();
          contexts.push(context);
          return [key, await provision(context, key, pool)] as const;
        }),
      );
      const actorMap = Object.fromEntries(entries) as Record<ActorKey, Actor>;
      actorIds = entries.map(([, actor]) => actor.id);
      await clearActorState(pool, actorIds);
      await use({
        actors: actorMap,
        seedFollowRequest: async (from, to) => {
          const follower = actorMap[from].id;
          const following = actorMap[to].id;
          await pool.query(
            `insert into "follows" ("follower_id", "following_id", "status", "created_at", "updated_at")
             values ($1, $2, 'pending', now(), now())
             on conflict ("follower_id", "following_id") do update set "status" = 'pending', "updated_at" = now()`,
            [follower, following],
          );
          await pool.query(
            `delete from "notifications"
             where "user_id" = $2 and "actor_id" = $1 and "type" = 'follow_request'`,
            [follower, following],
          );
          await pool.query(
            `insert into "notifications" ("id", "user_id", "actor_id", "type", "created_at")
             values (gen_random_uuid(), $2, $1, 'follow_request', now())`,
            [follower, following],
          );
        },
        readFollowStatus: async (from, to) => {
          const result = await pool.query<{ status: string }>(
            'select "status" from "follows" where "follower_id" = $1 and "following_id" = $2',
            [actorMap[from].id, actorMap[to].id],
          );
          return result.rows[0]?.status ?? null;
        },
      });
    } catch (error) {
      primaryError = error;
    }

    let cleanupError: unknown;
    for (const context of contexts) {
      try {
        await context.close();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    try {
      if (actorIds.length > 0) {
        await clearActorState(pool, actorIds);
      }
    } catch (error) {
      cleanupError ??= error;
    } finally {
      try {
        if (lockAcquired) {
          // biome-ignore lint/security/noSecrets: Static PostgreSQL unlock query, not a credential.
          await pool.query("select pg_advisory_unlock(hashtext($1))", [lock]);
        }
      } catch (error) {
        cleanupError ??= error;
      } finally {
        try {
          await pool.end();
        } catch (error) {
          cleanupError ??= error;
        }
      }
    }
    if (primaryError !== undefined) throw primaryError;
    if (cleanupError !== undefined) throw cleanupError;
  },
});

async function clearActorState(pool: Pool, actorIds: string[]) {
  await pool.query(
    `delete from "conversations" where "id" in (
       select "conversation_id" from "conversation_participants" where "user_id" = any($1::uuid[])
     )`,
    [actorIds],
  );
  await pool.query(
    `delete from "notifications" where "user_id" = any($1::uuid[]) or "actor_id" = any($1::uuid[])`,
    [actorIds],
  );
  await pool.query(
    `delete from "follows" where "follower_id" = any($1::uuid[]) or "following_id" = any($1::uuid[])`,
    [actorIds],
  );
}

export async function openAppPage(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
}

export { expect };
