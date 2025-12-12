import { publicProfilesUpdateSchema } from "@repo/supabase";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// API-specific schemas
const profileListFiltersSchema = z.object({
  username: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

const profileStatsSchema = z.object({
  period: z.number().min(1).max(365).default(30),
});

const trainingZonesUpdateSchema = z.object({
  maxHeartRate: z.number().optional(),
  restingHeartRate: z.number().optional(),
  ftpWatts: z.number().optional(),
  zoneCalculationMethod: z.string().optional(),
});

export const profilesRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    try {
      const { data: profile, error } = await ctx.supabase
        .from("profiles")
        .select("*")
        .eq("id", ctx.session.user.id)
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

      // Return profile as-is - tRPC will handle serialization
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
          .eq("id", ctx.session.user.id)
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

  getStats: protectedProcedure
    .input(profileStatsSchema)
    .query(async ({ ctx, input }) => {
      try {
        // Calculate stats from activities over the specified period
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - input.period);

        const { data: activities, error } = await ctx.supabase
          .from("activities")
          .select(
            "duration, distance, tss, activity_category, activity_location, started_at",
          )
          .eq("profile_id", ctx.session.user.id)
          .gte("started_at", startDate.toISOString())
          .lte("started_at", endDate.toISOString());

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        const totalActivities = activities?.length || 0;
        const totalDuration =
          activities?.reduce((sum, a) => sum + (a.duration || 0), 0) || 0;
        const totalDistance =
          activities?.reduce((sum, a) => sum + (a.distance || 0), 0) || 0;
        const totalTSS =
          activities?.reduce((sum, a) => sum + (a.tss || 0), 0) || 0;

        return {
          totalActivities,
          totalDuration,
          totalDistance,
          totalTSS,
          avgDuration:
            totalActivities > 0 ? totalDuration / totalActivities : 0,
          period: input.period,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get profile stats",
        });
      }
    }),

  getZones: protectedProcedure.query(async ({ ctx }) => {
    try {
      const { data: profile, error } = await ctx.supabase
        .from("profiles")
        .select(
          "max_heart_rate, resting_heart_rate, ftp_watts, zone_calculation_method",
        )
        .eq("id", ctx.session.user.id)
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Calculate heart rate zones (basic 5-zone model)
      const heartRateZones =
        profile.max_heart_rate && profile.resting_heart_rate
          ? {
              zone1: {
                min: profile.resting_heart_rate,
                max: Math.round(
                  profile.resting_heart_rate +
                    (profile.max_heart_rate - profile.resting_heart_rate) * 0.6,
                ),
              },
              zone2: {
                min: Math.round(
                  profile.resting_heart_rate +
                    (profile.max_heart_rate - profile.resting_heart_rate) * 0.6,
                ),
                max: Math.round(
                  profile.resting_heart_rate +
                    (profile.max_heart_rate - profile.resting_heart_rate) * 0.7,
                ),
              },
              zone3: {
                min: Math.round(
                  profile.resting_heart_rate +
                    (profile.max_heart_rate - profile.resting_heart_rate) * 0.7,
                ),
                max: Math.round(
                  profile.resting_heart_rate +
                    (profile.max_heart_rate - profile.resting_heart_rate) * 0.8,
                ),
              },
              zone4: {
                min: Math.round(
                  profile.resting_heart_rate +
                    (profile.max_heart_rate - profile.resting_heart_rate) * 0.8,
                ),
                max: Math.round(
                  profile.resting_heart_rate +
                    (profile.max_heart_rate - profile.resting_heart_rate) * 0.9,
                ),
              },
              zone5: {
                min: Math.round(
                  profile.resting_heart_rate +
                    (profile.max_heart_rate - profile.resting_heart_rate) * 0.9,
                ),
                max: profile.max_heart_rate,
              },
            }
          : null;

      // Calculate power zones (basic 7-zone model based on FTP)
      const powerZones = profile.ftp_watts
        ? {
            zone1: { min: 0, max: Math.round(profile.ftp_watts * 0.55) },
            zone2: {
              min: Math.round(profile.ftp_watts * 0.55),
              max: Math.round(profile.ftp_watts * 0.75),
            },
            zone3: {
              min: Math.round(profile.ftp_watts * 0.75),
              max: Math.round(profile.ftp_watts * 0.9),
            },
            zone4: {
              min: Math.round(profile.ftp_watts * 0.9),
              max: Math.round(profile.ftp_watts * 1.05),
            },
            zone5: {
              min: Math.round(profile.ftp_watts * 1.05),
              max: Math.round(profile.ftp_watts * 1.2),
            },
            zone6: {
              min: Math.round(profile.ftp_watts * 1.2),
              max: Math.round(profile.ftp_watts * 1.5),
            },
            zone7: { min: Math.round(profile.ftp_watts * 1.5), max: null },
          }
        : null;

      return {
        heartRateZones,
        powerZones,
        profile: {
          maxHeartRate: profile.max_heart_rate,
          restingHeartRate: profile.resting_heart_rate,
          ftpWatts: profile.ftp_watts,
          zoneCalculationMethod: profile.zone_calculation_method,
        },
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get training zones",
      });
    }
  }),

  updateZones: protectedProcedure
    .input(trainingZonesUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const updateData: any = {};

        if (input.maxHeartRate !== undefined)
          updateData.max_heart_rate = input.maxHeartRate;
        if (input.restingHeartRate !== undefined)
          updateData.resting_heart_rate = input.restingHeartRate;
        if (input.ftpWatts !== undefined) updateData.ftp_watts = input.ftpWatts;
        if (input.zoneCalculationMethod !== undefined)
          updateData.zone_calculation_method = input.zoneCalculationMethod;

        const { data: profile, error } = await ctx.supabase
          .from("profiles")
          .update(updateData)
          .eq("id", ctx.session.user.id)
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
          message: "Failed to update training zones",
        });
      }
    }),
});
