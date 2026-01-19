import { profileQuickUpdateSchema } from "@repo/core";
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
  threshold_hr: z.number().int().positive().optional(),
  ftp: z.number().int().positive().optional(),
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

  // Get public profile data by ID (for displaying in activity feeds)
  getPublicById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const { data: profile, error } = await ctx.supabase
          .from("profiles")
          .select("id, username, avatar_url, bio")
          .eq("id", input.id)
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
          message: "Failed to fetch public profile",
        });
      }
    }),

  update: protectedProcedure
    .input(
      profileQuickUpdateSchema.partial().extend({
        avatar_url: z.string().nullable().optional(),
        bio: z.string().max(500).nullable().optional(),
        dob: z.string().nullable().optional(),
        preferred_units: z.enum(["metric", "imperial"]).nullable().optional(),
        language: z.string().max(10).nullable().optional(),
      }),
    )
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
            "duration_seconds, distance_meters, metrics, type, location, started_at",
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
          activities?.reduce((sum, a) => sum + (a.duration_seconds || 0), 0) ||
          0;
        const totalDistance =
          activities?.reduce((sum, a) => sum + (a.distance_meters || 0), 0) ||
          0;
        const totalTSS =
          activities?.reduce((sum, a) => {
            const metrics = (a.metrics as Record<string, any>) || {};
            return sum + (metrics.tss || 0);
          }, 0) || 0;

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
        .select("threshold_hr, ftp")
        .eq("id", ctx.session.user.id)
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // Calculate heart rate zones based on threshold HR
      // Threshold HR is typically at the top of Zone 3 (~85-90% of max HR)
      const heartRateZones = profile.threshold_hr
        ? {
            // Estimate max HR from threshold (assuming threshold is ~87% of max)
            maxHR: Math.round(profile.threshold_hr / 0.87),

            zone1: {
              min: Math.round(profile.threshold_hr * 0.55), // ~50-60% max HR
              max: Math.round(profile.threshold_hr * 0.75), // ~65% max HR
            },
            zone2: {
              min: Math.round(profile.threshold_hr * 0.75), // ~65% max HR
              max: Math.round(profile.threshold_hr * 0.87), // ~75% max HR
            },
            zone3: {
              min: Math.round(profile.threshold_hr * 0.87), // ~75% max HR
              max: Math.round(profile.threshold_hr * 0.98), // ~85% max HR (at threshold)
            },
            zone4: {
              min: Math.round(profile.threshold_hr * 0.98), // ~85% max HR
              max: Math.round(profile.threshold_hr * 1.06), // ~92% max HR
            },
            zone5: {
              min: Math.round(profile.threshold_hr * 1.06), // ~92% max HR
              max: Math.round(profile.threshold_hr / 0.87), // ~100% max HR
            },
          }
        : null;

      // Calculate power zones (basic 7-zone model based on FTP)
      const powerZones = profile.ftp
        ? {
            zone1: { min: 0, max: Math.round(profile.ftp * 0.55) },
            zone2: {
              min: Math.round(profile.ftp * 0.55),
              max: Math.round(profile.ftp * 0.75),
            },
            zone3: {
              min: Math.round(profile.ftp * 0.75),
              max: Math.round(profile.ftp * 0.9),
            },
            zone4: {
              min: Math.round(profile.ftp * 0.9),
              max: Math.round(profile.ftp * 1.05),
            },
            zone5: {
              min: Math.round(profile.ftp * 1.05),
              max: Math.round(profile.ftp * 1.2),
            },
            zone6: {
              min: Math.round(profile.ftp * 1.2),
              max: Math.round(profile.ftp * 1.5),
            },
            zone7: { min: Math.round(profile.ftp * 1.5), max: null },
          }
        : null;

      return {
        heartRateZones,
        powerZones,
        profile: {
          threshold_hr: profile.threshold_hr,
          ftp: profile.ftp,
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

        // Map input fields to actual schema columns
        if (input.threshold_hr !== undefined)
          updateData.threshold_hr = input.threshold_hr;
        if (input.ftp !== undefined) updateData.ftp = input.ftp;

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
