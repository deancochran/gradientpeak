import { profileQuickUpdateSchema } from "@repo/core";
import {
  resolveCanonicalThresholds,
  type ThresholdActivityEffortObservation,
} from "@repo/core/athlete-inputs";
import { activityEfforts } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getProfileStats } from "../application/profiles/getProfileStats";
import {
  ensureProfileExists,
  getProfilePerformanceSnapshot,
  getPublicProfileById,
  getSerializedProfile,
  listProfiles,
} from "../application/profiles/readProfiles";
import {
  ProfileUpdateNotFoundError,
  ProfileUsernameConflictError,
  updateProfile,
} from "../application/profiles/updateProfile";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { indexCursorSchema } from "../utils/index-cursor";
import { filterSupersededProfileOverrides } from "../utils/profile-override-observations";

const profileListFiltersSchema = z
  .object({
    username: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(25),
    cursor: indexCursorSchema.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict();

const profileStatsSchema = z
  .object({
    period: z.number().min(1).max(365).default(30),
  })
  .strict();

const trainingZonesUpdateSchema = z
  .object({
    threshold_hr: z.number().int().positive().optional(),
    ftp: z.number().int().positive().optional(),
  })
  .strict();

const uuidSchema = z.string().uuid();

const profileUpdateInputSchema = profileQuickUpdateSchema
  .partial()
  .extend({
    avatar_url: z.string().nullable().optional(),
    cover_url: z.string().nullable().optional(),
    bio: z.string().max(500).nullable().optional(),
    dob: z.string().nullable().optional(),
    preferred_units: z.enum(["metric", "imperial"]).nullable().optional(),
    language: z.string().max(10).nullable().optional(),
    is_public: z.boolean().optional(),
  })
  .strict();

export const profilesRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    try {
      await ensureProfileExists(db, {
        id: ctx.session.user.id,
        email: ctx.session.user.email,
      });

      const profile = await getSerializedProfile(db, ctx.session.user.id);

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found",
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

  getPublicById: protectedProcedure
    .input(z.object({ id: uuidSchema }).strict())
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      try {
        const profile = await getPublicProfileById(db, {
          viewerProfileId: ctx.session.user.id,
          profileId: input.id,
        });

        if (!profile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found",
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

  update: protectedProcedure.input(profileUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    try {
      await updateProfile(db, {
        profileId: ctx.session.user.id,
        avatar_url: input.avatar_url,
        cover_url: input.cover_url,
        bio: input.bio,
        dob: input.dob === undefined ? undefined : input.dob === null ? null : new Date(input.dob),
        is_public: input.is_public,
        username: input.username,
        language: input.language,
        preferred_units: input.preferred_units,
        weight_kg: input.weight_kg,
        threshold_hr: input.threshold_hr,
        ftp: input.ftp,
      });

      const profile = await getSerializedProfile(db, ctx.session.user.id);

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profile not found",
        });
      }

      return profile;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      if (error instanceof ProfileUpdateNotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: error.message });
      }
      if (error instanceof ProfileUsernameConflictError) {
        throw new TRPCError({ code: "CONFLICT", message: error.message });
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update profile",
      });
    }
  }),

  list: protectedProcedure.input(profileListFiltersSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    try {
      return await listProfiles(db, input);
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

  getStats: protectedProcedure.input(profileStatsSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    try {
      return await getProfileStats(db, {
        profileId: ctx.session.user.id,
        period: input.period,
      });
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
    const db = getRequiredDb(ctx);

    try {
      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const [performance, thresholdEfforts] = await Promise.all([
        getProfilePerformanceSnapshot(db, ctx.session.user.id),
        db
          .select({
            id: activityEfforts.id,
            activity_id: activityEfforts.activity_id,
            activity_category: activityEfforts.activity_category,
            duration_seconds: activityEfforts.duration_seconds,
            effort_type: activityEfforts.effort_type,
            recorded_at: activityEfforts.recorded_at,
            unit: activityEfforts.unit,
            value: activityEfforts.value,
            source: activityEfforts.source,
            method: activityEfforts.method,
            provenance: activityEfforts.provenance,
          })
          .from(activityEfforts)
          .where(
            and(
              eq(activityEfforts.profile_id, ctx.session.user.id),
              gte(activityEfforts.recorded_at, cutoffDate),
            ),
          )
          .orderBy(desc(activityEfforts.recorded_at), desc(activityEfforts.id))
          .limit(100),
      ]);

      const threshold_hr = performance.threshold_hr ?? undefined;
      const weight_kg = performance.weight_kg ?? undefined;
      const thresholds = resolveCanonicalThresholds({
        now: new Date().toISOString(),
        freshnessWindowMs: 90 * 24 * 60 * 60 * 1000,
        directMetrics:
          performance.ftp === null
            ? []
            : [
                {
                  threshold: "cycling_ftp" as const,
                  value: performance.ftp,
                  observedAt: new Date().toISOString(),
                  source: "provider" as const,
                },
              ],
        activityEfforts: filterSupersededProfileOverrides(
          thresholdEfforts,
          (effort) =>
            `${effort.activity_category}:${effort.effort_type}:${effort.duration_seconds}:${effort.unit}`,
        ).flatMap((effort): ThresholdActivityEffortObservation[] => {
          if (effort.duration_seconds !== 1200) return [];
          const observedAt = effort.recorded_at.toISOString();
          if (effort.activity_category === "bike" && effort.effort_type === "power") {
            return [
              {
                sport: "bike" as const,
                metric: "power" as const,
                value: Number(effort.value),
                durationSeconds: 1200,
                observedAt,
                observationKind:
                  effort.activity_id !== null &&
                  effort.source !== "derived" &&
                  effort.source !== "estimated"
                    ? ("actual" as const)
                    : ("derived" as const),
              },
            ];
          }
          if (effort.activity_category === "run" && effort.effort_type === "speed") {
            const speed =
              effort.unit === "km_per_hour"
                ? Number(effort.value) / 3.6
                : effort.unit === "meters_per_second" || effort.unit === "m/s"
                  ? Number(effort.value)
                  : null;
            if (speed === null) return [];
            return [
              {
                sport: "run" as const,
                metric: "speed" as const,
                value: speed,
                durationSeconds: 1200,
                observedAt,
                observationKind: "actual" as const,
              },
            ];
          }
          return [];
        }),
      });
      const ftp =
        thresholds.cycling_ftp.value === null
          ? undefined
          : Math.round(thresholds.cycling_ftp.value);
      const threshold_pace =
        thresholds.running_threshold_pace.value === null
          ? undefined
          : Math.round(thresholds.running_threshold_pace.value);

      const heartRateZones = threshold_hr
        ? {
            maxHR: Math.round(threshold_hr / 0.87),
            zone1: {
              min: Math.round(threshold_hr * 0.55),
              max: Math.round(threshold_hr * 0.75),
            },
            zone2: {
              min: Math.round(threshold_hr * 0.75),
              max: Math.round(threshold_hr * 0.87),
            },
            zone3: {
              min: Math.round(threshold_hr * 0.87),
              max: Math.round(threshold_hr * 0.98),
            },
            zone4: {
              min: Math.round(threshold_hr * 0.98),
              max: Math.round(threshold_hr * 1.06),
            },
            zone5: {
              min: Math.round(threshold_hr * 1.06),
              max: Math.round(threshold_hr / 0.87),
            },
          }
        : null;

      const powerZones = ftp
        ? {
            zone1: { min: 0, max: Math.round(ftp * 0.55) },
            zone2: {
              min: Math.round(ftp * 0.55),
              max: Math.round(ftp * 0.75),
            },
            zone3: {
              min: Math.round(ftp * 0.75),
              max: Math.round(ftp * 0.9),
            },
            zone4: {
              min: Math.round(ftp * 0.9),
              max: Math.round(ftp * 1.05),
            },
            zone5: {
              min: Math.round(ftp * 1.05),
              max: Math.round(ftp * 1.2),
            },
            zone6: {
              min: Math.round(ftp * 1.2),
              max: Math.round(ftp * 1.5),
            },
            zone7: { min: Math.round(ftp * 1.5), max: null },
          }
        : null;

      return {
        heartRateZones,
        powerZones,
        profile: {
          threshold_hr,
          ftp,
          weight_kg,
          threshold_pace,
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
      const db = getRequiredDb(ctx);

      try {
        await updateProfile(db, {
          profileId: ctx.session.user.id,
          threshold_hr: input.threshold_hr,
          ftp: input.ftp,
        });

        const profile = await getSerializedProfile(db, ctx.session.user.id);

        if (!profile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found",
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
