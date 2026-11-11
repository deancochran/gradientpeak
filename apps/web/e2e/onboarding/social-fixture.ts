import type { APIRequestContext, TestInfo } from "@playwright/test";
import { follows, groupJoinRequests, groupMemberships, groups, profiles } from "@repo/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { currentE2EActor } from "../support/actors";
import { LocalE2EDatabase } from "../support/database";
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
  const database = new LocalE2EDatabase({ max: 1 });
  let ownerWasPublic = false;
  let ownerFullName: string | null = null;
  let ownerUsername: string | null = null;
  let ownerId = "";
  let athleteId = "";
  let openGroupId = "";
  let closedGroupId = "";
  let primaryError: unknown;

  try {
    ownerId = ownerActor.profileId;
    athleteId = athleteActor.profileId;
    const [owner] = await database.db
      .select({
        full_name: profiles.full_name,
        is_public: profiles.is_public,
        username: profiles.username,
      })
      .from(profiles)
      .where(eq(profiles.id, ownerId))
      .limit(1);
    if (!owner)
      throw new Error(`The social fixture actor ${ownerActor.email} was not provisioned.`);
    ownerWasPublic = owner.is_public;
    ownerFullName = owner.full_name;
    ownerUsername = owner.username;

    const createdGroups = await database.typedTransaction(async (transaction) => {
      await transaction
        .delete(follows)
        .where(and(eq(follows.follower_id, athleteId), eq(follows.following_id, ownerId)));
      await transaction
        .update(profiles)
        .set({
          is_public: true,
          full_name: "Social Trail Guide",
          username: ownerActor.username,
          updated_at: new Date(),
        })
        .where(eq(profiles.id, ownerId));
      const created = await transaction
        .insert(groups)
        .values([
          {
            created_by_profile_id: ownerId,
            name: openGroupName,
            slug: openSlug,
            description: "An open social discovery fixture.",
            access_level: "public",
            join_policy: "open",
          },
          {
            created_by_profile_id: ownerId,
            name: closedGroupName,
            slug: closedSlug,
            description: "A request-only social discovery fixture.",
            access_level: "public",
            join_policy: "request_to_join",
          },
        ])
        .returning({ id: groups.id, join_policy: groups.join_policy });
      const openGroupId = created.find((group) => group.join_policy === "open")?.id;
      const closedGroupId = created.find((group) => group.join_policy === "request_to_join")?.id;
      if (!openGroupId || !closedGroupId)
        throw new Error("Social fixture groups were not created.");
      await transaction.insert(groupMemberships).values([
        { group_id: openGroupId, profile_id: ownerId, role: "owner", status: "active" },
        { group_id: closedGroupId, profile_id: ownerId, role: "owner", status: "active" },
      ]);
      return { closedGroupId, openGroupId };
    });
    openGroupId = createdGroups.openGroupId;
    closedGroupId = createdGroups.closedGroupId;

    await run({
      closedGroupId,
      closedGroupName,
      openGroupId,
      openGroupName,
      personId: ownerId,
      personName: "Social Trail Guide",
      readFollowStatus: async () => {
        const [follow] = await database.db
          .select({ status: follows.status })
          .from(follows)
          .where(and(eq(follows.follower_id, athleteId), eq(follows.following_id, ownerId)))
          .limit(1);
        return follow?.status ?? null;
      },
      readGroupMembership: async (groupId) => {
        const [membership] = await database.db
          .select({ role: groupMemberships.role })
          .from(groupMemberships)
          .where(
            and(
              eq(groupMemberships.group_id, groupId),
              eq(groupMemberships.profile_id, athleteId),
              eq(groupMemberships.status, "active"),
            ),
          )
          .limit(1);
        return membership?.role ?? null;
      },
      readJoinRequest: async (groupId) => {
        const [request] = await database.db
          .select({ status: groupJoinRequests.status })
          .from(groupJoinRequests)
          .where(
            and(
              eq(groupJoinRequests.group_id, groupId),
              eq(groupJoinRequests.profile_id, athleteId),
            ),
          )
          .orderBy(desc(groupJoinRequests.created_at))
          .limit(1);
        return request?.status ?? null;
      },
    });
  } catch (error) {
    primaryError = error;
  }

  let cleanupError: unknown;
  try {
    await database.typedTransaction(async (transaction) => {
      if (athleteId && ownerId) {
        await transaction
          .delete(follows)
          .where(and(eq(follows.follower_id, athleteId), eq(follows.following_id, ownerId)));
      }
      if (openGroupId || closedGroupId) {
        await transaction
          .delete(groups)
          .where(
            and(
              eq(groups.created_by_profile_id, ownerId),
              inArray(groups.id, [openGroupId, closedGroupId].filter(Boolean)),
            ),
          );
      } else if (ownerId) {
        await transaction
          .delete(groups)
          .where(
            and(
              eq(groups.created_by_profile_id, ownerId),
              inArray(groups.slug, [openSlug, closedSlug]),
            ),
          );
      }
      if (ownerId) {
        await transaction
          .update(profiles)
          .set({
            is_public: ownerWasPublic,
            full_name: ownerFullName,
            username: ownerUsername,
            updated_at: new Date(),
          })
          .where(eq(profiles.id, ownerId));
      }
    });
  } catch (error) {
    cleanupError = error;
  } finally {
    await database.close();
  }

  if (primaryError !== undefined) throw primaryError;
  if (cleanupError !== undefined) throw cleanupError;
}
