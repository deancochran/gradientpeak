import { publicProfilesUpdateSchema } from "@repo/supabase";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../index";

// API-specific schemas
const profileListFiltersSchema = z.object({
  username: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export const profilesRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    try {
      const { data: profile, error } = await ctx.supabase
        .from("profiles")
        .select("*")
        .eq("id", ctx.user.id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return profile;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch profile",
      });
    }
  }),

  update: protectedProcedure
    .input(publicProfilesUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { data: profile, error } = await ctx.supabase
          .from("profiles")
          .update(input)
          .eq("id", ctx.user.id)
          .select()
          .single();

        if (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        return profile;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update profile",
        });
      }
    }),

  list: protectedProcedure
    .input(profileListFiltersSchema)
    .query(async ({ ctx, input }) => {
      try {
        let query = ctx.supabase
          .from("profiles")
          .select("id, username, avatar_url, bio, created_at")
          .range(input.offset, input.offset + input.limit - 1);

        if (input.username) {
          query = query.ilike("username", `%${input.username}%`);
        }

        const { data: profiles, error } = await query;

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        return profiles || [];
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch profiles",
        });
      }
    }),
});
