import {
  athleteTrainingSettingsSchema,
  creationConfigValueSchema,
  defaultAthletePreferenceProfile,
  profileTrainingSettingsRecordSchema,
} from "@repo/core";
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

function getSqlRows<T>(result: unknown) {
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

function coerceLegacyProfileSettings(settings: unknown) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }

  const rawSettings = settings as Record<string, unknown>;
  const legacyShape = creationConfigValueSchema.shape;

  const availabilityConfig = legacyShape.availability_config.safeParse(
    rawSettings.availability_config,
  );
  const constraints = legacyShape.constraints.safeParse(rawSettings.constraints);
  const behaviorControls = legacyShape.behavior_controls_v1.safeParse(
    rawSettings.behavior_controls_v1,
  );
  const recentInfluence = legacyShape.recent_influence.safeParse(rawSettings.recent_influence);
  const postGoalRecoveryDays = legacyShape.post_goal_recovery_days.safeParse(
    rawSettings.post_goal_recovery_days,
  );

  if (
    !availabilityConfig.success ||
    !constraints.success ||
    !behaviorControls.success ||
    !recentInfluence.success ||
    !postGoalRecoveryDays.success
  ) {
    return null;
  }

  const availabilityByDay = new Map(
    availabilityConfig.data.days.map((dayConfig) => [dayConfig.day, dayConfig]),
  );

  return athleteTrainingSettingsSchema.parse({
    availability: {
      weekly_windows: [...availabilityByDay.values()]
        .filter((dayConfig) => dayConfig.windows.length > 0 || dayConfig.max_sessions !== undefined)
        .map((dayConfig) => ({
          day: dayConfig.day,
          windows: dayConfig.windows,
          ...(dayConfig.max_sessions !== undefined ? { max_sessions: dayConfig.max_sessions } : {}),
        })),
      hard_rest_days: constraints.data.hard_rest_days,
    },
    dose_limits: {
      ...defaultAthletePreferenceProfile.dose_limits,
      min_sessions_per_week: constraints.data.min_sessions_per_week,
      max_sessions_per_week: constraints.data.max_sessions_per_week,
      max_single_session_duration_minutes: constraints.data.max_single_session_duration_minutes,
    },
    training_style: {
      ...defaultAthletePreferenceProfile.training_style,
      progression_pace: behaviorControls.data.aggressiveness,
      week_pattern_preference: behaviorControls.data.variability,
    },
    recovery_preferences: {
      ...defaultAthletePreferenceProfile.recovery_preferences,
      recovery_priority: behaviorControls.data.recovery_priority,
      post_goal_recovery_days: postGoalRecoveryDays.data,
    },
    adaptation_preferences: {
      ...defaultAthletePreferenceProfile.adaptation_preferences,
      recency_adaptation_preference: (recentInfluence.data.influence_score + 1) / 2,
    },
    goal_strategy_preferences: defaultAthletePreferenceProfile.goal_strategy_preferences,
    baseline_fitness: defaultAthletePreferenceProfile.baseline_fitness,
  });
}

function parseProfileSettingsRecord(data: unknown) {
  const parsed = profileTrainingSettingsRecordSchema.safeParse(data);
  if (parsed.success) {
    return parsed;
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return parsed;
  }

  const record = data as Record<string, unknown>;
  const coercedSettings = coerceLegacyProfileSettings(record.settings);
  if (!coercedSettings) {
    return parsed;
  }

  return profileTrainingSettingsRecordSchema.safeParse({
    profile_id: record.profile_id,
    settings: coercedSettings,
    updated_at: record.updated_at,
  });
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
    cache_tags: z.tuple([
      z.literal("profileSettings.getForProfile"),
      z.literal("goals.list"),
    ]),
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

      const parsed = parseProfileSettingsRecord(normalizeProfileSettingsRow(data));

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

      const parsed = parseProfileSettingsRecord(normalizeProfileSettingsRow(data));

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
