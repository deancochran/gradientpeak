import type { APIRequestContext } from "@playwright/test";
import { Pool } from "pg";
import { authenticateTestActor, TEST_USERS } from "../../utils/testData";

type FollowSnapshot = {
  created_at: Date;
  follower_id: string;
  following_id: string;
  status: "accepted" | "pending";
  updated_at: Date;
};

type NotificationSnapshot = {
  actor_id: string;
  created_at: Date;
  entity_id: string | null;
  id: string;
  read_at: Date | null;
  type: "follow_request";
  user_id: string;
};

type ProfileSnapshot = {
  bio: string | null;
  full_name: string | null;
  id: string;
  is_public: boolean;
  username: string | null;
  updated_at: Date;
};

export type SeededSocialState = {
  athleteId: string;
  coachId: string;
  cleanup: () => Promise<void>;
};

const configuredConnectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  // biome-ignore lint/security/noSecrets: Supabase's documented local-only database URL.
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function getLocalConnectionString() {
  const url = new URL(configuredConnectionString);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Area 4 social E2E seeding is local-only.");
  }
  return configuredConnectionString;
}

export async function seedSocialState(request: APIRequestContext): Promise<SeededSocialState> {
  const connectionString = getLocalConnectionString();
  await authenticateTestActor(request, "coach", { persistStorageState: false });

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  const client = await pool.connect();
  let athlete: ProfileSnapshot | undefined;
  let coach: ProfileSnapshot | undefined;
  let follows: FollowSnapshot[] = [];
  let notifications: NotificationSnapshot[] = [];

  try {
    await client.query("begin");
    const profiles = await client.query<ProfileSnapshot>(
      `select p."id", p."username", p."full_name", p."bio", p."is_public", p."updated_at"
       from "profiles" p
       join "users" u on u."id" = p."id"
       where lower(u."email") in (lower($1), lower($2))`,
      [TEST_USERS.athlete.email, TEST_USERS.coach.email],
    );
    athlete = profiles.rows.find((profile) => profile.username === TEST_USERS.athlete.username);
    coach = profiles.rows.find((profile) => profile.username === TEST_USERS.coach.username);
    if (!athlete || !coach) {
      throw new Error("Area 4 requires local athlete and coach E2E profiles.");
    }

    const relationshipRows = await client.query<FollowSnapshot>(
      `select "follower_id", "following_id", "status", "created_at", "updated_at"
       from "follows"
       where ("follower_id" = $1 and "following_id" = $2)
          or ("follower_id" = $2 and "following_id" = $1)`,
      [athlete.id, coach.id],
    );
    follows = relationshipRows.rows;
    const notificationRows = await client.query<NotificationSnapshot>(
      `select "id", "user_id", "actor_id", "type", "entity_id", "read_at", "created_at"
       from "notifications"
       where "user_id" = $1 and "actor_id" = $2 and "type" = 'follow_request'`,
      [coach.id, athlete.id],
    );
    notifications = notificationRows.rows;

    await client.query(
      `delete from "follows"
       where ("follower_id" = $1 and "following_id" = $2)
          or ("follower_id" = $2 and "following_id" = $1)`,
      [athlete.id, coach.id],
    );
    await client.query(
      `update "profiles"
       set "full_name" = 'Coach User', "bio" = 'Area 4 private coach biography', "is_public" = false,
           "updated_at" = now()
       where "id" = $1`,
      [coach.id],
    );
    await client.query(
      `insert into "follows" ("follower_id", "following_id", "status", "created_at", "updated_at")
       values ($1, $2, 'accepted', now(), now())`,
      [coach.id, athlete.id],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  if (!athlete || !coach) {
    throw new Error("Area 4 social actor setup did not complete.");
  }

  return {
    athleteId: athlete.id,
    coachId: coach.id,
    cleanup: async () => {
      const cleanupPool = new Pool({
        connectionString,
        connectionTimeoutMillis: 10_000,
        query_timeout: 10_000,
      });
      const cleanupClient = await cleanupPool.connect();
      try {
        await cleanupClient.query("begin");
        await cleanupClient.query(
          `delete from "follows"
           where ("follower_id" = $1 and "following_id" = $2)
              or ("follower_id" = $2 and "following_id" = $1)`,
          [athlete.id, coach.id],
        );
        await cleanupClient.query(
          `delete from "notifications"
           where "user_id" = $1 and "actor_id" = $2 and "type" = 'follow_request'`,
          [coach.id, athlete.id],
        );
        for (const follow of follows) {
          await cleanupClient.query(
            `insert into "follows" ("follower_id", "following_id", "status", "created_at", "updated_at")
             values ($1, $2, $3, $4, $5)`,
            [
              follow.follower_id,
              follow.following_id,
              follow.status,
              follow.created_at,
              follow.updated_at,
            ],
          );
        }
        for (const notification of notifications) {
          await cleanupClient.query(
            `insert into "notifications" ("id", "user_id", "actor_id", "type", "entity_id", "read_at", "created_at")
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [
              notification.id,
              notification.user_id,
              notification.actor_id,
              notification.type,
              notification.entity_id,
              notification.read_at,
              notification.created_at,
            ],
          );
        }
        await cleanupClient.query(
          `update "profiles"
           set "username" = $2, "full_name" = $3, "bio" = $4, "is_public" = $5, "updated_at" = $6
           where "id" = $1`,
          [coach.id, coach.username, coach.full_name, coach.bio, coach.is_public, coach.updated_at],
        );
        await cleanupClient.query("commit");
      } catch (error) {
        await cleanupClient.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        cleanupClient.release();
        await cleanupPool.end();
      }
    },
  };
}
