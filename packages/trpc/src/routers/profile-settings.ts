import {
  athleteTrainingSettingsSchema,
  creationConfigValueSchema,
  defaultAthletePreferenceProfile,
  profileTrainingSettingsRecordSchema,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertProfileAccess } from "./account/profile-access";

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
    ...record,
    settings: coercedSettings,
  });
}

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

      const parsed = parseProfileSettingsRecord(data);

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

      const parsed = parseProfileSettingsRecord(data);

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
