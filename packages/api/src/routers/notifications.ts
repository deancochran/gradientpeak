import { Schemas } from "@repo/core";
import { z } from "zod";
import { createNotificationOperations } from "../application/notifications/notificationOperations";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const getRecentInputSchema = z.object({ limit: z.number().min(1).max(100).default(20) }).strict();

const notificationHistoryInputSchema = z
  .object({
    // tRPC's infinite-query adapter appends this transport field. History only
    // exposes descending keyset pagination, so backward traversal is rejected.
    direction: z.literal("forward").optional(),
    cursor: z
      .object({ createdAt: z.string().datetime(), id: z.string().uuid() })
      .strict()
      .nullable()
      .optional(),
    limit: z.number().min(1).max(100).default(50),
    view: z.enum(["all", "unread"]).default("all"),
  })
  .strict();

const markReadInputSchema = Schemas.MarkNotificationReadSchema.strict();

export const notificationsRouter = createTRPCRouter({
  getRecent: protectedProcedure.input(getRecentInputSchema).query(async ({ ctx, input }) => {
    return createNotificationOperations(getRequiredDb(ctx)).getRecent({
      recipientProfileId: ctx.session.user.id,
      limit: input.limit,
    });
  }),

  getHistory: protectedProcedure
    .input(notificationHistoryInputSchema)
    .query(async ({ ctx, input }) => {
      return createNotificationOperations(getRequiredDb(ctx)).getHistory({
        recipientProfileId: ctx.session.user.id,
        limit: input.limit,
        cursor: input.cursor
          ? { createdAt: new Date(input.cursor.createdAt), id: input.cursor.id }
          : null,
        view: input.view,
      });
    }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    return createNotificationOperations(getRequiredDb(ctx)).getUnreadCount({
      recipientProfileId: ctx.session.user.id,
    });
  }),

  markRead: protectedProcedure.input(markReadInputSchema).mutation(async ({ ctx, input }) => {
    return createNotificationOperations(getRequiredDb(ctx)).markRead({
      recipientProfileId: ctx.session.user.id,
      notificationIds: input.notification_ids,
    });
  }),
});
