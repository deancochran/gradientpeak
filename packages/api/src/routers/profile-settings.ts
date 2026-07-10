import { athleteTrainingSettingsSchema, profileTrainingSettingsRecordSchema } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  normalizeProfileTrainingSettingsRow,
  readProfileTrainingSettings,
  upsertProfileTrainingSettings,
} from "../application/profile-settings/profileTrainingSettings";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertProfileAccess } from "./account/profile-access";

const profileIdSchema = z.string().uuid();

const profileSettingsRecordDtoSchema = z
  .object({
    profile_id: profileIdSchema,
    settings: z.unknown(),
    updated_at: z.string().datetime().optional(),
  })
  .strict();

const profileSettingsInputSchema = z
  .object({
    profile_id: profileIdSchema,
  })
  .strict();

const profileSettingsUpsertInputSchema = z
  .object({
    profile_id: profileIdSchema,
    settings: athleteTrainingSettingsSchema,
  })
  .strict();

const profileSettingsGetOutputSchema = profileTrainingSettingsRecordSchema.nullable();

const profileSettingsUpsertOutputSchema = profileTrainingSettingsRecordSchema
  .extend({
    cache_tags: z.tuple([z.literal("profileSettings.getForProfile"), z.literal("goals.list")]),
  })
  .strict();

export const profileSettingsRouter = createTRPCRouter({
  getForProfile: protectedProcedure
    .input(profileSettingsInputSchema)
    .output(profileSettingsGetOutputSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      await assertProfileAccess({
        ctx,
        profileId: input.profile_id,
      });

      const data = await readProfileTrainingSettings(db, input.profile_id);

      if (!data) {
        return null;
      }

      const parsed = profileTrainingSettingsRecordSchema.safeParse(
        profileSettingsRecordDtoSchema.parse(normalizeProfileTrainingSettingsRow(data)),
      );

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
    .output(profileSettingsUpsertOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      await assertProfileAccess({
        ctx,
        profileId: input.profile_id,
      });

      const data = await upsertProfileTrainingSettings(db, input);

      if (!data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upsert profile settings",
        });
      }

      const parsed = profileTrainingSettingsRecordSchema.safeParse(
        profileSettingsRecordDtoSchema.parse(normalizeProfileTrainingSettingsRow(data)),
      );

      if (!parsed.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Profile settings data is invalid",
        });
      }

      return profileSettingsUpsertOutputSchema.parse({
        profile_id: parsed.data.profile_id,
        settings: parsed.data.settings,
        updated_at: parsed.data.updated_at,
        cache_tags: ["profileSettings.getForProfile", "goals.list"],
      });
    }),
});
