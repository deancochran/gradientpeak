import {
  athleteTrainingSettingsSchema,
  profileTrainingSettingsRecordSchema,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertProfileAccess } from "./profile-access";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const profileSettingsInputSchema = z.object({
  profile_id: z.string().uuid(),
});

const profileSettingsUpsertInputSchema = z.object({
  profile_id: z.string().uuid(),
  settings: athleteTrainingSettingsSchema,
});

export const profileSettingsRouter = createTRPCRouter({
  getForProfile: protectedProcedure
    .input(profileSettingsInputSchema)
    .query(async ({ ctx, input }) => {
      await assertProfileAccess({
        ctx,
        profileId: input.profile_id,
      });

      const { data, error } = await ctx.supabase
        .from("profile_training_settings")
        .select("*")
        .eq("profile_id", input.profile_id)
        .maybeSingle();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch profile settings",
        });
      }

      if (!data) {
        return null;
      }

      const parsed = profileTrainingSettingsRecordSchema.safeParse(data);

      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Profile settings data is invalid",
        });
      }

      return parsed.data;
    }),

  upsert: protectedProcedure
    .input(profileSettingsUpsertInputSchema)
    .mutation(async ({ ctx, input }) => {
      await assertProfileAccess({
        ctx,
        profileId: input.profile_id,
      });

      const { data, error } = await ctx.supabase
        .from("profile_training_settings")
        .upsert(
          {
            profile_id: input.profile_id,
            settings: input.settings,
          },
          { onConflict: "profile_id" },
        )
        .select("*")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upsert profile settings",
        });
      }

      const parsed = profileTrainingSettingsRecordSchema.safeParse(data);

      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Profile settings data is invalid",
        });
      }

      return {
        ...parsed.data,
        cache_tags: ["profileSettings.getForProfile", "goals.list"],
      };
    }),
});
