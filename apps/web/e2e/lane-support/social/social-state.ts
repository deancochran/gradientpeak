import type { APIRequestContext } from "@playwright/test";
import { follows, notifications, profiles } from "@repo/db/schema";
import { and, eq, type InferSelectModel, or } from "drizzle-orm";
import { currentE2EActor } from "../../support/actors";
import { LocalE2EDatabase } from "../../support/database";

type FollowSnapshot = Pick<
  InferSelectModel<typeof follows>,
  "created_at" | "follower_id" | "following_id" | "status" | "updated_at"
>;
type NotificationSnapshot = Pick<
  InferSelectModel<typeof notifications>,
  "actor_id" | "created_at" | "entity_id" | "id" | "read_at" | "type" | "user_id"
>;
type ProfileSnapshot = Pick<
  InferSelectModel<typeof profiles>,
  "bio" | "full_name" | "id" | "is_public" | "updated_at" | "username"
>;

export type SeededSocialState = {
  athleteId: string;
  coachId: string;
  cleanup: () => Promise<void>;
};

export async function seedSocialState(request: APIRequestContext): Promise<SeededSocialState> {
  void request;
  const athleteActor = currentE2EActor("athlete");
  const coachActor = currentE2EActor("coach");

  const database = new LocalE2EDatabase({
    connectionTimeoutMillis: 10_000,
    queryTimeout: 10_000,
  });
  let athlete: ProfileSnapshot | undefined;
  let coach: ProfileSnapshot | undefined;
  let followsSnapshot: FollowSnapshot[] = [];
  let notificationsSnapshot: NotificationSnapshot[] = [];

  try {
    await database.typedTransaction(async (transaction) => {
      const profileRows = await transaction
        .select({
          bio: profiles.bio,
          full_name: profiles.full_name,
          id: profiles.id,
          is_public: profiles.is_public,
          updated_at: profiles.updated_at,
          username: profiles.username,
        })
        .from(profiles)
        .where(or(eq(profiles.id, athleteActor.profileId), eq(profiles.id, coachActor.profileId)));
      athlete = profileRows.find((profile) => profile.id === athleteActor.profileId);
      coach = profileRows.find((profile) => profile.id === coachActor.profileId);
      if (!athlete || !coach)
        throw new Error("Area 4 requires local athlete and coach E2E profiles.");

      followsSnapshot = await transaction
        .select({
          created_at: follows.created_at,
          follower_id: follows.follower_id,
          following_id: follows.following_id,
          status: follows.status,
          updated_at: follows.updated_at,
        })
        .from(follows)
        .where(
          or(
            and(eq(follows.follower_id, athlete.id), eq(follows.following_id, coach.id)),
            and(eq(follows.follower_id, coach.id), eq(follows.following_id, athlete.id)),
          ),
        );
      notificationsSnapshot = await transaction
        .select({
          actor_id: notifications.actor_id,
          created_at: notifications.created_at,
          entity_id: notifications.entity_id,
          id: notifications.id,
          read_at: notifications.read_at,
          type: notifications.type,
          user_id: notifications.user_id,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.user_id, coach.id),
            eq(notifications.actor_id, athlete.id),
            eq(notifications.type, "follow_request"),
          ),
        );

      await transaction
        .delete(follows)
        .where(
          or(
            and(eq(follows.follower_id, athlete.id), eq(follows.following_id, coach.id)),
            and(eq(follows.follower_id, coach.id), eq(follows.following_id, athlete.id)),
          ),
        );
      await transaction
        .update(profiles)
        .set({
          full_name: "Coach User",
          bio: "Area 4 private coach biography",
          is_public: false,
          updated_at: new Date(),
        })
        .where(eq(profiles.id, coach.id));
      const now = new Date();
      await transaction.insert(follows).values({
        follower_id: coach.id,
        following_id: athlete.id,
        status: "accepted",
        created_at: now,
        updated_at: now,
      });
    });
  } catch (error) {
    await database.close();
    throw error;
  }

  if (!athlete || !coach) {
    await database.close();
    throw new Error("Area 4 social actor setup did not complete.");
  }
  const seededAthlete = athlete;
  const seededCoach = coach;
  await database.close();

  return {
    athleteId: seededAthlete.id,
    coachId: seededCoach.id,
    cleanup: async () => {
      const cleanupDatabase = new LocalE2EDatabase({
        connectionTimeoutMillis: 10_000,
        queryTimeout: 10_000,
      });
      try {
        await cleanupDatabase.typedTransaction(async (transaction) => {
          await transaction
            .delete(follows)
            .where(
              or(
                and(
                  eq(follows.follower_id, seededAthlete.id),
                  eq(follows.following_id, seededCoach.id),
                ),
                and(
                  eq(follows.follower_id, seededCoach.id),
                  eq(follows.following_id, seededAthlete.id),
                ),
              ),
            );
          await transaction
            .delete(notifications)
            .where(
              and(
                eq(notifications.user_id, seededCoach.id),
                eq(notifications.actor_id, seededAthlete.id),
                eq(notifications.type, "follow_request"),
              ),
            );
          if (followsSnapshot.length) await transaction.insert(follows).values(followsSnapshot);
          if (notificationsSnapshot.length)
            await transaction.insert(notifications).values(notificationsSnapshot);
          await transaction
            .update(profiles)
            .set({
              username: seededCoach.username,
              full_name: seededCoach.full_name,
              bio: seededCoach.bio,
              is_public: seededCoach.is_public,
              updated_at: seededCoach.updated_at,
            })
            .where(eq(profiles.id, seededCoach.id));
        });
      } finally {
        await cleanupDatabase.close();
      }
    },
  };
}
