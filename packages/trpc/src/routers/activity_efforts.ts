import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const activityEffortsRouter = createTRPCRouter({
  getForProfile: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("activity_efforts")
      .select("*")
      .eq("profile_id", ctx.session.user.id)
      .order("recorded_at", { ascending: false });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return data;
  }),

  create: protectedProcedure
    .input(
      z.object({
        activity_id: z.string().uuid().optional().nullable(),
        activity_category: z.enum(["run", "bike", "swim", "strength", "other"]),
        duration_seconds: z.number().int().positive(),
        effort_type: z.enum(["power", "speed"]),
        value: z.number(),
        unit: z.string(),
        start_offset: z.number().int().nonnegative().optional().nullable(),
        recorded_at: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await ctx.supabase
        .from("activity_efforts")
        .insert({
          ...input,
          profile_id: ctx.session.user.id,
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data;
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { error } = await ctx.supabase
        .from("activity_efforts")
        .delete()
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { success: true, deletedId: input.id };
    }),
});
