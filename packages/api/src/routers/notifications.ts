import { Schemas } from "@repo/core";
import { z } from "zod";
import { createNotificationOperations } from "../application/notifications/notificationOperations";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const getRecentInputSchema = z.object({ limit: z.number().min(1).max(100).default(20) }).strict();

const markReadInputSchema = Schemas.MarkNotificationReadSchema.strict();

export const notificationsRouter = createTRPCRouter({
  getRecent: protectedProcedure.input(getRecentInputSchema).query(async ({ ctx, input }) => {
    return createNotificationOperations(getRequiredDb(ctx)).getRecent({
      recipientProfileId: ctx.session.user.id,
      limit: input.limit,
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
