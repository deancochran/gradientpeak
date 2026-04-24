import { randomUUID } from "node:crypto";
import {
  activities,
  activityPlans,
  activityRoutes,
  events,
  likes,
  profiles,
  publicNotificationTypeSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { buildIndexPageInfo, indexCursorSchema, parseIndexCursor } from "../utils/index-cursor";

type DbClient = ReturnType<typeof getRequiredDb>;

const uuidSchema = z.string().uuid();
const nullableAvatarUrlSchema = z.string().nullable();
const nullableUsernameSchema = z.string().nullable();
const followStatusSchema = z.enum(["pending", "accepted"]);
const likeEntityTypeSchema = z.enum(["activity", "training_plan", "activity_plan", "route"]);
const commentEntityTypeSchema = z.enum([
  "activity",
  "training_plan",
  "activity_plan",
  "route",
  "event",
]);
type FollowNotificationType = Extract<
  z.infer<typeof publicNotificationTypeSchema>,
  "follow_request" | "new_follower"
>;

const followRecordSchema = z
  .object({
    follower_id: uuidSchema,
    following_id: uuidSchema,
    status: followStatusSchema,
  })
  .strict();

const followerRelationshipRowSchema = z
  .object({
    follower_id: uuidSchema,
    status: followStatusSchema,
  })
  .strict();

const followingRelationshipRowSchema = z
  .object({
    following_id: uuidSchema,
    status: followStatusSchema,
  })
  .strict();

const profileListItemSchema = z
  .object({
    id: uuidSchema,
    username: nullableUsernameSchema,
    avatar_url: nullableAvatarUrlSchema,
    is_public: z.boolean().nullable(),
    created_at: z.union([z.date(), z.string()]),
    updated_at: z.union([z.date(), z.string()]),
  })
  .strict();

const countRowSchema = z.object({
  value: z.union([z.number(), z.string()]),
});

const commentInsertRowSchema = z
  .object({
    id: uuidSchema,
    profile_id: uuidSchema,
    entity_id: uuidSchema,
    entity_type: commentEntityTypeSchema,
    content: z.string(),
    created_at: z.union([z.date(), z.string()]),
  })
  .strict();

const commentOwnerRowSchema = z.object({ profile_id: uuidSchema }).strict();

const commentListRowSchema = z
  .object({
    id: uuidSchema,
    content: z.string(),
    created_at: z.union([z.date(), z.string()]),
    profile_id: uuidSchema.nullable(),
    profile_username: nullableUsernameSchema,
    profile_avatar_url: nullableAvatarUrlSchema,
  })
  .strict();

const trainingPlanAccessRowSchema = z
  .object({
    profile_id: uuidSchema.nullable(),
    is_system_template: z.boolean(),
    template_visibility: z.enum(["private", "public"]),
  })
  .strict();

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function buildUuidInList(values: string[]) {
  return sql.join(
    values.map((value) => sql`${value}::uuid`),
    sql`, `,
  );
}

async function getFollowRecord(db: DbClient, followerId: string, followingId: string) {
  const result = await db.execute(sql`
    select follower_id, following_id, status
    from follows
    where follower_id = ${followerId}::uuid
      and following_id = ${followingId}::uuid
    limit 1
  `);

  const row = result.rows[0];
  return row ? followRecordSchema.parse(row) : null;
}

async function deleteFollowRequestNotification(db: DbClient, userId: string, actorId: string) {
  await db.execute(sql`
    delete from notifications
    where user_id = ${userId}::uuid
      and actor_id = ${actorId}::uuid
      and type = 'follow_request'
  `);
}

async function hasFollowRequestNotification(db: DbClient, userId: string, actorId: string) {
  const result = await db.execute(sql<{ has_notification: boolean }>`
    select exists(
      select 1
      from notifications
      where user_id = ${userId}::uuid
        and actor_id = ${actorId}::uuid
        and type = 'follow_request'
    ) as has_notification
  `);

  return Boolean(result.rows[0]?.has_notification);
}

async function createNotification(
  db: DbClient,
  input: {
    user_id: string;
    actor_id: string;
    type: FollowNotificationType;
  },
) {
  await db.execute(sql`
    insert into notifications (user_id, actor_id, type)
    values (${input.user_id}::uuid, ${input.actor_id}::uuid, ${input.type})
  `);
}

async function getCount(resultPromise: Promise<{ rows: unknown[] }>) {
  const result = await resultPromise;
  const row = countRowSchema.parse(result.rows[0] ?? { value: 0 });
  return Number(row.value ?? 0);
}

/**
 * Check if a user has access to view an activity.
 * Returns true if: user owns the activity, OR activity is public, OR user follows the owner.
 */
async function checkActivityAccess(
  db: DbClient,
  activityId: string,
  userId: string,
): Promise<boolean> {
  const activity = await db.query.activities.findFirst({
    columns: {
      profile_id: true,
      is_private: true,
    },
    where: eq(activities.id, activityId),
  });

  if (!activity) {
    return false;
  }

  if (activity.profile_id === userId) {
    return true;
  }

  if (!activity.is_private) {
    return true;
  }

  const followResult = await db.execute(sql<{ has_access: boolean }>`
    select exists(
      select 1
      from follows
      where follower_id = ${userId}::uuid
        and following_id = ${activity.profile_id}::uuid
        and status = 'accepted'
    ) as has_access
  `);

  return Boolean(followResult.rows[0]?.has_access);
}

async function checkPlanAccess(
  db: DbClient,
  planId: string,
  planType: "training_plan" | "activity_plan",
  userId: string,
): Promise<boolean> {
  if (planType === "activity_plan") {
    const plan = await db.query.activityPlans.findFirst({
      columns: {
        profile_id: true,
        is_system_template: true,
        template_visibility: true,
      },
      where: eq(activityPlans.id, planId),
    });

    if (!plan) {
      return false;
    }

    if (plan.profile_id === userId) {
      return true;
    }

    if (plan.is_system_template) {
      return true;
    }

    return plan.template_visibility === "public";
  }

  const result = await db.execute(sql`
    select profile_id, is_system_template, template_visibility
    from training_plans
    where id = ${planId}::uuid
    limit 1
  `);

  const plan = result.rows[0] ? trainingPlanAccessRowSchema.parse(result.rows[0]) : null;

  if (!plan) {
    return false;
  }

  if (plan.profile_id === userId) {
    return true;
  }

  if (plan.is_system_template) {
    return true;
  }

  return plan.template_visibility === "public";
}

async function checkRouteAccess(db: DbClient, routeId: string, userId: string): Promise<boolean> {
  const route = await db.query.activityRoutes.findFirst({
    columns: {
      profile_id: true,
      is_public: true,
    },
    where: eq(activityRoutes.id, routeId),
  });

  if (!route) {
    return false;
  }

  return route.profile_id === userId || route.is_public;
}

async function checkEventAccess(db: DbClient, eventId: string, userId: string): Promise<boolean> {
  const event = await db.query.events.findFirst({
    columns: {
      profile_id: true,
    },
    where: eq(events.id, eventId),
  });

  if (!event) {
    return false;
  }

  return event.profile_id === userId;
}

export const socialRouter = createTRPCRouter({
  followUser: protectedProcedure
    .input(z.object({ target_user_id: z.string().uuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      if (ctx.session.user.id === input.target_user_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot follow yourself",
        });
      }

      const [targetProfile] = await db
        .select({ is_public: profiles.is_public })
        .from(profiles)
        .where(eq(profiles.id, input.target_user_id))
        .limit(1);

      if (!targetProfile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target user not found",
        });
      }

      const existingFollow = await getFollowRecord(db, ctx.session.user.id, input.target_user_id);

      if (existingFollow) {
        if (existingFollow.status === "accepted") {
          return { ...existingFollow, already_following: true };
        }

        if (existingFollow.status === "pending") {
          return { ...existingFollow, already_pending: true };
        }
      }

      const status = targetProfile.is_public ? "accepted" : "pending";

      const insertResult = await db.execute(sql`
        insert into follows (follower_id, following_id, status)
        values (${ctx.session.user.id}::uuid, ${input.target_user_id}::uuid, ${status})
        returning follower_id, following_id, status
      `);

      const insertedFollow = followRecordSchema.parse(insertResult.rows[0]);

      if (status === "pending") {
        const existingNotification = await hasFollowRequestNotification(
          db,
          input.target_user_id,
          ctx.session.user.id,
        );

        if (!existingNotification) {
          try {
            await createNotification(db, {
              user_id: input.target_user_id,
              actor_id: ctx.session.user.id,
              type: "follow_request",
            });
          } catch (error) {
            console.error("Failed to create follow request notification:", error);
          }
        }
      }

      return insertedFollow;
    }),

  unfollowUser: protectedProcedure
    .input(z.object({ target_user_id: z.string().uuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      await db.execute(sql`
        delete from follows
        where follower_id = ${ctx.session.user.id}::uuid
          and following_id = ${input.target_user_id}::uuid
      `);

      return { success: true };
    }),

  acceptFollowRequest: protectedProcedure
    .input(z.object({ follower_id: z.string().uuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const existingFollow = await getFollowRecord(db, input.follower_id, ctx.session.user.id);

      if (!existingFollow) {
        try {
          await deleteFollowRequestNotification(db, ctx.session.user.id, input.follower_id);
        } catch (error) {
          console.error("Failed to delete orphan notification:", error);
        }

        return {
          success: true,
          message: "No pending request found - notification cleaned up",
        };
      }

      if (existingFollow.status === "accepted") {
        await deleteFollowRequestNotification(db, ctx.session.user.id, input.follower_id);

        return { success: true, message: "Already following" };
      }

      await db.execute(sql`
        update follows
        set status = 'accepted'
        where follower_id = ${input.follower_id}::uuid
          and following_id = ${ctx.session.user.id}::uuid
          and status = 'pending'
      `);

      await deleteFollowRequestNotification(db, ctx.session.user.id, input.follower_id);

      try {
        await createNotification(db, {
          user_id: input.follower_id,
          actor_id: ctx.session.user.id,
          type: "new_follower",
        });
      } catch (error) {
        console.error("Failed to create follow accepted notification:", error);
      }

      return { success: true };
    }),

  rejectFollowRequest: protectedProcedure
    .input(z.object({ follower_id: z.string().uuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const existingFollow = await getFollowRecord(db, input.follower_id, ctx.session.user.id);

      if (!existingFollow) {
        try {
          await deleteFollowRequestNotification(db, ctx.session.user.id, input.follower_id);
        } catch (error) {
          console.error("Failed to delete orphan notification:", error);
        }

        return {
          success: true,
          message: "No pending request found - notification cleaned up",
        };
      }

      if (existingFollow.status !== "pending") {
        await deleteFollowRequestNotification(db, ctx.session.user.id, input.follower_id);

        return { success: true, message: "Follow request already processed" };
      }

      await db.execute(sql`
        delete from follows
        where follower_id = ${input.follower_id}::uuid
          and following_id = ${ctx.session.user.id}::uuid
          and status = 'pending'
      `);

      await deleteFollowRequestNotification(db, ctx.session.user.id, input.follower_id);

      return { success: true };
    }),

  toggleLike: protectedProcedure
    .input(
      z
        .object({
          entity_id: z.string().uuid(),
          entity_type: likeEntityTypeSchema,
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const userId = ctx.session.user.id;

      if (input.entity_type === "activity") {
        const hasAccess = await checkActivityAccess(db, input.entity_id, userId);

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to like this activity",
          });
        }
      }

      if (input.entity_type === "training_plan" || input.entity_type === "activity_plan") {
        const hasAccess = await checkPlanAccess(db, input.entity_id, input.entity_type, userId);

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You don't have permission to like this ${input.entity_type}`,
          });
        }
      }

      if (input.entity_type === "route") {
        const hasAccess = await checkRouteAccess(db, input.entity_id, userId);

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to like this route",
          });
        }
      }

      const existingLike = await db
        .select({ id: likes.id })
        .from(likes)
        .where(
          and(
            eq(likes.profile_id, ctx.session.user.id),
            eq(likes.entity_id, input.entity_id),
            eq(likes.entity_type, input.entity_type),
          ),
        )
        .limit(1);

      if (existingLike[0]) {
        await db.delete(likes).where(eq(likes.id, existingLike[0].id));
        return { liked: false };
      }

      await db.insert(likes).values({
        id: randomUUID(),
        created_at: new Date(),
        profile_id: ctx.session.user.id,
        entity_id: input.entity_id,
        entity_type: input.entity_type,
      });

      return { liked: true };
    }),

  getFollowers: protectedProcedure
    .input(
      z
        .object({
          user_id: z.string().uuid(),
          limit: z.number().min(1).max(50).default(20),
          cursor: indexCursorSchema.optional(),
          direction: z.enum(["forward", "backward"]).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        const currentUserId = ctx.session.user.id;
        const offset = parseIndexCursor(input.cursor);

        const followersResult = await db.execute(sql`
          select p.id, p.username, p.avatar_url, p.is_public, p.created_at, p.updated_at
          from follows f
          join profiles p on p.id = f.follower_id
          where f.following_id = ${input.user_id}::uuid
            and f.status = 'accepted'
          order by p.created_at desc, p.id asc
          limit ${input.limit}
          offset ${offset}
        `);

        const followers = z.array(profileListItemSchema).parse(followersResult.rows);
        const total = await getCount(
          db.execute(sql`
          select count(*)::int as value
          from follows
          where following_id = ${input.user_id}::uuid
            and status = 'accepted'
        `),
        );

        let usersWithRelationship = followers;

        if (currentUserId !== input.user_id) {
          const followerIds = followers.map((follower) => follower.id);

          if (followerIds.length > 0) {
            const relationshipsResult = await db.execute(sql`
              select follower_id, status
              from follows
              where following_id = ${currentUserId}::uuid
                and follower_id in (${buildUuidInList(followerIds)})
            `);

            const relationships = z
              .array(followerRelationshipRowSchema)
              .parse(relationshipsResult.rows);

            const statusMap = new Map(
              relationships.map((relationship) => [relationship.follower_id, relationship.status]),
            );

            usersWithRelationship = followers.map((follower) => ({
              ...follower,
              follow_status: statusMap.get(follower.id) ?? null,
            }));
          }
        } else {
          usersWithRelationship = followers.map((follower) => ({
            ...follower,
            follow_status: "accepted" as const,
          }));
        }

        return {
          users: usersWithRelationship,
          total,
          ...buildIndexPageInfo({ offset, limit: input.limit, total }),
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch followers",
        });
      }
    }),

  getFollowing: protectedProcedure
    .input(
      z
        .object({
          user_id: z.string().uuid(),
          limit: z.number().min(1).max(50).default(20),
          cursor: indexCursorSchema.optional(),
          direction: z.enum(["forward", "backward"]).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        const currentUserId = ctx.session.user.id;
        const offset = parseIndexCursor(input.cursor);

        const followingResult = await db.execute(sql`
          select p.id, p.username, p.avatar_url, p.is_public, p.created_at, p.updated_at
          from follows f
          join profiles p on p.id = f.following_id
          where f.follower_id = ${input.user_id}::uuid
            and f.status = 'accepted'
          order by p.created_at desc, p.id asc
          limit ${input.limit}
          offset ${offset}
        `);

        const following = z.array(profileListItemSchema).parse(followingResult.rows);
        const total = await getCount(
          db.execute(sql`
          select count(*)::int as value
          from follows
          where follower_id = ${input.user_id}::uuid
            and status = 'accepted'
        `),
        );

        let usersWithRelationship = following;

        if (currentUserId !== input.user_id) {
          const followingIds = following.map((followedUser) => followedUser.id);

          if (followingIds.length > 0) {
            const relationshipsResult = await db.execute(sql`
              select following_id, status
              from follows
              where follower_id = ${currentUserId}::uuid
                and following_id in (${buildUuidInList(followingIds)})
            `);

            const relationships = z
              .array(followingRelationshipRowSchema)
              .parse(relationshipsResult.rows);

            const statusMap = new Map(
              relationships.map((relationship) => [relationship.following_id, relationship.status]),
            );

            usersWithRelationship = following.map((followedUser) => ({
              ...followedUser,
              follow_status: statusMap.get(followedUser.id) ?? null,
            }));
          }
        } else {
          usersWithRelationship = following.map((followedUser) => ({
            ...followedUser,
            follow_status: "accepted" as const,
          }));
        }

        return {
          users: usersWithRelationship,
          total,
          ...buildIndexPageInfo({ offset, limit: input.limit, total }),
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch following",
        });
      }
    }),

  searchUsers: protectedProcedure
    .input(
      z
        .object({
          query: z.string().optional(),
          limit: z.number().min(1).max(50).default(20),
          cursor: indexCursorSchema.optional(),
          offset: z.number().min(0).default(0),
          direction: z.enum(["forward", "backward"]).optional(),
          sort_by: z.enum(["newest", "oldest", "username_asc", "username_desc"]).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        const trimmedQuery = input.query?.trim() ?? "";
        const searchPattern = `%${trimmedQuery}%`;
        const offset = input.cursor ? parseIndexCursor(input.cursor) : input.offset;
        const profileSortClause =
          input.sort_by === "oldest"
            ? sql`p.created_at asc, p.id asc`
            : input.sort_by === "username_asc"
              ? sql`p.username asc nulls last, p.created_at desc, p.id asc`
              : input.sort_by === "username_desc"
                ? sql`p.username desc nulls last, p.created_at desc, p.id asc`
                : sql`p.created_at desc, p.id asc`;

        const usersResult = trimmedQuery
          ? await db.execute(sql`
              select p.id, p.username, p.avatar_url, p.is_public, p.created_at, p.updated_at
              from profiles p
               where p.id != ${ctx.session.user.id}::uuid
                 and p.username ilike ${searchPattern}
               order by ${profileSortClause}
               limit ${input.limit}
               offset ${offset}
             `)
          : await db.execute(sql`
               select p.id, p.username, p.avatar_url, p.is_public, p.created_at, p.updated_at
               from profiles p
               where p.id != ${ctx.session.user.id}::uuid
               order by ${profileSortClause}
               limit ${input.limit}
               offset ${offset}
             `);

        const users = z.array(profileListItemSchema).parse(usersResult.rows);
        const total = await getCount(
          trimmedQuery
            ? db.execute(sql`
                select count(*)::int as value
                from profiles p
                where p.id != ${ctx.session.user.id}::uuid
                  and p.username ilike ${searchPattern}
              `)
            : db.execute(sql`
                select count(*)::int as value
                from profiles p
                where p.id != ${ctx.session.user.id}::uuid
              `),
        );

        return {
          users,
          total,
          ...buildIndexPageInfo({ offset, limit: input.limit, total }),
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to search users",
        });
      }
    }),

  addComment: protectedProcedure
    .input(
      z
        .object({
          entity_id: z.string().uuid(),
          entity_type: commentEntityTypeSchema,
          content: z.string().min(1).max(1000),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const userId = ctx.session.user.id;

      if (input.entity_type === "activity") {
        const hasAccess = await checkActivityAccess(db, input.entity_id, userId);

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to comment on this activity",
          });
        }
      }

      if (input.entity_type === "training_plan" || input.entity_type === "activity_plan") {
        const hasAccess = await checkPlanAccess(db, input.entity_id, input.entity_type, userId);

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You don't have permission to comment on this ${input.entity_type}`,
          });
        }
      }

      if (input.entity_type === "route") {
        const hasAccess = await checkRouteAccess(db, input.entity_id, userId);

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to comment on this route",
          });
        }
      }

      if (input.entity_type === "event") {
        const hasAccess = await checkEventAccess(db, input.entity_id, userId);

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to view comments on this event",
          });
        }
      }

      const insertResult = await db.execute(sql`
        insert into comments (profile_id, entity_id, entity_type, content)
        values (
          ${userId}::uuid,
          ${input.entity_id}::uuid,
          ${input.entity_type},
          ${input.content.trim()}
        )
        returning id, profile_id, entity_id, entity_type, content, created_at
      `);

      const insertedComment = commentInsertRowSchema.parse(insertResult.rows[0]);

      return {
        ...insertedComment,
        created_at: toIsoString(insertedComment.created_at),
      };
    }),

  deleteComment: protectedProcedure
    .input(z.object({ comment_id: z.string().uuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const commentResult = await db.execute(sql`
        select profile_id
        from comments
        where id = ${input.comment_id}::uuid
        limit 1
      `);

      const existingComment = commentResult.rows[0]
        ? commentOwnerRowSchema.parse(commentResult.rows[0])
        : null;

      if (!existingComment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found",
        });
      }

      if (existingComment.profile_id !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own comments",
        });
      }

      await db.execute(sql`
        delete from comments
        where id = ${input.comment_id}::uuid
      `);

      return { success: true };
    }),

  getComments: protectedProcedure
    .input(
      z
        .object({
          entity_id: z.string().uuid(),
          entity_type: commentEntityTypeSchema,
          limit: z.number().min(1).max(100).default(20),
          cursor: indexCursorSchema.optional(),
          direction: z.enum(["forward", "backward"]).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const userId = ctx.session.user.id;
      const offset = parseIndexCursor(input.cursor);

      if (input.entity_type === "activity") {
        const hasAccess = await checkActivityAccess(db, input.entity_id, userId);

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to view comments on this activity",
          });
        }
      }

      if (input.entity_type === "training_plan" || input.entity_type === "activity_plan") {
        const hasAccess = await checkPlanAccess(db, input.entity_id, input.entity_type, userId);

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You don't have permission to view comments on this ${input.entity_type}`,
          });
        }
      }

      if (input.entity_type === "route") {
        const hasAccess = await checkRouteAccess(db, input.entity_id, userId);

        if (!hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to view comments on this route",
          });
        }
      }

      const commentsResult = await db.execute(sql`
        select
          c.id,
          c.content,
          c.created_at,
          p.id as profile_id,
          p.username as profile_username,
          p.avatar_url as profile_avatar_url
        from comments c
        left join profiles p on p.id = c.profile_id
        where c.entity_id = ${input.entity_id}::uuid
          and c.entity_type = ${input.entity_type}
        order by c.created_at asc
        limit ${input.limit}
        offset ${offset}
      `);

      const comments = z.array(commentListRowSchema).parse(commentsResult.rows);
      const total = await getCount(
        db.execute(sql`
        select count(*)::int as value
        from comments
        where entity_id = ${input.entity_id}::uuid
          and entity_type = ${input.entity_type}
      `),
      );

      return {
        comments: comments.map((comment) => ({
          id: comment.id,
          content: comment.content,
          created_at: toIsoString(comment.created_at),
          profile: comment.profile_id
            ? {
                id: comment.profile_id,
                username: comment.profile_username,
                avatar_url: comment.profile_avatar_url,
              }
            : null,
        })),
        total,
        ...buildIndexPageInfo({ offset, limit: input.limit, total }),
      };
    }),
});
