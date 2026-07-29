import { athleteTrainingSettingsSchema, profileTrainingSettingsRecordSchema } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  normalizeProfileTrainingSettingsRow,
  parseProfileTrainingSettings,
  readProfileTrainingSettings,
  upsertProfileTrainingSettings,
} from "../application/profile-settings/profileTrainingSettings";
import type { DrizzleTransactionClient } from "../db";
import { getRequiredDb } from "../db";
import {
  createProviderSyncRepository,
  createWahooRepository,
} from "../infrastructure/repositories";
import { hasWahooRouteMirrorScopes } from "../lib/integrations/wahoo/planned-activity-scopes";
import { enqueueWahooGroupEventRouteDeliveryReconcile } from "../lib/provider-sync/event-delivery/wahoo-group-event-route-delivery";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertProfileAccess, withProfileWriteAccess } from "./account/profile-access";

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

      const data = await withProfileWriteAccess({
        ctx,
        profileId: input.profile_id,
        write: async (tx) => {
          const previous = await readProfileTrainingSettings(tx, input.profile_id);
          const data = await upsertProfileTrainingSettings(tx, input);
          const wasEnabled = parseProfileTrainingSettings(
            previous?.settings,
          )?.wahooEventRouteDeliveryEnabled;
          if (Boolean(wasEnabled) !== input.settings.wahooEventRouteDeliveryEnabled) {
            const integration = await createWahooRepository({
              db: tx,
            }).findWahooIntegrationByProfileId(input.profile_id);
            if (integration && hasWahooRouteMirrorScopes(integration.scope)) {
              await enqueueWahooGroupEventRouteDeliveryReconcile({
                integrationGeneration: integration.integrationGeneration,
                integrationId: integration.id,
                profileId: input.profile_id,
                providerSyncRepository: createProviderSyncRepository({ db }),
                transaction: tx as DrizzleTransactionClient,
                trigger: "preference_changed",
              });
            }
          }
          return data;
        },
      });

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
