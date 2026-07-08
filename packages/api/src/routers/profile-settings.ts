import { athleteTrainingSettingsSchema, profileTrainingSettingsRecordSchema } from "@repo/core";
import { type ProfileTrainingSettingsRow, profileTrainingSettings } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertProfileAccess } from "./account/profile-access";

type DbClient = ReturnType<typeof getRequiredDb>;

type ProfileTrainingSettingsSqlRow = Pick<
  ProfileTrainingSettingsRow,
  "profile_id" | "settings" | "updated_at"
>;

function _getSqlRows<T>(result: unknown) {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function normalizeProfileSettingsRow(row: ProfileTrainingSettingsSqlRow) {
  return profileSettingsRecordDtoSchema.parse({
    profile_id: row.profile_id,
    settings: row.settings,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : typeof row.updated_at === "string"
          ? row.updated_at
          : undefined,
  });
}

async function getProfileTrainingSettingsRow(db: DbClient, profileId: string) {
  const [row] = await db
    .select({
      profile_id: profileTrainingSettings.profile_id,
      settings: profileTrainingSettings.settings,
      updated_at: profileTrainingSettings.updated_at,
    })
    .from(profileTrainingSettings)
    .where(eq(profileTrainingSettings.profile_id, profileId))
    .limit(1);

  return (row as ProfileTrainingSettingsSqlRow | undefined) ?? null;
}

async function upsertProfileTrainingSettingsRow(
  db: DbClient,
  input: { profile_id: string; settings: z.infer<typeof athleteTrainingSettingsSchema> },
) {
  const [row] = await db
    .insert(profileTrainingSettings)
    .values({
      profile_id: input.profile_id,
      settings: input.settings,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: profileTrainingSettings.profile_id,
      set: {
        settings: input.settings,
        updated_at: new Date(),
      },
    })
    .returning({
      profile_id: profileTrainingSettings.profile_id,
      settings: profileTrainingSettings.settings,
      updated_at: profileTrainingSettings.updated_at,
    });

  return (row as ProfileTrainingSettingsSqlRow | undefined) ?? null;
}

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

      const data = await getProfileTrainingSettingsRow(db, input.profile_id);

      if (!data) {
        return null;
      }

      const parsed = profileTrainingSettingsRecordSchema.safeParse(
        normalizeProfileSettingsRow(data),
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

      const data = await upsertProfileTrainingSettingsRow(db, input);

      if (!data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upsert profile settings",
        });
      }

      const parsed = profileTrainingSettingsRecordSchema.safeParse(
        normalizeProfileSettingsRow(data),
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
