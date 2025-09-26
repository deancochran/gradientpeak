import {
  publicActivitiesInsertSchema,
  publicActivitiesUpdateSchema,
  publicActivityTypeSchema,
} from "@repo/supabase";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const activitiesRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({
      activity: PublicActivitiesInsertSchema,
      activity_streams: z.array(PublicActivityStreamsInsertSchema),
    });)
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await ctx.supabase.rpc(
        "create_activity",
        input,
      );

      if (error) throw new Error(error.message);
      return data;
    }),
  getActivityWithStreams: protectedProcedure
      .input(
        z.object({
          id: z.string().uuid(), // activity ID
        })
      )
      .query(async ({ input, ctx }) => {
        const { data, error } = await ctx.supabase
          .from("activities")
          .select(`
            *,
            activity_streams (
              id,
              type,
              data_type,
              original_size,
              compressed_data,
              created_at
            )
          `)
          .eq("id", input.id)
          .single(); // we expect only one activity

        if (error) throw new Error(error.message);
        if (!data) throw new Error("Activity not found");

        return data;
      }),
});
