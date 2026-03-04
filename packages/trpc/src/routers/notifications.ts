import { Schemas } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const notificationsRouter = createTRPCRouter({
  getRecent: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("notifications")
        .select("*")
        .eq("user_id", ctx.session.user.id)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      return data;
    }),

  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const { count, error } = await ctx.supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", ctx.session.user.id)
      .is("read_at", null);

    if (error)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    return count || 0;
  }),

  markRead: protectedProcedure
    .input(Schemas.MarkNotificationReadSchema)
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", input.notification_ids)
        .eq("user_id", ctx.session.user.id); // Security check

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      return { success: true };
    }),
});
