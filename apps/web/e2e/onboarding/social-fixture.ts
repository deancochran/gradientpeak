import type { APIRequestContext, TestInfo } from "@playwright/test";
import { currentE2EActor } from "../support/actors";
import { type E2EQuery, LocalE2EDatabase } from "../support/database";
import { e2eArtifactIdentity } from "../utils/testData";

type OnboardingSocialFixture = {
  closedGroupId: string;
  closedGroupName: string;
  openGroupId: string;
  openGroupName: string;
  personId: string;
  personName: string;
  readFollowStatus: () => Promise<string | null>;
  readGroupMembership: (groupId: string) => Promise<string | null>;
  readJoinRequest: (groupId: string) => Promise<string | null>;
};

async function profileId(client: E2EQuery, email: string) {
  const result = await client.query<{ id: string }>(
    `select p."id" from "profiles" p
     inner join "users" u on u."id" = p."id"
     where lower(u."email") = lower($1) limit 1`,
    [email],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`The social fixture actor ${email} was not provisioned.`);
  return id;
}

export async function withOnboardingSocialFixture(
  request: APIRequestContext,
  testInfo: TestInfo,
  run: (fixture: OnboardingSocialFixture) => Promise<void>,
) {
  void request;
  const ownerActor = currentE2EActor("coach");
  const athleteActor = currentE2EActor("athlete");

  const openGroupName = e2eArtifactIdentity(testInfo, "social open group");
  const closedGroupName = e2eArtifactIdentity(testInfo, "social closed group");
  const openSlug = `social-open-${openGroupName.split(" ").at(-1)}`;
  const closedSlug = `social-closed-${closedGroupName.split(" ").at(-1)}`;
  const pool = new LocalE2EDatabase({ max: 1 });
  const client = await pool.connect();
  let ownerWasPublic = false;
  let ownerFullName: string | null = null;
  let ownerUsername: string | null = null;
  let ownerId = "";
  let athleteId = "";
  let openGroupId = "";
  let closedGroupId = "";
  let primaryError: unknown;

  try {
    ownerId = await profileId(client, ownerActor.email);
    athleteId = await profileId(client, athleteActor.email);
    const owner = await client.query<{
      full_name: string | null;
      is_public: boolean;
      username: string | null;
    }>('select "full_name", "is_public", "username" from "profiles" where "id" = $1', [ownerId]);
    ownerWasPublic = owner.rows[0]?.is_public ?? false;
    ownerFullName = owner.rows[0]?.full_name ?? null;
    ownerUsername = owner.rows[0]?.username ?? null;

    await client.query("begin");
    await client.query('delete from "follows" where "follower_id" = $1 and "following_id" = $2', [
      athleteId,
      ownerId,
    ]);
    await client.query(
      `update "profiles"
       set "is_public" = true, "full_name" = $2, "username" = $3, "updated_at" = now()
       where "id" = $1`,
      [ownerId, "Social Trail Guide", ownerActor.username],
    );
    const groups = await client.query<{ id: string; join_policy: string }>(
      `insert into "groups" (
         "created_by_profile_id", "name", "slug", "description", "access_level", "join_policy"
       ) values
          ($1, $2, $3, 'An open social discovery fixture.', 'public', 'open'),
          ($1, $4, $5, 'A request-only social discovery fixture.', 'public', 'request_to_join')
       returning "id", "join_policy"`,
      [ownerId, openGroupName, openSlug, closedGroupName, closedSlug],
    );
    openGroupId = groups.rows.find((row) => row.join_policy === "open")?.id ?? "";
    closedGroupId = groups.rows.find((row) => row.join_policy === "request_to_join")?.id ?? "";
    if (!openGroupId || !closedGroupId) throw new Error("Social fixture groups were not created.");
    await client.query(
      `insert into "group_memberships" ("group_id", "profile_id", "role", "status")
       values ($1, $3, 'owner', 'active'), ($2, $3, 'owner', 'active')`,
      [openGroupId, closedGroupId, ownerId],
    );
    await client.query("commit");

    await run({
      closedGroupId,
      closedGroupName,
      openGroupId,
      openGroupName,
      personId: ownerId,
      personName: "Social Trail Guide",
      readFollowStatus: async () => {
        const result = await client.query<{ status: string }>(
          'select "status" from "follows" where "follower_id" = $1 and "following_id" = $2',
          [athleteId, ownerId],
        );
        return result.rows[0]?.status ?? null;
      },
      readGroupMembership: async (groupId) => {
        const result = await client.query<{ role: string }>(
          `select "role" from "group_memberships"
           where "group_id" = $1 and "profile_id" = $2 and "status" = 'active'`,
          [groupId, athleteId],
        );
        return result.rows[0]?.role ?? null;
      },
      readJoinRequest: async (groupId) => {
        const result = await client.query<{ status: string }>(
          `select "status" from "group_join_requests"
           where "group_id" = $1 and "profile_id" = $2
           order by "created_at" desc limit 1`,
          [groupId, athleteId],
        );
        return result.rows[0]?.status ?? null;
      },
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    primaryError = error;
  }

  let cleanupError: unknown;
  try {
    await client.query("begin");
    if (athleteId && ownerId) {
      await client.query('delete from "follows" where "follower_id" = $1 and "following_id" = $2', [
        athleteId,
        ownerId,
      ]);
    }
    if (openGroupId || closedGroupId) {
      await client.query(
        'delete from "groups" where "created_by_profile_id" = $1 and "id" = any($2::uuid[])',
        [ownerId, [openGroupId, closedGroupId].filter(Boolean)],
      );
    } else if (ownerId) {
      const recovered = await client.query<{ id: string }>(
        `select "id" from "groups"
         where "created_by_profile_id" = $1 and "slug" = any($2::text[])`,
        [ownerId, [openSlug, closedSlug]],
      );
      const recoveredIds = recovered.rows.map((row) => row.id);
      if (recoveredIds.length > 0) {
        await client.query(
          'delete from "groups" where "created_by_profile_id" = $1 and "id" = any($2::uuid[])',
          [ownerId, recoveredIds],
        );
      }
    }
    if (ownerId) {
      await client.query(
        `update "profiles"
         set "is_public" = $2, "full_name" = $3, "username" = $4, "updated_at" = now()
         where "id" = $1`,
        [ownerId, ownerWasPublic, ownerFullName, ownerUsername],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    cleanupError = error;
  } finally {
    client.release();
    await pool.close();
  }

  if (primaryError !== undefined) throw primaryError;
  if (cleanupError !== undefined) throw cleanupError;
}
